import type { Metadata, Viewport } from "next";
import "./theme.css";
import "./messenger.css";

export const metadata: Metadata = {
  title: "gitmsg",
  description: "A GitHub-backed messenger. Private chats, shared repositories, and messages stored as commits.",
  applicationName: "gitmsg",
  openGraph: { title: "gitmsg", description: "A GitHub-backed messenger.", type: "website" },
  twitter: { card: "summary_large_image", title: "gitmsg", description: "A GitHub-backed messenger." },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#141414" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><head><link rel="preload" href="/fonts/CalSansVF.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body>{children}</body></html>;
}
