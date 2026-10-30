"use client";
// coss UI — MIT. Unused panel/footer helpers omitted.
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type React from "react";
import { XIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ className, children, showCloseButton = true, ...props }: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }): React.ReactElement {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-all duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
    <DialogPrimitive.Viewport className="fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center overflow-y-auto p-4">
      <DialogPrimitive.Popup className={cn("relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 max-w-lg origin-center flex-col rounded-2xl border bg-popover not-dark:bg-clip-padding text-popover-foreground opacity-[calc(1-var(--nested-dialogs))] shadow-lg/5 outline-none transition-[scale,opacity,translate] duration-200 ease-in-out will-change-transform before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-2xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-opacity sm:scale-[calc(1-0.1*var(--nested-dialogs))] motion-safe:sm:data-ending-style:scale-98 motion-safe:sm:data-starting-style:scale-98 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]", className)} data-slot="dialog-popup" {...props}>
        {children}
        {showCloseButton && <DialogPrimitive.Close aria-label="Close" className="absolute end-2 top-2" render={<Button size="icon" variant="ghost" />}><XIcon /></DialogPrimitive.Close>}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Viewport>
  </DialogPrimitive.Portal>;
}
export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props): React.ReactElement {
  return <DialogPrimitive.Title className={cn("font-bold font-heading text-xl leading-none", className)} data-slot="dialog-title" {...props} />;
}
export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props): React.ReactElement {
  return <DialogPrimitive.Description className={cn("text-muted-foreground text-sm", className)} data-slot="dialog-description" {...props} />;
}
