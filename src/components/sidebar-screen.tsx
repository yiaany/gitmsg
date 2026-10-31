"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

export function SidebarScreen({ screen, title, onBack, children, header, actions }: { screen: string | null; title: string; onBack: () => void; children: ReactNode; header?: ReactNode; actions?: ReactNode }) {
  return <AnimatePresence initial={false}>{screen && <Screen key={screen} screen={screen} title={title} onBack={onBack} header={header} actions={actions}>{children}</Screen>}</AnimatePresence>;
}

function Screen({ screen, title, onBack, children, header, actions }: { screen: string; title: string; onBack: () => void; children: ReactNode; header?: ReactNode; actions?: ReactNode }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { (panel.current?.querySelector<HTMLElement>('input') || panel.current?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }); }, []);
  return <motion.section ref={panel} inert={!present} aria-hidden={!present} className="sidebar-screen" data-screen={screen} initial={{ opacity: 0, x: reduced ? 0 : 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : 24 }} transition={{ duration: reduced ? 0 : .3, ease: [.33, 1, .68, 1] }} aria-label={title}>
    <header className={`sidebar-screen-header ${header ? "with-search" : ""}`}><Button variant="ghost" size="icon-lg" className="round-button" aria-label="Back to chats" onClick={onBack}><ArrowLeft /></Button>{header || <h2>{title}</h2>}{actions}</header>
    <div className="sidebar-screen-content">{children}</div>
  </motion.section>;
}
