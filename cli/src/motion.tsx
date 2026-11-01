import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAnimationTick, type BoxProps } from "@opentui/react";
import { blend, easeOut, MOTION_MS } from "./presentation";
import { useTheme } from "./theme";

/** Shares OpenTUI's frame clock. No idle interval or full-app 60 Hz rerender. */
export function useTransition(trigger: unknown, reduced = false, animateOnMount = true) {
  const elapsed = useRef(0);
  const mounted = useRef(false);
  const [progress, setProgress] = useState(reduced || !animateOnMount ? 1 : 0);
  useEffect(() => {
    elapsed.current = 0;
    setProgress(reduced || !mounted.current && !animateOnMount ? 1 : 0);
    mounted.current = true;
  }, [trigger, reduced]);
  useAnimationTick(!reduced && progress < 1 ? 60 : undefined, delta => {
    elapsed.current += delta;
    setProgress(easeOut(elapsed.current / MOTION_MS));
  });
  return progress;
}

export function Reveal({ children, reduced = false }: { children: ReactNode; reduced?: boolean }) {
  const progress = useTransition(true, reduced);
  return <box flexDirection="column" flexGrow={1} minHeight={0} opacity={0.65 + progress * 0.35}>{children}</box>;
}

export function Panel({ reduced = false, ...props }: BoxProps & { reduced?: boolean }) {
  const progress = useTransition(true, reduced);
  return <box {...props} opacity={0.7 + progress * 0.3} />;
}

function useColor(target: string, reduced = false) {
  const [color, setColor] = useState(target), [running, setRunning] = useState(false);
  const current = useRef(target), from = useRef(target), elapsed = useRef(0);
  useEffect(() => {
    from.current = current.current; elapsed.current = 0;
    if (reduced) { current.current = target; setColor(target); setRunning(false); }
    else setRunning(current.current !== target);
  }, [target, reduced]);
  useAnimationTick(running ? 60 : undefined, delta => {
    elapsed.current += delta;
    current.current = blend(from.current, target, easeOut(elapsed.current / MOTION_MS));
    setColor(current.current);
    if (elapsed.current >= MOTION_MS) setRunning(false);
  });
  return color;
}

export function FocusFrame({ active, reduced, quiet = false, children, ...props }: BoxProps & { active: boolean; reduced?: boolean; quiet?: boolean; children: ReactNode }) {
  const c = useTheme();
  const base = quiet ? c.bg : c.border;
  const color = useColor(active ? c.accent : base, reduced);
  return <box border borderStyle="single" borderColor={color} flexDirection="column" flexShrink={0} {...props}>{children}</box>;
}

export function ChatRow({ name, preview, selected, active, reduced, onClick, onRemove, id }: { name: string; preview: string; selected: boolean; active: boolean; reduced?: boolean; onClick: () => void; onRemove?: () => void; id: string }) {
  const c = useTheme();
  const [hovered, setHovered] = useState(false);
  // Inset rows share the message/composer's light rounded outline.
  const background = useColor(selected ? c.elevated : active ? c.own : c.bg, reduced);
  return <box id={id} height={4} flexShrink={0} marginX={1} marginBottom={1} onMouseDown={onClick} onMouseOver={() => setHovered(true)} onMouseMove={() => setHovered(true)} onMouseOut={function (event) { if (event.x < this.x || event.x >= this.x + this.width || event.y < this.y || event.y >= this.y + this.height) setHovered(false); }}>
    <box height={4} flexShrink={0} border borderStyle="rounded" borderColor={selected || active ? c.border : c.bg} paddingX={1} flexDirection="column" backgroundColor={background}>
      <box flexDirection="row" justifyContent="space-between"><text selectable={false} flexShrink={1} minWidth={0} wrapMode="none" fg={selected || active ? c.text : c.muted}><strong>{name}</strong></text>{onRemove ? <text id={`${id}-remove`} selectable={false} width={1} flexShrink={0} opacity={hovered || selected ? 1 : 0} fg={c.muted} onMouseDown={event => { event.stopPropagation(); if (hovered || selected) onRemove(); }}>×</text> : <text selectable={false} width={1} flexShrink={0} fg={c.accent}>{selected ? "›" : " "}</text>}</box>
      <text selectable={false} fg={c.muted}>{preview}</text>
    </box>
  </box>;
}

export function MessageBubble({ own, reduced, feedbackReduced = reduced, children, id, onCopy, onReply }: { own: boolean; reduced: boolean; feedbackReduced?: boolean; children: ReactNode; id?: string; onCopy?: () => Promise<"copied" | "requested" | "failed">; onReply?: () => void }) {
  const c = useTheme(), progress = useTransition(true, reduced);
  const [hovered, setHovered] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "requested" | "failed">("idle");
  const [elapsed, setElapsed] = useState(0), copying = useRef(false), mounted = useRef(true);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(reset.current); }; }, []);
  useAnimationTick(!feedbackReduced && (copyState === "copying" || copyState === "copied" && elapsed < 900) ? 60 : undefined, delta => setElapsed(value => value + delta));
  const copyColor = useColor(copyState === "copied" ? c.success : copyState === "failed" ? c.error : copyState === "copying" ? c.accent : c.muted, feedbackReduced);
  async function handleCopy() {
    if (!onCopy || copying.current) return;
    copying.current = true; clearTimeout(reset.current); setElapsed(0); setCopyState("copying");
    let state: "copied" | "requested" | "failed" = "failed";
    try { state = await onCopy(); } catch { /* Parent reports the error; never show false success. */ }
    copying.current = false;
    if (!mounted.current) return;
    setElapsed(0); setCopyState(state);
    reset.current = setTimeout(() => { if (mounted.current) setCopyState("idle"); }, 2400);
  }
  return <box id={id} flexDirection="column" alignItems={own ? "flex-end" : "flex-start"} flexShrink={0} marginBottom={onCopy || onReply ? 1 : 2} opacity={0.65 + 0.35 * progress} onMouseOver={() => setHovered(true)} onMouseMove={() => setHovered(true)} onMouseOut={function (event) { if (event.x < this.x || event.x >= this.x + this.width || event.y < this.y || event.y >= this.y + this.height) setHovered(false); }}>
    <box flexDirection="column" maxWidth="92%" border borderStyle="rounded" borderColor={c.border} paddingX={1} gap={1} backgroundColor={own ? c.own : c.panel}>{children}</box>
    {(onCopy || onReply) && <box id={`${id}-actions`} height={1} flexShrink={0} paddingX={1} gap={2} flexDirection="row" opacity={hovered || copyState !== "idle" ? 1 : 0}>
      {onCopy && <text id={`${id}-copy`} width={11} selectable={false} fg={copyColor} opacity={copyState === "copied" && !feedbackReduced ? .72 + .28 * Math.min(1, elapsed / 300) : 1} onMouseDown={event => { event.stopPropagation(); if (hovered || copyState !== "idle") void handleCopy(); }}>{copyState === "copying" ? `${feedbackReduced ? "…" : "◐◓◑◒"[Math.floor(elapsed / 110) % 4]} Copying…` : copyState === "copied" ? "✓ Copied" : copyState === "requested" ? "↗ Requested" : copyState === "failed" ? "! Retry" : "Copy"}</text>}
      {onReply && <text id={`${id}-reply`} selectable={false} fg={c.muted} onMouseDown={event => { event.stopPropagation(); if (hovered) onReply(); }}>Reply</text>}
    </box>}
  </box>;
}

/** Indeterminate activity, never a fake percentage or delivery receipt. */
export function SendActivity({ reduced = false }: { reduced?: boolean }) {
  const c = useTheme(), [elapsed, setElapsed] = useState(0);
  useAnimationTick(reduced ? undefined : 60, delta => setElapsed(time => time + delta));
  const position = elapsed % 1000 / 1000 * 10 - 1;
  return <text id="send-activity" fg={c.muted}>
    {!reduced && Array.from({ length: 8 }, (_, i) => <span key={i} fg={blend(c.border, c.accent, Math.max(0, 1 - Math.abs(i - position) / 2))}>━</span>)}
    {reduced ? "Sending…" : "  Sending…"}
  </text>;
}
