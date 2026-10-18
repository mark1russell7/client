/**
 * A set of listeners for the events of a storage: the change batches of `observe()`, or the status
 * of a sync. A storage package uses it, so each storage treats its listeners in the same way.
 */

/** The function that gets the error of a listener. */
export type ListenerErrorHandler = (error: unknown) => void;

/**
 * The default handler of the error of a listener. It throws the error again in a microtask, as an
 * `EventTarget` reports the error of a listener. Thus the error is not lost, and the write that
 * sent the event does not fail.
 */
export const reportListenerError: ListenerErrorHandler = (error) => {
  queueMicrotask(() => {
    throw error;
  });
};

/**
 * The listeners of one kind of event.
 *
 * - `emit()` gives the event to each listener, in the order of `add()`.
 * - A listener that `add()` gets during an `emit()` gets the next event, not this one.
 * - The error of a listener goes to the error handler. The other listeners get the event.
 * - The same function can be added two times. Each `add()` gives its own function that removes it.
 */
export class StorageListeners<E> {
  private readonly listeners = new Set<{ readonly listener: (event: E) => void }>();
  private readonly onError: ListenerErrorHandler;

  /** @param onError - The function that gets the error of a listener. The default is `reportListenerError`. */
  constructor(onError: ListenerErrorHandler = reportListenerError) {
    this.onError = onError;
  }

  /** The number of listeners. */
  get size(): number {
    return this.listeners.size;
  }

  /**
   * This method adds a listener.
   *
   * @returns The function that removes the listener. A second use of it does nothing.
   */
  add(listener: (event: E) => void): () => void {
    const entry = { listener };
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  /** This method gives the event to each listener. */
  emit(event: E): void {
    for (const entry of [...this.listeners]) {
      // A listener that a listener before it removed gets no event
      if (!this.listeners.has(entry)) continue;
      try {
        entry.listener(event);
      } catch (error) {
        this.onError(error);
      }
    }
  }

  /** This method removes each listener. */
  clear(): void {
    this.listeners.clear();
  }
}
