"use client";

import { type ReactNode } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { Bookmark, Copy, GitCommitHorizontal, Pencil, Pin, PinOff, Reply, Trash2 } from "lucide-react";
import { REACTIONS, type Reaction } from "@/lib/protocol";

export function MessageMenu({ children, mine, editable, disabled, saveDisabled = disabled, pinned, onReply, onEdit, onDelete, onCopy, onSave, onInspect, onPin, onReact }: {
  children: ReactNode; mine: boolean; editable: boolean; disabled: boolean; saveDisabled?: boolean; pinned: boolean;
  onReply: () => void; onEdit: () => void; onDelete: () => void; onCopy: () => void;
  onSave: () => void; onInspect: () => void; onPin: () => void; onReact: (emoji: Reaction) => void;
}) {
  const items = <>
    <div className="context-reactions" aria-label="React to message">{REACTIONS.map(emoji => <Menu.Item className="context-reaction" key={emoji} aria-label={`React ${emoji}`} disabled={disabled} onClick={() => onReact(emoji)}>{emoji}</Menu.Item>)}</div>
    <Menu.Item className="island-menu-item" onClick={onReply} disabled={disabled}><Reply /><span>Reply</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={onCopy}><Copy /><span>Copy Text</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={onPin}>{pinned ? <PinOff /> : <Pin />}<span>{pinned ? "Unpin for me" : "Pin for me"}</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={onSave} disabled={saveDisabled}><Bookmark /><span>Save to Git</span></Menu.Item>
    {mine && editable && <Menu.Item className="island-menu-item" onClick={onEdit} disabled={disabled}><Pencil /><span>Edit</span></Menu.Item>}
    <Menu.Item className="island-menu-item" onClick={onInspect}><GitCommitHorizontal /><span>View commit</span></Menu.Item>
    {mine && <Menu.Item className="island-menu-item destructive" onClick={onDelete} disabled={disabled}><Trash2 /><span>Delete</span></Menu.Item>}
  </>;
  return <ContextMenu.Root><ContextMenu.Trigger className="message-interaction" tabIndex={-1}>
    {children}
  </ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Positioner className="island-menu-positioner" collisionPadding={12}><ContextMenu.Popup className="island-menu message-context-menu">{items}</ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal></ContextMenu.Root>;
}
