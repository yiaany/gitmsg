"use client";
// coss UI — MIT.
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "@/lib/utils";
import type React from "react";
export function Avatar({ className, ...props }: AvatarPrimitive.Root.Props): React.ReactElement {
  return <AvatarPrimitive.Root className={cn("relative isolate inline-flex size-(--avatar-size,--spacing(8)) shrink-0 select-none items-center justify-center overflow-hidden rounded-full align-middle font-medium text-[calc(var(--avatar-size,--spacing(8))*0.375)]/none", className)} data-slot="avatar" {...props} />;
}
export function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props): React.ReactElement {
  return <AvatarPrimitive.Image className={cn("absolute inset-0 z-10 size-full rounded-[inherit] object-cover data-error:invisible data-loading:invisible", className)} data-slot="avatar-image" {...props} />;
}
export function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props): React.ReactElement {
  return <AvatarPrimitive.Fallback className={cn("absolute inset-0 flex size-full items-center justify-center rounded-[inherit] bg-border", className)} data-slot="avatar-fallback" {...props} />;
}
