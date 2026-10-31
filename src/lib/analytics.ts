/** Room links and secret invite fragments must never become analytics URLs. */
export function analyticsEvent<T extends { url: string }>(event: T): T | null {
  try {
    const url = new URL(event.url);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch { return null; }
}
