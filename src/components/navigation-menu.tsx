"use client";

import { Menu } from "@base-ui/react/menu";
import { Bookmark, CircleHelp, Menu as MenuIcon, Moon, Pencil, Settings2, UserRound } from "lucide-react";
import { Button } from "./ui/button";
import { useAppearance } from "./appearance-provider";

export function NavigationMenu({ onSaved, onNew, onSettings, onHelp, onAccount, account }: {
  onSaved: () => void; onNew: () => void; onSettings: () => void;
  onHelp: () => void; onAccount: () => void; account?: string;
}) {
  const { appearance, toggle } = useAppearance();
  return <Menu.Root><Menu.Trigger aria-label="Open navigation menu" title="Menu" render={<Button variant="ghost" size="icon-lg" className="round-button" />}><MenuIcon /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner side="bottom" align="start" alignOffset={16} sideOffset={8} className="island-menu-positioner"><Menu.Popup className="island-menu compact-menu navigation-popup">
      {account && <Menu.Item className="island-menu-item navigation-account" onClick={onAccount}><span className="navigation-menu-avatar">{account.slice(0, 2).toUpperCase()}</span><span>{account}</span></Menu.Item>}
      <Menu.Separator className="island-menu-divider" />
      <Menu.Item className="island-menu-item" onClick={onAccount}><UserRound /><span>My Profile</span></Menu.Item>
      <Menu.Item className="island-menu-item" onClick={onSaved}><Bookmark /><span>Saved Messages</span></Menu.Item>
      <Menu.Item className="island-menu-item" onClick={onNew}><Pencil /><span>New chat</span></Menu.Item>
      <Menu.Item className="island-menu-item" onClick={onSettings}><Settings2 /><span>Settings</span></Menu.Item>
      <Menu.CheckboxItem className="island-menu-item" checked={appearance === "dark"} onCheckedChange={toggle} closeOnClick={false}><Moon /><span>Night mode</span><span className={`appearance-switch ${appearance === "dark" ? "on" : ""}`} aria-hidden="true" /></Menu.CheckboxItem>
      <Menu.Item className="island-menu-item" onClick={onHelp}><CircleHelp /><span>Help</span></Menu.Item>
      <p className="island-menu-caption">gitmsg · messages as commits</p>
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
