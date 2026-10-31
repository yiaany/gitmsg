export const voiceClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Bounded amplitude metadata, not invented decoration or a copy of audio bytes. */
export function voiceWaveform(peaks: readonly number[], count = 48): number[] {
  if (!peaks.length) return Array(count).fill(0);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * peaks.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * peaks.length / count));
    let max = 0;
    for (let i = start; i < end; i++) max = Math.max(max, Number.isFinite(peaks[i]) ? peaks[i] : 0);
    return Math.round(Math.min(1, Math.max(0, max)) * 31);
  });
}
