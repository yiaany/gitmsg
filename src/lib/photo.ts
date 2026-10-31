/** Telegram-like photo bounds, preserving portrait/landscape ratio without gutters. */
export function photoDisplaySize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 320, height: 240 };
  const ratio = width / height;
  const scale = Math.min(1, 480 / width, 432 / height);
  const displayWidth = Math.max(Math.min(192, 432 * ratio), width * scale);
  return { width: displayWidth, height: displayWidth / ratio };
}
