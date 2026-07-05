// Human-readable labels for facet values. The corpus stores compact codes
// (ISO alpha-2 countries, ISO 639-3 languages, integer decades); the UI shows
// friendly names. Display-only, so this lives in the web app, not the shared
// wire types.

/** Integer decade to its label, e.g. "1980" -> "1980s". */
export function formatDecade(value: string): string {
  return `${value}s`;
}

let regionNames: Intl.DisplayNames | undefined;
function regionDisplay(): Intl.DisplayNames | undefined {
  if (regionNames === undefined && typeof Intl !== 'undefined' && 'DisplayNames' in Intl) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = undefined;
    }
  }
  return regionNames;
}

/** ISO 3166 alpha-2 country code to its English name (falls back to the code). */
export function countryName(code: string): string {
  try {
    return regionDisplay()?.of(code) ?? code;
  } catch {
    return code;
  }
}

let languageNames: Intl.DisplayNames | undefined;
function languageDisplay(): Intl.DisplayNames | undefined {
  if (languageNames === undefined && typeof Intl !== 'undefined' && 'DisplayNames' in Intl) {
    try {
      languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      languageNames = undefined;
    }
  }
  return languageNames;
}

// Intl.DisplayNames resolves ISO 639-3 codes for hundreds of languages, so it is
// the source of truth. These overrides only reword a few where the CLDR label
// reads oddly for a music listener.
const LANGUAGE_OVERRIDES: Record<string, string> = {
  zxx: 'Instrumental', // CLDR: "No linguistic content"
  mul: 'Multiple languages', // CLDR leaves this as the raw code
};

/** ISO 639-3 language code to its English name (falls back to the code). */
export function languageName(code: string): string {
  const override = LANGUAGE_OVERRIDES[code];
  if (override) return override;
  try {
    const name = languageDisplay()?.of(code);
    if (name && name !== code) return name;
  } catch {
    // fall through to the raw code
  }
  return code;
}
