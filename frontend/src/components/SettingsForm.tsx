import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePreferences, applyTheme, type Theme } from '../lib/preferences';
import { COUNTRIES, CURRENCIES, LOCALES, TIMEZONES, countryByCode } from '../lib/countries';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from '../lib/i18n';
import { isPushSupported, isSubscribed, enablePush, disablePush } from '../lib/push';

interface NotificationSettings {
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
// Section headers group fields; field labels inside stay quiet so the two read differently.
const sectionCls = 'text-xs font-medium uppercase tracking-widest text-zinc-500';
const gLabelCls = 'mb-1.5 block text-xs text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function SettingsForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  // Household-wide config and infrastructure (backups, calendar token, reminder
  // window) are admin-only on the server; hide those controls from members so
  // they never hit a 403. Members keep appearance + their own device's push.
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [leadDays, setLeadDays] = useState('3');
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupported = isPushSupported();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [calToken, setCalToken] = useState<string | null>(null);
  const [calCopied, setCalCopied] = useState(false);

  // Household preferences (country drives currency / locale / timezone defaults).
  const prefs = usePreferences();
  const [householdName, setHouseholdName] = useState(prefs.household_name);
  const [country, setCountry] = useState(prefs.country);
  const [currency, setCurrency] = useState(prefs.currency);
  const [locale, setLocale] = useState(prefs.locale);
  const [timezone, setTimezone] = useState(prefs.timezone);
  const [language, setLanguage] = useState(prefs.language);
  const [savingsOpening, setSavingsOpening] = useState(String(prefs.savings_opening || ''));
  const [theme, setTheme] = useState<Theme>(prefs.theme);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [tab, setTab] = useState<'general' | 'notifications' | 'data'>('general');

  // Keep local fields in sync once preferences finish loading.
  useEffect(() => {
    setHouseholdName(prefs.household_name);
    setCountry(prefs.country);
    setCurrency(prefs.currency);
    setLocale(prefs.locale);
    setTimezone(prefs.timezone);
    setLanguage(prefs.language);
    setSavingsOpening(String(prefs.savings_opening || ''));
    setTheme(prefs.theme);
  }, [prefs.household_name, prefs.country, prefs.currency, prefs.locale, prefs.timezone, prefs.language, prefs.savings_goal, prefs.savings_opening, prefs.theme]);

  // Apply the theme live as the user toggles, for instant feedback.
  const onThemeChange = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  const onCountryChange = (code: string) => {
    setCountry(code);
    const c = countryByCode(code);
    if (c) { setCurrency(c.currency); setLocale(c.locale); setTimezone(c.timezone); }
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    setMessage(null);
    try {
      await prefs.save({ household_name: householdName.trim(), country, currency, locale, timezone, language, savings_goal: prefs.savings_goal, savings_opening: Number(savingsOpening) || 0, theme });
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
      .then((s) => { setLeadDays(String(s.lead_days)); })
      .catch(() => {})
      .finally(() => setLoading(false));
    if (pushSupported) isSubscribed().then(setPushOn).catch(() => {});
    // Backups + the calendar token are admin-only on the server.
    if (isAdmin) {
      loadBackups();
      api.get<{ token: string }>('/settings/calendar').then((r) => setCalToken(r.token)).catch(() => {});
    }
  }, []);

  const calUrl = calToken ? `${window.location.origin}/api/calendar/${calToken}.ics` : '';
  const copyCal = async () => {
    if (!calUrl) return;
    try { await navigator.clipboard.writeText(calUrl); setCalCopied(true); } catch { /* clipboard blocked */ }
  };
  const regenCal = async () => {
    try {
      const r = await api.post<{ token: string }>('/settings/calendar/rotate', {});
      setCalToken(r.token);
      setCalCopied(false);
    } catch (err) {
      console.error(err);
    }
  };

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
      await api.put('/settings/notifications', { lead_days: Number(leadDays) || 0 });
      setMessage({ kind: 'ok', text: t('settings.saved') });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : t('settings.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const togglePush = async () => {
    setPushBusy(true);
    setMessage(null);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        await enablePush();
        setPushOn(true);
      }
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message.replace(/^\d+\s+/, '') : t('settings.pushFailed') });
    } finally {
      setPushBusy(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
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
      {/* Tabs — split the long form into focused sections. */}
      <div role="tablist" aria-label={t('common.settings')} className="flex gap-1 rounded-xl border border-zinc-800/60 bg-zinc-950 p-1">
        {([
          ['general', 'settings.tabGeneral'],
          ['notifications', 'settings.tabNotifications'],
          ...(isAdmin ? [['data', 'settings.tabData'] as const] : []),
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={['flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', tab === key ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'].join(' ')}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {/* General — grouped into Household / Region / Money / Appearance so the
          long form reads as a few small decisions instead of one wall of fields. */}
      {tab === 'general' && (
      <div className="animate-fade-slide-in space-y-5">
        {isAdmin && (<>
        <section className="space-y-3">
          <p className={sectionCls}>{t('settings.sectionHousehold')}</p>
          <div>
            <label htmlFor="household_name" className={gLabelCls}>{t('settings.householdName')}</label>
            <input
              id="household_name"
              type="text"
              maxLength={60}
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder={t('settings.householdNamePlaceholder')}
              className={`${fieldCls}`}
            />
          </div>
        </section>

        <section className="space-y-3 border-t border-zinc-800/60 pt-4">
          <p className={sectionCls}>{t('settings.sectionRegion')}</p>
          <div>
            <label htmlFor="country" className={gLabelCls}>{t('settings.country')}</label>
            <select
              id="country"
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
              className={`${fieldCls}`}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="pref_currency" className={gLabelCls}>{t('settings.currency')}</label>
              <select
                id="pref_currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={`${fieldCls}`}
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="pref_locale" className={gLabelCls}>{t('settings.locale')}</label>
              <select
                id="pref_locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className={`${fieldCls}`}
              >
                {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="pref_tz" className={gLabelCls}>{t('settings.timezone')}</label>
            <select
              id="pref_tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={`${fieldCls}`}
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pref_language" className={gLabelCls}>{t('settings.language')}</label>
            <select
              id="pref_language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={`${fieldCls}`}
            >
              {SUPPORTED_LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
            </select>
          </div>
        </section>

        <section className="space-y-3 border-t border-zinc-800/60 pt-4">
          <p className={sectionCls}>{t('settings.sectionMoney')}</p>
          <div>
            <label htmlFor="pref_savings_opening" className={gLabelCls}>{t('settings.currentSavings')}</label>
            <input
              id="pref_savings_opening"
              type="number"
              min="0"
              step="0.01"
              value={savingsOpening}
              onChange={(e) => setSavingsOpening(e.target.value)}
              placeholder="0.00"
              className={`${fieldCls}`}
            />
            <p className="mt-1 text-xs text-zinc-600">{t('settings.currentSavingsHint')}</p>
          </div>
          {/* Savings targets now live on each pot (Money → tap a pot). */}
          <p className="text-xs text-zinc-600">{t('settings.potsHint')}</p>
        </section>
        </>)}

        <section className={`space-y-3 ${isAdmin ? 'border-t border-zinc-800/60 pt-4' : ''}`}>
          <p className={sectionCls}>{t('settings.sectionAppearance')}</p>
          <div>
            <span className={gLabelCls}>{t('settings.theme')}</span>
            <div className="grid grid-cols-2 gap-2">
              {(['dark', 'light'] as Theme[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onThemeChange(opt)}
                  aria-pressed={theme === opt}
                  className={[
                    'rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                    theme === opt
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                      : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                >
                  {t(`settings.theme_${opt}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {isAdmin ? (
          <button
            type="button"
            onClick={savePrefs}
            disabled={savingPrefs}
            className="w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {savingPrefs ? t('common.saving') : t('settings.savePreferences')}
          </button>
        ) : (
          // Members have no server-side prefs to save; theme applies live and is
          // remembered on this device.
          <p className="text-xs text-zinc-600">{t('settings.themeDeviceHint')}</p>
        )}
      </div>
      )}

      {/* Notifications */}
      {tab === 'notifications' && (
      <div className="animate-fade-slide-in space-y-4">
      <p className="text-xs leading-relaxed text-zinc-500">
        {t('settings.notificationsIntro')}
      </p>

      {/* Web Push toggle for this device */}
      {pushSupported ? (
        <button
          type="button"
          onClick={togglePush}
          disabled={pushBusy}
          aria-pressed={pushOn}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 px-3 py-2.5 text-left disabled:opacity-50"
        >
          <span className="min-w-0">
            <span className="block text-sm text-zinc-200">{t('settings.pushOnThisDevice')}</span>
            <span className="block text-xs text-zinc-500">
              {pushBusy ? t('common.pleaseWait') : pushOn ? t('settings.pushEnabled') : t('settings.pushDisabled')}
            </span>
          </span>
          <span className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${pushOn ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${pushOn ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} />
          </span>
        </button>
      ) : (
        <p className="rounded-xl border border-zinc-800 px-3 py-2.5 text-xs text-zinc-500">
          {t('settings.pushUnsupported')}
        </p>
      )}

      {/* The reminder window is a household-wide setting → admin only. */}
      {isAdmin && (
      <div>
        <label htmlFor="lead_days" className={labelCls}>{t('settings.remindDaysAhead')}</label>
        <input
          id="lead_days"
          type="number"
          min="0"
          max="60"
          value={leadDays}
          onChange={(e) => setLeadDays(e.target.value)}
          className={`${fieldCls}`}
        />
      </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={sendTest}
          disabled={testing || saving || !pushOn}
          className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 disabled:opacity-50"
        >
          {testing ? t('settings.sending') : t('settings.sendTest')}
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={save}
            disabled={saving || testing}
            className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('settings.save')}
          </button>
        )}
      </div>
      </div>
      )}

      {/* Data — calendar feed + backups */}
      {tab === 'data' && (
      <div className="animate-fade-slide-in space-y-4">
      {/* Backups */}
      <div>
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

      {/* Calendar feed */}
      <div className="border-t border-zinc-800/60 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <label className={`${labelCls} mb-0`}>{t('settings.calendar')}</label>
          <button
            type="button"
            onClick={regenCal}
            className="text-xs text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-200"
          >
            {t('settings.calendarRegenerate')}
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-zinc-500">{t('settings.calendarIntro')}</p>
        {calUrl && (
          <button
            type="button"
            onClick={copyCal}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-left"
          >
            <p className="mb-1 text-xs text-zinc-500">{calCopied ? t('settings.calendarCopied') : t('settings.calendarUrl')}</p>
            <p className="break-all text-xs text-zinc-300">{calUrl}</p>
          </button>
        )}
      </div>
      </div>
      )}

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
          {message.text}
        </p>
      )}

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
