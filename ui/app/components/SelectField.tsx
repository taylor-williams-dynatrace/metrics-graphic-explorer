import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownSmallIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";

/**
 * A lightweight, theme-aware single-select dropdown.
 *
 * Unlike a native <select>, the open option list is rendered by React (in a
 * portal), so it uses the Strato app font throughout — the native option list
 * is drawn by the OS and can't be font-matched, especially on macOS. The menu
 * is portaled to <body> and positioned with fixed coordinates so it is never
 * clipped by scrollable containers (e.g. the metrics explorer or a modal).
 */

// Matches the Strato design-system font so the menu matches section headings,
// even though the portal renders outside the app's styled subtree.
const FONT_FAMILY = "DynatraceFlow, Roboto, Helvetica, sans-serif";

export interface SelectFieldOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  function reposition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !menuRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Close on scroll/resize rather than chase a moving trigger.
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "6px 8px",
          fontSize: 13,
          fontFamily: FONT_FAMILY,
          fontWeight: 500,
          textAlign: "left",
          borderRadius: 4,
          border: `1px solid ${Colors.Border.Neutral.Default}`,
          background: Colors.Background.Surface.Default,
          color: Colors.Text.Neutral.Default,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selected
              ? Colors.Text.Neutral.Default
              : Colors.Text.Neutral.Subdued,
          }}
        >
          {selected ? selected.label : placeholder ?? "Select…"}
        </span>
        <ChevronDownSmallIcon />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              maxHeight: 260,
              overflowY: "auto",
              zIndex: 4000,
              padding: 4,
              borderRadius: 6,
              fontFamily: FONT_FAMILY,
              background: Colors.Background.Surface.Default,
              border: `1px solid ${Colors.Border.Neutral.Default}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
            }}
          >
            {options.map((o) => {
              const isSel = o.value === value;
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={isSel}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={{
                    padding: "6px 8px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 4,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: Colors.Text.Neutral.Default,
                    background: isSel
                      ? Colors.Background.Container.Neutral.Emphasized
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSel)
                      e.currentTarget.style.background =
                        Colors.Background.Container.Neutral.Default;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSel)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  {o.label}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
};
