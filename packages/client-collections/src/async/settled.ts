/**
 * asSettled - The results of running promises, in the order that they settle.
 *
 * @example
 * const pages = urls.map((url) => fetch(url));
 * for await (const result of asSettled(pages)) {
 *   if (result.status === "fulfilled") show(result.index, result.value);
 *   else report(result.index, result.reason);
 * }
 */

/** One result of `asSettled`: the index of its promise in the input, and how the promise settled. */
export type Settled<T> = { readonly index: number } & PromiseSettledResult<T>;

/**
 * This function gives the result of each promise when it settles, in settle order, not in input
 * order. The promises run already: this function starts nothing. Each result has the index of its
 * promise in the input. A rejected promise gives `status: "rejected"` and its reason: the
 * generator does not throw it. When the consumer stops early, the other promises continue, and
 * their rejections are not reported as unhandled.
 */
export async function* asSettled<T>(promises: Iterable<Promise<T>>): AsyncGenerator<Settled<T>, void, undefined> {
  const pending = new Map<number, Promise<Settled<T>>>();
  let next = 0;
  for (const promise of promises) {
    const index = next;
    next += 1;
    pending.set(
      index,
      Promise.resolve(promise).then(
        (value): Settled<T> => ({ index, status: "fulfilled", value }),
        (reason: unknown): Settled<T> => ({ index, status: "rejected", reason })
      )
    );
  }
  while (pending.size > 0) {
    const settled = await Promise.race(pending.values());
    pending.delete(settled.index);
    yield settled;
  }
}
