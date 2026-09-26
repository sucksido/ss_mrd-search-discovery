import type { IndexedItem } from '../catalog/catalog.repository.js';

/**
 * Field weights. Name beats tags beats category beats vendor beats
 * description — a customer typing "burger" means the thing called burger, not
 * everything whose blurb mentions one.
 */
const WEIGHTS = {
  name: { exact: 10, prefix: 7, substring: 4 },
  tags: { exact: 6, prefix: 4, substring: 2.5 },
  category: { exact: 5, prefix: 3.5, substring: 2 },
  vendor: { exact: 3, prefix: 2, substring: 1 },
  description: { exact: 1.5, prefix: 1.2, substring: 1 },
} as const;

type FieldKey = keyof typeof WEIGHTS;

function fieldScore(haystack: string, token: string, weights: { exact: number; prefix: number; substring: number }): number {
  if (haystack.length === 0) return 0;
  const words = haystack.split(' ');
  if (words.includes(token)) return weights.exact;
  if (words.some((word) => word.startsWith(token))) return weights.prefix;
  if (haystack.includes(token)) return weights.substring;
  return 0;
}

/**
 * Score one item against one token. Returns 0 when the token does not appear
 * anywhere — the caller uses that to enforce AND semantics across tokens.
 */
export function scoreToken(item: IndexedItem, token: string): number {
  let best = 0;
  for (const key of Object.keys(WEIGHTS) as FieldKey[]) {
    const score = fieldScore(item.searchable[key], token, WEIGHTS[key]);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Does every token appear in the item's name or tags?
 *
 * Typeahead uses this instead of the full scorer: a suggestion is a shortcut
 * to a specific item, so "piz" should offer three pizzas — not every item in
 * the "Pizza & Pasta" category, which is what a category-prefix match gives.
 */
export function matchesNameOrTags(item: IndexedItem, tokens: readonly string[]): boolean {
  return tokens.every(
    (token) =>
      fieldScore(item.searchable.name, token, WEIGHTS.name) > 0 ||
      fieldScore(item.searchable.tags, token, WEIGHTS.tags) > 0,
  );
}

/**
 * Score an item against the full query.
 *
 * Returns null when any token is missing, which is what makes "veg burger"
 * mean *both* words rather than "anything vegetarian, plus anything burger".
 * An exact phrase hit on the name gets a bonus so "pad thai" ranks the dish
 * above items that merely mention thai and pad separately.
 */
export function scoreItem(item: IndexedItem, tokens: readonly string[], phrase: string): number | null {
  if (tokens.length === 0) return 0;

  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(item, token);
    if (score === 0) return null;
    total += score;
  }

  if (tokens.length > 1 && item.searchable.name.includes(phrase)) total += 5;

  // Sub-point popularity nudge: a deterministic tie-break, never a re-rank.
  return total + item.popularity / 1000;
}
