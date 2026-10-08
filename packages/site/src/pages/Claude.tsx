import type { ReactElement } from "react";
import { mcpTools, procedureByKey } from "../data";
import { href } from "../lib/router";

export function Claude(): ReactElement {
  const groups = new Map<string, string[]>();
  for (const tool of mcpTools) {
    const namespace = tool.split(".")[0] ?? tool;
    groups.set(namespace, [...(groups.get(namespace) ?? []), tool]);
  }
  return (
    <>
      <h1>What Claude sees</h1>
      <p>
        The <code>dev-tools</code> MCP server gives Claude Code these {mcpTools.length} procedures as tools. Each tool
        has the JSON Schema of its procedure, so Claude knows the names and the types of the fields.
      </p>
      <p>
        The list is a security decision. A test starts the real server and compares its tools with{" "}
        <a href="https://github.com/mark1russell7/client/blob/main/packages/impl-mcp-dev/tools.snapshot.txt">
          <code>tools.snapshot.txt</code>
        </a>
        . Thus a change to the list is always visible in a review.
      </p>
      <div className="cards">
        {[...groups.entries()].map(([namespace, tools]) => (
          <section className="panel" key={namespace}>
            <h3>
              <code>{namespace}.*</code> <span className="muted small">({tools.length})</span>
            </h3>
            <ul className="small" style={{ margin: 0, paddingLeft: "1.2em" }}>
              {tools.map((tool) => (
                <li key={tool}>
                  <a href={href("catalog", tool)}>
                    <code>{tool.slice(namespace.length + 1)}</code>
                  </a>{" "}
                  <span className="muted">{procedureByKey(tool)?.description ?? ""}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
