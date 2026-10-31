"use client";

import { Popover } from "@base-ui/react/popover";
import { type ReactNode } from "react";
import { Button } from "./ui/button";

/** Hover and click share a popup; Base UI keeps the pointer corridor and focus safe. */
export function ComposerPopover({ label, icon, children, disabled, className = "", open, onOpenChange }: {
  label: string; icon: ReactNode; children: ReactNode; disabled?: boolean; className?: string;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  return <Popover.Root open={open} onOpenChange={onOpenChange}>
    <Popover.Trigger openOnHover delay={150} closeDelay={200} disabled={disabled} aria-label={label} render={<Button variant="ghost" size="icon-lg" className={`round-button ${className}`} />}>{icon}</Popover.Trigger>
    <Popover.Portal><Popover.Positioner side="top" align="start" sideOffset={12} collisionPadding={12} className="composer-popover-positioner">
      <Popover.Popup className="composer-popover" initialFocus={false} finalFocus={false} aria-label={label}>{children}</Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
