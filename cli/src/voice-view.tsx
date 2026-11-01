import { useEffect, useRef, useState } from "react";
import type { Attachment } from "../../src/lib/protocol";
import type { Rooms, TerminalRoom } from "./rooms";
import type { VoiceCapture, VoiceDriver } from "./voice";
import { voiceDiagram, type LocalVoice } from "./voice-data";
import { publicError } from "./safety";
import { useTheme } from "./theme";

export function VoiceRecorder({ driver, width, compact = false, onSend, onClose }: { driver: VoiceDriver; width: number; compact?: boolean; onSend: (voice: LocalVoice) => Promise<void>; onClose: () => void }) {
  const c = useTheme(), [levels, setLevels] = useState<number[]>([]), [seconds, setSeconds] = useState(0);
  const [voice, setVoice] = useState<LocalVoice | null>(null), [error, setError] = useState("");
  const [ready, setReady] = useState(false), [sending, setSending] = useState(false), [playing, setPlaying] = useState(false);
  const capture = useRef<VoiceCapture | null>(null), playback = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const active = await driver.record(value => { if (!controller.signal.aborted) { setSeconds(value.seconds); setLevels(levels => [...levels.slice(-47), value.level]); } }, controller.signal);
        capture.current = active;
        if (controller.signal.aborted) active.cancel(); else setReady(true);
        const result = await active.result;
        if (!controller.signal.aborted) setVoice(result);
      } catch (error) { if (!controller.signal.aborted) setError(publicError(error)); }
    })();
    return () => { controller.abort(); capture.current?.cancel(); playback.current?.abort(); };
  }, [driver]);
  async function listen() {
    if (playing) { playback.current?.abort(); return; }
    if (!voice) return;
    const controller = new AbortController(); playback.current = controller; setPlaying(true);
    try { await driver.play(voice.bytes, voice.mime, controller.signal); }
    catch (error) { if (!controller.signal.aborted) setError(publicError(error)); }
    finally { setPlaying(false); }
  }
  const diagram = voiceDiagram(voice ? voice.waveform.map(value => value / 31) : levels, Math.max(8, Math.min(48, width - 10)));
  return <box id="voice-recorder" flexDirection="column" gap={compact ? 0 : 1}>
    <text fg={c.accent}><strong>{voice ? "VOICE / READY" : error ? "VOICE / UNAVAILABLE" : ready ? "● REC" : "Connecting microphone…"}</strong><span fg={c.muted}>{`   ${(voice?.duration ?? seconds).toFixed(1)}s / 60s`}</span></text>
    <box border borderStyle="rounded" borderColor={c.border} paddingX={2} paddingY={compact ? 0 : 1}>
      <text id="voice-diagram" selectable={false} fg={voice ? c.accent : c.success} wrapMode="none">{compact ? diagram.split("\n").slice(1, 4).join("\n") : diagram}</text>
    </box>
    {!!error && <text fg={c.error}>{error}</text>}
    {!compact && <text fg={c.muted}>{voice ? "Listen first. Nothing is uploaded until Send Voice." : "Real microphone level · louder voice, taller bars. Stop at 60 seconds."}</text>}
    <select key={voice ? "preview" : "recording"} id="voice-actions" focused={!sending} height={voice ? 3 : 2} selectedIndex={0} backgroundColor={c.panel} focusedBackgroundColor={c.panel} textColor={c.muted} focusedTextColor={c.text} selectedBackgroundColor={c.elevated} selectedTextColor={c.accent} showDescription={false} options={voice ? [
      { name: "Cancel", value: "cancel", description: "" }, { name: playing ? "■ Stop listening" : "▶ Listen", value: "listen", description: "" }, { name: sending ? "Sending…" : "Send Voice →", value: "send", description: "" },
    ] : [ { name: "■ Stop recording", value: "stop", description: "" }, { name: "Cancel", value: "cancel", description: "" } ]} onSelect={(_, option) => {
      if (sending) return;
      if (option?.value === "cancel") onClose();
      if (option?.value === "stop") capture.current?.stop();
      if (option?.value === "listen") void listen();
      if (option?.value === "send" && voice) {
        setSending(true); playback.current?.abort();
        void onSend(voice).catch(error => setError(publicError(error))).finally(() => setSending(false));
      }
    }} />
  </box>;
}

export function VoiceMessage({ rooms, room, attachment, driver }: { rooms: Rooms; room: TerminalRoom; attachment: Attachment; driver: VoiceDriver }) {
  const c = useTheme(), [playing, setPlaying] = useState(false), [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => { operation.current?.abort(); }, [room.id, attachment.id]);
  async function toggle() {
    if (operation.current) { operation.current.abort(); operation.current = null; setPlaying(false); return; }
    const controller = new AbortController(); operation.current = controller; setPlaying(true); setError("");
    try {
      const bytes = await rooms.voice(room, attachment, controller.signal);
      if (!controller.signal.aborted) await driver.play(bytes, attachment.mime, controller.signal);
    } catch (error) { if (!controller.signal.aborted) setError(publicError(error)); }
    finally { if (operation.current === controller) { operation.current = null; setPlaying(false); } }
  }
  const bars = "▁▂▃▄▅▆▇█";
  return <box flexDirection="column" gap={1}>
    <text id={`voice-play-${attachment.id}`} fg={c.accent} selectable={false} onMouseDown={event => { event.stopPropagation(); void toggle(); }}>{`${playing ? "■ Stop" : "▶ Play"}  ${(attachment.waveform ?? [2, 6, 12, 7, 3]).map(value => bars[Math.min(7, Math.floor(value / 4))]).join("")}  ${attachment.duration?.toFixed(1) ?? "?"}s${attachment.iv ? " · encrypted" : ""}`}</text>
    {!!error && <text fg={c.error}>{error}</text>}
  </box>;
}
