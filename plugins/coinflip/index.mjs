export async function run({ randomInt }, input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("Coin flip accepts no arguments.");
  const value = randomInt(0, 2);
  if (value !== 0 && value !== 1) throw new Error("Invalid randomness source.");
  return { text: `${value ? "Heads" : "Tails"}. Git has settled the argument.` };
}
