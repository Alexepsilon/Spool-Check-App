import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout, { LangToggleButton } from '../components/Layout';
import { listDeliveries } from '../lib/db';
import type { Delivery } from '../lib/types';
import { useLang } from '../lib/i18n';

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [counts, setCounts] = useState<Record<string, { total: number; verified: number }>>(
    {},
  );

  useEffect(() => {
    refresh();
  }, []);

  const refresh = async () => {
    const all = await listDeliveries();
    setDeliveries(all);
    // Lazy item count per delivery — small lists, fine.
    const { listItems } = await import('../lib/db');
    const next: typeof counts = {};
    for (const d of all) {
      const items = await listItems(d.id);
      next[d.id] = {
        total: items.length,
        verified: items.filter((i) => i.status === 'verified').length,
      };
    }
    setCounts(next);
  };

  return (
    <Layout title={t('app_title')} right={<TopRight />}>
      <div className="flex-1 flex flex-col">
        {deliveries === null ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            ...
          </div>
        ) : deliveries.length === 0 ? (
          <Empty onCreate={() => navigate('/import')} />
        ) : (
          <ul className="divide-y bg-white">
            {deliveries.map((d) => {
              const c = counts[d.id] ?? { total: 0, verified: 0 };
              const pct = c.total === 0 ? 0 : Math.round((c.verified * 100) / c.total);
              return (
                <li key={d.id}>
                  <Link
                    to={`/board/${d.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{d.name}</div>
                      <div className="text-xs text-gray-500">
                        {c.verified} / {c.total} · {new Date(d.importedAt).toLocaleString()}
                      </div>
                    </div>
                    <Ring pct={pct} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Link
        to="/import"
        className="fixed bottom-4 right-4 bg-accent text-white rounded-full px-5 py-3 shadow-lg flex items-center gap-2 active:scale-95"
      >
        <span className="text-xl">+</span>
        <span className="font-medium">{t('home_new')}</span>
      </Link>
    </Layout>
  );
}

function TopRight() {
  return (
    <div className="flex items-center gap-2">
      <LangToggleButton />
      <Link
        to="/settings"
        className="p-2 -mr-2 rounded hover:bg-white/10 active:bg-white/20"
        aria-label="Settings"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  const { t } = useLang();
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <div className="text-6xl mb-4">📋</div>
      <h2 className="text-xl font-semibold">{t('home_empty_title')}</h2>
      <p className="text-gray-600 mt-2">{t('home_empty_subtitle')}</p>
      <button
        onClick={onCreate}
        className="mt-6 bg-primary text-white px-6 py-3 rounded-lg font-medium active:scale-95"
      >
        {t('home_new')}
      </button>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const radius = 16;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={radius} stroke="#e5e7eb" strokeWidth="4" fill="none" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke="#26a65b"
          strokeWidth="4"
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
        {pct}%
      </div>
    </div>
  );
}
