/* Amount input.
 *
 * The amount prompt accepts positive whole numbers only and refuses the rest,
 * so bad values never reach the store. parseAmount turns whatever the user
 * typed into a number or null; isValidAmount is the gate.
 */

export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isValidAmount(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && Math.floor(n) === n && n > 0;
}
