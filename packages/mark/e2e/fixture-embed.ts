// A script that embeds the CLI (`exit.e2e.test.ts`). It runs the command of its arguments with
// `main()` of the built CLI in this process. Without `ownsProcess`, the runner of the command does
// not end the process. After the command, the script writes one line with the resources that keep
// the event loop alive. Then the process ends by itself when no resource remains.
const { main } = (await import(new URL("../dist/cli.js", import.meta.url).href)) as {
  main: (argv: readonly string[]) => Promise<void>;
};
await main(process.argv.slice(2));

// One turn of the event loop: a callback that the command queued at its end runs first
await new Promise<void>((resolve) => setImmediate(resolve));
process.stdout.write(`\nACTIVE ${JSON.stringify(process.getActiveResourcesInfo())}\n`);
