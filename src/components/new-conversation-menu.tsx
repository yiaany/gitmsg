"use client";
import { Menu } from "@base-ui/react/menu";
import { Link, MessageCircle, Megaphone, Pencil } from "lucide-react";
import { Button } from "./ui/button";

export type ConversationKind = "chat" | "channel" | "connect";
export function NewConversationMenu({ onSelect }: { onSelect: (kind: ConversationKind) => void }) {
  return <Menu.Root><Menu.Trigger aria-label="New message" render={<Button className="new-conversation" size="icon-lg" />}><Pencil /></Menu.Trigger><Menu.Portal><Menu.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="island-menu-positioner"><Menu.Popup className="island-menu new-conversation-menu">
    <Menu.Item className="island-menu-item" onClick={() => onSelect("channel")}><Megaphone /><span>New Channel</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={() => onSelect("chat")}><MessageCircle /><span>New Message</span></Menu.Item>
    <Menu.Item className="island-menu-item" onClick={() => onSelect("connect")}><Link /><span>Connect Repository</span></Menu.Item>
  </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>;
}
