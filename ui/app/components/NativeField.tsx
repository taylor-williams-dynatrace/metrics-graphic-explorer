import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";

/**
 * Lightweight, theme-aware wrappers around native <select> / <input> elements.
 * Used for compact inline form controls inside the metric explorer where the
 * full Strato form controls would be heavier than needed.
 */

const baseFieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  fontSize: 13,
  // Inherit the Strato app font (DynatraceFlow) instead of the
  // browser's default form-control font.
  fontFamily: "inherit",
  fontWeight: 500,
  borderRadius: 4,
  border: `1px solid ${Colors.Border.Neutral.Default}`,
  background: Colors.Background.Surface.Default,
  color: Colors.Text.Neutral.Default,
};

type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const NativeSelect: React.FC<NativeSelectProps> = ({
  style,
  ...rest
}) => <select style={{ ...baseFieldStyle, ...style }} {...rest} />;

type NativeInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const NativeInput: React.FC<NativeInputProps> = ({ style, ...rest }) => (
  <input style={{ ...baseFieldStyle, ...style }} {...rest} />
);
