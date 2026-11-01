import { randomUUID } from "node:crypto";
import { MAX_MEDIA } from "../../src/lib/protocol";
import { ClientError } from "./safety";

export const VOICE_RATE = 16_000;
export const VOICE_SECONDS = 60;
export type LocalVoice = { id: string; name: string; mime: "audio/wav"; bytes: Uint8Array<ArrayBuffer>; duration: number; waveform: number[] };

export function amplitude(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += (Number.isFinite(samples[i]) ? samples[i] : 0) ** 2;
  return Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 4);
}
export function voiceWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  if (!samples.length || samples.length > VOICE_RATE * VOICE_SECONDS) throw new ClientError("Record between a moment and 60 seconds.");
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF")); view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, VOICE_RATE, true);
  view.setUint32(28, VOICE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  bytes.set(new TextEncoder().encode("data"), 36); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0)) * 32767), true);
  return bytes;
}
/** Strict, bounded PCM parser; untrusted audio never reaches an unlimited decoder. */
export function memoryVoice(data: Uint8Array): LocalVoice {
  if (data.length < 46 || data.length > MAX_MEDIA || data.length % 2) throw new ClientError("Invalid voice recording.");
  const bytes = new Uint8Array(data), view = new DataView(bytes.buffer);
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
  if (text(0, 4) !== "RIFF" || text(8, 16) !== "WAVEfmt " || text(36, 40) !== "data" || view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== VOICE_RATE || view.getUint32(28, true) !== VOICE_RATE * 2 || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 || view.getUint32(40, true) !== bytes.length - 44) throw new ClientError("Unsupported voice format. Use 16 kHz mono PCM16 WAV.");
  const length = (bytes.length - 44) / 2;
  if (length > VOICE_RATE * VOICE_SECONDS) throw new ClientError("Voice messages are limited to 60 seconds.");
  const waveform = Array.from({ length: 48 }, (_, bin) => {
    const start = Math.floor(bin * length / 48), end = Math.floor((bin + 1) * length / 48);
    let sum = 0;
    for (let i = start; i < end; i++) sum += (view.getInt16(44 + i * 2, true) / 32768) ** 2;
    return Math.min(31, Math.round(Math.sqrt(sum / Math.max(1, end - start)) * 124));
  });
  return { id: randomUUID(), name: "voice.wav", mime: "audio/wav", bytes, duration: length / VOICE_RATE, waveform };
}

/** Symmetric, five-row cell diagram, driven only by measured signal. */
export function voiceDiagram(levels: readonly number[], columns = 40): string {
  const values = levels.slice(-columns);
  const heights = [...Array(Math.max(0, columns - values.length)).fill(0), ...values].map(value => Math.round(Math.max(0, Math.min(1, value)) * 2));
  return [-2, -1, 0, 1, 2].map(row => heights.map(value => row === 0 ? "━" : value >= Math.abs(row) ? "┃" : " ").join("")).join("\n");
}
