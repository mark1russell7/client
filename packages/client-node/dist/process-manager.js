/**
 * Process Manager - Manages spawned Node.js processes
 */
import { ChildProcess } from "child_process";
class ProcessManager {
    processes = new Map();
    counter = 0;
    /**
     * Register a spawned process for management
     */
    register(process, script) {
        const processId = `proc-${Date.now()}-${++this.counter}`;
        const managed = {
            process,
            script,
            startedAt: new Date(),
        };
        this.processes.set(processId, managed);
        // Track process exit
        process.on("exit", (code) => {
            if (code !== null) {
                managed.exitCode = code;
            }
            managed.exitedAt = new Date();
        });
        process.on("error", (error) => {
            managed.error = error;
            managed.exitedAt = new Date();
        });
        return processId;
    }
    /**
     * Get a managed process by ID
     */
    get(processId) {
        return this.processes.get(processId);
    }
    /**
     * Kill a process by ID
     */
    kill(processId, signal = "SIGTERM") {
        const managed = this.processes.get(processId);
        if (!managed)
            return false;
        const killed = managed.process.kill(signal);
        return killed;
    }
    /**
     * Wait for a ready pattern in stdout
     */
    async waitForReady(processId, pattern, timeout = 30000) {
        const managed = this.processes.get(processId);
        if (!managed) {
            throw new Error(`Process ${processId} not found`);
        }
        const regex = new RegExp(pattern);
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Timeout waiting for ready pattern: ${pattern}`));
            }, timeout);
            const onData = (data) => {
                if (regex.test(data.toString())) {
                    clearTimeout(timeoutId);
                    managed.process.stdout?.off("data", onData);
                    resolve();
                }
            };
            managed.process.stdout?.on("data", onData);
            managed.process.on("exit", (code) => {
                clearTimeout(timeoutId);
                reject(new Error(`Process exited with code ${code} before ready`));
            });
            managed.process.on("error", (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }
    /**
     * Get status of all or specific processes
     */
    getStatus(processId) {
        const result = [];
        for (const [id, managed] of this.processes) {
            if (processId && id !== processId)
                continue;
            const status = this.getProcessStatus(managed);
            const info = {
                processId: id,
                pid: managed.process.pid ?? 0,
                script: managed.script,
                status,
                startedAt: managed.startedAt.toISOString(),
            };
            if (managed.exitCode !== undefined) {
                info.exitCode = managed.exitCode;
            }
            if (managed.exitedAt) {
                info.exitedAt = managed.exitedAt.toISOString();
            }
            result.push(info);
        }
        return result;
    }
    getProcessStatus(managed) {
        if (managed.error)
            return "error";
        if (managed.exitedAt)
            return "exited";
        return "running";
    }
    /**
     * Cleanup exited processes
     */
    cleanup() {
        let cleaned = 0;
        for (const [id, managed] of this.processes) {
            if (managed.exitedAt) {
                this.processes.delete(id);
                cleaned++;
            }
        }
        return cleaned;
    }
}
// Singleton instance
export const processManager = new ProcessManager();
//# sourceMappingURL=process-manager.js.map