import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { setLanguageFromLocale } from './i18n';

export interface Preferences {
  country: string;
  currency: string;
  locale: string;
  timezone: string;
}

const DEFAULTS: Preferences = {
  country: 'DE',
  currency: 'EUR',
  locale: 'de-DE',
  timezone: 'Europe/Berlin',
};

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

  // Keep the UI language in sync with the chosen locale.
  useEffect(() => {
    setLanguageFromLocale(prefs.locale);
  }, [prefs.locale]);

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
