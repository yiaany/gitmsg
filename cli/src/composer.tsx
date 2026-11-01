import { useLayoutEffect, useRef } from "react";
import type { TextareaRenderable } from "@opentui/core";
import { useTheme } from "./theme";

export function Composer({ value, width, rows, maxRows, focused, placeholder, onChange, onRows, onSubmit }: {
  value: string; width: number; rows: number; maxRows: number; focused: boolean; placeholder: string;
  onChange: (value: string) => void; onRows: (rows: number) => void; onSubmit: () => void;
}) {
  const c = useTheme(), editor = useRef<TextareaRenderable | null>(null);
  function measure() {
    const count = editor.current?.editorView.measureForDimensions(Math.max(1, width), maxRows)?.lineCount ?? 1;
    onRows(Math.max(1, Math.min(maxRows, count)));
  }
  useLayoutEffect(() => {
    if (editor.current && editor.current.plainText !== value) { editor.current.setText(value); editor.current.gotoBufferEnd(); }
    measure();
  }, [value, width, maxRows]);
  return <textarea id="composer" ref={editor} initialValue={value} width="100%" height={rows} flexShrink={0}
    wrapMode="word" scrollMargin={0} focused={focused} placeholder={placeholder}
    backgroundColor={c.panel} focusedBackgroundColor={c.panel} textColor={c.text} focusedTextColor={c.text}
    placeholderColor={c.muted} selectionBg={c.elevated} selectionFg={c.text} cursorColor={c.accent}
    cursorStyle={{ style: "line", blinking: true }}
    keyBindings={[{ name: "return", action: "submit" }, { name: "return", shift: true, action: "newline" }, { name: "j", ctrl: true, action: "newline" }]}
    onContentChange={() => {
      const node = editor.current;
      if (!node) return;
      if (node.plainText.length > 4000) { node.replaceText(node.plainText.slice(0, 4000)); return; }
      onChange(node.plainText); measure();
    }} onSubmit={onSubmit} />;
}
