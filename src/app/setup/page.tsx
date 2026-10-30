import type { Metadata } from "next";
import { SetupPage } from "@/components/setup-page";
export const metadata: Metadata = { title: "Connect GitHub OAuth — gitmsg", robots: { index: false, follow: false } };
export default function Setup() { return <SetupPage />; }
