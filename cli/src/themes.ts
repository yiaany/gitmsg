export type Palette = { bg: string; panel: string; elevated: string; border: string; muted: string; text: string; accent: string; success: string; error: string; own: string };
export type Theme = { id: string; name: string; description: string; colors: Palette };

// Semantic colors cover every surface, including focused inputs and image errors.
// Tokyo Night and Catppuccin use their upstream palette colors, not upstream UI code.
export const THEMES: readonly Theme[] = [
  { id: "mono", name: "Mono", description: "Carbon, chalk, nothing else", colors: { bg: "#101010", panel: "#181818", elevated: "#303030", border: "#373737", muted: "#a0a0a0", text: "#eeeeee", accent: "#ffffff", success: "#cccccc", error: "#ffffff", own: "#242424" } },
  { id: "violet", name: "Violet", description: "Ink with a quiet ultraviolet edge", colors: { bg: "#101014", panel: "#19191f", elevated: "#302642", border: "#343440", muted: "#a5a5b8", text: "#eeeef5", accent: "#b39aff", success: "#86d5af", error: "#ff9eaa", own: "#282136" } },
  { id: "tokyo-night", name: "Tokyo Night", description: "Midnight blue, electric periwinkle", colors: { bg: "#1a1b26", panel: "#202230", elevated: "#292e42", border: "#414868", muted: "#a9b1d6", text: "#c0caf5", accent: "#7aa2f7", success: "#9ece6a", error: "#f7768e", own: "#24283b" } },
  { id: "catppuccin", name: "Catppuccin Mocha", description: "Soft charcoal and lavender", colors: { bg: "#1e1e2e", panel: "#181825", elevated: "#313244", border: "#45475a", muted: "#a6adc8", text: "#cdd6f4", accent: "#cba6f7", success: "#a6e3a1", error: "#f38ba8", own: "#313244" } },
  { id: "paper", name: "Paper", description: "Warm paper, graphite, daylight", colors: { bg: "#f5f2eb", panel: "#ece8df", elevated: "#ddd7ca", border: "#c6c0b5", muted: "#5f594f", text: "#24211c", accent: "#5746a3", success: "#356447", error: "#a12838", own: "#e2ddd2" } },
];
export function themeById(id?: string): Theme { return THEMES.find(theme => theme.id === id) ?? THEMES[0]; }
