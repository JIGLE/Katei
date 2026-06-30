// EU-focused country table. Picking a country at home creation derives a
// sensible currency, locale, and timezone — each of which stays overridable.

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  locale: string; // BCP-47
  timezone: string; // IANA
}

// EU-27 plus a few common neighbours. Sorted by name for the picker.
export const COUNTRIES: Country[] = [
  { code: 'AT', name: 'Austria', currency: 'EUR', locale: 'de-AT', timezone: 'Europe/Vienna' },
  { code: 'BE', name: 'Belgium', currency: 'EUR', locale: 'nl-BE', timezone: 'Europe/Brussels' },
  { code: 'BG', name: 'Bulgaria', currency: 'BGN', locale: 'bg-BG', timezone: 'Europe/Sofia' },
  { code: 'HR', name: 'Croatia', currency: 'EUR', locale: 'hr-HR', timezone: 'Europe/Zagreb' },
  { code: 'CY', name: 'Cyprus', currency: 'EUR', locale: 'el-CY', timezone: 'Asia/Nicosia' },
  { code: 'CZ', name: 'Czechia', currency: 'CZK', locale: 'cs-CZ', timezone: 'Europe/Prague' },
  { code: 'DK', name: 'Denmark', currency: 'DKK', locale: 'da-DK', timezone: 'Europe/Copenhagen' },
  { code: 'EE', name: 'Estonia', currency: 'EUR', locale: 'et-EE', timezone: 'Europe/Tallinn' },
  { code: 'FI', name: 'Finland', currency: 'EUR', locale: 'fi-FI', timezone: 'Europe/Helsinki' },
  { code: 'FR', name: 'France', currency: 'EUR', locale: 'fr-FR', timezone: 'Europe/Paris' },
  { code: 'DE', name: 'Germany', currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin' },
  { code: 'GR', name: 'Greece', currency: 'EUR', locale: 'el-GR', timezone: 'Europe/Athens' },
  { code: 'HU', name: 'Hungary', currency: 'HUF', locale: 'hu-HU', timezone: 'Europe/Budapest' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', locale: 'en-IE', timezone: 'Europe/Dublin' },
  { code: 'IT', name: 'Italy', currency: 'EUR', locale: 'it-IT', timezone: 'Europe/Rome' },
  { code: 'LV', name: 'Latvia', currency: 'EUR', locale: 'lv-LV', timezone: 'Europe/Riga' },
  { code: 'LT', name: 'Lithuania', currency: 'EUR', locale: 'lt-LT', timezone: 'Europe/Vilnius' },
  { code: 'LU', name: 'Luxembourg', currency: 'EUR', locale: 'fr-LU', timezone: 'Europe/Luxembourg' },
  { code: 'MT', name: 'Malta', currency: 'EUR', locale: 'en-MT', timezone: 'Europe/Malta' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam' },
  { code: 'PL', name: 'Poland', currency: 'PLN', locale: 'pl-PL', timezone: 'Europe/Warsaw' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', locale: 'pt-PT', timezone: 'Europe/Lisbon' },
  { code: 'RO', name: 'Romania', currency: 'RON', locale: 'ro-RO', timezone: 'Europe/Bucharest' },
  { code: 'SK', name: 'Slovakia', currency: 'EUR', locale: 'sk-SK', timezone: 'Europe/Bratislava' },
  { code: 'SI', name: 'Slovenia', currency: 'EUR', locale: 'sl-SI', timezone: 'Europe/Ljubljana' },
  { code: 'ES', name: 'Spain', currency: 'EUR', locale: 'es-ES', timezone: 'Europe/Madrid' },
  { code: 'SE', name: 'Sweden', currency: 'SEK', locale: 'sv-SE', timezone: 'Europe/Stockholm' },
  // Common non-EU neighbours.
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', locale: 'de-CH', timezone: 'Europe/Zurich' },
  { code: 'NO', name: 'Norway', currency: 'NOK', locale: 'nb-NO', timezone: 'Europe/Oslo' },
  { code: 'US', name: 'United States', currency: 'USD', locale: 'en-US', timezone: 'America/New_York' },
];

export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.code === 'DE')!;

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

// Distinct currencies / timezones / locales for the override pickers.
export const CURRENCIES = Array.from(new Set(COUNTRIES.map((c) => c.currency))).sort();
export const TIMEZONES = Array.from(new Set(COUNTRIES.map((c) => c.timezone))).sort();
export const LOCALES = Array.from(new Set(COUNTRIES.map((c) => c.locale))).sort();
