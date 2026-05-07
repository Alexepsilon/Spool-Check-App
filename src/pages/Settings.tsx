import { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import {
  exportBackup,
  importBackup,
  loadSettings,
  saveSetting,
  type BackupBlob,
} from '../lib/db';
import { useLang, type Lang } from '../lib/i18n';
import { defaultSettings, type AppSettings } from '../lib/types';

export default function SettingsPage() {
  const { t, lang, setLang } = useLang();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [info, setInfo] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const update = async <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
    await saveSetting(k, v);
  };

  const onLang = async (l: Lang) => {
    await setLang(l);
    setSettings((s) => ({ ...s, language: l }));
  };

  const onExport = async () => {
    const blob = await exportBackup();
    const json = JSON.stringify(blob, null, 2);
    const file = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spool-check-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setInfo('Backup downloaded.');
  };

  const onImport = async (file: File) => {
    try {
      const text = await file.text();
      const blob = JSON.parse(text) as BackupBlob;
      await importBackup(blob);
      setInfo('Backup restored.');
    } catch (e) {
      setInfo(`Restore failed: ${(e as Error).message}`);
    }
  };

  return (
    <Layout title={t('settings_title')} showBack>
      <div className="p-4 max-w-md w-full mx-auto space-y-4">
        <Section title={t('settings_language')}>
          <div className="flex gap-2">
            <LangBtn label="English" active={lang === 'en'} onClick={() => onLang('en')} />
            <LangBtn label="Nederlands" active={lang === 'nl'} onClick={() => onLang('nl')} />
          </div>
        </Section>

        <Section title="Scanning">
          <Toggle
            label={t('settings_confirm_verified')}
            checked={settings.confirmBeforeVerified}
            onChange={(v) => update('confirmBeforeVerified', v)}
          />
          <Toggle
            label={t('settings_confirm_uncharted')}
            checked={settings.confirmBeforeUncharted}
            onChange={(v) => update('confirmBeforeUncharted', v)}
          />
          <Toggle
            label={t('settings_auto_confirm')}
            checked={settings.autoConfirmMode}
            onChange={(v) => update('autoConfirmMode', v)}
          />
          <Toggle
            label={t('settings_haptic')}
            checked={settings.haptic}
            onChange={(v) => update('haptic', v)}
          />
          <Toggle
            label={t('settings_sound')}
            checked={settings.sound}
            onChange={(v) => update('sound', v)}
          />
        </Section>

        <Section title={t('settings_backup')}>
          <p className="text-xs text-gray-500 mb-2">
            All data lives on this device. Export occasionally for a safety net.
          </p>
          <button
            onClick={onExport}
            className="w-full bg-primary text-white rounded py-3 font-medium active:scale-95"
          >
            {t('settings_export_json')}
          </button>
          <input
            type="file"
            accept=".json"
            ref={fileInput}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            className="mt-2 w-full border rounded py-3 font-medium active:scale-95"
          >
            {t('settings_import_json')}
          </button>
        </Section>

        {info && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded p-3">
            {info}
          </div>
        )}

        <Section title={t('settings_about')}>
          <p className="text-xs text-gray-500">
            Spool Check · v0.1 · all data local on this device.
          </p>
        </Section>
      </div>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 py-1 cursor-pointer">
      <span className="flex-1 text-sm">{label}</span>
      <span
        className={
          'relative inline-block w-10 h-6 rounded-full transition-colors ' +
          (checked ? 'bg-accent' : 'bg-gray-300')
        }
      >
        <span
          className={
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ' +
            (checked ? 'translate-x-4' : '')
          }
        />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function LangBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        'flex-1 px-3 py-2 rounded font-medium border ' +
        (active
          ? 'bg-primary text-white border-primary'
          : 'border-gray-200 text-gray-700')
      }
    >
      {label}
    </button>
  );
}
