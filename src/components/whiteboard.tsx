"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GitCommitHorizontal, History, LoaderCircle } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { loadMedia } from "@/lib/media";
import type { Message, Room } from "@/lib/protocol";
import { Button } from "./ui/button";

const Excalidraw = dynamic(async () => {
  (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
  return (await import("@excalidraw/excalidraw")).Excalidraw;
}, { ssr: false, loading: () => <div className="empty-state"><LoaderCircle className="spin" />Loading whiteboard…</div> });
export function Whiteboard({ room, snapshots, onCommit, disabled }: { room: Room; snapshots: Message[]; onCommit: (blob: Blob) => Promise<void>; disabled: boolean }) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null); const [selected, setSelected] = useState(snapshots.at(-1)?.id || ""); const [scene, setScene] = useState<Record<string, unknown> | null>(null); const [version, setVersion] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!selected) { setScene({ elements: [] }); setVersion(n => n + 1); setDirty(false); setError(""); return; }
    const snapshot = snapshots.find(s => s.id === selected); const attachment = snapshot?.attachments?.find(a => a.mime === "application/vnd.excalidraw+json");
    if (!attachment) return;
    let disposed = false; setBusy(true); setError("");
    loadMedia(room, attachment).then(blob => blob.text()).then(text => {
      const value = JSON.parse(text);
      if (!Array.isArray(value.elements) || value.elements.length > 2000 || value.elements.some((e: { type?: string }) => !e || e.type === "image")) throw new Error("Invalid or oversized Excalidraw snapshot.");
      if (!disposed) { setScene({ elements: value.elements, appState: { viewBackgroundColor: "#161616" }, files: {} }); setVersion(n => n + 1); setDirty(false); }
    }).catch(e => { if (!disposed) setError(e.message); }).finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; };
  }, [selected, room.id]);
  async function save() {
    if (!api.current) return; setBusy(true); setError("");
    try {
      const elements = api.current.getSceneElements();
      if (elements.length > 2000) throw new Error("Keep each board under 2,000 elements.");
      const blob = new Blob([JSON.stringify({ type: "excalidraw", version: 2, source: "gitmsg", elements, appState: { viewBackgroundColor: "#161616" }, files: {} })], { type: "application/vnd.excalidraw+json" });
      await onCommit(blob); setDirty(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <><h2>Whiteboard <span className="subtle-label">Excalidraw × Git</span></h2><div className="board-toolbar"><label><History size={14} /><select aria-label="Board version" value={selected} onChange={e => { if (!dirty || confirm("Discard unsaved drawing changes and open this version?")) setSelected(e.target.value); }}><option value="">New board</option>{snapshots.map((s, i) => <option key={s.id} value={s.id}>v{i + 1} · {s.actor.login} · {new Date(s.createdAt).toLocaleString()} · {s.sha?.slice(0, 7) || "local"}</option>)}</select></label><Button loading={busy} disabled={disabled || !scene} onClick={() => void save()}><GitCommitHorizontal />Commit snapshot</Button></div>
    {selected && snapshots.at(-1)?.id !== selected && <p className="fine-print">You are viewing an earlier version. Committing creates a new snapshot; no history is overwritten.</p>}
    <p className="fine-print">Draw locally, then commit to share. Other participants open the saved version. No live cursors or automatic merging. Embedded images are disabled; send images in chat instead.</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="whiteboard-canvas">{scene && <Excalidraw key={version} excalidrawAPI={value => { api.current = value; }} initialData={scene} theme="dark" langCode="en" onChange={() => setDirty(true)} UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false }, tools: { image: false } }} />}</div>
    <p className="fine-print">{dirty ? "Uncommitted changes stay on this device until you close the board." : "Snapshot committed or unchanged."}</p>
  </>;
}
