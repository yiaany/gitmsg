import { useEffect, useState } from "react";
import { useAnimationTick } from "@opentui/react";
import type { TerminalCallView } from "./calls";
import type { CallLevels } from "./call-device";
import { useTheme } from "./theme";
import { voiceDiagram } from "./voice-data";
import { terminalText } from "./safety";

export function callDuration(view: TerminalCallView, now: number): string {
  const seconds = view.startedAt ? Math.max(0, Math.floor(((view.endedAt ?? now) - view.startedAt) / 1000)) : 0;
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function CallPanel({ view, levels, width, compact, reduced = false, onAccept, onEnd, onMute, onClose }: { view: TerminalCallView; levels: CallLevels; width: number; compact: boolean; reduced?: boolean; onAccept(): void; onEnd(): void; onMute(): void; onClose(): void }) {
  const c = useTheme(), [elapsed, setElapsed] = useState(0), [now, setNow] = useState(Date.now()), [samples, setSamples] = useState<number[]>([]);
  const pending = ["preparing", "ringing", "connecting"].includes(view.phase), connected = view.phase === "connected", finished = view.phase === "finished";
  const micLive = !finished && view.phase !== "incoming" && !view.muted;
  useAnimationTick(!reduced && pending ? 30 : undefined, delta => setElapsed(value => value + delta));
  useEffect(() => { if (!connected) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [connected, view.startedAt]);
  useEffect(() => { setSamples(value => view.muted || finished || view.phase === "incoming" ? [] : [...value.slice(-47), levels.local]); }, [levels, view.muted, finished, view.phase]);
  const color = finished ? c.error : connected ? c.success : c.accent;
  const spinner = reduced ? "·" : ["◜", "◝", "◞", "◟"][Math.floor(elapsed / 120) % 4];
  const title = { incoming: "INCOMING CALL", preparing: "PREPARING AUDIO", ringing: "RINGING", connecting: "CONNECTING", connected: "CONNECTED", finished: "CALL ENDED" }[view.phase];
  const diagram = voiceDiagram(samples, Math.max(8, Math.min(48, width - 12))).split("\n");
  return <box id="call-panel" border borderStyle="rounded" borderColor={color} paddingX={1} paddingY={compact ? 0 : 1} flexDirection="column" gap={compact ? 0 : 1}>
    <box flexDirection="row" justifyContent="space-between"><text id="call-status" fg={color}><strong>{`${pending ? spinner : connected ? "●" : finished ? "×" : "◇"} ${title}`}</strong></text><text id="call-duration" fg={c.text}>{callDuration(view, now)}</text></box>
    <text fg={c.text}>{terminalText(view.room.peer?.login ?? view.room.name, 35)}<span fg={c.muted}> · WebRTC / audio only</span></text>
    {!compact && <text fg={c.muted}>{connected ? "        YOU ◀━━━━━━━━━▶ PEER        " : pending ? `        YOU ${"─".repeat(Math.floor(elapsed / 180) % 4 + 1)}○····○ PEER        ` : "        [ MIC ]     [ PEER ]        "}</text>}
    <text id="call-diagram" fg={view.muted ? c.muted : color} wrapMode="none" selectable={false}>{(compact ? diagram.slice(1, 4) : diagram).join("\n")}</text>
    <text id="call-level" fg={c.muted}>{`${finished || view.phase === "incoming" ? "MIC OFF" : view.muted ? "MIC MUTED" : "MIC LIVE"}  ${"▰".repeat(Math.round((micLive ? levels.local : 0) * 12)).padEnd(12, "▱")}   RX ${"▰".repeat(Math.round((finished ? 0 : levels.remote) * 8)).padEnd(8, "▱")}`}</text>
    {!!view.detail && <text fg={finished ? c.error : c.muted} wrapMode="word">{terminalText(view.detail, compact ? 140 : 350)}</text>}
    <box flexDirection="row" gap={3}>
      {view.phase === "incoming" && <text id="call-accept" selectable={false} fg={c.success} onMouseDown={onAccept}>[A] Answer</text>}
      {!finished && view.phase !== "incoming" && <text id="call-mute" selectable={false} fg={c.accent} onMouseDown={onMute}>{view.muted ? "[M] Unmute" : "[M] Mute"}</text>}
      {!finished && <text id="call-end" selectable={false} fg={c.error} onMouseDown={onEnd}>{view.phase === "incoming" ? "[H] Decline" : "[H] Hang up"}</text>}
      {finished && <text id="call-close" selectable={false} fg={c.accent} onMouseDown={onClose}>[Esc] Close</text>}
    </box>
    {!compact && <text fg={c.muted}>Voice level is measured, not simulated. No audio is committed.</text>}
  </box>;
}
