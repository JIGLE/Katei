import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { setLanguage } from './i18n';

export type Theme = 'dark' | 'light' | 'system';

export interface Preferences {
  country: string;
  currency: string;
  locale: string;
  timezone: string;
  language: string;
  savings_goal: number;
  savings_opening: number;
  theme: Theme;
  household_name: string;
}

const DEFAULTS: Preferences = {
  country: 'DE',
  currency: 'EUR',
  locale: 'de-DE',
  timezone: 'Europe/Berlin',
  language: 'en',
  savings_goal: 0,
  savings_opening: 0,
  theme: 'dark',
  household_name: '',
};

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

// The last explicitly applied choice, so the OS listener below knows whether
// a live scheme flip should re-resolve ('system') or be ignored (fixed theme).
let appliedChoice: Theme = 'dark';

// Apply the theme to <html> so the CSS-variable palette flips, and cache the
// raw choice so the next boot can apply it before React mounts (see
// index.html / theme-init.js) — no flash. 'system' resolves against the
// device colour scheme here and re-resolves whenever the OS setting changes.
export function applyTheme(theme: Theme) {
  appliedChoice = theme;
  const resolved = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
  if (resolved === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  // Keep the browser/PWA chrome colour in step with the page background.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f7f6f3' : '#09090b');
  try {
    localStorage.setItem('katei-theme', theme);
  } catch {
    // localStorage unavailable (private mode) — theme still applies this session.
  }
}

// Live-update while the app is open: if the household follows the system,
// flipping the OS scheme flips Katei without a reload.
systemDark.addEventListener('change', () => {
  if (appliedChoice === 'system') applyTheme('system');
});

interface PreferencesContextValue extends Preferences {
  loading: boolean;
  reload: () => Promise<void>;
  save: (p: Preferences) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const p = await api.get<Preferences>('/settings/preferences');
      setPrefs(p);
    } catch {
      // Unauthenticated (before login) or offline — keep defaults.
    }
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  // UI language is independent of locale (e.g. da-DK formatting, English UI).
  useEffect(() => {
    setLanguage(prefs.language);
  }, [prefs.language]);

  // Flip the neutral palette when the theme preference changes.
  useEffect(() => {
    applyTheme(prefs.theme);
  }, [prefs.theme]);

  const save = async (p: Preferences) => {
    const saved = await api.put<Preferences>('/settings/preferences', p);
    setPrefs(saved);
  };

  return (
    <PreferencesContext.Provider value={{ ...prefs, loading, reload, save }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
