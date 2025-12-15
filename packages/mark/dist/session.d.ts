/**
 * Session ID generation for CLI operations
 *
 * Session IDs are used to group logs and track CLI invocations.
 * Format: YYYYMMDD-HHMMSS-XXXX (e.g., 20241215-143052-a7b3)
 */
/**
 * Generate a session ID
 *
 * @example
 * generateSessionId() // "20241215-143052-a7b3"
 */
export declare function generateSessionId(): string;
/**
 * Parse a session ID into its components
 */
export declare function parseSessionId(sessionId: string): {
    date: string;
    time: string;
    random: string;
} | null;
//# sourceMappingURL=session.d.ts.map