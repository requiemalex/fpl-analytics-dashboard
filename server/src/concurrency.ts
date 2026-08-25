/**
 * Runs `worker` over `items` with at most `limit` running at once. Each
 * item's outcome (result or caught error) is returned in the same order
 * as the input, so a caller can tell exactly which items failed without
 * losing the rest to a single Promise.all rejection.
 *
 * Written dependency-free (no p-limit or similar) since this project has
 * no need for a general-purpose concurrency library elsewhere — this is
 * the one place hundreds of individual upstream requests happen at once
 * (the historic bulk build), and a small local pool is easier to reason
 * about than adding a new dependency for a single call site.
 */
export interface ConcurrentMapResult<T, R> {
  index: number;
  item: T;
  result: R | null;
  error: Error | null;
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<ConcurrentMapResult<T, R>[]> {
  const results: ConcurrentMapResult<T, R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        const result = await worker(items[i], i);
        results[i] = { index: i, item: items[i], result, error: null };
      } catch (err) {
        results[i] = { index: i, item: items[i], result: null, error: err as Error };
      }
    }
  }

  const poolSize = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => runNext()));
  return results;
}
