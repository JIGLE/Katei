// i18next setup. UI copy is translated per language; formatting (money, dates,
// relative time) is handled separately via Intl in lib/format.ts. Languages
// without a catalog fall back to English.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';
import de from '../locales/de.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';
import it from '../locales/it.json';
import nl from '../locales/nl.json';

export const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'nl'] as const;

// Endonyms for the display-language picker.
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
};

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    es: { translation: es },
    it: { translation: it },
    nl: { translation: nl },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

/** Set the UI language directly (falls back to English if unsupported). */
export function setLanguage(lang: string): void {
  const code = (lang || 'en').split('-')[0].toLowerCase();
  const next = (SUPPORTED_LANGUAGES as readonly string[]).includes(code) ? code : 'en';
  if (i18n.language !== next) void i18n.changeLanguage(next);
}

/** Point i18next at the language portion of a BCP-47 locale (e.g. de-DE → de). */
export function setLanguageFromLocale(locale: string): void {
  setLanguage((locale || 'en').split('-')[0]);
}

export default i18n;
