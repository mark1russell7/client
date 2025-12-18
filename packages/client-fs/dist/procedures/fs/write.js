/**
 * write procedure
 *
 * Write content to file
 */
import { writeFile, appendFile } from "node:fs/promises";
/**
 * Write content to file
 */
export async function write(input) {
    const { path, content, encoding, mode } = input;
    const writeOptions = { encoding: encoding };
    if (mode === "append") {
        await appendFile(path, content, writeOptions);
    }
    else {
        await writeFile(path, content, writeOptions);
    }
    return {
        path,
        bytesWritten: Buffer.byteLength(content, encoding),
    };
}
//# sourceMappingURL=write.js.map