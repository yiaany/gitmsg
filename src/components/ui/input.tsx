"use client";
// coss UI — MIT. Native-input branch and unused sizes omitted.
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";
import type React from "react";
export function Input({ className, ...props }: InputPrimitive.Props & React.RefAttributes<HTMLInputElement>): React.ReactElement {
  return <span className={cn("relative inline-flex w-full rounded-lg border border-input bg-background not-dark:bg-clip-padding text-base shadow-xs/5 ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/16 has-aria-invalid:border-destructive/36 has-focus-visible:border-ring has-disabled:opacity-64 has-[:disabled,:focus-visible,[aria-invalid]]:shadow-none has-focus-visible:ring-[3px] sm:text-sm dark:bg-input/32 dark:has-aria-invalid:ring-destructive/24 dark:not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)]", className)} data-slot="input-control">
    <InputPrimitive className="h-8.5 w-full min-w-0 rounded-[inherit] px-[calc(--spacing(3)-1px)] text-foreground leading-8.5 outline-none placeholder:text-muted-foreground/72 sm:h-7.5 sm:leading-7.5" data-slot="input" {...props} />
  </span>;
}
