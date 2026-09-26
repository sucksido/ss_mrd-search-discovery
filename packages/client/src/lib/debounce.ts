/**
 * Trailing-edge debounce. Used for typeahead so a burst of keystrokes costs
 * one request instead of one per character — the cheapest and most visible
 * "avoid unnecessary requests" win there is.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): {
  (...args: A): void;
  cancel(): void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  return debounced;
}
