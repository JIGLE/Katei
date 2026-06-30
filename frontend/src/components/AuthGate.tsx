import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { COUNTRIES, CURRENCIES, TIMEZONES, countryByCode, DEFAULT_COUNTRY } from '../lib/countries';
import { SUPPORTED_LANGUAGES } from '../lib/i18n';

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function AuthGate() {
  const { needsSetup, login, register } = useAuth();
  const prefs = usePreferences();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An invite link (?invite=CODE) puts the gate into "join" mode.
  const inviteCode = useMemo(() => new URLSearchParams(window.location.search).get('invite') ?? '', []);
  const [inviteValid, setInviteValid] = useState<boolean | null>(inviteCode ? null : false);
  useEffect(() => {
    if (!inviteCode) return;
    api.get<{ valid: boolean }>(`/auth/invite/${inviteCode}`)
      .then((r) => setInviteValid(!!r.valid))
      .catch(() => setInviteValid(false));
  }, [inviteCode]);

  const mode: 'invite' | 'setup' | 'signin' = inviteCode ? 'invite' : needsSetup ? 'setup' : 'signin';

  // Setup-only: country drives currency / locale / timezone, each overridable.
  const [country, setCountry] = useState(DEFAULT_COUNTRY.code);
  const [currency, setCurrency] = useState(DEFAULT_COUNTRY.currency);
  const [timezone, setTimezone] = useState(DEFAULT_COUNTRY.timezone);

  const onCountryChange = (code: string) => {
    setCountry(code);
    const c = countryByCode(code);
    if (c) { setCurrency(c.currency); setTimezone(c.timezone); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) {
      setError(t('auth.errNamePassword'));
      return;
    }
    if (mode !== 'signin' && password.length < 8) {
      setError(t('auth.errPasswordLen'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'setup') {
        await register(name.trim(), password);
        // Persist the household's region preferences right after the session
        // is created (locale follows the chosen country).
        const locale = countryByCode(country)?.locale ?? DEFAULT_COUNTRY.locale;
        // Default the UI language to the country's language when we support it,
        // otherwise English (e.g. Denmark → English UI, Danish formatting).
        const lang = locale.split('-')[0].toLowerCase();
        const language = (SUPPORTED_LANGUAGES as readonly string[]).includes(lang) ? lang : 'en';
        await api.put('/settings/preferences', { country, currency, locale, timezone, language }).catch(() => {});
        await prefs.reload();
      } else if (mode === 'invite') {
        await register(name.trim(), password, inviteCode);
        await prefs.reload();
      } else {
        await login(name.trim(), password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.errGeneric');
      // Surface the API's message rather than the raw "401 {json}" string.
      setError(msg.replace(/^\d+\s+/, '').replace(/^\{.*"error":"(.*?)".*\}$/, '$1'));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-light tracking-wide text-zinc-100">家庭</h1>
          <p className="mt-2 text-xs uppercase tracking-widest text-zinc-500">Katei</p>
        </div>

        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-6">
          <h2 className="mb-1 text-lg font-light text-zinc-100">
            {mode === 'invite' ? t('auth.joinTitle') : mode === 'setup' ? t('auth.createTitle') : t('auth.signInTitle')}
          </h2>
          <p className="mb-5 text-xs text-zinc-500">
            {mode === 'invite' ? t('auth.joinSubtitle') : mode === 'setup' ? t('auth.createSubtitle') : t('auth.signInSubtitle')}
          </p>

          {mode === 'invite' && inviteValid === false ? (
            <div className="space-y-4">
              <p className="text-sm text-rose-400">{t('auth.inviteInvalid')}</p>
              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                className="w-full rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700"
              >
                {t('auth.signInBtn')}
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className={labelCls}>{t('auth.name')}</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('auth.namePlaceholder')}
                autoFocus
                autoComplete="username"
                className={fieldCls}
              />
            </div>

            <div>
              <label htmlFor="password" className={labelCls}>{t('auth.password')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode !== 'signin' ? t('auth.passwordSetupPlaceholder') : '••••••••'}
                autoComplete={mode !== 'signin' ? 'new-password' : 'current-password'}
                className={fieldCls}
              />
            </div>

            {mode === 'setup' && (
              <>
                <div>
                  <label htmlFor="country" className={labelCls}>{t('auth.country')}</label>
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
                    <label htmlFor="currency" className={labelCls}>{t('auth.currency')}</label>
                    <select
                      id="currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className={`${fieldCls}`}
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label htmlFor="timezone" className={labelCls}>{t('auth.timezone')}</label>
                    <select
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className={`${fieldCls}`}
                    >
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting
                ? t('common.pleaseWait')
                : mode === 'invite'
                  ? t('auth.joinBtn')
                  : mode === 'setup'
                    ? t('auth.createBtn')
                    : t('auth.signInBtn')}
            </button>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
