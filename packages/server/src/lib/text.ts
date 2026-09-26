/**
 * Fold a string to a comparable form: lowercase, diacritics stripped,
 * punctuation reduced to spaces. "Café Mocha" and "cafe mocha" must match.
 */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const normalized = normalize(input);
  return normalized.length === 0 ? [] : normalized.split(' ');
}
