const RAND = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
});

/** Prices travel as integer cents; only the view layer knows about rands. */
export function formatPrice(cents: number): string {
  return RAND.format(cents / 100).replace(/ /g, ' ');
}

export function formatEta(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * A merchant monogram for the card tile. The catalog has no imagery, and an
 * image pipeline is not in scope, so the anchor is derived from data we already
 * hold — which also means it can never fail to load or shift the layout.
 *
 * Tokens that start with a letter or digit only, so "Grill & Co" reads GC
 * rather than G&.
 */
export function initials(vendor: string): string {
  const words = vendor.split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word));
  if (words.length === 0) return '·';
  const letters = words.slice(0, 2).map((word) => word[0] ?? '');
  return letters.join('').toUpperCase();
}

export const STOCK_LABELS = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  sold_out: 'Sold out',
} as const;

export const UNAVAILABLE_LABELS = {
  timeout: 'Live info timed out',
  upstream_error: 'Live info unavailable',
  circuit_open: 'Live info paused',
  not_found: 'No live record',
} as const;
