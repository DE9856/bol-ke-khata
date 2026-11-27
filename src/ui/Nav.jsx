import React from "react";
import { motion } from "framer-motion";
import { House, NotebookPen, ReceiptText, Package } from "lucide-react";
import { SPRING } from "./kit.jsx";

const LEFT = [{ id: "home", label: "Home", Icon: House }, { id: "udhaar", label: "Udhaar", Icon: NotebookPen }];
const RIGHT = [{ id: "hisaab", label: "Hisaab", Icon: ReceiptText }, { id: "stock", label: "Stock", Icon: Package }];

// Floating bottom bar: four places, with the mic sitting in the middle gap (rendered by App).
export function Nav({ screen, onNav, badges = {} }) {
  const Item = ({ id, label, Icon }) => {
    const active = screen === id;
    return (
      <button onClick={() => onNav(id)} aria-current={active ? "page" : undefined} aria-label={label}
        className={`relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${active ? "text-forest-700" : "text-ink-400"}`}>
        <span className="relative flex h-8 w-12 items-center justify-center">
          {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-sage-100" transition={SPRING} />}
          <Icon size={21} strokeWidth={active ? 2.4 : 2} className="relative" />
          {badges[id] ? <span className="absolute right-1.5 top-0.5 h-2 w-2 rounded-full bg-clay-500 ring-2 ring-paper-50" /> : null}
        </span>
        {label}
      </button>
    );
  };
  return (
    <nav className="relative z-20 mx-2 flex h-[66px] items-stretch rounded-[24px] bg-paper-50/95 shadow-[0_8px_28px_-12px_rgba(18,51,38,0.35)] ring-1 ring-paper-300/70 backdrop-blur">
      {LEFT.map((it) => <Item key={it.id} {...it} />)}
      <div className="w-[88px] shrink-0" aria-hidden />
      {RIGHT.map((it) => <Item key={it.id} {...it} />)}
    </nav>
  );
}
