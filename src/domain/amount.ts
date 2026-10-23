/* Amount input and rounding.
 *
 * People type "2", "0.5", "1/2", "1 1/2", or "½". The prompt accepts all of
 * them and stores a positive decimal in the ingredient's canonical unit.
 * Three decimal places is finer than any kitchen scale and keeps floating
 * point noise from leaking into totals.
 */

const VULGAR: Record<string, number> = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

export function roundAmount(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * A number, or null when the text is not a usable quantity. Accepts a comma
 * decimal (common in Europe), a bare fraction, a mixed number, and the single
 * unicode fractions cooks actually see.
 */
export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (text === '') return null;

  // Replace a leading/trailing unicode fraction, including "1½".
  for (const [glyph, value] of Object.entries(VULGAR)) {
    if (text.includes(glyph)) {
      const prefix = text.slice(0, text.indexOf(glyph)).trim();
      const whole = prefix === '' ? 0 : Number(prefix.replace(',', '.'));
      if (!Number.isFinite(whole) || whole < 0) return null;
      return roundAmount(whole + value);
    }
  }

  text = text.replace(',', '.');

  // "1 1/2" — a whole number and a fraction.
  let match = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (match) {
    const whole = Number(match[1]);
    const numerator = Number(match[2]);
    const denominator = Number(match[3]);
    if (denominator === 0) return null;
    return roundAmount(whole + numerator / denominator);
  }

  // "1/2"
  match = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (match) {
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (denominator === 0) return null;
    return roundAmount(numerator / denominator);
  }

  // Plain decimal, including ".5". Number() also handles "1e3".
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return roundAmount(n);
}

/** Positive, finite, and at least one thousandth — never zero or negative. */
export function isValidAmount(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && roundAmount(n) > 0;
}
