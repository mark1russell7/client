/**
 * The saved programs of the Composer (roadmap R45): a panel with a name field that saves the
 * program, and the list of the saved programs. The Composer loads this panel, and the panel loads
 * the program store, only when the reader opens it.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from "react";
import type { StoredProgram } from "@procedures/store/indexeddb";
import type { Json } from "../lib/program";
import { savedPrograms, toStoredProgram, type SavedPrograms as Store } from "../lib/saved-programs";

type State = { status: "opening" } | { status: "ready"; saved: Store; list: StoredProgram[] } | { status: "failed"; reason: string };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function SavedPrograms({
  program,
  onOpen,
  onClose,
}: {
  /** The program of the Composer now. */
  program: Json;
  /** The reader opens a saved program. */
  onOpen: (program: Json, key: string) => void;
  onClose: () => void;
}): ReactElement {
  const [state, setState] = useState<State>({ status: "opening" });
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async (saved: Store) => {
    setState({ status: "ready", saved, list: await saved.store.list() });
  }, []);

  useEffect(() => {
    let live = true;
    savedPrograms()
      .then(async (saved) => {
        const list = await saved.store.list();
        if (live) setState({ status: "ready", saved, list });
      })
      .catch((error: unknown) => {
        if (live) setState({ status: "failed", reason: `The saved programs did not open: ${messageOf(error)}` });
      });
    return () => {
      live = false;
    };
  }, []);

  const ready = state.status === "ready";
  useEffect(() => {
    if (ready) nameField.current?.focus();
  }, [ready]);

  if (state.status !== "ready") {
    return (
      <section className="saved-programs" id="saved-programs" aria-labelledby="saved-title">
        <h3 id="saved-title" className="small">
          Saved programs
        </h3>
        <p className={state.status === "failed" ? "error-text small" : "muted small"} role="status">
          {state.status === "failed" ? state.reason : "The program store opens…"}
        </p>
      </section>
    );
  }

  const { saved, list } = state;
  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const built = toStoredProgram(name, program);
    if (!built.ok) {
      setMessage(built.reason);
      return;
    }
    const replaced = list.some((stored) => stored.key === built.record.key);
    try {
      await saved.store.put(built.record);
      await refresh(saved);
      setMessage(`${replaced ? "Replaced" : "Saved"} ${built.record.key}.`);
    } catch (error) {
      setMessage(`The program was not saved: ${messageOf(error)}`);
    }
  };
  const remove = async (key: string): Promise<void> => {
    try {
      await saved.store.delete(key);
      await refresh(saved);
      setMessage(`Deleted ${key}.`);
    } catch (error) {
      setMessage(`The program was not deleted: ${messageOf(error)}`);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <section className="saved-programs" id="saved-programs" aria-labelledby="saved-title" onKeyDown={onKeyDown}>
      <div className="saved-head">
        <h3 id="saved-title" className="small">
          Saved programs
        </h3>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close the saved programs">
          ✕
        </button>
      </div>
      <p className="muted small">
        {saved.durable
          ? "This browser keeps the programs in IndexedDB. They stay after you close the page."
          : "This browser has no IndexedDB. The programs stay only until you close the page."}
      </p>
      <form className="saved-form" onSubmit={(event) => void save(event)}>
        <label className="small">
          Name{" "}
          <input
            ref={nameField}
            type="text"
            value={name}
            placeholder="reports.weekly"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" className="primary">
          Save the program
        </button>
      </form>
      {list.length === 0 ? (
        <p className="muted small">No saved programs yet.</p>
      ) : (
        <ul className="saved-list" aria-label="The saved programs">
          {list.map((stored) => (
            <li key={stored.key}>
              <span className="saved-key">{stored.key}</span>
              <span className="muted small">{new Date(stored.storedAt).toLocaleString("en")}</span>
              <button type="button" onClick={() => onOpen(stored.program as unknown as Json, stored.key)} aria-label={`Open ${stored.key}`}>
                Open
              </button>
              <button type="button" className="danger" onClick={() => void remove(stored.key)} aria-label={`Delete ${stored.key}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="small" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
