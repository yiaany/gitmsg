// Pure handler. The reviewed adapter owns auth, policy checks and GitHub writes.
export async function run(_context, input = {}) {
  if (Object.keys(input).length) throw new Error("This plugin accepts no arguments.");
  return { text: "Hello from a reviewed gitmsg integration." };
}
