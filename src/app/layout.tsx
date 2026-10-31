import type { Metadata, Viewport } from "next";
import "./theme.css";
import "./messenger.css";
import { MotionProvider } from "@/components/motion-provider";
import { AppearanceProvider } from "@/components/appearance-provider";

export const metadata: Metadata = {
  title: "gitmsg",
  description: "A GitHub-backed messenger. Private chats, shared repositories, and messages stored as commits.",
  applicationName: "gitmsg",
  openGraph: { title: "gitmsg", description: "A GitHub-backed messenger.", type: "website" },
  twitter: { card: "summary_large_image", title: "gitmsg", description: "A GitHub-backed messenger." },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", themeColor: "#212121" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('gitmsg:appearance')||'dark';t=t==='light'?'light':'dark';document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.dataset.apple=/Mac|iPhone|iPad|iPod/.test(navigator.platform)?'true':'false';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t==='dark'?'#212121':'#ffffff')}catch{}` }} /></head><body><AppearanceProvider><MotionProvider>{children}</MotionProvider></AppearanceProvider></body></html>;
}
