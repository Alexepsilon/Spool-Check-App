import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../lib/i18n';

interface Props {
  title: string;
  showBack?: boolean;
  right?: ReactNode;
  children: ReactNode;
}

export default function Layout({ title, showBack, right, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-primary text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 rounded hover:bg-white/10 active:bg-white/20"
            aria-label="Back"
          >
            <BackIcon />
          </button>
        )}
        <h1 className="text-lg font-semibold flex-1 truncate">{title}</h1>
        {right}
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function LangToggleButton() {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'nl' : 'en')}
      className="px-2 py-1 text-xs rounded border border-white/40 hover:bg-white/10 active:bg-white/20"
      aria-label="Toggle language"
    >
      {lang.toUpperCase()}
    </button>
  );
}
