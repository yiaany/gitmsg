import { useTheme } from "./theme";

export function Brand() {
  const c = useTheme();
  return <ascii-font id="wordmark" text="gitmsg" font="tiny" color={c.text} selectable={false} flexShrink={0} />;
}
