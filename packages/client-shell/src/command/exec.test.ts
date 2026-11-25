import { describe, expect, it } from "vitest";
import { EXEC_MAX_BUFFER, execProgram, execProgramSync, type ExecProgramError } from "./exec.js";

/** The arguments of a Node program from its code. */
const node = (code: string): string[] => ["-e", code];

describe("execProgramSync", () => {
  it("gives the standard output of a program that exits with 0", () => {
    expect(execProgramSync(process.execPath, node("process.stdout.write('out')"), { encoding: "utf8", stdio: "pipe" })).toBe("out");
  });

  it("gives bytes with no encoding, and writes the input to the program", () => {
    const out = execProgramSync(process.execPath, node("process.stdin.pipe(process.stdout)"), { input: "abc", stdio: "pipe" });
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString()).toBe("abc");
  });

  it("throws the fields of the result when the program exits with a code that is not 0", () => {
    let error: (Error & { status?: number | null; stdout?: string; stderr?: string }) | undefined;
    try {
      execProgramSync(process.execPath, node("process.stdout.write('o'); process.stderr.write('e'); process.exit(3)"), { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      error = e as typeof error;
    }
    expect(error?.status).toBe(3);
    expect(error?.stdout).toBe("o");
    expect(error?.stderr).toBe("e");
    expect(error?.message).toMatch(/^Command failed: .+\ne$/s);
  });

  it("throws the error of the start when the program does not exist", () => {
    expect(() => execProgramSync("no-such-program-of-this-test", [], { stdio: "pipe" })).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("execProgram", () => {
  it("gives the standard output and the standard error of a program that exits with 0", async () => {
    await expect(execProgram(process.execPath, node("process.stdout.write('out'); process.stderr.write('err')"))).resolves.toEqual({ stdout: "out", stderr: "err" });
  });

  it("writes the input to the program, and uses the environment that the caller gives", async () => {
    const env = { PATH: process.env["PATH"] ?? "", ONLY_THIS: "yes" };
    const code = "let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => process.stdout.write(s + ':' + process.env.ONLY_THIS + ':' + (process.env.HOME_OF_TEST ?? 'none')))";
    process.env["HOME_OF_TEST"] = "parent";
    try {
      await expect(execProgram(process.execPath, node(code), { input: "in", env })).resolves.toEqual({ stdout: "in:yes:none", stderr: "" });
    } finally {
      delete process.env["HOME_OF_TEST"];
    }
  });

  it("fails with the exit code and the output when the program exits with a code that is not 0", async () => {
    const error = (await execProgram(process.execPath, node("process.stdout.write('o'); process.stderr.write('e'); process.exit(4)")).catch((e: unknown) => e)) as ExecProgramError;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: 4, signal: null, killed: false, stdout: "o", stderr: "e" });
    expect(error.message).toMatch(/^Command failed: .+\ne$/s);
  });

  it("fails with the code of the start error when the program does not exist", async () => {
    const error = (await execProgram("no-such-program-of-this-test", []).catch((e: unknown) => e)) as ExecProgramError;
    expect(error.code).toBe("ENOENT");
    expect(error.stdout).toBe("");
  });

  it("stops a program at its time limit", async () => {
    const error = (await execProgram(process.execPath, node("setTimeout(() => {}, 20000)"), { timeout: 200 }).catch((e: unknown) => e)) as ExecProgramError;
    expect(error.killed).toBe(true);
    expect(error.code === null || typeof error.code === "number").toBe(true);
  });

  it("stops a program that writes more than maxBuffer", async () => {
    const error = (await execProgram(process.execPath, node("process.stdout.write('x'.repeat(5000)); setTimeout(() => {}, 20000)"), { maxBuffer: 1000 }).catch((e: unknown) => e)) as ExecProgramError;
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", killed: true });
    expect(EXEC_MAX_BUFFER).toBe(1024 * 1024);
  });
});
