"use client";
// coss UI — MIT. Unused size variants omitted.
import { Field as FieldPrimitive } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import { cn } from "@/lib/utils";
import type React from "react";
export function Textarea({ className, ref, ...props }: React.ComponentProps<"textarea">): React.ReactElement {
  return <span className={cn("relative inline-grid w-full rounded-lg border border-input bg-background not-dark:bg-clip-padding text-base shadow-xs/5 ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/16 has-aria-invalid:border-destructive/36 has-aria-invalid:border-destructive/36 has-focus-visible:border-ring has-disabled:opacity-64 has-[:disabled,:focus-visible,[aria-invalid]]:shadow-none has-focus-visible:ring-[3px] sm:text-sm dark:bg-input/32 dark:has-aria-invalid:ring-destructive/24 dark:not-has-disabled:has-not-focus-visible:not-has-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)]", className)} data-slot="textarea-control">
    <FieldPrimitive.Control ref={ref} value={props.value} defaultValue={props.defaultValue} disabled={props.disabled} id={props.id} name={props.name} render={(defaultProps: React.ComponentProps<"textarea">) => <textarea className="field-sizing-content min-h-17.5 w-full rounded-[inherit] px-[calc(--spacing(3)-1px)] py-[calc(--spacing(1.5)-1px)] text-foreground outline-none placeholder:text-muted-foreground/72 max-sm:min-h-20.5" data-slot="textarea" {...mergeProps(defaultProps, props)} />} />
  </span>;
}
