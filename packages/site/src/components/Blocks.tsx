/**
 * The block editor of the Composer. Each procedure call is a block, and each input field is a
 * slot. A slot holds a value, a list, an object, a `$ref` or another call. The editor changes
 * the program JSON at a location, so the JSON and the blocks never differ.
 */

import { Fragment, useState, type DragEvent, type ReactElement } from "react";
import { categoryOf, procedureByKey, procedures, type ProcedureInfo } from "../data";
import {
  defaultValue,
  inputOf,
  isOutputRef,
  isPlainObject,
  isProcRef,
  newCall,
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
  /** The selected slot, as `JSON.stringify(location)`. */
  selected: string | null;
  select(location: Location): void;
  /** This function changes the program. `undefined` removes the key or the list item. */
  set(location: Location, value: Json | undefined): void;
}

/** A new call of the procedure with a key ("client.add") or a short name ("add"). */
export function callFor(name: string): ProcRef | undefined {
  const info = procedureByKey(name) ?? procedureByKey(`client.${name}`);
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

/** The controls of a slot that holds no call: the kind of the value, and a picker for a call. */
function SlotControls({ value, location, ctx }: { value: Json; location: Location; ctx: EditorContext }): ReactElement {
  return (
    <span className="slot-controls">
      <select
        className="kind-select"
        aria-label="Kind of value"
        value={kindOf(value)}
        onChange={(event) => ctx.set(location, convert(value, event.target.value as Kind))}
      >
        {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
          <option key={kind} value={kind}>
            {KIND_LABELS[kind]}
          </option>
        ))}
      </select>
      <input
        className="proc-picker"
        list={PICKER_LIST}
        placeholder="ƒ call…"
        aria-label="Replace with a procedure call"
        onChange={(event) => {
          const call = callFor(event.target.value);
          if (call) ctx.set(location, call);
        }}
      />
    </span>
  );
}

function LiteralEditor({ value, location, ctx }: { value: Json; location: Location; ctx: EditorContext }): ReactElement {
  let editor: ReactElement;
  if (typeof value === "number") {
    editor = (
      <input
        type="number"
        value={value}
        aria-label="Number"
        onChange={(event) => ctx.set(location, event.target.value === "" ? 0 : Number(event.target.value))}
      />
    );
  } else if (typeof value === "string") {
    editor = (
      <input type="text" value={value} aria-label="Text" onChange={(event) => ctx.set(location, event.target.value)} />
    );
  } else if (typeof value === "boolean") {
    editor = (
      <select aria-label="Yes or no" value={String(value)} onChange={(event) => ctx.set(location, event.target.value === "true")}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else {
    editor = <span className="muted small">null</span>;
  }
  return (
    <div className="literal">
      {editor}
      <SlotControls value={value} location={location} ctx={ctx} />
    </div>
  );
}

function RefChip({ value, location, ctx }: { value: { $ref: string }; location: Location; ctx: EditorContext }): ReactElement {
  return (
    <div className="literal">
      <span className="ref-chip" title="Reads a named result: a step $name, or item, index and acc in map and reduce">
        $ref
        <input
          type="text"
          value={value.$ref}
          placeholder="name"
          aria-label="Name of the result"
          onChange={(event) => ctx.set(location, { $ref: event.target.value })}
        />
      </span>
      <SlotControls value={value} location={location} ctx={ctx} />
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

function Collapsed({ value, onExpand }: { value: Json; onExpand: () => void }): ReactElement {
  const text = JSON.stringify(value);
  const size = Array.isArray(value) ? `${value.length} items` : `${Object.keys(value ?? {}).length} keys`;
  return (
    <div className="literal">
      <button type="button" className="collapsed" onClick={onExpand} title="Edit the value">
        <code>{text.length > 70 ? `${text.slice(0, 69)}…` : text}</code>
        <span className="muted"> {size} · edit</span>
      </button>
    </div>
  );
}

function ListEditor({ value, location, ctx, type }: { value: Json[]; location: Location; ctx: EditorContext; type: string | undefined }): ReactElement {
  const allCalls = value.length > 1 && value.every((item) => isProcRef(item));
  const [collapsed, setCollapsed] = useCollapsed(value);
  if (collapsed) return <Collapsed value={value} onExpand={() => setCollapsed(false)} />;
  return (
    <div className="list-editor">
      {value.map((item, index) => (
        <div className="list-row" key={index}>
          <span className="list-index">{index}</span>
          <Slot value={item} location={[...location, index]} ctx={ctx} type={elementType(type)} />
          <button type="button" className="icon" title="Remove the item" onClick={() => ctx.set([...location, index], undefined)}>
            ×
          </button>
        </div>
      ))}
      {allCalls && !isStepsList(location) ? (
        <span className="hint">A list of only calls runs as a chain: the slot gets the chain result. Add a plain value to keep a list.</span>
      ) : null}
      <div className="add-row">
        <button type="button" onClick={() => ctx.set([...location, value.length], defaultValue(elementType(type)))}>
          + item
        </button>
        <SlotControls value={value} location={location} ctx={ctx} />
      </div>
    </div>
  );
}

/** The steps of a chain and the tasks of parallel are lists of calls by design. */
function isStepsList(location: Location): boolean {
  const last = location[location.length - 1];
  return last === "steps" || last === "tasks";
}

function ObjectEditor({ value, location, ctx }: { value: { [key: string]: Json }; location: Location; ctx: EditorContext }): ReactElement {
  const keys = Object.keys(value);
  const [collapsed, setCollapsed] = useCollapsed(value);
  const rename = (from: string, to: string): void => {
    if (!to || to === from || to in value) return;
    const renamed: { [key: string]: Json } = {};
    for (const key of keys) renamed[key === from ? to : key] = value[key] ?? null;
    ctx.set(location, renamed);
  };
  if (collapsed) return <Collapsed value={value} onExpand={() => setCollapsed(false)} />;
  return (
    <div className="object-editor">
      {keys.map((key) => (
        <div className="object-row" key={key}>
          <input
            className="key"
            type="text"
            defaultValue={key}
            aria-label="Key"
            onBlur={(event) => rename(key, event.target.value.trim())}
          />
          <Slot value={value[key] ?? null} location={[...location, key]} ctx={ctx} type={undefined} />
          <button type="button" className="icon" title="Remove the key" onClick={() => ctx.set([...location, key], undefined)}>
            ×
          </button>
        </div>
      ))}
      <div className="add-row">
        <button
          type="button"
          onClick={() => {
            let index = keys.length + 1;
            while (`key${index}` in value) index++;
            ctx.set([...location, `key${index}`], "");
          }}
        >
          + key
        </button>
        <SlotControls value={value} location={location} ctx={ctx} />
      </div>
    </div>
  );
}

function CallBlock({
  value,
  location,
  ctx,
  onClear,
}: {
  value: ProcRef;
  location: Location;
  ctx: EditorContext;
  onClear: () => void;
}): ReactElement {
  const key = value.$proc.join(".");
  const info = procedureByKey(key);
  const category = info ? categoryOf(info) : "other";
  const input = inputOf(value);
  const fields = info?.fields ?? [];
  const known = new Set(fields.map((field) => field.name));
  const shown = fields.filter((field) => !field.optional || field.name in input);
  const missing = fields.filter((field) => field.optional && !(field.name in input));
  const extra = Object.keys(input).filter((name) => !known.has(name));
  const selected = ctx.selected === JSON.stringify(location);
  const inputLocation = [...location, "input"];

  return (
    <div className={`block cat-${category}${selected ? " selected" : ""}`}>
      <div
        className="block-head"
        title={info?.description ?? (info ? "" : "This procedure is not in the catalog")}
        onClick={(event) => {
          event.stopPropagation();
          ctx.select(location);
        }}
      >
        <span className="block-ns">{value.$proc.slice(0, -1).join(".")}.</span>
        <span className="block-name">{value.$proc[value.$proc.length - 1]}</span>
        {info && !info.browser ? <span className="pill warn">not in the browser</span> : null}
        <input
          className="name-input"
          type="text"
          placeholder="$name"
          aria-label="Name of the result ($name)"
          value={value.$name ?? ""}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => ctx.set([...location, "$name"], event.target.value || undefined)}
        />
        <span className="end">
          <button type="button" className="icon" title="Remove the call" onClick={onClear}>
            ×
          </button>
        </span>
      </div>
      <div className="block-fields">
        {shown.map((field) => (
          <Fragment key={field.name}>
            <label className={`field-label${field.optional ? " optional" : ""}`}>
              {field.name}
              {field.optional ? "?" : ""}
              <span className="type" title={field.type}>
                {field.type}
              </span>
            </label>
            <FieldSlot
              value={input[field.name] ?? null}
              location={[...inputLocation, field.name]}
              ctx={ctx}
              type={field.type}
              removable={field.optional}
            />
          </Fragment>
        ))}
        {extra.map((name) => (
          <Fragment key={name}>
            <label className="field-label optional">{name}</label>
            <FieldSlot value={input[name] ?? null} location={[...inputLocation, name]} ctx={ctx} type={undefined} removable />
          </Fragment>
        ))}
        {missing.length > 0 ? (
          <div className="add-row" style={{ gridColumn: "1 / -1" }}>
            <select
              aria-label="Add an optional field"
              value=""
              onChange={(event) => {
                const field = missing.find((candidate) => candidate.name === event.target.value);
                if (field) ctx.set([...inputLocation, field.name], defaultValue(field.type));
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

/** A slot of a field, with a remove button for an optional field. */
function FieldSlot({
  value,
  location,
  ctx,
  type,
  removable,
}: {
  value: Json;
  location: Location;
  ctx: EditorContext;
  type: string | undefined;
  removable: boolean;
}): ReactElement {
  if (!removable) return <Slot value={value} location={location} ctx={ctx} type={type} />;
  return (
    <div className="list-row" style={{ gridTemplateColumns: "minmax(0, 1fr) max-content" }}>
      <Slot value={value} location={location} ctx={ctx} type={type} />
      <button type="button" className="icon" title="Remove the field" onClick={() => ctx.set(location, undefined)}>
        ×
      </button>
    </div>
  );
}

/** A slot: a drop target for the palette that holds one value. */
export function Slot({
  value,
  location,
  ctx,
  type,
}: {
  value: Json;
  location: Location;
  ctx: EditorContext;
  type: string | undefined;
}): ReactElement {
  const [hover, setHover] = useState(false);
  const id = JSON.stringify(location);

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
    const call = callFor(name);
    if (call) {
      ctx.set(location, call);
      ctx.select(location);
    }
  };

  let content: ReactElement;
  if (isProcRef(value)) {
    content = (
      <CallBlock
        value={value}
        location={location}
        ctx={ctx}
        onClear={() => ctx.set(location, location.length === 0 ? null : defaultValue(type ?? ""))}
      />
    );
  } else if (isOutputRef(value)) {
    content = <RefChip value={value} location={location} ctx={ctx} />;
  } else if (Array.isArray(value)) {
    content = <ListEditor value={value} location={location} ctx={ctx} type={type} />;
  } else if (isPlainObject(value)) {
    content = <ObjectEditor value={value} location={location} ctx={ctx} />;
  } else {
    content = <LiteralEditor value={value} location={location} ctx={ctx} />;
  }

  return (
    <div
      className={`slot${hover ? " drop-hover" : ""}${ctx.selected === id ? " selected" : ""}`}
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
