"use client";

import { useEffect, useRef } from "react";

// One shared tooltip: any element with a data-tip attribute shows it on hover.
export default function Tooltip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = ref.current!;
    const move = (e: PointerEvent) => {
      const g = (e.target as Element | null)?.closest?.("[data-tip]");
      if (!g) { tip.hidden = true; return; }
      tip.innerHTML = g.getAttribute("data-tip") || "";
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      let x = e.clientX + 14, y = e.clientY - r.height - 10;
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
      if (y < 8) y = e.clientY + 16;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    };
    const hide = () => { tip.hidden = true; };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", hide);
    window.addEventListener("hashchange", hide);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", hide);
      window.removeEventListener("hashchange", hide);
    };
  }, []);
  return <div className="tip" ref={ref} hidden />;
}
