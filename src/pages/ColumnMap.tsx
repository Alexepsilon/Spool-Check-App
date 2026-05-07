import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { createDelivery } from '../lib/db';
import type { ImportResult, ImportedItem } from '../lib/importers';
import { useLang } from '../lib/i18n';
import type { Delivery, MasterItem } from '../lib/types';

interface PendingImport {
  name: string;
  source: 'xlsx' | 'csv';
  result: ImportResult;
}

const standardFields: { key: keyof ImportedItem; labelKey: string }[] = [
  { key: 'drawing', labelKey: 'map_field_drawing' },
  { key: 'spool', labelKey: 'map_field_spool' },
  { key: 'isoNumber', labelKey: 'map_field_iso' },
  { key: 'project', labelKey: 'map_field_project' },
  { key: 'diameter', labelKey: 'map_field_diameter' },
  { key: 'paintSpec', labelKey: 'map_field_paint' },
  { key: 'ral', labelKey: 'map_field_ral' },
  { key: 'chClean', labelKey: 'map_field_chclean' },
  { key: 'remark', labelKey: 'map_field_remark' },
];

export default function ColumnMapPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [overrideMap, setOverrideMap] = useState<Record<string, number>>({});
  const [name, setName] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('import:pending');
    if (!raw) {
      navigate('/import', { replace: true });
      return;
    }
    const parsed: PendingImport = JSON.parse(raw);
    setPending(parsed);
    setName(parsed.name);
    if (parsed.result.columnMap) {
      setOverrideMap({ ...(parsed.result.columnMap as unknown as Record<string, number>) });
    }
  }, [navigate]);

  const headers = pending?.result.detectedHeader ?? [];

  const previewItems = useMemo(() => {
    if (!pending) return [];
    return pending.result.items.slice(0, 10);
  }, [pending]);

  const apply = async () => {
    if (!pending) return;
    const deliveryId = crypto.randomUUID();
    const delivery: Delivery = {
      id: deliveryId,
      name: name || pending.name,
      importedAt: Date.now(),
      sourceType: pending.source,
      status: 'open',
    };
    const items: MasterItem[] = pending.result.items.map((it) => ({
      id: crypto.randomUUID(),
      deliveryId,
      drawing: it.drawing,
      spool: it.spool.toUpperCase(),
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
    sessionStorage.removeItem('import:pending');
    navigate(`/board/${deliveryId}`, { replace: true });
  };

  if (!pending) return null;

  return (
    <Layout title={t('map_title')} showBack>
      <div className="p-4 max-w-md w-full mx-auto">
        <p className="text-sm text-gray-600 mb-4">{t('map_subtitle')}</p>
        <label className="block text-sm font-medium mb-1">List name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-4 bg-white"
        />
        <div className="bg-white border rounded divide-y">
          {standardFields.map(({ key, labelKey }) => {
            const idx = overrideMap[key] ?? -1;
            return (
              <div key={key} className="flex items-center px-3 py-2 gap-3">
                <div className="w-32 text-sm font-medium">{t(labelKey as never)}</div>
                <select
                  value={idx}
                  onChange={(e) =>
                    setOverrideMap((m) => ({ ...m, [key]: Number(e.target.value) }))
                  }
                  className="flex-1 border rounded px-2 py-1 bg-white text-sm"
                >
                  <option value={-1}>{t('map_unset')}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="mt-4 text-sm text-gray-600">
          Found <strong>{pending.result.items.length}</strong> items. Preview:
        </div>
        <div className="mt-2 bg-white border rounded divide-y text-sm font-mono">
          {previewItems.map((it, i) => (
            <div key={i} className="px-3 py-1 flex justify-between">
              <span>{it.drawing}</span>
              {it.spool && (
                <span className="text-gray-500">spool {it.spool}</span>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={apply}
          className="w-full mt-6 bg-accent text-white rounded-lg py-3 font-medium active:scale-95"
        >
          {t('map_apply')}
        </button>
      </div>
    </Layout>
  );
}
