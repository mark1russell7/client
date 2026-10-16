/**
 * A push notification through an ntfy server (https://ntfy.sh, or a self-hosted one). Each phone
 * that subscribes to the topic gets the message.
 *
 * The public server is a third party, and anyone who knows a topic can read it. Do not send
 * private content. Use a long random topic name.
 */

export const NTFY_URL = "https://ntfy.sh";

export interface Notification {
  readonly topic: string;
  readonly title: string;
  readonly message: string;
  readonly priority?: "min" | "low" | "default" | "high" | "max" | undefined;
  readonly tags?: readonly string[] | undefined;
  /** The address that a tap on the notification opens */
  readonly click?: string | undefined;
}

/**
 * HTTP header values are Latin-1 (ByteString). A character above 255 (an em dash) or a control
 * character makes `fetch` refuse the request. This function changes them, and the body stays
 * UTF-8.
 */
export const headerSafe = (text: string): string =>
  [
    // eslint-disable-next-line no-control-regex
    ...text.replace(/[\u0000-\u001f\u007f]/g, ""),
  ]
    .map((char) => ((char.codePointAt(0) ?? 0) <= 255 ? char : "-"))
    .join("");

/** This function sends a notification. It throws when the server does not accept it. */
export async function sendNotification(
  notification: Notification,
  options: { server?: string | undefined; token?: string | undefined; timeoutMs: number; signal?: AbortSignal | undefined }
): Promise<void> {
  const headers: Record<string, string> = {
    title: headerSafe(notification.title),
    priority: notification.priority ?? "default",
    ...(notification.tags && notification.tags.length > 0 ? { tags: headerSafe(notification.tags.join(",")) } : {}),
    ...(notification.click !== undefined ? { click: headerSafe(notification.click) } : {}),
    ...(options.token !== undefined ? { authorization: `Bearer ${options.token}` } : {}),
  };
  const signals = [AbortSignal.timeout(options.timeoutMs), ...(options.signal ? [options.signal] : [])];
  let response: Response;
  try {
    response = await fetch(`${options.server ?? NTFY_URL}/${encodeURIComponent(notification.topic)}`, {
      method: "POST",
      headers,
      body: notification.message,
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    const reason = (error as { name?: string }).name === "TimeoutError" ? `no answer in ${options.timeoutMs} ms` : "the request failed";
    throw new Error(`The ntfy server did not answer: ${reason}`);
  }
  if (!response.ok) throw new Error(`The ntfy server gave HTTP ${response.status}`);
}
