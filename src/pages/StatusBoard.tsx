import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout, { LangToggleButton } from '../components/Layout';
import ProgressStrip from '../components/ProgressStrip';
import {
  getDelivery,
  listItems,
  listUncharted,
  setItemStatus,
} from '../lib/db';
import { useLang } from '../lib/i18n';
import type { Delivery, ItemStatus, MasterItem } from '../lib/types';

const FILTERS = ['all', 'remaining', 'verified', 'missing'] as const;
type Filter = (typeof FILTERS)[number];

export default function StatusBoardPage() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const navigate = useNavigate();
  const { t } = useLang();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [items, setItems] = useState<MasterItem[]>([]);
  const [unchartedCount, setUnchartedCount] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [actionItem, setActionItem] = useState<MasterItem | null>(null);

  useEffect(() => {
    if (!deliveryId) return;
    void refresh();
    // Refresh on visibility (e.g. coming back from Scanner)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [deliveryId]);

  const refresh = async () => {
    if (!deliveryId) return;
    const [d, i, u] = await Promise.all([
      getDelivery(deliveryId),
      listItems(deliveryId),
      listUncharted(deliveryId),
    ]);
    if (!d) {
      navigate('/');
      return;
    }
    setDelivery(d);
    setItems(i);
    setUnchartedCount(u.length);
  };

  const counts = useMemo(() => {
    const total = items.length;
    const verified = items.filter((i) => i.status === 'verified').length;
    const missing = items.filter((i) => i.status === 'missing').length;
    const damaged = items.filter((i) => i.status === 'damaged').length;
    return { total, verified, missing, damaged };
  }, [items]);

  const visible = useMemo(() => {
    return items.filter((i) => {
      if (filter === 'remaining' && i.status !== 'expected') return false;
      if (filter === 'verified' && i.status !== 'verified') return false;
      if (filter === 'missing' && i.status !== 'missing') return false;
      if (search) {
        const q = search.toLowerCase();
        if (!i.drawing.toLowerCase().includes(q) && !i.spool.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [items, filter, search]);

  const onChangeStatus = async (item: MasterItem, status: ItemStatus) => {
    setActionItem(null);
    await setItemStatus(item.id, status);
    void refresh();
  };

  if (!delivery) return null;

  return (
    <Layout title={delivery.name} showBack right={<LangToggleButton />}>
      <div className="bg-primary text-white">
        <ProgressStrip
          total={counts.total}
          verified={counts.verified}
          missing={counts.missing}
          variant="wide"
          theme="dark"
        />
      </div>
      <div className="bg-white px-3 py-2 border-b sticky top-14 z-20 flex flex-col gap-2">
        <input
          type="search"
          placeholder={t('board_search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded px-3 py-2 bg-gray-50"
        />
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'px-3 py-1 rounded-full text-sm whitespace-nowrap ' +
                (filter === f
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700')
              }
            >
              {t(`board_filter_${f}` as never)}
            </button>
          ))}
          <Link
            to={`/uncharted/${deliveryId}`}
            className={
              'ml-auto px-3 py-1 rounded-full text-sm whitespace-nowrap border ' +
              (unchartedCount > 0
                ? 'bg-status-pending/20 text-yellow-900 border-status-pending/40 font-medium'
                : 'bg-gray-50 text-gray-600 border-gray-200')
            }
          >
            ⚠ {t('uncharted_title')}{unchartedCount > 0 ? ` (${unchartedCount})` : ''}
          </Link>
        </div>
      </div>
      <div className="bg-white flex-1 overflow-x-auto">
        {/* Column headers — scroll horizontally together with the rows. */}
        <div className="min-w-max flex bg-gray-50 border-b text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          <div className="sticky left-0 z-10 bg-gray-50 px-3 py-2 min-w-[230px] border-r">
            Drawing no.
          </div>
          <Cell w="60px">Spool</Cell>
          <Cell w="80px">Ø</Cell>
          <Cell w="110px">Paint spec.</Cell>
          <Cell w="80px">RAL</Cell>
          <Cell w="90px">Ch.clean.</Cell>
          <Cell w="90px">Project</Cell>
          <Cell w="200px">Iso number</Cell>
          <Cell w="200px">Remark</Cell>
          <Cell w="130px">Verified at</Cell>
        </div>
        {visible.length === 0 ? (
          <div className="text-center text-gray-500 py-12">No matches</div>
        ) : (
          <ul className="min-w-max divide-y">
            {visible.map((item) => (
              <li key={item.id}>
                <div
                  onClick={() => setActionItem(item)}
                  className="flex items-center cursor-pointer active:bg-gray-100"
                >
                  <div className="sticky left-0 z-10 bg-white flex items-center gap-3 px-3 py-3 min-w-[230px] border-r">
                    <StatusDot status={item.status} />
                    <span className="font-mono text-sm font-medium truncate">
                      {item.drawing}
                    </span>
                  </div>
                  <Cell w="60px">
                    {item.spool && (
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                        {item.spool}
                      </span>
                    )}
                  </Cell>
                  <Cell w="80px">{item.diameter || '—'}</Cell>
                  <Cell w="110px">
                    {item.paintSpec && item.paintSpec !== 'N.A.' ? item.paintSpec : '—'}
                  </Cell>
                  <Cell w="80px">
                    {item.ral && item.ral !== 'N.A.' ? item.ral : '—'}
                  </Cell>
                  <Cell w="90px">{item.chClean || '—'}</Cell>
                  <Cell w="90px">{item.project || '—'}</Cell>
                  <Cell w="200px" mono>
                    {item.isoNumber && item.isoNumber !== item.drawing
                      ? item.isoNumber
                      : '—'}
                  </Cell>
                  <Cell w="200px">{item.remark || '—'}</Cell>
                  <Cell w="130px">
                    {item.verifiedAt
                      ? new Date(item.verifiedAt).toLocaleString()
                      : '—'}
                  </Cell>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sticky bottom-0 p-3 bg-white border-t">
        <Link
          to={`/scan/${deliveryId}`}
          className="block w-full bg-accent text-white text-center rounded-lg py-3 font-medium active:scale-95"
        >
          📷  {t('board_open_scanner')}
        </Link>
      </div>
      {actionItem && (
        <StatusActionSheet
          item={actionItem}
          onClose={() => setActionItem(null)}
          onChange={(s) => onChangeStatus(actionItem, s)}
        />
      )}
    </Layout>
  );
}

function Cell({
  w,
  mono,
  children,
}: {
  w: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        'flex-shrink-0 px-3 py-3 text-sm text-gray-700 truncate ' +
        (mono ? 'font-mono' : '')
      }
      style={{ minWidth: w, maxWidth: w }}
    >
      {children}
    </div>
  );
}

function StatusDot({ status }: { status: ItemStatus }) {
  const colour = {
    expected: 'bg-status-expected',
    verified: 'bg-status-verified',
    missing: 'bg-status-missing',
    damaged: 'bg-status-damaged',
    wrong_item: 'bg-status-wrong',
  }[status];
  return <span className={`inline-block w-3 h-3 rounded-full ${colour} flex-shrink-0`} />;
}

function StatusActionSheet({
  item,
  onClose,
  onChange,
}: {
  item: MasterItem;
  onClose: () => void;
  onChange: (s: ItemStatus) => void;
}) {
  const { t } = useLang();
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end z-30"
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-2xl p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-mono text-sm font-semibold mb-1">
          {item.drawing} {item.spool && <span className="text-gray-500">· {item.spool}</span>}
        </div>
        <div className="text-xs text-gray-500 mb-4">{t('board_status_change')}</div>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn colour="bg-status-verified" label={t('board_mark_verified')} onClick={() => onChange('verified')} />
          <ActionBtn colour="bg-status-missing" label={t('board_mark_missing')} onClick={() => onChange('missing')} />
          <ActionBtn colour="bg-status-damaged" label={t('board_mark_damaged')} onClick={() => onChange('damaged')} />
          <ActionBtn colour="bg-status-expected" label={t('board_mark_expected')} onClick={() => onChange('expected')} />
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full text-gray-600 py-2"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

function ActionBtn({ colour, label, onClick }: { colour: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`${colour} text-white rounded-lg py-3 font-medium text-sm active:scale-95`}
    >
      {label}
    </button>
  );
}
