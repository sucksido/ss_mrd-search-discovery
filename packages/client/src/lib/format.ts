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
