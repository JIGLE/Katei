// Plain-words labels for the household's region settings, built with Intl so
// they read naturally in the viewer's own UI language: "Euro (€)",
// "German (Germany) · 17.11.2026 · 1.234,50", "Berlin". Every helper falls
// back to the raw code if the browser can't name it.

const SAMPLE_DATE = new Date(Date.UTC(2026, 10, 17, 12));

function displayName(uiLang: string, type: 'currency' | 'language', code: string): string {
  try {
    return new Intl.DisplayNames([uiLang], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "Euro (€)" — the currency's name and the symbol it prints with. */
export function currencyLabel(code: string, uiLang: string): string {
  const name = displayName(uiLang, 'currency', code);
  try {
    const symbol = new Intl.NumberFormat(uiLang, { style: 'currency', currency: code })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value;
    return symbol && symbol !== code ? `${name} (${symbol})` : name;
  } catch {
    return name;
  }
}

/** "€" — the symbol a currency prints with, or its code when it has none. */
export function currencySymbol(code: string, uiLang: string): string {
  try {
    return (
      new Intl.NumberFormat(uiLang, { style: 'currency', currency: code })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? code
    );
  } catch {
    return code;
  }
}

/** "German (Germany)" — the format's name in the viewer's language. */
export function formatName(locale: string, uiLang: string): string {
  return displayName(uiLang, 'language', locale);
}

/** "17.11.2026 · 1.234,50" — what dates and numbers look like in a format. */
export function formatSample(locale: string): string {
  try {
    const date = new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(SAMPLE_DATE);
    const num = new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(1234.5);
    return `${date} · ${num}`;
  } catch {
    return locale;
  }
}

/** "Berlin" from "Europe/Berlin"; "New York" from "America/New_York". */
export function timezoneCity(tz: string): string {
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}
