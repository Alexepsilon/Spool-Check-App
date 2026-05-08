import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import ProgressStrip from '../components/ProgressStrip';
import { captureFrame, setTorch, startBackCamera, type CameraHandle } from '../lib/camera';
import {
  appendScan,
  appendUncharted,
  findItemByKey,
  getDelivery,
  listItems,
  loadSettings,
  setItemStatus,
} from '../lib/db';
import { pulseDouble, pulseLong, pulseShort } from '../lib/haptics';
import { useLang } from '../lib/i18n';
import { CodeMatcher, type MatchResult } from '../lib/matcher';
import { getWorkerStatus, recognizeCanvas, recognizeImage } from '../lib/ocr';
import {
  DEFAULT_CODE_PATTERN,
  FRAME_CONSENSUS_COUNT,
  FRAME_CONSENSUS_WINDOW,
  OCR_FRAME_INTERVAL_MS,
  SCAN_DEBOUNCE_MS,
} from '../lib/constants';
import type { AppSettings, MasterItem, Scan } from '../lib/types';
import { composeKey } from '../lib/types';

type Mode = 'live' | 'photo';

interface PendingFlow {
  type: 'matchFound' | 'notFound' | 'partial' | 'fuzzy';
  result?: MatchResult;
  drawing?: string;
  spool?: string;
  /** Raw OCR text — kept so the user can see what the camera read and
   *  copy from it manually if extraction failed. */
  rawText?: string;
  /** Full master row — populated when the matcher resolved an item, so the
   *  dialog can show diameter / paint / RAL / scope and the user can
   *  verify the whole row before confirming. */
  matchedItem?: MasterItem;
}

export default function ScannerPage() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const navigate = useNavigate();
  const { t } = useLang();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<CameraHandle | null>(null);

  const [mode, setMode] = useState<Mode>('live');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [items, setItems] = useState<MasterItem[]>([]);
  const [matcher, setMatcher] = useState<CodeMatcher | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [holding, setHolding] = useState(false);
  const [feed, setFeed] = useState<{ time: number; key: string; status: string }[]>([]);
  const [pending, setPending] = useState<PendingFlow | null>(null);
  const [debug, setDebug] = useState(false);
  const [lastOcr, setLastOcr] = useState('');
  const [debugStats, setDebugStats] = useState({
    frames: 0,
    captureFails: 0,
    emptyResults: 0,
    lastFrameMs: 0,
  });

  // Frame-consensus state lives in refs so the OCR loop can mutate without rerenders.
  const consensusBuf = useRef<Set<string>[]>([]);
  const offListBuf = useRef<string[]>([]); // codes seen by OCR that AREN'T on the master list
  const offListText = useRef<Map<string, string>>(new Map()); // raw OCR text per off-list code
  const candidateInfo = useRef<Map<string, MatchResult>>(new Map());
  const recentMatches = useRef<Map<string, number>>(new Map());
  const processing = useRef(false);
  const lastFrameAt = useRef(0);
  const stopped = useRef(false);

  // ---------- bootstrap ----------
  useEffect(() => {
    void boot();
    return () => {
      stopped.current = true;
      camRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId]);

  const boot = async () => {
    if (!deliveryId) return;
    const [d, its, set] = await Promise.all([
      getDelivery(deliveryId),
      listItems(deliveryId),
      loadSettings(),
    ]);
    if (!d) {
      navigate('/');
      return;
    }
    setItems(its);
    setSettings(set);
    setMatcher(
      new CodeMatcher(
        its.map((i) => ({ drawing: i.drawing, spool: i.spool, itemId: i.id })),
        d.codePattern,
      ),
    );
    if (mode === 'live') {
      await startLive();
    }
  };

  const startLive = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setError(null);
    try {
      camRef.current = await startBackCamera(videoRef.current, canvasRef.current);
      stopped.current = false;
      void runLoop();
    } catch (e) {
      setError(`${t('scan_camera_failed')}: ${(e as Error).message}`);
    }
  };

  const stopLive = () => {
    stopped.current = true;
    camRef.current?.stop();
    camRef.current = null;
    consensusBuf.current = [];
    candidateInfo.current.clear();
    setHolding(false);
  };

  // ---------- live OCR loop ----------
  const runLoop = async () => {
    while (!stopped.current && camRef.current) {
      const now = Date.now();
      if (now - lastFrameAt.current < OCR_FRAME_INTERVAL_MS) {
        await new Promise((r) => setTimeout(r, 30));
        continue;
      }
      lastFrameAt.current = now;
      if (processing.current) {
        await new Promise((r) => setTimeout(r, 30));
        continue;
      }
      if (pending) {
        // Pause OCR while a dialog is open.
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      processing.current = true;
      try {
        await tickFrame();
      } catch {
        /* swallow per-frame errors */
      } finally {
        processing.current = false;
      }
    }
  };

  const tickFrame = async () => {
    if (!videoRef.current || !canvasRef.current || !matcher) return;
    const c = captureFrame(videoRef.current, canvasRef.current);
    if (!c) {
      if (debug) {
        setDebugStats((s) => ({ ...s, captureFails: s.captureFails + 1 }));
      }
      return;
    }
    const t0 = performance.now();
    const text = await recognizeCanvas(c);
    const elapsed = Math.round(performance.now() - t0);
    if (debug) {
      setLastOcr(text);
      setDebugStats((s) => ({
        frames: s.frames + 1,
        captureFails: s.captureFails,
        emptyResults: text.trim() === '' ? s.emptyResults + 1 : s.emptyResults,
        lastFrameMs: elapsed,
      }));
    }
    const matches = matcher.match(text);
    const keys = new Set<string>();
    for (const m of matches) {
      if (m.confidence === 'partial') {
        // Pause loop and ask the user.
        if (!pending) await openPartial(m);
        continue;
      }
      keys.add(composeKey(m.drawing, m.spool));
      candidateInfo.current.set(composeKey(m.drawing, m.spool), m);
    }
    consensusBuf.current.push(keys);
    while (consensusBuf.current.length > FRAME_CONSENSUS_WINDOW) {
      consensusBuf.current.shift();
    }
    setHolding(keys.size > 0);
    const committable = computeCommittable();
    for (const k of committable) {
      const m = candidateInfo.current.get(k);
      if (m) await commit(m);
    }

    // ---- Off-list detection ----
    // If OCR found code-shaped strings that AREN'T in the master set, and the
    // SAME off-list code shows up in N consecutive frames, fire the
    // "Not on the list" dialog so the user can record it without leaving
    // the scanner.
    if (committable.size === 0 && !pending) {
      const re = new RegExp(DEFAULT_CODE_PATTERN.source, 'g');
      const matchedKeys = new Set(matches.map((m) => composeKey(m.drawing, m.spool)));
      const offListThisFrame: string[] = [];
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(text.toUpperCase())) !== null) {
        const candidate = mm[0];
        // Already matched (any spool variant) — skip.
        let isMatched = false;
        for (const k of matchedKeys) {
          if (k === candidate || k.startsWith(`${candidate}|`)) {
            isMatched = true;
            break;
          }
        }
        if (!isMatched) {
          offListThisFrame.push(candidate);
          offListText.current.set(candidate, text);
        }
      }
      offListBuf.current.push(offListThisFrame.length ? offListThisFrame[0] : '');
      while (offListBuf.current.length > FRAME_CONSENSUS_WINDOW) {
        offListBuf.current.shift();
      }
      // Need N consecutive frames with the SAME off-list code.
      if (offListBuf.current.length >= FRAME_CONSENSUS_COUNT) {
        const recent = offListBuf.current.slice(-FRAME_CONSENSUS_COUNT);
        const first = recent[0];
        if (first && recent.every((c) => c === first)) {
          // Avoid spamming: only fire if not recently shown.
          const last = recentMatches.current.get(`offlist:${first}`) ?? 0;
          if (Date.now() - last >= SCAN_DEBOUNCE_MS) {
            recentMatches.current.set(`offlist:${first}`, Date.now());
            const rawText = offListText.current.get(first) ?? '';
            // Try to extract the spool letter from the same OCR pass.
            const spool = CodeMatcher.firstLoneLetter(rawText.toUpperCase()) ?? '';
            setPending({ type: 'notFound', drawing: first, spool, rawText });
          }
        }
      }
    }
  };

  const computeCommittable = (): Set<string> => {
    const buf = consensusBuf.current;
    if (buf.length < FRAME_CONSENSUS_COUNT) return new Set();
    const recent = buf.slice(buf.length - FRAME_CONSENSUS_COUNT);
    if (recent[0].size === 0) return new Set();
    let inter = new Set(recent[0]);
    for (let i = 1; i < recent.length; i++) {
      inter = new Set([...inter].filter((k) => recent[i].has(k)));
      if (inter.size === 0) return inter;
    }
    return inter;
  };

  // ---------- commit / flows ----------
  const commit = async (m: MatchResult) => {
    const key = composeKey(m.drawing, m.spool);
    const last = recentMatches.current.get(key) ?? 0;
    const now = Date.now();
    if (now - last < SCAN_DEBOUNCE_MS) return;
    recentMatches.current.set(key, now);
    const matched = m.itemId ? items.find((i) => i.id === m.itemId) : undefined;
    if (m.confidence === 'fuzzy') {
      setPending({ type: 'fuzzy', result: m, matchedItem: matched });
      return;
    }
    if (settings?.confirmBeforeVerified && !settings.autoConfirmMode) {
      setPending({ type: 'matchFound', result: m, matchedItem: matched });
      return;
    }
    await doVerify(m);
  };

  /** Brief "✓ Verified" highlight banner that fades out after ~1.5s. */
  const [highlight, setHighlight] = useState<MasterItem | null>(null);
  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => setHighlight(null), 1600);
    return () => clearTimeout(id);
  }, [highlight]);

  const doVerify = async (m: MatchResult, byUserConfirm = false) => {
    if (!deliveryId) return;
    pulseShort();
    const scan: Scan = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      deliveryId,
      drawing: m.drawing,
      spool: m.spool,
      matchedItemId: m.itemId,
      confidence: m.confidence,
      confirmed: true,
    };
    await appendScan(scan);
    if (m.itemId) {
      await setItemStatus(m.itemId, 'verified', scan.id);
    } else {
      const it = await findItemByKey(deliveryId, m.drawing, m.spool);
      if (it) await setItemStatus(it.id, 'verified', scan.id);
    }
    if (byUserConfirm) pulseDouble();
    setFeed((f) =>
      [{ time: Date.now(), key: composeKey(m.drawing, m.spool), status: 'verified' }, ...f].slice(0, 20),
    );
    // Show a brief highlight banner with the matched row.
    const matched = m.itemId
      ? items.find((i) => i.id === m.itemId)
      : await findItemByKey(deliveryId!, m.drawing, m.spool);
    if (matched) setHighlight(matched);
    // Refresh items count display
    if (deliveryId) listItems(deliveryId).then(setItems);
  };

  const openPartial = async (m: MatchResult) => {
    setPending({ type: 'partial', result: m });
  };

  const onPartialPick = async (chosenSpool: string) => {
    const m = pending?.result;
    setPending(null);
    if (!m || !deliveryId) return;
    const item = await findItemByKey(deliveryId, m.drawing, chosenSpool);
    if (!item) return;
    await doVerify(
      {
        drawing: m.drawing,
        spool: chosenSpool,
        observed: m.observed,
        confidence: 'partial',
        itemId: item.id,
      },
      true,
    );
  };

  const onMatchConfirm = async () => {
    const m = pending?.result;
    setPending(null);
    if (m) await doVerify(m, true);
  };

  const onMatchReject = async () => {
    const m = pending?.result;
    setPending(null);
    if (!m || !deliveryId) return;
    // Log as uncharted with note "rejected by user"
    const scan: Scan = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      deliveryId,
      drawing: m.drawing,
      spool: m.spool,
      matchedItemId: m.itemId,
      confidence: m.confidence,
      confirmed: false,
    };
    await appendScan(scan);
    await appendUncharted({
      id: crypto.randomUUID(),
      scanId: scan.id,
      deliveryId,
      timestamp: Date.now(),
      drawing: m.drawing,
      spool: m.spool,
      disposition: 'unassigned',
      notes: 'rejected by user',
    });
    setFeed((f) => [
      { time: Date.now(), key: composeKey(m.drawing, m.spool), status: 'rejected' },
      ...f,
    ].slice(0, 20));
  };

  /**
   * Save an unmatched scan to Uncharted. Accepts user-edited values from
   * the dialog so a label OCR couldn't read can still be recorded by typing
   * it in. Never bails on empty drawing — at minimum we save the raw OCR
   * text so the user has a record they can resolve later.
   */
  const onAddUncharted = async (
    overrideDrawing?: string,
    overrideSpool?: string,
  ) => {
    if (!deliveryId) {
      setPending(null);
      return;
    }
    const m = pending?.result;
    const drawing = (overrideDrawing ?? pending?.drawing ?? m?.drawing ?? '').trim();
    const spool = (overrideSpool ?? pending?.spool ?? m?.spool ?? '')
      .trim()
      .toUpperCase();
    const rawText = pending?.rawText;
    setPending(null);
    pulseLong();
    const scan: Scan = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      deliveryId,
      drawing: drawing || '(unreadable)',
      spool,
      rawText,
      confidence: 'none',
      confirmed: false,
    };
    await appendScan(scan);
    await appendUncharted({
      id: crypto.randomUUID(),
      scanId: scan.id,
      deliveryId,
      timestamp: Date.now(),
      drawing: drawing || '(unreadable)',
      spool,
      disposition: 'unassigned',
      notes: !drawing && rawText ? `OCR text: ${rawText.slice(0, 200)}` : undefined,
    });
    setFeed((f) => [
      {
        time: Date.now(),
        key: composeKey(drawing || '(unreadable)', spool),
        status: 'uncharted',
      },
      ...f,
    ].slice(0, 20));
  };

  // ---------- photo path ----------
  const onPhoto = async (file: File) => {
    if (!matcher || !deliveryId) return;
    setBusy(t('import_running_ocr'));
    setError(null);
    try {
      const text = await recognizeImage(file);
      setLastOcr(text);
      const matches = matcher.match(text);
      // Prefer exact, then fuzzy, then partial.
      const exact = matches.find((m) => m.confidence === 'exact');
      const fuzzy = matches.find((m) => m.confidence === 'fuzzy');
      const partial = matches.find((m) => m.confidence === 'partial');
      if (exact) {
        if (settings?.confirmBeforeVerified && !settings.autoConfirmMode) {
          setPending({ type: 'matchFound', result: exact });
        } else {
          await doVerify(exact);
        }
      } else if (fuzzy) {
        setPending({ type: 'fuzzy', result: fuzzy });
      } else if (partial) {
        setPending({ type: 'partial', result: partial });
      } else {
        // No master-list match — open the not-found dialog. Pre-fill drawing
        // with the first regex hit (if any) and spool with the first lone
        // letter, but always pass the raw OCR text so the user can edit
        // values manually if the camera misread them.
        const re = new RegExp(DEFAULT_CODE_PATTERN.source, 'g');
        const m = re.exec(text.toUpperCase());
        const drawing = m?.[0] ?? '';
        const spool = drawing ? CodeMatcher.firstLoneLetter(text.toUpperCase()) ?? '' : '';
        setPending({
          type: 'notFound',
          drawing,
          spool,
          rawText: text,
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ---------- mode switching ----------
  const switchMode = async (next: Mode) => {
    if (mode === next) return;
    if (mode === 'live') stopLive();
    setMode(next);
    if (next === 'live') {
      // Wait for video element to mount, then start.
      setTimeout(() => void startLive(), 50);
    }
  };

  const toggleFlash = async () => {
    if (!camRef.current) return;
    const ok = await setTorch(camRef.current.stream, !flashOn);
    if (ok) setFlashOn(!flashOn);
  };

  const counts = useMemo(() => {
    return {
      total: items.length,
      verified: items.filter((i) => i.status === 'verified').length,
    };
  }, [items]);

  return (
    <Layout title={t('nav_scan')} showBack>
      <div className="flex-1 flex flex-col bg-black text-white">
        <div className="bg-black/85 border-b border-white/10">
          <ProgressStrip
            total={counts.total}
            verified={counts.verified}
            variant="wide"
            theme="dark"
          />
          <div className="flex border-t border-white/10">
            <ModeBtn label="📷 Live" active={mode === 'live'} onClick={() => switchMode('live')} />
            <ModeBtn label="🖼 Photo" active={mode === 'photo'} onClick={() => switchMode('photo')} />
            <button
              onClick={() => setDebug((v) => !v)}
              className={
                'ml-auto px-3 text-xs border-l border-white/10 ' +
                (debug ? 'bg-yellow-500 text-black font-semibold' : '')
              }
              title="Show what OCR is reading right now"
            >
              {debug ? '🐛 ON' : '🐛'}
            </button>
            {mode === 'live' && (
              <button onClick={toggleFlash} className="px-3 text-sm border-l border-white/10">
                {flashOn ? '🔦' : '💡'}
              </button>
            )}
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
        {mode === 'live' ? (
          <div className="flex-1 relative bg-black">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            <div className="absolute inset-0 pointer-events-none">
              <Reticle holding={holding} />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-12 px-4 pb-4">
              {debug && <DebugOcr text={lastOcr} stats={debugStats} />}
              <p className="text-center text-sm text-white/80 mb-3">{t('scan_aim')}</p>
              <Feed feed={feed} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPhoto(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => photoInputRef.current?.click()}
              className="bg-accent text-white px-6 py-4 rounded-lg text-lg font-medium active:scale-95"
            >
              📷 {t('import_pick_camera')}
            </button>
            <button
              onClick={() => {
                if (photoInputRef.current) {
                  photoInputRef.current.removeAttribute('capture');
                  photoInputRef.current.click();
                  // Restore for next time
                  setTimeout(() => photoInputRef.current?.setAttribute('capture', 'environment'), 100);
                }
              }}
              className="mt-3 px-6 py-3 rounded-lg border border-white/30 active:scale-95"
            >
              🖼 {t('import_pick_gallery')}
            </button>
            {busy && (
              <div className="mt-6 text-center">
                <div className="inline-block w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <div className="mt-2 text-sm">{busy}</div>
              </div>
            )}
            {debug && <DebugOcr text={lastOcr} stats={debugStats} />}
            <div className="mt-8 max-h-48 overflow-auto w-full max-w-sm">
              <Feed feed={feed} />
            </div>
          </div>
        )}
        {error && (
          <div className="bg-red-700 text-white px-3 py-2 text-sm">{error}</div>
        )}
      </div>
      {pending && (
        <PendingDialog
          pending={pending}
          onCancel={() => setPending(null)}
          onConfirm={onMatchConfirm}
          onReject={onMatchReject}
          onPickSpool={onPartialPick}
          onAddUncharted={(d, s) => onAddUncharted(d, s)}
        />
      )}
      {highlight && <HighlightBanner item={highlight} />}
    </Layout>
  );
}

function HighlightBanner({ item }: { item: MasterItem }) {
  return (
    <div className="fixed top-16 left-3 right-3 z-20 pointer-events-none">
      <div className="bg-status-verified text-white rounded-lg shadow-lg px-4 py-3 flex items-start gap-3 animate-pulse">
        <div className="text-2xl leading-none">✓</div>
        <div className="flex-1 min-w-0">
          <div className="font-mono font-semibold text-base truncate">
            {item.drawing}
          </div>
          <div className="text-xs flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 opacity-90">
            {item.spool && <span>spool {item.spool}</span>}
            {item.diameter && <span>{item.diameter}</span>}
            {item.paintSpec && item.paintSpec !== 'N.A.' && <span>{item.paintSpec}</span>}
            {item.ral && item.ral !== 'N.A.' && <span>RAL {item.ral}</span>}
            {item.chClean && <span>{item.chClean}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-4 py-2 text-sm border-r border-white/10 ' +
        (active ? 'bg-white/15 font-medium' : 'opacity-70')
      }
    >
      {label}
    </button>
  );
}

function Reticle({ holding }: { holding: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className={
          'w-72 h-44 border-2 rounded-lg transition-colors ' +
          (holding ? 'border-yellow-300' : 'border-white/70')
        }
      />
    </div>
  );
}

function Feed({ feed }: { feed: { time: number; key: string; status: string }[] }) {
  if (feed.length === 0) {
    return (
      <div className="text-center text-white/50 text-sm">
        Point camera at a tag — auto-ticks after 3 stable reads.
      </div>
    );
  }
  return (
    <div className="bg-black/50 rounded-lg p-2 space-y-1 max-h-44 overflow-auto">
      {feed.map((e, i) => {
        const [drawing, spool] = e.key.split('|');
        const isLatest = i === 0;
        const accent =
          e.status === 'verified'
            ? 'border-l-4 border-status-verified bg-status-verified/15'
            : e.status === 'uncharted'
            ? 'border-l-4 border-status-pending bg-status-pending/15'
            : 'border-l-4 border-status-missing bg-status-missing/15';
        return (
          <div
            key={i}
            className={
              `${accent} rounded px-2 py-1.5 ` +
              (isLatest ? 'ring-2 ring-white/40' : '')
            }
          >
            <div className="flex items-baseline gap-2">
              <span className="text-base">
                {e.status === 'verified' ? '✓' : e.status === 'uncharted' ? '⚠' : '✗'}
              </span>
              <span className="font-mono text-sm font-semibold flex-1 truncate text-white">
                {drawing}
              </span>
              {spool && (
                <span className="bg-white/20 text-white text-xs font-mono px-1.5 py-0.5 rounded">
                  spool {spool}
                </span>
              )}
            </div>
            <div className="flex justify-between text-[11px] text-white/70 mt-0.5">
              <span className="capitalize">{e.status}</span>
              <span>{new Date(e.time).toLocaleTimeString().slice(0, 8)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Live OCR debug panel. Toggleable from the Scanner top bar.
 * Shows worker status, frame stats, and the last OCR text so we can
 * pinpoint exactly where the pipeline is failing:
 *   - worker `error` → Tesseract failed to load (network or SW issue)
 *   - frames = 0 → tickFrame isn't running (camera not started?)
 *   - captureFails high → video element not delivering frames
 *   - emptyResults == frames → OCR runs but always returns nothing
 *   - text shown but no match → matcher / regex tuning issue
 */
function DebugOcr({
  text,
  stats,
}: {
  text: string;
  stats: { frames: number; captureFails: number; emptyResults: number; lastFrameMs: number };
}) {
  const workerStatus = getWorkerStatus();
  return (
    <div className="bg-yellow-500/95 text-black rounded-lg px-3 py-2 mb-3 text-xs font-mono max-h-44 overflow-auto whitespace-pre-wrap break-all">
      <div className="font-semibold uppercase tracking-wide text-[10px] mb-1">
        OCR debug
      </div>
      <div className="text-[10px] mb-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>worker: <strong>{workerStatus.status}</strong></span>
        <span>frames: <strong>{stats.frames}</strong></span>
        <span>capture fails: <strong>{stats.captureFails}</strong></span>
        <span>empty results: <strong>{stats.emptyResults}</strong></span>
        <span>last frame: <strong>{stats.lastFrameMs}ms</strong></span>
        {workerStatus.error && (
          <span className="col-span-2 text-red-700">err: {workerStatus.error}</span>
        )}
      </div>
      <div className="border-t border-black/20 pt-1">
        <span className="text-[10px] opacity-70">last text:</span>
        <div>{text.trim() || '(empty)'}</div>
      </div>
    </div>
  );
}

function NotFoundForm({
  initialDrawing,
  initialSpool,
  rawText,
  onCancel,
  onAdd,
}: {
  initialDrawing: string;
  initialSpool: string;
  rawText?: string;
  onCancel: () => void;
  onAdd: (drawing: string, spool: string) => void;
}) {
  const { t } = useLang();
  const [drawing, setDrawing] = useState(initialDrawing);
  const [spool, setSpool] = useState(initialSpool);
  const [showRaw, setShowRaw] = useState(false);
  return (
    <>
      <div className="text-xs uppercase tracking-wide text-red-600 font-semibold">
        {t('scan_not_found')}
      </div>
      <p className="text-xs text-gray-600 mt-1 mb-3">
        OCR couldn't find this on the active list. Edit the values if the
        camera misread them, then add to Uncharted.
      </p>
      <label className="block text-xs text-gray-500 mb-1">Drawing no. (Tek nr)</label>
      <input
        value={drawing}
        onChange={(e) => setDrawing(e.target.value)}
        placeholder="e.g. 322-FLA-1001-SS-100-P-2"
        className="w-full border rounded px-2 py-2 font-mono text-sm bg-white"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      <label className="block text-xs text-gray-500 mt-3 mb-1">Spool</label>
      <input
        value={spool}
        onChange={(e) => setSpool(e.target.value.toUpperCase())}
        maxLength={2}
        placeholder="A"
        className="w-20 border rounded px-2 py-2 font-mono text-sm bg-white"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      {rawText && (
        <div className="mt-3">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="text-xs text-gray-500 underline"
          >
            {showRaw ? 'Hide' : 'Show'} raw OCR text
          </button>
          {showRaw && (
            <pre className="text-[11px] text-gray-700 bg-gray-100 rounded p-2 mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all">
              {rawText.trim()}
            </pre>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-5">
        <button onClick={onCancel} className="border rounded py-3 font-medium">
          {t('scan_try_again')}
        </button>
        <button
          onClick={() => onAdd(drawing, spool)}
          className="bg-status-pending text-white rounded py-3 font-medium"
        >
          {t('scan_add_uncharted')}
        </button>
      </div>
    </>
  );
}

function RowContext({ item }: { item: MasterItem }) {
  const fields: { label: string; value?: string }[] = [
    { label: 'Diameter', value: item.diameter },
    { label: 'Paint', value: item.paintSpec && item.paintSpec !== 'N.A.' ? item.paintSpec : undefined },
    { label: 'RAL', value: item.ral && item.ral !== 'N.A.' ? item.ral : undefined },
    { label: 'Ch.clean.', value: item.chClean },
    { label: 'Project', value: item.project },
    { label: 'Iso', value: item.isoNumber !== item.drawing ? item.isoNumber : undefined },
  ].filter((f) => !!f.value);
  if (fields.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs bg-gray-50 rounded p-2">
      {fields.map((f) => (
        <div key={f.label} className="flex justify-between">
          <span className="text-gray-500">{f.label}</span>
          <span className="text-gray-900 font-medium">{f.value}</span>
        </div>
      ))}
      {item.remark && (
        <div className="col-span-2 text-gray-600 italic mt-1">{item.remark}</div>
      )}
    </div>
  );
}

function PendingDialog({
  pending,
  onCancel,
  onConfirm,
  onReject,
  onPickSpool,
  onAddUncharted,
}: {
  pending: PendingFlow;
  onCancel: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onPickSpool: (s: string) => void;
  onAddUncharted: (drawing: string, spool: string) => void;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-30">
      <div className="w-full sm:max-w-sm bg-white text-black rounded-t-2xl sm:rounded-2xl p-5 pb-7">
        {pending.type === 'matchFound' && pending.result && (
          <>
            <div className="text-xs uppercase tracking-wide text-accent font-semibold">
              {t('scan_match_found')}
            </div>
            <div className="font-mono text-lg font-semibold mt-1">
              {pending.result.drawing}
            </div>
            {pending.result.spool && (
              <div className="text-sm text-gray-600 mt-0.5">
                spool <span className="font-mono font-semibold">{pending.result.spool}</span>
              </div>
            )}
            {pending.matchedItem && <RowContext item={pending.matchedItem} />}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button onClick={onReject} className="border rounded py-3 font-medium">{t('scan_wrong_match')}</button>
              <button onClick={onConfirm} className="bg-status-verified text-white rounded py-3 font-medium">{t('scan_confirm')}</button>
            </div>
          </>
        )}
        {pending.type === 'fuzzy' && pending.result && (
          <>
            <div className="text-xs uppercase tracking-wide text-yellow-600 font-semibold">
              {t('scan_fuzzy_title')}
            </div>
            <div className="text-sm text-gray-700 mt-1">{t('scan_fuzzy_help')}</div>
            <div className="font-mono text-lg font-semibold mt-2">
              {pending.result.drawing}
              {pending.result.spool && (
                <span className="text-gray-500"> · {pending.result.spool}</span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              read as: {pending.result.observed}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button onClick={onReject} className="border rounded py-3 font-medium">{t('no')}</button>
              <button onClick={onConfirm} className="bg-status-verified text-white rounded py-3 font-medium">{t('yes')}</button>
            </div>
          </>
        )}
        {pending.type === 'partial' && pending.result && (
          <>
            <div className="text-xs uppercase tracking-wide text-blue-600 font-semibold">
              {t('scan_partial_title')}
            </div>
            <div className="font-mono text-lg font-semibold mt-1">
              {pending.result.drawing}
            </div>
            <div className="text-sm text-gray-700 mt-1">{t('scan_partial_help')}</div>
            <div className="flex gap-2 flex-wrap mt-3">
              {(pending.result.availableSpools ?? []).map((s) => (
                <button
                  key={s}
                  onClick={() => onPickSpool(s)}
                  className="px-4 py-3 border rounded-lg font-mono text-lg active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>
            <button onClick={onCancel} className="mt-4 w-full text-gray-500 py-2">
              {t('cancel')}
            </button>
          </>
        )}
        {pending.type === 'notFound' && (
          <NotFoundForm
            initialDrawing={pending.drawing ?? ''}
            initialSpool={pending.spool ?? ''}
            rawText={pending.rawText}
            onCancel={onCancel}
            onAdd={onAddUncharted}
          />
        )}
      </div>
    </div>
  );
}
