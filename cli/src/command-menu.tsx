import { useEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { commandSuggestions } from "./commands";
import { Panel } from "./motion";
import { useTheme } from "./theme";

export function CommandMenu({ value, index, height, wide, reduced, bottom = 3, onComplete }: { value: string; index: number; height: number; wide: boolean; reduced: boolean; bottom?: number; onComplete: (usage: string) => void }) {
  const c = useTheme(), items = commandSuggestions(value), scroll = useRef<ScrollBoxRenderable | null>(null);
  useEffect(() => { scroll.current?.scrollChildIntoView(`command-${index}`, { align: "nearest" }); }, [index, value]);
  return <Panel id="command-menu" reduced={reduced} position="absolute" bottom={bottom} left={0} right={0} zIndex={20} height={Math.min(items.length, Math.max(2, height - 14)) + 2} backgroundColor={c.panel} border borderStyle="single" borderColor={c.border} paddingX={1}>
    <scrollbox ref={scroll} flexGrow={1} scrollX={false}>
      {items.map(([usage, description], i) => <box id={`command-${i}`} key={usage} height={1} flexShrink={0} paddingX={1} backgroundColor={i === index ? c.elevated : c.panel} flexDirection="row" onMouseDown={() => onComplete(usage)}>
        <text width={wide ? 15 : undefined} fg={i === index ? c.accent : c.text}>{`${i === index ? "›" : " "} ${usage.split(" ")[0]}`}</text>
        {wide && <text fg={c.muted}>{description}</text>}
      </box>)}
    </scrollbox>
  </Panel>;
}
