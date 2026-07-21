import React, { useEffect, useRef } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle, Markdown } from "@dynatrace/strato-components/content";
import {
  DeleteIcon,
  EditIcon,
  DragAllDirectionIcon,
  DuplicateIcon,
  LinkIcon,
} from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type {
  MetricTile as MetricTileModel,
  TileLink,
} from "../types/metricsView";
import {
  TileShapeLayer,
  TileOutlineLayer,
  TileLineLayer,
} from "./TileShapeLayer";
import { isLineTileShape, isOutlineTileShape } from "../types/metricsView";
import {
  contrastTextColor,
  evaluateThresholdColor,
  extractScalar,
  formatValue,
  readDqlCell,
  tileValueQuery,
} from "../services/metricsQuery";

const MIN_TILE_SIZE = 60;
const MAX_TILE_SIZE = 1200;

interface MetricTileProps {
  tile: MetricTileModel;
  /** Editing enabled (drag / resize / remove / reconfigure). */
  editable: boolean;
  /** Whether this tile is part of the current selection. */
  selected?: boolean;
  /** Auto-refresh interval in ms for the value query. */
  refreshIntervalMs: number;
  /** Pixel bounds of the canvas, used to clamp dragging. */
  bounds: { width: number; height: number };
  /** Current canvas zoom factor, used to map pointer deltas to canvas space. */
  scale: number;
  onChange: (tile: MetricTileModel) => void;
  onRemove: (id: string) => void;
  onEdit: (tile: MetricTileModel) => void;
  onDuplicate: (tile: MetricTileModel) => void;
  /** Snap a proposed position against other tiles; also drives alignment guides. */
  onSnap?: (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => { x: number; y: number };
  /** Called when a drag/resize gesture ends, to clear alignment guides. */
  onGestureEnd?: () => void;
  /**
   * Called on drag-handle pointer down for selection. Returns true if the
   * canvas took over the gesture (group move or a selection toggle), meaning
   * the tile should not start its own single-tile drag.
   */
  onHeaderPointerDown?: (
    id: string,
    additive: boolean,
    clientX: number,
    clientY: number,
  ) => boolean;
  /** Reports whether this tile's value query is currently running. */
  onLoadingChange?: (id: string, loading: boolean) => void;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  tile,
  editable,
  selected,
  refreshIntervalMs,
  bounds,
  scale,
  onChange,
  onRemove,
  onEdit,
  onDuplicate,
  onSnap,
  onGestureEnd,
  onHeaderPointerDown,
  onLoadingChange,
}) => {
  const source = tile.source ?? "metric";
  const isDql = source === "dql";
  const isMarkdown = source === "markdown";
  const isShape = source === "shape";
  // Non-data tiles (markdown text, static shapes) never run a query.
  const isStatic = isMarkdown || isShape;
  const transparent = tile.transparent ?? false;
  // Shape-only makes no sense with no shape, so transparent overrides it.
  const shapeOnly = (tile.shapeOnly ?? false) && !transparent;
  const query = isStatic ? "" : isDql ? tile.dql ?? "" : tileValueQuery(tile);
  const hasSource = isDql ? Boolean(tile.dql) : Boolean(tile.metricKey);

  // In shape-only mode with no thresholds, the value isn't needed at all, so
  // skip the query entirely; otherwise we still need it to drive the color.
  const needsValue = !shapeOnly || (tile.thresholds?.length ?? 0) > 0;

  const { data, error, isLoading, isFetching } = useDql(
    { query },
    {
      refetchInterval: refreshIntervalMs,
      enabled: !isStatic && hasSource && needsValue && query.length > 0,
    },
  );

  // Report query activity to the canvas. Use `isFetching` (not `isLoading`) so
  // the indicator also reflects the periodic background refreshes — `isLoading`
  // is only true on the very first load before any data exists.
  useEffect(() => {
    onLoadingChange?.(tile.id, isFetching);
    return () => onLoadingChange?.(tile.id, false);
  }, [isFetching, tile.id, onLoadingChange]);

  // Metric tiles read the aliased `val`; DQL tiles read the single cell (which
  // may be numeric or text). Thresholds only apply to numeric values.
  let numericValue: number | null;
  let displayValue: string;
  if (isDql) {
    const cell = readDqlCell(data?.records);
    // A DQL value can come back as a numeric string (e.g. "0"); coerce it so
    // color thresholds still apply. Non-numeric text stays null (no thresholds).
    if (typeof cell.value === "number") {
      numericValue = cell.value;
    } else if (
      typeof cell.value === "string" &&
      cell.value.trim() !== "" &&
      Number.isFinite(Number(cell.value))
    ) {
      numericValue = Number(cell.value);
    } else {
      numericValue = null;
    }
    displayValue =
      cell.value == null
        ? "–"
        : typeof cell.value === "number"
          ? formatValue(cell.value, tile.unit)
          : tile.unit
            ? `${cell.value} ${tile.unit}`
            : String(cell.value);
  } else {
    numericValue = extractScalar(data?.records);
    displayValue = formatValue(numericValue, tile.unit);
  }

  const thresholdColor = evaluateThresholdColor(numericValue, tile.thresholds);
  // A matching threshold overrides the tile's resting fill (static color, or the
  // default surface). `effectiveFill` is the explicit hex fill, if any.
  const staticBg = tile.backgroundColor;
  const effectiveFill = thresholdColor ?? staticBg ?? null;
  const valueTextColor = effectiveFill
    ? contrastTextColor(effectiveFill)
    : undefined;

  const shape = tile.shape ?? "rectangle";
  const lineShape = isLineTileShape(shape);
  const outlineShape = !lineShape && isOutlineTileShape(shape);
  // Legacy "arrow" shapes default to an end arrowhead when no explicit setting.
  const lineArrows =
    tile.lineArrows ?? (shape === "arrow" ? "end" : "none");
  // Outline icons and transparent tiles have no solid backdrop behind the text.
  const noFill = transparent || outlineShape;

  // With no solid fill, text uses a readable color + surface-colored halo
  // (works in light/dark and over busy backgrounds). Transparent tiles color
  // the text by the threshold so status still reads; solid tiles fill instead.
  const contentTextColor = transparent
    ? thresholdColor ?? Colors.Text.Neutral.Default
    : outlineShape
      ? Colors.Text.Neutral.Default
      : valueTextColor;
  const contentTextShadow = noFill
    ? `0 0 3px ${Colors.Background.Surface.Default}, 0 0 2px ${Colors.Background.Surface.Default}`
    : undefined;

  const link = tile.link;
  // In view mode a linked tile is clickable; in edit mode we only show the badge.
  const clickable = !editable && Boolean(link);

  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const resizeState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);

  function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  function onDragPointerDown(e: React.PointerEvent) {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    // Let the canvas update selection and possibly take over (group move).
    const takeover =
      onHeaderPointerDown?.(tile.id, additive, e.clientX, e.clientY) ?? false;
    if (takeover) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: tile.x,
      originY: tile.y,
    };
  }

  // Keep the tile's rotated bounding box within the canvas. Reduces to the
  // plain box when rotation is 0, but lets rotated tiles reach the edges.
  function clampPosition(px: number, py: number): { x: number; y: number } {
    const rot = ((tile.rotation ?? 0) * Math.PI) / 180;
    const w = tile.width;
    const h = tile.height;
    const halfW =
      (Math.abs(Math.cos(rot)) * w) / 2 + (Math.abs(Math.sin(rot)) * h) / 2;
    const halfH =
      (Math.abs(Math.sin(rot)) * w) / 2 + (Math.abs(Math.cos(rot)) * h) / 2;
    let cx = px + w / 2;
    let cy = py + h / 2;
    cx = Math.min(Math.max(cx, halfW), Math.max(halfW, bounds.width - halfW));
    cy = Math.min(Math.max(cy, halfH), Math.max(halfH, bounds.height - halfH));
    return { x: cx - w / 2, y: cy - h / 2 };
  }

  function onDragPointerMove(e: React.PointerEvent) {
    const s = dragState.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const dx = (e.clientX - s.startX) / scale;
    const dy = (e.clientY - s.startY) / scale;
    let { x: nx, y: ny } = clampPosition(s.originX + dx, s.originY + dy);
    if (onSnap) {
      const snapped = onSnap(tile.id, nx, ny, tile.width, tile.height);
      ({ x: nx, y: ny } = clampPosition(snapped.x, snapped.y));
    }
    onChange({ ...tile, x: nx, y: ny });
  }

  function endDrag(e: React.PointerEvent) {
    if (dragState.current?.pointerId === e.pointerId) {
      dragState.current = null;
      onGestureEnd?.();
    }
  }

  function onResizePointerDown(e: React.PointerEvent) {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originWidth: tile.width,
      originHeight: tile.height,
    };
  }

  function onResizePointerMove(e: React.PointerEvent) {
    const s = resizeState.current;
    if (!s || s.pointerId !== e.pointerId) return;
    let dx = (e.clientX - s.startX) / scale;
    let dy = (e.clientY - s.startY) / scale;
    // The tile may be rotated, so map the screen-space drag back into the
    // tile's local axes before applying it to width/height.
    const rot = ((tile.rotation ?? 0) * Math.PI) / 180;
    if (rot) {
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      dx = localX;
      dy = localY;
    }
    // Allow shapes to span up to the full canvas (never below the fixed floor).
    const maxDim = Math.max(bounds.width, bounds.height, MAX_TILE_SIZE);
    const width = clamp(s.originWidth + dx, MIN_TILE_SIZE, maxDim);
    const height = clamp(s.originHeight + dy, MIN_TILE_SIZE, maxDim);
    onChange({ ...tile, width, height });
  }

  function endResize(e: React.PointerEvent) {
    if (resizeState.current?.pointerId === e.pointerId)
      resizeState.current = null;
  }

  // Only show a label the user explicitly entered — never the metric key or a
  // placeholder fallback.
  const label = tile.label?.trim() ?? "";

  return (
    <div
      onClick={clickable && link ? () => openTileLink(link) : undefined}
      title={clickable ? "Open link in a new tab" : undefined}
      onPointerDown={editable ? onDragPointerDown : undefined}
      onPointerMove={editable ? onDragPointerMove : undefined}
      onPointerUp={editable ? endDrag : undefined}
      onPointerCancel={editable ? endDrag : undefined}
      style={{
        position: "absolute",
        left: tile.x,
        top: tile.y,
        width: tile.width,
        height: tile.height,
        transform: tile.rotation ? `rotate(${tile.rotation}deg)` : undefined,
        transformOrigin: "center center",
        outline: selected
          ? `2px solid ${Colors.Border.Primary.Default}`
          : undefined,
        outlineOffset: 2,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        touchAction: "none",
        cursor: clickable ? "pointer" : editable ? "grab" : undefined,
      }}
    >
      {transparent ? null : lineShape ? (
        <TileLineLayer
          width={tile.width}
          height={tile.height}
          color={effectiveFill ?? Colors.Text.Neutral.Default}
          weight={tile.lineWeight ?? 4}
          dashed={tile.lineDashed ?? false}
          arrowStart={lineArrows === "start" || lineArrows === "both"}
          arrowEnd={lineArrows === "end" || lineArrows === "both"}
        />
      ) : outlineShape ? (
        <TileOutlineLayer
          shape={shape}
          color={effectiveFill ?? Colors.Text.Neutral.Default}
          tint={effectiveFill ? `${effectiveFill}2b` : "transparent"}
        />
      ) : (
        <TileShapeLayer
          shape={shape}
          fill={effectiveFill ?? Colors.Background.Surface.Default}
          stroke={
            editable
              ? Colors.Border.Primary.Default
              : Colors.Border.Neutral.Default
          }
        />
      )}
      {link && !editable && (
        <div
          aria-label="Has drill-down link"
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: valueTextColor ?? Colors.Text.Primary.Default,
            pointerEvents: "none",
            opacity: 0.85,
          }}
        >
          <LinkIcon />
        </div>
      )}
      {editable && selected && (
        <Flex
          justifyContent="space-between"
          alignItems="center"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 3,
            cursor: "default",
            padding: "2px 4px",
            borderRadius: 4,
            background: Colors.Background.Container.Neutral.Default,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Flex gap={2} alignItems="center">
            <DragAllDirectionIcon />
            {link && <LinkIcon />}
          </Flex>
          <Flex gap={0}>
            <Button
              variant="default"
              onClick={() => onEdit(tile)}
              aria-label="Edit tile"
              style={{ minWidth: "auto", padding: 2 }}
            >
              <Button.Prefix>
                <EditIcon />
              </Button.Prefix>
            </Button>
            <Button
              variant="default"
              onClick={() => onDuplicate(tile)}
              aria-label="Duplicate tile"
              style={{ minWidth: "auto", padding: 2 }}
            >
              <Button.Prefix>
                <DuplicateIcon />
              </Button.Prefix>
            </Button>
            <Button
              variant="default"
              onClick={() => onRemove(tile.id)}
              aria-label="Remove tile"
              style={{ minWidth: "auto", padding: 2 }}
            >
              <Button.Prefix>
                <DeleteIcon />
              </Button.Prefix>
            </Button>
          </Flex>
        </Flex>
      )}

      {isMarkdown ? (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flexGrow: 1,
            minHeight: 0,
            width: "100%",
            boxSizing: "border-box",
            padding: 8,
            // Clear the floating edit toolbar so text isn't hidden beneath it.
            paddingTop: editable && selected ? 34 : 8,
            overflow: "auto",
          }}
        >
          <Markdown>{tile.markdown ?? ""}</Markdown>
        </div>
      ) : !shapeOnly && !isShape ? (
      <Flex
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        flexGrow={1}
        gap={2}
        style={{ position: "relative", zIndex: 1, padding: 6, minHeight: 0 }}
      >
        {isLoading && numericValue == null ? (
          <ProgressCircle size="small" aria-label="Loading value" />
        ) : error ? (
          <Text
            style={{
              color: Colors.Text.Critical.Default,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Query error
          </Text>
        ) : (
          <Text
            style={{
              fontSize: tileFontSize(tile.width, tile.height),
              fontWeight: 600,
              textAlign: "center",
              color: contentTextColor,
              textShadow: contentTextShadow,
            }}
          >
            {displayValue}
          </Text>
        )}
        {label && (
          <Text
            style={{
              textAlign: "center",
              fontSize: 11,
              color: contentTextColor ?? Colors.Text.Neutral.Default,
              textShadow: contentTextShadow,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              wordBreak: "break-word",
            }}
          >
            {label}
          </Text>
        )}
      </Flex>
      ) : null}

      {editable && selected && (
        <div
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          aria-label="Resize tile"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            zIndex: 2,
            width: 16,
            height: 16,
            cursor: "nwse-resize",
            background: `linear-gradient(135deg, transparent 50%, ${Colors.Border.Primary.Default} 50%)`,
          }}
        />
      )}
    </div>
  );
};

function tileFontSize(width: number, height: number): number {
  return Math.max(14, Math.min(34, Math.round(Math.min(width, height) / 5)));
}

/** Open a tile's drill-down link in a new browser tab. */
function openTileLink(link: TileLink): void {
  const href =
    link.type === "url" ? normalizeUrl(link.target) : buildViewHref(link.target);
  window.open(href, "_blank", "noopener,noreferrer");
}

/** Ensure a user-entered URL has a scheme so it isn't treated as relative. */
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Build an absolute URL to another canvas within this app, so it can open in a
 * new tab. Derives the app base from the current location's `/ui` segment and
 * preserves any platform query parameters.
 */
function buildViewHref(viewId: string): string {
  const url = new URL(window.location.href);
  const route = `/view/${encodeURIComponent(viewId)}`;
  if (/\/ui(\/|$)/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/(\/ui)(\/.*)?$/, `$1${route}`);
  } else {
    url.pathname = `${url.pathname.replace(/\/$/, "")}${route}`;
  }
  return url.toString();
}
