import React, { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";

interface ConfigSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * A boxed, collapsible configuration group — a rounded surface with a header
 * (chevron + title) that toggles its content. Used to organize the tile
 * config form into clear categories, matching the Strato settings pattern.
 */
export const ConfigSection: React.FC<ConfigSectionProps> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        border: `1px solid ${Colors.Border.Neutral.Default}`,
        borderRadius: 8,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 12px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          color: Colors.Text.Neutral.Default,
        }}
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </button>
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "4px 12px 12px 12px",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};
