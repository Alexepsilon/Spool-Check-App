import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { listUncharted, setUnchartedDisposition } from '../lib/db';
import { useLang } from '../lib/i18n';
import type { Disposition, UnchartedItem } from '../lib/types';

const DISPOSITIONS: { key: Disposition; labelKey: string; colour: string }[] = [
  { key: 'wrong_project', labelKey: 'disp_wrong_project', colour: 'bg-status-wrong' },
  { key: 'other_system', labelKey: 'disp_other_system', colour: 'bg-blue-500' },
  { key: 'advance_delivery', labelKey: 'disp_advance', colour: 'bg-status-pending' },
  { key: 'investigate', labelKey: 'disp_investigate', colour: 'bg-status-damaged' },
  { key: 'resolved', labelKey: 'disp_resolved', colour: 'bg-status-verified' },
];

export default function UnchartedPage() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const navigate = useNavigate();
  const { t } = useLang();
  const [items, setItems] = useState<UnchartedItem[]>([]);
  const [pickFor, setPickFor] = useState<UnchartedItem | null>(null);

  useEffect(() => {
    if (!deliveryId) navigate('/');
    void refresh();
  }, [deliveryId]);

  const refresh = async () => {
    if (!deliveryId) return;
    setItems(await listUncharted(deliveryId));
  };

  const setDisp = async (id: string, d: Disposition) => {
    await setUnchartedDisposition(id, d);
    setPickFor(null);
    void refresh();
  };

  return (
    <Layout title={t('uncharted_title')} showBack>
      <div className="p-3 text-sm text-gray-600 bg-yellow-50 border-b">
        {t('uncharted_subtitle')}
      </div>
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 p-6 text-center">
          {t('uncharted_empty')}
        </div>
      ) : (
        <ul className="divide-y bg-white flex-1">
          {items.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setPickFor(u)}
                className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-100 text-left"
              >
                <span
                  className={
                    'w-2.5 h-2.5 rounded-full flex-shrink-0 ' +
                    (DISPOSITIONS.find((d) => d.key === u.disposition)?.colour ?? 'bg-gray-400')
                  }
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm font-medium truncate">{u.drawing}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex gap-2">
                    {u.spool && (
                      <span className="bg-gray-100 px-1.5 rounded">spool {u.spool}</span>
                    )}
                    <span>{new Date(u.timestamp).toLocaleString()}</span>
                  </div>
                  {u.notes && <div className="text-xs text-gray-400 mt-0.5">{u.notes}</div>}
                </div>
                <span className="text-xs text-gray-500 capitalize">
                  {t(`disp_${u.disposition}` as never).replace('_', ' ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pickFor && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end z-30"
          onClick={() => setPickFor(null)}
        >
          <div
            className="w-full bg-white rounded-t-2xl p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-sm font-semibold mb-1">{pickFor.drawing}</div>
            <div className="text-xs text-gray-500 mb-3">Set disposition</div>
            <div className="grid grid-cols-2 gap-2">
              {DISPOSITIONS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setDisp(pickFor.id, d.key)}
                  className={`${d.colour} text-white rounded-lg py-3 font-medium text-sm active:scale-95`}
                >
                  {t(d.labelKey as never)}
                </button>
              ))}
            </div>
            <button onClick={() => setPickFor(null)} className="mt-4 w-full text-gray-600 py-2">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
