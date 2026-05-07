import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { createDelivery } from '../lib/db';
import { parseCsv, parsePhoto, parseXlsx, type ImportResult } from '../lib/importers';
import { useLang } from '../lib/i18n';
import type { Delivery, MasterItem } from '../lib/types';

export default function ImportPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(t('import_reading_excel'));
    try {
      const buf = await file.arrayBuffer();
      let result: ImportResult;
      if (file.name.toLowerCase().endsWith('.csv')) {
        result = await parseCsv(new TextDecoder().decode(buf));
      } else {
        result = await parseXlsx(buf);
      }
      if (result.items.length === 0) {
        setError(t('import_no_codes'));
        return;
      }
      // Stash and continue to mapping screen.
      sessionStorage.setItem(
        'import:pending',
        JSON.stringify({
          name: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
          source: file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx',
          result,
        }),
      );
      navigate('/import/map');
    } catch (e) {
      setError(`${t('import_failed')}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handlePhoto = async (file: File) => {
    setError(null);
    setBusy(t('import_running_ocr'));
    try {
      const result = await parsePhoto(file);
      if (result.items.length === 0) {
        setError(t('import_no_codes'));
        return;
      }
      // Photo route: spool letters not extracted; save direct, user can edit.
      const deliveryId = crypto.randomUUID();
      const delivery: Delivery = {
        id: deliveryId,
        name: 'Photo import — ' + new Date().toLocaleDateString(),
        importedAt: Date.now(),
        sourceType: 'photo',
        status: 'open',
      };
      const items: MasterItem[] = result.items.map((it) => ({
        id: crypto.randomUUID(),
        deliveryId,
        drawing: it.drawing,
        spool: it.spool,
        isoNumber: it.isoNumber,
        project: it.project,
        diameter: it.diameter,
        paintSpec: it.paintSpec,
        ral: it.ral,
        chClean: it.chClean,
        remark: it.remark,
        status: 'expected',
      }));
      await createDelivery(delivery, items);
      navigate(`/board/${deliveryId}`, { replace: true });
    } catch (e) {
      setError(`${t('import_failed')}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout title={t('import_title')} showBack>
      <div className="p-4 flex flex-col gap-3 max-w-md w-full mx-auto">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePhoto(f);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={!!busy}
          className="bg-white border rounded-lg px-4 py-4 flex items-center gap-3 active:bg-gray-100 disabled:opacity-50"
        >
          <span className="text-2xl">📊</span>
          <div className="text-left flex-1">
            <div className="font-medium">{t('import_pick_file')}</div>
            <div className="text-xs text-gray-500">.xlsx or .csv</div>
          </div>
        </button>
        <button
          onClick={() => photoInput.current?.click()}
          disabled={!!busy}
          className="bg-white border rounded-lg px-4 py-4 flex items-center gap-3 active:bg-gray-100 disabled:opacity-50"
        >
          <span className="text-2xl">📷</span>
          <div className="text-left flex-1">
            <div className="font-medium">{t('import_pick_photo')}</div>
            <div className="text-xs text-gray-500">OCR-based</div>
          </div>
        </button>
        {busy && (
          <div className="mt-4 text-center text-gray-700">
            <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-primary rounded-full animate-spin"></div>
            <div className="mt-2">{busy}</div>
          </div>
        )}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
            {error}
          </div>
        )}
      </div>
    </Layout>
  );
}
