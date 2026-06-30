import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { COUNTRIES, CURRENCIES, LOCALES, TIMEZONES, countryByCode } from '../lib/countries';

interface NotificationSettings {
  ntfy_url: string;
  lead_days: number;
}

interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function SettingsForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [leadDays, setLeadDays] = useState('3');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);

  // Household preferences (country drives currency / locale / timezone defaults).
  const prefs = usePreferences();
  const [country, setCountry] = useState(prefs.country);
  const [currency, setCurrency] = useState(prefs.currency);
  const [locale, setLocale] = useState(prefs.locale);
  const [timezone, setTimezone] = useState(prefs.timezone);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Keep local fields in sync once preferences finish loading.
  useEffect(() => {
    setCountry(prefs.country);
    setCurrency(prefs.currency);
    setLocale(prefs.locale);
    setTimezone(prefs.timezone);
  }, [prefs.country, prefs.currency, prefs.locale, prefs.timezone]);

  const onCountryChange = (code: string) => {
    setCountry(code);
    const c = countryByCode(code);
    if (c) { setCurrency(c.currency); setLocale(c.locale); setTimezone(c.timezone); }
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    setMessage(null);
    try {
      await prefs.save({ country, currency, locale, timezone });
      setMessage({ kind: 'ok', text: t('settings.preferencesSaved') });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message.replace(/^\d+\s+/, '') : t('settings.saveFailed') });
    } finally {
      setSavingPrefs(false);
    }
  };

  const loadBackups = () => {
    api.get<BackupInfo[]>('/settings/backups').then(setBackups).catch(() => {});
  };

  useEffect(() => {
    api
      .get<NotificationSettings>('/settings/notifications')
      .then((s) => { setUrl(s.ntfy_url); setLeadDays(String(s.lead_days)); })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadBackups();
  }, []);

  const backupNow = async () => {
    setBackingUp(true);
    setMessage(null);
    try {
      await api.post('/settings/backups/run', {});
      setMessage({ kind: 'ok', text: t('settings.backupCreated') });
      loadBackups();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message.replace(/^\d+\s+/, '') : t('settings.backupFailed') });
    } finally {
      setBackingUp(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.put('/settings/notifications', {
        ntfy_url: url.trim(),
        lead_days: Number(leadDays) || 0,
      });
      setMessage({ kind: 'ok', text: t('settings.saved') });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : t('settings.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      // Persist first so the test hits the current URL.
      await api.put('/settings/notifications', {
        ntfy_url: url.trim(),
        lead_days: Number(leadDays) || 0,
      });
      await api.post('/settings/notifications/test', {});
      setMessage({ kind: 'ok', text: t('settings.testSent') });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message.replace(/^\d+\s+/, '') : t('settings.testFailed') });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      {/* Preferences — country drives currency / locale / timezone, all overridable */}
      <div className="space-y-3 border-b border-zinc-800/60 pb-4">
        <label className={`${labelCls} mb-0`}>{t('settings.preferences')}</label>
        <div>
          <label htmlFor="country" className="mb-1.5 block text-xs text-zinc-500">{t('settings.country')}</label>
          <select
            id="country"
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
            className={`${fieldCls} [color-scheme:dark]`}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="pref_currency" className="mb-1.5 block text-xs text-zinc-500">{t('settings.currency')}</label>
            <select
              id="pref_currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={`${fieldCls} [color-scheme:dark]`}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="pref_locale" className="mb-1.5 block text-xs text-zinc-500">{t('settings.locale')}</label>
            <select
              id="pref_locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className={`${fieldCls} [color-scheme:dark]`}
            >
              {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="pref_tz" className="mb-1.5 block text-xs text-zinc-500">{t('settings.timezone')}</label>
          <select
            id="pref_tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={`${fieldCls} [color-scheme:dark]`}
          >
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={savePrefs}
          disabled={savingPrefs}
          className="w-full rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 disabled:opacity-50"
        >
          {savingPrefs ? t('common.saving') : t('settings.savePreferences')}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        {t('settings.notificationsIntro')}
      </p>

      <div>
        <label htmlFor="ntfy_url" className={labelCls}>{t('settings.notificationUrl')}</label>
        <input
          id="ntfy_url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://ntfy.sh/…"
          className={fieldCls}
        />
      </div>

      <div>
        <label htmlFor="lead_days" className={labelCls}>{t('settings.remindDaysAhead')}</label>
        <input
          id="lead_days"
          type="number"
          min="0"
          max="60"
          value={leadDays}
          onChange={(e) => setLeadDays(e.target.value)}
          className={`${fieldCls} [color-scheme:dark]`}
        />
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
          {message.text}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={sendTest}
          disabled={testing || saving || !url.trim()}
          className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 disabled:opacity-50"
        >
          {testing ? t('settings.sending') : t('settings.sendTest')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || testing}
          className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('settings.save')}
        </button>
      </div>

      {/* Backups */}
      <div className="border-t border-zinc-800/60 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <label className={`${labelCls} mb-0`}>{t('settings.backups')}</label>
          <button
            type="button"
            onClick={backupNow}
            disabled={backingUp}
            className="text-xs text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-200 disabled:opacity-50"
          >
            {backingUp ? t('settings.backingUp') : t('settings.backupNow')}
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-zinc-500">
          {t('settings.backupsIntro')}
        </p>
        {backups.length === 0 ? (
          <p className="text-xs text-zinc-600">{t('settings.noBackups')}</p>
        ) : (
          <ul className="space-y-1.5">
            {backups.map((b) => (
              <li
                key={b.name}
                className="flex items-center gap-3 rounded-xl border border-zinc-800/60 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{b.name}</span>
                <span className="flex-shrink-0 text-xs tabular-nums text-zinc-600">{formatSize(b.size)}</span>
                <a
                  href={`/api/settings/backups/${b.name}`}
                  download
                  className="flex-shrink-0 text-xs text-emerald-500 underline-offset-2 hover:text-emerald-400"
                >
                  {t('settings.download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full pt-1 text-center text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {t('common.close')}
      </button>
    </div>
  );
}
