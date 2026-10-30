"use client";
import { useState } from "react";
import qrcode from "qrcode-generator";
import { Copy, QrCode } from "lucide-react";
import { Button } from "./ui/button";
export function ChatQR({ repo }: { repo: string }) {
  const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false);
  const link = `${location.origin}/?repo=${encodeURIComponent(repo)}`;
  const code = qrcode(0, "M"); code.addData(link); code.make();
  return <><Button variant="outline" onClick={() => setOpen(v => !v)}><QrCode />{open ? "Hide room QR" : "Show room QR"}</Button>{open && <div className="key-share"><div className="qr-code" dangerouslySetInnerHTML={{ __html: code.createSvgTag({ cellSize: 4, margin: 4, scalable: true }) }} /><p className="fine-print">Room address only. No secret key. GitHub collaborator access is still required.</p><Button variant="ghost" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}><Copy />{copied ? "Copied" : "Copy room link"}</Button></div>}</>;
}
