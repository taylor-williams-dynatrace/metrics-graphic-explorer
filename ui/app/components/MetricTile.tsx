import React, { useRef } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
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
import { TileShapeLayer, TileOutlineLayer } from "./TileShapeLayer";
import { isOutlineTileShape } from "../types/metricsView";
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
}

export const MetricTile: React.FC<MetricTileProps> = ({
  tile,
  editable,
  refreshIntervalMs,
  bounds,
  scale,
  onChange,
  onRemove,
  onEdit,
  onDuplicate,
}) => {
  const isDql = (tile.source ?? "metric") === "dql";
  const query = isDql ? tile.dql ?? "" : tileValueQuery(tile);
  const hasSource = isDql ? Boolean(tile.dql) : Boolean(tile.metricKey);

  // In shape-only mode with no thresholds, the value isn't needed at all, so
  // skip the query entirely; otherwise we still need it to drive the color.
  const needsValue =
    !tile.shapeOnly || (tile.thresholds?.length ?? 0) > 0;

  const { data, error, isLoading } = useDql(
    { query },
    {
      refetchInterval: refreshIntervalMs,
      enabled: hasSource && needsValue && query.length > 0,
    },
  );

  // Metric tiles read the aliased `val`; DQL tiles read the single cell (which
  // may be numeric or text). Thresholds only apply to numeric values.
  let numericValue: number | null;
  let displayValue: string;
  if (isDql) {
    const cell = readDqlCell(data?.records);
    numericValue = typeof cell.value === "number" ? cell.value : null;
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
  const valueTextColor = thresholdColor
    ? contrastTextColor(thresholdColor)
    : undefined;

  const shape = tile.shape ?? "rectangle";
  const outlineShape = isOutlineTileShape(shape);

  // Outline (icon) shapes have a mostly-transparent interior, so text uses the
  // neutral color with a surface-colored halo (readable in light and dark, and
  // over busy backgrounds) rather than the solid-fill contrast color.
  const contentTextColor = outlineShape
    ? Colors.Text.Neutral.Default
    : valueTextColor;
  const contentTextShadow = outlineShape
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
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: tile.x,
      originY: tile.y,
    };
  }

  function onDragPointerMove(e: React.PointerEvent) {
    const s = dragState.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const dx = (e.clientX - s.startX) / scale;
    const dy = (e.clientY - s.startY) / scale;
    onChange({
      ...tile,
      x: clamp(s.originX + dx, 0, Math.max(0, bounds.width - tile.width)),
      y: clamp(s.originY + dy, 0, Math.max(0, bounds.height - tile.height)),
    });
  }

  function endDrag(e: React.PointerEvent) {
    if (dragState.current?.pointerId === e.pointerId) dragState.current = null;
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
    const width = clamp(
      s.originWidth + (e.clientX - s.startX) / scale,
      MIN_TILE_SIZE,
      MAX_TILE_SIZE,
    );
    const height = clamp(
      s.originHeight + (e.clientY - s.startY) / scale,
      MIN_TILE_SIZE,
      MAX_TILE_SIZE,
    );
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
      style={{
        position: "absolute",
        left: tile.x,
        top: tile.y,
        width: tile.width,
        height: tile.height,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        touchAction: "none",
        cursor: clickable ? "pointer" : undefined,
      }}
    >
      {outlineShape ? (
        <TileOutlineLayer
          shape={shape}
          color={thresholdColor ?? Colors.Text.Neutral.Default}
          tint={thresholdColor ? `${thresholdColor}2b` : "transparent"}
        />
      ) : (
        <TileShapeLayer
          shape={shape}
          fill={thresholdColor ?? Colors.Background.Surface.Default}
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
      {editable && (
        <Flex
          justifyContent="space-between"
          alignItems="center"
          style={{
            position: "relative",
            zIndex: 1,
            cursor: "grab",
            padding: "2px 4px",
            borderRadius: 4,
            background: Colors.Background.Container.Neutral.Default,
          }}
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
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

      {!tile.shapeOnly && (
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
      )}

      {editable && (
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
