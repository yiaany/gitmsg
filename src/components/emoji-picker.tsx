"use client";

import { useId, useState } from "react";
import { Clock3, Coffee, Heart, Leaf, Search, Smile } from "lucide-react";
import { ComposerPopover } from "./composer-popover";

const groups = [
  { name: "Frequently used", icon: Clock3, emoji: "👍 ❤️ 😂 🔥 👀 🚀 👋 🤝 🫡 ✨ ☕ 🎉" },
  { name: "Smileys & People", icon: Smile, emoji: "😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 🥰 😍 🤩 😘 😋 😎 🤓 🥳 😏 😌 😔 😢 😭 😤 😡 🤯 😳 🥺 🤔 🤫 🫠 🫡 😴 👋 🤚 ✋ 🖖 👌 🤌 ✌️ 🤞 🫶 🙌 👏 🤝 👍 👎 💪 🙏" },
  { name: "Animals & Nature", icon: Leaf, emoji: "🐶 🐱 🦊 🐻 🐼 🐨 🐯 🦁 🐸 🐵 🦄 🐝 🦋 🐢 🐬 🌸 🌻 🌹 🌿 🍀 🌴 🌵 🌍 🌞 🌙 ⭐ 🌈 ⚡ 🔥 ❄️" },
  { name: "Food & Drink", icon: Coffee, emoji: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥑 🥦 🥕 🌽 🍕 🍔 🍟 🌮 🍜 🍣 🍰 🍩 🍪 🍫 ☕ 🍵 🥤 🍻" },
  { name: "Symbols", icon: Heart, emoji: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💖 💯 ✅ ❌ ❗ ❓ ⚠️ 🔒 🔑 🎉 🎊 🎁 🏆 ⚽ 🎮 💻 📱 💡 🚀 ✈️ 🏠" },
] as const;

export function EmojiPicker({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (emoji: string) => void }) {
  const [category, setCategory] = useState(0);
  const [query, setQuery] = useState("");
  const id = useId();
  const visible = query ? groups.filter(group => group.name.toLowerCase().includes(query.toLowerCase()) || group.emoji.includes(query)) : [groups[category]];
  return <ComposerPopover label="Add emoji" icon={<Smile />} className="emoji-trigger" open={open} onOpenChange={onOpenChange}>
    <div className="emoji-panel"><div className="emoji-categories" role="tablist" aria-label="Emoji categories" onKeyDown={event => { const next = event.key === "ArrowRight" ? (category + 1) % groups.length : event.key === "ArrowLeft" ? (category + groups.length - 1) % groups.length : event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : null; if (next === null) return; event.preventDefault(); setCategory(next); setQuery(""); event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus(); }}>{groups.map((group, index) => <button type="button" role="tab" id={`${id}-category-${index}`} aria-controls={`${id}-panel`} tabIndex={category === index ? 0 : -1} aria-label={group.name} aria-selected={category === index} key={group.name} onClick={() => { setCategory(index); setQuery(""); }}><group.icon /></button>)}</div>
      <label className="emoji-search"><Search size={18} /><input aria-label="Search emoji categories" placeholder="Search emoji" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="emoji-scroll" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-category-${category}`}>{visible.map(group => <section key={group.name}><h3>{group.name}</h3><div className="emoji-grid">{group.emoji.split(" ").map(emoji => <button type="button" key={emoji} aria-label={`Insert ${emoji}`} onClick={() => onSelect(emoji)}>{emoji}</button>)}</div></section>)}{!visible.length && <p className="notice">No emoji categories found</p>}</div>
      <div className="emoji-panel-footer">Emoji</div>
    </div>
  </ComposerPopover>;
}
