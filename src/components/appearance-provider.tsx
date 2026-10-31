"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

type Appearance = "light" | "dark";
const AppearanceContext = createContext({ appearance: "dark" as Appearance, toggle: () => {} });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>("dark");
  useEffect(() => { setAppearance(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  function toggle() {
    const next = appearance === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#212121" : "#ffffff");
    try { localStorage.setItem("gitmsg:appearance", next); } catch { /* The theme still works without storage. */ }
    setAppearance(next);
  }
  return <AppearanceContext.Provider value={{ appearance, toggle }}>{children}</AppearanceContext.Provider>;
}

export function AppearanceToggle() {
  const { appearance, toggle } = useContext(AppearanceContext);
  return <Button variant="ghost" className="appearance-toggle" onClick={toggle}>{appearance === "light" ? <Moon /> : <Sun />}Night mode<span className={`appearance-switch ${appearance === "dark" ? "on" : ""}`} aria-hidden="true" /><span className="sr-only">{appearance === "dark" ? "on; switch to light theme" : "off; switch to dark theme"}</span></Button>;
}

export function useAppearance() { return useContext(AppearanceContext); }
