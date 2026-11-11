/**
 * programPath: the file that a command starts. On Windows, a name with no folder is searched only
 * in the folders of `PATH`, never in the working folder. The tests give the operating system and
 * a list of files, so they run the same on each system.
 */

import { describe, expect, it } from "vitest";
import { programPath, systemProgram, windowsPathFolders, windowsPathValue } from "./program.js";

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
