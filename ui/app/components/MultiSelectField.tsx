import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownSmallIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { SelectFieldOption } from "./SelectField";

/**
 * A lightweight, theme-aware multi-select dropdown, matching {@link SelectField}
 * but allowing several values. The menu stays open while toggling options and
 * is portaled to <body> so it isn't clipped by scrollable containers.
 */

const FONT_FAMILY = "DynatraceFlow, Roboto, Helvetica, sans-serif";

interface MultiSelectFieldProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  ariaLabel?: string;
}

export const MultiSelectField: React.FC<MultiSelectFieldProps> = ({
  values,
  onChange,
  options,
  placeholder,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedLabels = options
    .filter((o) => values.includes(o.value))
    .map((o) => o.label);

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
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
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

  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
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
          cursor: "pointer",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selectedLabels.length
              ? Colors.Text.Neutral.Default
              : Colors.Text.Neutral.Subdued,
          }}
        >
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder ?? "Select…"}
        </span>
        <ChevronDownSmallIcon />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-multiselectable="true"
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
              const checked = values.includes(o.value);
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(o.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 4,
                    cursor: "pointer",
                    color: Colors.Text.Neutral.Default,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      Colors.Background.Container.Neutral.Default;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 15,
                      height: 15,
                      flexShrink: 0,
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      lineHeight: 1,
                      color: "#fff",
                      border: `1px solid ${
                        checked
                          ? Colors.Border.Primary.Default
                          : Colors.Border.Neutral.Default
                      }`,
                      background: checked
                        ? Colors.Background.Container.Primary.Accent
                        : Colors.Background.Surface.Default,
                    }}
                  >
                    {checked ? "✓" : ""}
                  </span>
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
