/**
 * move procedure
 *
 * Move or rename file/directory
 */
import { rename } from "node:fs/promises";
import { stat } from "./stat.js";
import { copy } from "./copy.js";
import { rm } from "./rm.js";
/**
 * Move or rename file/directory
 */
export async function move(input) {
    const { src, dest, overwrite } = input;
    if (!overwrite) {
        try {
            await stat({ path: dest });
            throw new Error(`Destination already exists: ${dest}`);
        }
        catch (err) {
            if (err.code !== "ENOENT")
                throw err;
        }
    }
    try {
        await rename(src, dest);
    }
    catch (err) {
        if (err.code === "EXDEV") {
            await copy({ src, dest, recursive: true, overwrite });
            await rm({ path: src, recursive: true, force: false });
        }
        else {
            throw err;
        }
    }
    return { src, dest };
}
//# sourceMappingURL=move.js.map