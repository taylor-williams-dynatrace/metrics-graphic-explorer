import React from "react";
import type { TileShape } from "../types/metricsView";

interface IconPaint {
  stroke: string;
  /** Group fill applied to closed outline shapes (a subtle tint or "none"). */
  fill: string;
  /** Fill for solid dots (LEDs, home button, window dots). */
  dotColor: string;
}

/**
 * Shared geometry for the "icon" shapes (server, database, user, globe, …),
 * drawn as outlines. Both the picker glyph and the canvas outline layer render
 * from this single definition so they always match. Pure-line elements set
 * `fill="none"` explicitly so a translucent group fill doesn't bleed into them.
 */
function renderIconShape(shape: TileShape, paint: IconPaint): React.ReactNode {
  const { stroke, fill, dotColor } = paint;
  const gp = (sw: number) => ({
    stroke,
    fill,
    strokeWidth: sw,
    strokeLinejoin: "round" as const,
  });
  const dot = { fill: dotColor, stroke: "none" };

  switch (shape) {
    case "server":
      return (
        <g {...gp(7)}>
          <rect x={18} y={10} width={64} height={80} rx={7} />
          <line x1={18} y1={37} x2={82} y2={37} />
          <line x1={18} y1={63} x2={82} y2={63} />
          <circle cx={30} cy={23.5} r={3.5} {...dot} />
          <circle cx={30} cy={50} r={3.5} {...dot} />
          <circle cx={30} cy={76.5} r={3.5} {...dot} />
        </g>
      );
    case "application":
      return (
        <g {...gp(7)}>
          <rect x={12} y={18} width={76} height={64} rx={7} />
          <line x1={12} y1={38} x2={88} y2={38} />
          <circle cx={22} cy={28} r={3} {...dot} />
          <circle cx={33} cy={28} r={3} {...dot} />
          <circle cx={44} cy={28} r={3} {...dot} />
        </g>
      );
    case "database":
      return (
        <g {...gp(7)}>
          <path d="M18,26 v48 a32,12 0 0 0 64,0 v-48" />
          <ellipse cx={50} cy={26} rx={32} ry={12} />
          <path d="M18,50 a32,12 0 0 0 64,0" fill="none" />
        </g>
      );
    case "user":
      return (
        <g {...gp(7)}>
          <circle cx={50} cy={30} r={16} />
          <path d="M20,86 C20,62 34,54 50,54 C66,54 80,62 80,86" fill="none" />
        </g>
      );
    case "users":
      return (
        <g {...gp(6)}>
          <circle cx={68} cy={34} r={12} />
          <path d="M46,82 C46,64 56,58 68,58 C82,58 90,66 90,82" fill="none" />
          <circle cx={36} cy={38} r={15} />
          <path d="M12,88 C12,67 24,60 36,60 C49,60 60,67 60,88" fill="none" />
        </g>
      );
    case "globe":
      return (
        <g {...gp(6)}>
          <circle cx={50} cy={50} r={40} />
          <ellipse cx={50} cy={50} rx={16} ry={40} fill="none" />
          <line x1={12} y1={50} x2={88} y2={50} />
          <path d="M18,28 a44,20 0 0 0 64,0" fill="none" />
          <path d="M18,72 a44,20 0 0 1 64,0" fill="none" />
        </g>
      );
    case "laptop":
      return (
        <g {...gp(6)}>
          <rect x={20} y={20} width={60} height={44} rx={4} />
          <path d="M8,80 H92 L98,88 H2 Z" />
        </g>
      );
    case "mobile":
      return (
        <g {...gp(6)}>
          <rect x={32} y={8} width={36} height={84} rx={8} />
          <line x1={44} y1={18} x2={56} y2={18} />
          <circle cx={50} cy={83} r={3} {...dot} />
        </g>
      );
    case "document":
      return (
        <g {...gp(6)}>
          <path d="M24,8 H60 L80,28 V92 H24 Z" />
          <path d="M60,8 V28 H80" fill="none" />
          <line x1={36} y1={52} x2={68} y2={52} />
          <line x1={36} y1={66} x2={68} y2={66} />
        </g>
      );
    case "shield":
      return (
        <g {...gp(7)}>
          <path d="M50,8 L84,22 V50 C84,72 68,86 50,92 C32,86 16,72 16,50 V22 Z" />
        </g>
      );
    default:
      return null;
  }
}

/**
 * A small glyph of a shape for the shape picker. Geometric shapes are solid
 * `currentColor`; icon shapes are clean outlines (via {@link renderIconShape}).
 */
export const ShapeGlyph: React.FC<{ shape: TileShape; size?: number }> = ({
  shape,
  size = 22,
}) => (
  <svg
    viewBox="0 0 100 100"
    width={size}
    height={size}
    aria-hidden="true"
    fill="currentColor"
  >
    {shape === "rectangle" && <rect x={8} y={24} width={84} height={52} rx={4} />}
    {shape === "rounded" && <rect x={8} y={24} width={84} height={52} rx={16} />}
    {shape === "circle" && <circle cx={50} cy={50} r={42} />}
    {shape === "triangle" && <polygon points="50,10 90,88 10,88" />}
    {shape === "diamond" && <polygon points="50,6 94,50 50,94 6,50" />}
    {shape === "cloud" && (
      <g>
        <ellipse cx={32} cy={62} rx={22} ry={18} />
        <ellipse cx={50} cy={48} rx={26} ry={22} />
        <ellipse cx={70} cy={60} rx={22} ry={20} />
        <rect x={22} y={56} width={58} height={24} rx={12} />
      </g>
    )}
    {renderIconShape(shape, {
      stroke: "currentColor",
      fill: "none",
      dotColor: "currentColor",
    })}
  </svg>
);

interface TileShapeLayerProps {
  shape: TileShape;
  /** Fill color of the shape (threshold color or a neutral surface). */
  fill: string;
  /** Stroke/outline color. */
  stroke: string;
}

/**
 * Solid-fill shape layer for the basic geometric shapes (rectangle, rounded,
 * circle, triangle, diamond, cloud). Rendered behind the tile content and
 * stretched to fill the tile via `preserveAspectRatio="none"`.
 */
export const TileShapeLayer: React.FC<TileShapeLayerProps> = ({
  shape,
  fill,
  stroke,
}) => {
  const common = {
    fill,
    stroke,
    strokeWidth: 1,
    vectorEffect: "non-scaling-stroke" as const,
  };

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.22))",
      }}
    >
      {shape === "rectangle" && (
        <rect x={1} y={1} width={98} height={98} rx={4} {...common} />
      )}
      {shape === "rounded" && (
        <rect x={1} y={1} width={98} height={98} rx={16} {...common} />
      )}
      {shape === "circle" && (
        <ellipse cx={50} cy={50} rx={49} ry={49} {...common} />
      )}
      {shape === "triangle" && (
        <polygon points="50,3 97,97 3,97" {...common} />
      )}
      {shape === "diamond" && (
        <polygon points="50,2 98,50 50,98 2,50" {...common} />
      )}
      {shape === "cloud" && (
        <g fill={fill} stroke="none">
          <ellipse cx={30} cy={64} rx={24} ry={20} />
          <ellipse cx={50} cy={48} rx={28} ry={24} />
          <ellipse cx={72} cy={62} rx={24} ry={22} />
          <rect x={18} y={58} width={66} height={26} rx={13} />
        </g>
      )}
    </svg>
  );
};

interface TileOutlineLayerProps {
  shape: TileShape;
  /** Outline (and dot) color — the threshold color, or a neutral default. */
  color: string;
  /** Subtle translucent interior fill (or "none"). */
  tint: string;
}

/**
 * Outline shape layer for the icon shapes: reuses the exact picker-glyph
 * geometry, colors the outline with the threshold color, and applies a subtle
 * translucent fill. Uses a "meet" aspect ratio so the icon stays crisp and
 * undistorted (like the picker), centered rather than stretched.
 */
export const TileOutlineLayer: React.FC<TileOutlineLayerProps> = ({
  shape,
  color,
  tint,
}) => (
  <svg
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid meet"
    width="100%"
    height="100%"
    aria-hidden="true"
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.18))",
    }}
  >
    {renderIconShape(shape, { stroke: color, fill: tint, dotColor: color })}
  </svg>
);
