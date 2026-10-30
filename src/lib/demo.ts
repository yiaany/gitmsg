import type { Actor, ChatEvent, Room } from "./protocol";

export const DEMO_USER: Actor = { id: 1001, login: "you" };
export const DEMO_ROOMS: Room[] = [
  { id: "demo/ship-it", name: "ship-it", description: "Good ideas. Questionable infrastructure.", branch: "main", demo: true },
  { id: "demo/emotional-support", name: "emotional-support", description: "A safe space for unsafe deployments.", branch: "main", demo: true },
  { id: "demo/production-is-down", name: "production-is-down", description: "Everything is fine. This is a feature.", branch: "main", demo: true },
];
export const BOTS: Actor[] = [
  { id: 1002, login: "sarah" }, { id: 1003, login: "alex" }, { id: 1004, login: "dependabot" },
];
const lines: Record<string, { actor: Actor; text: string }[]> = {
  "demo/ship-it": [
    { actor: BOTS[1], text: "Hey Sarah, have you had a chance to try the new build?" },
    { actor: BOTS[0], text: "Just opened it. The chat feels much quieter now." },
    { actor: BOTS[1], text: "That was the idea. Fewer distractions." },
    { actor: BOTS[0], text: "Can we invite the rest of the team?" },
    { actor: BOTS[1], text: "Yes, once we sign in. Each shared chat gets its own private repository." },
    { actor: BOTS[2], text: "All checks passed." },
    { actor: BOTS[0], text: "Looks good. Let's try it on Monday." },
  ],
  "demo/emotional-support": [
    { actor: BOTS[0], text: "git status\nOn branch: barely-holding-it-together" },
    { actor: BOTS[1], text: "have you tried turning your expectations off and on again?" },
    { actor: BOTS[0], text: "I don't need therapy. I need git reset --soft yesterday." },
  ],
  "demo/production-is-down": [
    { actor: BOTS[2], text: "⚠️ Build passed. This is not a guarantee of anything." },
    { actor: BOTS[1], text: "who pushed to main" },
    { actor: BOTS[0], text: "define pushed. define main. define accountability." },
    { actor: BOTS[1], text: "it's not downtime. it's a surprise maintenance window." },
  ],
};

export function demoEvents(room: string): ChatEvent[] {
  const start = new Date(); start.setHours(14, 26, 0, 0);
  const messages: ChatEvent[] = (lines[room] || []).map((line, index) => ({
    v: 1, id: `demo-${room.split("/")[1]}-${index}`, kind: "message", actor: line.actor,
    createdAt: new Date(start.getTime() + index * 85000).toISOString(), text: line.text,
    sha: ["c0ffee1", "bada55e", "f00d123", "deca1ed", "facade0", "b00b135", "a11ce42"][index % 7],
  }));
  if (room === "demo/ship-it") messages.push(
    { v: 1, id: "demo-reaction-one", kind: "reaction", target: messages[4].id, actor: BOTS[0], emoji: "😂", active: true, createdAt: start.toISOString() },
    { v: 1, id: "demo-reaction-two", kind: "reaction", target: messages[4].id, actor: BOTS[2], emoji: "😂", active: true, createdAt: start.toISOString() },
    { v: 1, id: "demo-reaction-three", kind: "reaction", target: messages[6].id, actor: BOTS[1], emoji: "🚀", active: true, createdAt: start.toISOString() },
  );
  return messages;
}

export const BOT_REPLIES = [
  "Sounds good. I'll take a look.",
  "Thanks for the update.",
  "Got it. Let's talk about it tomorrow.",
  "I was thinking the same thing.",
];
export const FORTUNES = [
  "Your next deploy will work. Source: trust me bro.",
  "A merge conflict is just Git asking you to communicate.",
  "Today is a great day to not force-push to main.",
  "You are not behind. You are on a feature branch.",
  "There are only two hard things: cache invalidation, naming things, and counting.",
];
