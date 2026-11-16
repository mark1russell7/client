/**
 * programPath: the file that a command starts. On Windows, a name with no folder is searched only
 * in the folders of `PATH`, never in the working folder. The tests give the operating system and
 * a list of files, so they run the same on each system.
 */

import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  nameStartErrors,
  programPath,
  startFile,
  systemProgram,
  whichCall,
  windowsPathFolders,
  windowsPathValue,
} from "./program.js";

/** The options of a Windows lookup over a fixed list of files. */
function windows(files: readonly string[], hostEnv: Record<string, string | undefined> = {}) {
  const lower = new Set(files.map((file) => file.toLowerCase()));
  return { platform: "win32" as const, hostEnv, isFile: (path: string) => lower.has(path.toLowerCase()) };
}

describe("programPath", () => {
  it("gives the command as it is on POSIX, and for a command with a folder part on Windows", () => {
    expect(programPath("git", { PATH: "/usr/bin" }, { platform: "linux", isFile: () => true })).toBe("git");
    const options = windows(["C:\\bin\\git.exe"]);
    for (const command of [".\\git", "./git", "bin\\git", "C:git", "C:\\tools\\git.exe", ""]) {
      expect(programPath(command, { PATH: "C:\\bin" }, options)).toBe(command);
    }
  });

  it("gives the first match in the folders of PATH, with .com before .exe", () => {
    const options = windows(["C:\\one\\tool.exe", "C:\\two\\tool.com", "C:\\two\\tool.exe"]);
    expect(programPath("tool", { PATH: "C:\\one;C:\\two" }, options)).toBe("C:\\one\\tool.exe");
    expect(programPath("tool", { PATH: "C:\\two;C:\\one" }, options)).toBe("C:\\two\\tool.com");
  });

  it("tries the exact name first when the name has an extension, and adds no other extension", () => {
    const options = windows(["C:\\bin\\tool.cmd", "C:\\bin\\tool.exe", "C:\\bin\\x.y.exe"]);
    expect(programPath("tool.exe", { PATH: "C:\\bin" }, options)).toBe("C:\\bin\\tool.exe");
    expect(programPath("x.y", { PATH: "C:\\bin" }, options)).toBe("C:\\bin\\x.y.exe");
    // A batch file does not start without a shell, so the lookup never adds .cmd
    expect(programPath("tool", { PATH: "C:\\other" }, options)).toBeUndefined();
  });

  it("never looks in the working folder: an empty or relative folder of PATH is left out", () => {
    const options = windows(["git.exe", ".\\git.exe", "bin\\git.exe", "C:git.exe", "\\git.exe", "C:\\real\\git.exe"]);
    expect(programPath("git", { PATH: ";.;bin;C:;\\;C:\\real" }, options)).toBe("C:\\real\\git.exe");
    expect(programPath("git", { PATH: ";.;bin" }, options)).toBeUndefined();
    expect(programPath(".", { PATH: "C:\\real" }, options)).toBeUndefined();
  });

  it("reads PATH in any case, as Node gives it to the child, and the PATH of the host when the child has none", () => {
    const options = windows(["C:\\a\\tool.exe", "C:\\b\\tool.exe", "C:\\host\\tool.exe"], { Path: "C:\\host" });
    expect(programPath("tool", { Path: "C:\\b", PATH: "C:\\a" }, options)).toBe("C:\\a\\tool.exe");
    expect(programPath("tool", { path: "C:\\b" }, options)).toBe("C:\\b\\tool.exe");
    expect(programPath("tool", {}, options)).toBe("C:\\host\\tool.exe");
  });

  it("finds a folder of PATH in quotes, and a UNC folder", () => {
    const options = windows(["C:\\Program Files;x\\tool.exe", "\\\\server\\share\\other.exe"]);
    expect(programPath("tool", { PATH: '"C:\\Program Files;x";C:\\bin' }, options)).toBe("C:\\Program Files;x\\tool.exe");
    expect(programPath("other", { PATH: "\\\\server\\share" }, options)).toBe("\\\\server\\share\\other.exe");
  });
});

describe("the PATH of Windows", () => {
  it("windowsPathValue keeps the first name in sorted order", () => {
    expect(windowsPathValue({ Path: "b", PATH: "a" })).toBe("a");
    expect(windowsPathValue({ PATH: undefined, Path: "b" })).toBeUndefined();
    expect(windowsPathValue({ HOME: "x" })).toBeUndefined();
  });

  it("windowsPathFolders splits on ;, removes quotes and leaves out the folders that are not fully qualified", () => {
    expect(windowsPathFolders("C:\\a;;'D:\\b';rel;\\\\srv\\s;\"C:\\c;d\"")).toEqual(["C:\\a", "D:\\b", "\\\\srv\\s", "C:\\c;d"]);
    expect(windowsPathFolders("")).toEqual([]);
  });
});

describe("systemProgram", () => {
  it("gives the program in System32 of SystemRoot, then windir, then C:\\Windows", () => {
    expect(systemProgram("taskkill.exe", { SystemRoot: "D:\\Win", windir: "E:\\Win" })).toBe("D:\\Win\\System32\\taskkill.exe");
    expect(systemProgram("taskkill.exe", { windir: "E:\\Win" })).toBe("E:\\Win\\System32\\taskkill.exe");
    expect(systemProgram("taskkill.exe", { SystemRoot: "Windows" })).toBe("C:\\Windows\\System32\\taskkill.exe");
    expect(systemProgram("taskkill.exe", {})).toBe("C:\\Windows\\System32\\taskkill.exe");
  });
});

describe("startFile", () => {
  it("gives the match of programPath, and the command as it is on POSIX", () => {
    expect(startFile("git", { PATH: "/usr/bin" }, { platform: "linux", isFile: () => false })).toBe("git");
    expect(startFile("tool", { PATH: "C:\\bin" }, windows(["C:\\bin\\tool.exe"]))).toBe("C:\\bin\\tool.exe");
    expect(startFile(".\\tool", { PATH: "C:\\bin" }, windows([]))).toBe(".\\tool");
  });

  it("gives a path in a folder that cannot exist when no folder of PATH has the program", () => {
    const options = windows(["tool.exe", "C:\\Win\\System32\\tool.exe"], { SystemRoot: "C:\\Win" });
    expect(startFile("tool", { PATH: ".;C:\\bin" }, options)).toBe("C:\\Win\\System32\\<not in PATH>\\tool");
    // No join: the names . and .. stay in the path, so the path is not a folder that exists
    expect(startFile(".", { PATH: "C:\\bin" }, options)).toBe("C:\\Win\\System32\\<not in PATH>\\.");
    expect(startFile("..", { PATH: "C:\\bin" }, options)).toBe("C:\\Win\\System32\\<not in PATH>\\..");
  });
});

/** The error that Node gives for a start that fails, with the fields that callers read. */
function startError(file: string): NodeJS.ErrnoException & { spawnargs: string[] } {
  const error = new Error(`spawn ${file} ENOENT`) as NodeJS.ErrnoException & { spawnargs: string[] };
  Object.assign(error, { errno: -4058, code: "ENOENT", syscall: `spawn ${file}`, path: file, spawnargs: ["one"] });
  return error;
}

describe("nameStartErrors", () => {
  it("names the command in the error of a start of its file, as a start by name does", () => {
    const child = new EventEmitter();
    nameStartErrors(child, "tool", "C:\\bin\\tool.exe");
    const seen: unknown[] = [];
    child.on("error", (error) => seen.push(error));
    child.emit("error", startError("C:\\bin\\tool.exe"));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ message: "spawn tool ENOENT", code: "ENOENT", errno: -4058, syscall: "spawn tool", path: "tool", spawnargs: ["one"] });
    expect((seen[0] as Error).stack).toContain("spawn tool ENOENT");
    expect((seen[0] as Error).stack).not.toContain("tool.exe");
  });

  it("keeps another error as it is", () => {
    const child = new EventEmitter();
    nameStartErrors(child, "tool", "C:\\bin\\tool.exe");
    const seen: unknown[] = [];
    child.on("error", (error) => seen.push(error));
    const other = Object.assign(new Error("kill EPERM"), { syscall: "kill" });
    child.emit("error", other);
    expect(seen[0]).toBe(other);
    expect(other).toMatchObject({ message: "kill EPERM", syscall: "kill" });
  });

  it("throws the error when the child has no other listener, as an EventEmitter does", () => {
    const child = new EventEmitter();
    nameStartErrors(child, "tool", "C:\\bin\\tool.exe");
    expect(() => child.emit("error", startError("C:\\bin\\tool.exe"))).toThrow("spawn tool ENOENT");
  });

  it("adds no listener when the file is the command", () => {
    const child = new EventEmitter();
    nameStartErrors(child, "git", "git");
    expect(child.listenerCount("error")).toBe(0);
  });
});

describe("whichCall", () => {
  it("gives which on POSIX, and where with the folders of PATH only on Windows", () => {
    expect(whichCall("git", "linux")).toEqual({ program: "which", args: ["git"] });
    expect(whichCall("git", "win32")).toEqual({ program: "where", args: ["$PATH:git"] });
    expect(whichCall(".\\git", "win32")).toEqual({ program: "where", args: [".\\git"] });
    expect(whichCall("C:\\bin\\git.exe", "win32")).toEqual({ program: "where", args: ["C:\\bin\\git.exe"] });
  });
});

