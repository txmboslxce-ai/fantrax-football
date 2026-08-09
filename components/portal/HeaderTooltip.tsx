"use client";

import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function HeaderTooltip({ children, description }: { children: ReactNode; description?: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  if (!description) return children;

  function showTooltip() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tooltipWidth = 224;
    const viewportPadding = 12;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, viewportPadding + tooltipWidth / 2),
      window.innerWidth - viewportPadding - tooltipWidth / 2
    );

    setPosition({ left, top: rect.bottom + 8 });
  }

  return (
    <span
      ref={triggerRef}
      className="inline-flex w-full justify-center"
      onMouseEnter={showTooltip}
      onMouseLeave={() => setPosition(null)}
      onFocus={showTooltip}
      onBlur={() => setPosition(null)}
    >
      {children}
      {position
        ? createPortal(
            <span
              role="tooltip"
              style={{ left: position.left, top: position.top }}
              className="pointer-events-none fixed z-[100] w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium normal-case leading-snug tracking-normal text-slate-700 shadow-lg"
            >
              {description}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
