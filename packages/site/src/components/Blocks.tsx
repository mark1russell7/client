/**
 * The block editor of the Composer. Each procedure call is a block, and each input field is a
 * slot. A slot holds a value, a list, an object, a `$ref` or another call. The editor changes
 * the program JSON at a location, so the JSON and the blocks never differ.
 *
 * Keyboard: each control is a normal form control. The controls of a slot show on hover, on
 * focus and for the selected slot. The name of a call is a button that selects the call.
 */

import { useEffect, useId, useRef, useState, type DragEvent, type ReactElement } from "react";
import { categoryOf, procedureByKey, procedures, type ProcedureInfo } from "../data";
import type { Analysis } from "../lib/analysis";
import { focusAfterRemoval } from "../lib/edits";
import {
  defaultValue,
  inputOf,
  isOutputRef,
  isPlainObject,
  isProcRef,
  locationKey,
  newCall,
  renameKey,
  renameProblem,
  type Json,
  type Location,
  type ProcRef,
} from "../lib/program";

/** The data type of a procedure that the palette drags. */
export const DRAG_TYPE = "application/x-procedure";

/** The id of the datalist with the procedure names. */
export const PICKER_LIST = "procedure-names";

/** The procedures that run in the browser, so the Composer can use them. */
export const browserProcedures: ProcedureInfo[] = procedures.filter((procedure) => procedure.browser);

export interface EditorContext {
  /** The selected slot, as `locationKey(location)`. */
  selected: string | null;
  select(location: Location): void;
  /**
   * This function changes the program. `undefined` removes the key or the list item. Edits
   * with the same `group` (for example the letters typed in one field) make one undo step.
   */
  set(location: Location, value: Json | undefined, group?: string): void;
  /** This function puts a call at a location. It can ask where the call goes. */
  insert(location: Location, key: string): void;
  /** This function puts the call at a location in a new chain. */
  wrap(location: Location): void;
  /** This function gives the focus to the slot at a location after the next render. */
  focus(location: Location): void;
  analysis: Analysis;
}

/** The key of a procedure from a key ("client.add") or a short name of a core procedure ("add"). */
export function resolveKey(name: string): string | undefined {
  const text = name.trim();
  if (!text) return undefined;
  return procedureByKey(text)?.key ?? procedureByKey(`client.${text}`)?.key;
}

/** A new call of the procedure with a key ("client.add") or a short name ("add"). */
export function callFor(name: string): ProcRef | undefined {
  const key = resolveKey(name);
  const info = key ? procedureByKey(key) : undefined;
  return info ? newCall(info.path, info.fields) : undefined;
}

/** The element type of an array type: "number" for "number[]". */
function elementType(type: string | undefined): string {
  if (!type) return "";
  if (type.endsWith("[]")) return type.slice(0, -2);
  const generic = /^Array<(.*)>$/.exec(type);
  return generic?.[1] ?? "";
}

type Kind = "number" | "string" | "boolean" | "null" | "list" | "object" | "ref";

const KIND_LABELS: Record<Kind, string> = {
  number: "123",
  string: "abc",
  boolean: "yes/no",
  null: "null",
  list: "[ list ]",
  object: "{ object }",
  ref: "$ref",
};

function kindOf(value: Json): Kind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "list";
  if (isOutputRef(value)) return "ref";
  if (isPlainObject(value)) return "object";
  return typeof value as "number" | "string" | "boolean";
}

function convert(value: Json, kind: Kind): Json {
  switch (kind) {
    case "number": {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }
    case "string":
      return value === null || typeof value === "object" ? "" : String(value);
    case "boolean":
      return Boolean(value);
    case "null":
      return null;
    case "list":
      return [];
    case "object":
      return {};
    case "ref":
      return { $ref: "" };
  }
}

/** The input of a procedure name. It puts the call on Enter, on blur, or on a pick from the list. */
function ProcPicker({ location, ctx, label }: { location: Location; ctx: EditorContext; label: string }): ReactElement {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const commit = (name: string): boolean => {
    const key = resolveKey(name);
    if (!key) return false;
    setText("");
    setInvalid(false);
    ctx.insert(location, key);
    return true;
  };
  return (
    <input
      className={`proc-picker${invalid ? " invalid" : ""}`}
      list={PICKER_LIST}
      placeholder="ƒ call…"
      aria-label={`Put a procedure call in ${label}`}
      aria-invalid={invalid || undefined}
      title={invalid ? "No procedure has this name" : "Type a procedure name, then press Enter"}
      value={text}
      onChange={(event) => {
        const value = event.target.value;
        setText(value);
        setInvalid(false);
        // A pick from the datalist is not typing: it puts the call at once. Typing "gte"
        // must not stop at "gt" (deep dive SITE-8).
        const native = event.nativeEvent;
        const picked = typeof InputEvent !== "undefined" && (!(native instanceof InputEvent) || native.inputType === "insertReplacementText");
        if (picked) commit(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (text && !commit(text)) setInvalid(true);
        } else if (event.key === "Escape") {
          setText("");
          setInvalid(false);
        }
      }}
      onBlur={() => {
        if (text && !commit(text)) setInvalid(true);
      }}
    />
  );
}

/** The controls of a slot: the kind of the value, and a picker for a call. */
function SlotControls({ value, location, ctx, label }: { value: Json; location: Location; ctx: EditorContext; label: string }): ReactElement {
  return (
    <span className="slot-controls">
      {location.length > 0 ? (
        <select
          className="kind-select"
          aria-label={`Kind of value of ${label}`}
          value={kindOf(value)}
          onChange={(event) => {
            ctx.set(location, convert(value, event.target.value as Kind));
            ctx.focus(location);
          }}
        >
          {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      ) : null}
      <ProcPicker location={location} ctx={ctx} label={label} />
    </span>
  );
}

/**
 * A number field with its own text. The text can be "-" or "1." while the reader types, and
 * the program gets the number when the text is a number (deep dive SITE-8: "-5" was not possible).
 */
function NumberInput({ value, onCommit, id, label }: { value: number; onCommit: (value: number) => void; id: string; label: string }): ReactElement {
  const [text, setText] = useState(String(value));
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(String(value));
    }
  }, [value]);
  const parse = (raw: string): number | undefined => {
    if (raw.trim() === "") return undefined;
    const number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  };
  const invalid = parse(text) === undefined;
  return (
    <input
      id={id}
      type="text"
      inputMode="text"
      className={`number-input${invalid ? " invalid" : ""}`}
      aria-label={label}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const number = parse(event.target.value);
        if (number !== undefined) {
          committed.current = number;
          onCommit(number);
        }
      }}
      onBlur={() => setText(String(committed.current))}
    />
  );
}

interface SlotProps {
  value: Json;
  location: Location;
  ctx: EditorContext;
  type: string | undefined;
  /** The name of the slot for assistive technology: "a", "steps item 2". */
  label: string;
  /** The id of the main control, for a `<label htmlFor>`. */
  controlId?: string | undefined;
}

function LiteralEditor({ value, location, ctx, label, controlId }: Omit<SlotProps, "type">): ReactElement {
  const fallbackId = useId();
  const id = controlId ?? fallbackId;
  const group = `edit:${locationKey(location)}`;
  let editor: ReactElement;
  if (typeof value === "number") {
    editor = <NumberInput id={id} label={label} value={value} onCommit={(number) => ctx.set(location, number, group)} />;
  } else if (typeof value === "string") {
    editor = (
      <input id={id} type="text" value={value} aria-label={label} onChange={(event) => ctx.set(location, event.target.value, group)} />
    );
  } else if (typeof value === "boolean") {
    editor = (
      <select id={id} aria-label={label} value={String(value)} onChange={(event) => ctx.set(location, event.target.value === "true")}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else {
    // A focusable control, so the keyboard reaches the controls of an empty slot (deep dive SITE-7)
    editor = (
      <button
        id={id}
        type="button"
        className="null-value"
        aria-label={`${label}: null. Select the slot to choose a value`}
        onClick={(event) => {
          event.stopPropagation();
          ctx.select(location);
        }}
      >
        null
      </button>
    );
  }
  return (
    <div className="literal">
      {editor}
      <SlotControls value={value} location={location} ctx={ctx} label={label} />
    </div>
  );
}

function RefChip({ value, location, ctx, label, controlId }: Omit<SlotProps, "type" | "value"> & { value: { $ref: string } }): ReactElement {
  const listId = useId();
  const fallbackId = useId();
  const key = locationKey(location);
  const scope = ctx.analysis.scopeAt.get(key) ?? [];
  const unknown = ctx.analysis.unknownRefs.some((use) => locationKey(use.location) === key);
  const warning =
    value.$ref === ""
      ? "Type a name."
      : scope.length === 0
        ? "No name is in scope here. Names come from the $name of an earlier chain step, and from map and reduce."
        : `"${value.$ref}" is not in scope here. The names in scope: ${scope.join(", ")}.`;
  return (
    <div className="literal">
      <span className={`ref-chip${unknown ? " unknown" : ""}`} title="Reads a named result: a step $name, $last, or item, index and acc in map and reduce">
        $ref
        <input
          id={controlId ?? fallbackId}
          type="text"
          value={value.$ref}
          placeholder="name"
          list={listId}
          aria-label={`${label}: the name of a result`}
          aria-invalid={unknown || undefined}
          aria-describedby={unknown ? `${listId}-warning` : undefined}
          onChange={(event) => ctx.set(location, { $ref: event.target.value }, `edit:${key}`)}
        />
        <datalist id={listId}>
          {scope.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </span>
      {unknown ? (
        <span className="ref-warning" id={`${listId}-warning`} role="note">
          ⚠ {warning}
        </span>
      ) : null}
      <SlotControls value={value} location={location} ctx={ctx} label={label} />
    </div>
  );
}

/** A large list or object without calls starts as a one-line preview. */
function useCollapsed(value: Json): [boolean, (collapsed: boolean) => void] {
  return useState(() => JSON.stringify(value).length > 90 && countCallsIn(value) === 0);
}

function countCallsIn(value: Json): number {
  if (isProcRef(value)) return 1;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countCallsIn(item), 0);
  if (isPlainObject(value)) return Object.values(value).reduce<number>((sum, item) => sum + countCallsIn(item), 0);
  return 0;
}

function Collapsed({ value, onExpand, label }: { value: Json; onExpand: () => void; label: string }): ReactElement {
  const text = JSON.stringify(value);
  const size = Array.isArray(value) ? `${value.length} items` : `${Object.keys(value ?? {}).length} keys`;
  return (
    <div className="literal">
      <button type="button" className="collapsed" onClick={onExpand} aria-label={`Edit ${label} (${size})`}>
        <code>{text.length > 70 ? `${text.slice(0, 69)}…` : text}</code>
        <span className="muted"> {size} · edit</span>
      </button>
    </div>
  );
}

function ListEditor({ value, location, ctx, type, label }: SlotProps & { value: Json[] }): ReactElement {
  const [collapsed, setCollapsed] = useCollapsed(value);
  if (collapsed) {
    return (
      <Collapsed
        value={value}
        label={label}
        onExpand={() => {
          setCollapsed(false);
          ctx.focus(location);
        }}
      />
    );
  }
  const chain = ctx.analysis.chains.has(locationKey(location));
  return (
    <div className="list-editor" role="group" aria-label={label}>
      {value.map((item, index) => (
        <div className="list-row" key={index}>
          <span className="list-index" aria-hidden="true">
            {index}
          </span>
          <Slot value={item} location={[...location, index]} ctx={ctx} type={elementType(type)} label={`${label} item ${index}`} />
          <button
            type="button"
            className="icon"
            aria-label={`Remove item ${index} of ${label}`}
            title="Remove the item"
            onClick={(event) => {
              event.stopPropagation();
              ctx.set([...location, index], undefined);
              ctx.focus(focusAfterRemoval(location, index, value.length));
            }}
          >
            ×
          </button>
        </div>
      ))}
      {chain ? (
        <span className="hint" role="note">
          A list of only calls runs as a chain: this slot gets {"{ results, final }"}. The calls cannot read each other with $ref. Add
          a plain value to keep a list, or use client.chain.
        </span>
      ) : null}
      <div className="add-row">
        <button
          type="button"
          aria-label={`Add an item to ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            ctx.set([...location, value.length], defaultValue(elementType(type)));
            ctx.focus([...location, value.length]);
          }}
        >
          + item
        </button>
        <SlotControls value={value} location={location} ctx={ctx} label={label} />
      </div>
    </div>
  );
}

/** The key of an object row. A rename happens on Enter or on blur; a bad name shows a message. */
function KeyInput({ name, object, location, ctx }: { name: string; object: { [key: string]: Json }; location: Location; ctx: EditorContext }): ReactElement {
  const [text, setText] = useState(name);
  const [message, setMessage] = useState<string | null>(null);
  const messageId = useId();
  useEffect(() => setText(name), [name]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const commit = (): void => {
    const to = text.trim();
    const problem = renameProblem(object, name, to);
    if (problem) {
      // Before, the field kept the rejected text, and the program kept the old key (deep dive SITE-8)
      setText(name);
      setMessage(`${problem} The key stays "${name}".`);
      return;
    }
    if (to !== name) {
      ctx.set(location, renameKey(object, name, to));
      ctx.focus([...location, to]);
    }
  };
  return (
    <span className="key-cell">
      <input
        className="key"
        type="text"
        value={text}
        aria-label={`Name of the key ${name}`}
        aria-describedby={message ? messageId : undefined}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            setText(name);
          }
        }}
        onBlur={commit}
      />
      {message ? (
        <span className="key-message" id={messageId} role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}

function ObjectEditor({ value, location, ctx, label }: SlotProps & { value: { [key: string]: Json } }): ReactElement {
  const keys = Object.keys(value);
  const [collapsed, setCollapsed] = useCollapsed(value);
  if (collapsed) {
    return (
      <Collapsed
        value={value}
        label={label}
        onExpand={() => {
          setCollapsed(false);
          ctx.focus(location);
        }}
      />
    );
  }
  return (
    <div className="object-editor" role="group" aria-label={label}>
      {keys.map((key, index) => (
        <div className="object-row" key={key}>
          <KeyInput name={key} object={value} location={location} ctx={ctx} />
          <Slot value={value[key] ?? null} location={[...location, key]} ctx={ctx} type={undefined} label={`${label}.${key}`} />
          <button
            type="button"
            className="icon"
            aria-label={`Remove the key ${key} of ${label}`}
            title="Remove the key"
            onClick={(event) => {
              event.stopPropagation();
              ctx.set([...location, key], undefined);
              const next = keys[index + 1] ?? keys[index - 1];
              ctx.focus(next !== undefined ? [...location, next] : location);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div className="add-row">
        <button
          type="button"
          aria-label={`Add a key to ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            let index = keys.length + 1;
            while (Object.hasOwn(value, `key${index}`)) index++;
            ctx.set([...location, `key${index}`], "");
            ctx.focus([...location, `key${index}`]);
          }}
        >
          + key
        </button>
        <SlotControls value={value} location={location} ctx={ctx} label={label} />
      </div>
    </div>
  );
}

/** One field of a call: its label and its slot. */
function FieldRow({
  name,
  type,
  optional,
  value,
  location,
  ctx,
  removable,
}: {
  name: string;
  type: string | undefined;
  optional: boolean;
  value: Json;
  location: Location;
  ctx: EditorContext;
  removable: boolean;
}): ReactElement {
  const id = useId();
  // A label element goes with a single control: a value, a $ref or an empty slot
  const single = !isProcRef(value) && !Array.isArray(value) && (!isPlainObject(value) || isOutputRef(value));
  const text = (
    <>
      {name}
      {optional ? "?" : ""}
      {type ? (
        <span className="type" title={type}>
          {type}
        </span>
      ) : null}
    </>
  );
  return (
    <>
      {single ? (
        <label className={`field-label${optional ? " optional" : ""}`} htmlFor={id}>
          {text}
        </label>
      ) : (
        <span className={`field-label${optional ? " optional" : ""}`}>{text}</span>
      )}
      <div className={removable ? "field-slot removable" : "field-slot"}>
        <Slot value={value} location={location} ctx={ctx} type={type} label={name} controlId={single ? id : undefined} />
        {removable ? (
          <button
            type="button"
            className="icon"
            aria-label={`Remove the field ${name}`}
            title="Remove the field"
            onClick={(event) => {
              event.stopPropagation();
              ctx.set(location, undefined);
              ctx.focus(location.slice(0, -2));
            }}
          >
            ×
          </button>
        ) : null}
      </div>
    </>
  );
}

function CallBlock({ value, location, ctx, type }: { value: ProcRef; location: Location; ctx: EditorContext; type: string | undefined }): ReactElement {
  const key = value.$proc.join(".");
  const info = procedureByKey(key);
  const category = info ? categoryOf(info) : "other";
  const input = inputOf(value);
  const fields = info?.fields ?? [];
  const known = new Set(fields.map((field) => field.name));
  const shown = fields.filter((field) => !field.optional || Object.hasOwn(input, field.name));
  const missing = fields.filter((field) => field.optional && !Object.hasOwn(input, field.name));
  const extra = Object.keys(input).filter((name) => !known.has(name));
  const id = locationKey(location);
  const selected = ctx.selected === id;
  const inputLocation = [...location, "input"];
  const namable = ctx.analysis.namable.has(id);
  const hasName = typeof value.$name === "string" && value.$name !== "";
  const name = value.$proc[value.$proc.length - 1] ?? "";

  return (
    <div className={`block cat-${category}${selected ? " selected" : ""}${info ? "" : " unknown"}`}>
      <div
        className="block-head"
        title={info?.description ?? "This procedure is not in the catalog"}
        onClick={(event) => {
          event.stopPropagation();
          ctx.select(location);
        }}
      >
        <button
          type="button"
          className="block-title"
          aria-pressed={selected}
          aria-label={`Call of ${key}${selected ? ", selected" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            ctx.select(location);
          }}
        >
          <span className="block-ns">{value.$proc.slice(0, -1).join(".")}.</span>
          <span className="block-name">{name}</span>
        </button>
        {!info ? <span className="pill bad">unknown procedure</span> : null}
        {info && !info.browser ? <span className="pill warn">not in the browser</span> : null}
        {namable || hasName ? (
          <input
            className={`name-input${hasName && !namable ? " invalid" : ""}`}
            type="text"
            placeholder="$name"
            aria-label={`Name of the result of ${name} ($name)`}
            title={
              namable
                ? "A later step reads this result with a $ref of this name"
                : "Only the steps of a chain have names that a $ref can read. Remove the name, or make the call a chain step."
            }
            value={value.$name ?? ""}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => ctx.set([...location, "$name"], event.target.value || undefined, `edit:${id}:$name`)}
          />
        ) : null}
        <span className="end">
          <button
            type="button"
            className="icon"
            aria-label={`Wrap ${name} in a chain`}
            title="Wrap in a chain"
            onClick={(event) => {
              event.stopPropagation();
              ctx.wrap(location);
            }}
          >
            ⊂
          </button>
          <button
            type="button"
            className="icon"
            aria-label={`Remove the call of ${name}`}
            title="Remove the call"
            onClick={(event) => {
              event.stopPropagation();
              ctx.set(location, location.length === 0 ? null : defaultValue(type ?? ""));
              ctx.focus(location);
            }}
          >
            ×
          </button>
        </span>
      </div>
      <div className="block-fields">
        {shown.map((field) => (
          <FieldRow
            key={field.name}
            name={field.name}
            type={field.type}
            optional={field.optional}
            value={input[field.name] ?? null}
            location={[...inputLocation, field.name]}
            ctx={ctx}
            removable={field.optional}
          />
        ))}
        {extra.map((field) => (
          <FieldRow
            key={field}
            name={field}
            type={undefined}
            optional
            value={input[field] ?? null}
            location={[...inputLocation, field]}
            ctx={ctx}
            removable
          />
        ))}
        {missing.length > 0 ? (
          <div className="add-row" style={{ gridColumn: "1 / -1" }}>
            <select
              aria-label={`Add an optional field to ${name}`}
              value=""
              onChange={(event) => {
                const field = missing.find((candidate) => candidate.name === event.target.value);
                if (field) {
                  ctx.set([...inputLocation, field.name], defaultValue(field.type));
                  ctx.focus([...inputLocation, field.name]);
                }
              }}
            >
              <option value="">+ optional field…</option>
              {missing.map((field) => (
                <option key={field.name} value={field.name}>
                  {field.name}: {field.type}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A slot: a drop target for the palette that holds one value. */
export function Slot({ value, location, ctx, type, label, controlId }: SlotProps): ReactElement {
  const [hover, setHover] = useState(false);
  const id = locationKey(location);

  const onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    setHover(true);
  };
  const onDrop = (event: DragEvent): void => {
    const name = event.dataTransfer.getData(DRAG_TYPE);
    setHover(false);
    if (!name) return;
    event.preventDefault();
    event.stopPropagation();
    ctx.insert(location, name);
  };

  let content: ReactElement;
  if (isProcRef(value)) {
    content = <CallBlock value={value} location={location} ctx={ctx} type={type} />;
  } else if (isOutputRef(value)) {
    content = <RefChip value={value} location={location} ctx={ctx} label={label} controlId={controlId} />;
  } else if (Array.isArray(value)) {
    content = <ListEditor value={value} location={location} ctx={ctx} type={type} label={label} />;
  } else if (isPlainObject(value)) {
    content = <ObjectEditor value={value} location={location} ctx={ctx} type={type} label={label} />;
  } else {
    content = <LiteralEditor value={value} location={location} ctx={ctx} label={label} controlId={controlId} />;
  }

  return (
    <div
      className={`slot${hover ? " drop-hover" : ""}${ctx.selected === id ? " selected" : ""}`}
      data-loc={id}
      onDragOver={onDragOver}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      onClick={(event) => {
        event.stopPropagation();
        ctx.select(location);
      }}
    >
      {content}
    </div>
  );
}

