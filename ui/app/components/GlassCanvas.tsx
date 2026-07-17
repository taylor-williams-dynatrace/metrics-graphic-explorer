import React, { useCallback, useEffect, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Tooltip } from "@dynatrace/strato-components-preview/overlays";
import {
  DeleteIcon,
  ImageIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ZoomToFitIcon,
} from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import {
  generateId,
  type MetricTile as MetricTileModel,
} from "../types/metricsView";
import { MetricTile } from "./MetricTile";

interface GlassCanvasProps {
  tiles: MetricTileModel[];
  backgroundUrl: string | null;
  backgroundWidth?: number;
  backgroundHeight?: number;
  editable: boolean;
  refreshIntervalMs: number;
  onTilesChange: (tiles: MetricTileModel[]) => void;
  onEditTile: (tile: MetricTileModel) => void;
  /** Bump this to trigger a fit-to-screen (e.g. entering/leaving presentation). */
  fitToken?: number;
  /** Reports whether any tile query is currently running. */
  onActivityChange?: (active: boolean) => void;
  /** Reports the natural background size once the image has loaded. */
  onBackgroundSize?: (size: { width: number; height: number }) => void;
  /** Fired when the <img> element fails to decode/render the fetched source. */
  onBackgroundError?: () => void;
}

const FALLBACK = { width: 1000, height: 600 };
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;
const SNAP_T = 6;
const SPACING_COLOR = "#e6338e";

const clampScale = (s: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));

/** A tile projected onto one axis: `start`/`size` along it, `cStart`/`cSize` across it. */
interface AxisBox {
  start: number;
  size: number;
  cStart: number;
  cSize: number;
}

/** A spacing indicator segment (in canvas coordinates). */
interface SpacingSeg {
  axis: "x" | "y";
  from: number;
  to: number;
  cross: number;
  label: string;
}

interface AxisSnap {
  snapped: number;
  /** Alignment guide line coordinate along this axis (or null). */
  line: number | null;
  /** Equal-gap spacing segments (in axis/cross space). */
  segs: { from: number; to: number; cross: number; label: string }[];
}

const overlaps = (aS: number, aSz: number, bS: number, bSz: number) =>
  aS < bS + bSz && bS < aS + aSz;

const crossMid = (aS: number, aSz: number, bS: number, bSz: number) =>
  (Math.max(aS, bS) + Math.min(aS + aSz, bS + bSz)) / 2;

/**
 * Snap a dragged box along one axis to (a) other boxes' edges/centers
 * (alignment) and (b) gaps equal to an existing gap between two other boxes
 * that share the cross-axis (equal spacing). Returns the snapped coordinate
 * plus guide/spacing info for the nearest match within SNAP_T.
 */
function snapAxis(
  main: number,
  size: number,
  cStart: number,
  cSize: number,
  others: AxisBox[],
): AxisSnap {
  let best = SNAP_T + 1;
  let snapped = main;
  let line: number | null = null;
  let segs: AxisSnap["segs"] = [];

  // Alignment: left/center/right of the dragged box to any box edge/center.
  for (const o of others) {
    for (const target of [o.start, o.start + o.size / 2, o.start + o.size]) {
      for (const anchor of [main, main + size / 2, main + size]) {
        const d = Math.abs(anchor - target);
        if (d <= SNAP_T && d < best) {
          best = d;
          snapped = main + (target - anchor);
          line = target;
          segs = [];
        }
      }
    }
  }

  // Equal spacing: collect gaps between cross-overlapping pairs, then try to
  // place the dragged box that same gap away from a cross-overlapping neighbor.
  const gaps: { g: number; a: AxisBox; b: AxisBox }[] = [];
  for (const a of others) {
    for (const b of others) {
      if (a === b) continue;
      if (
        a.start + a.size <= b.start &&
        overlaps(a.cStart, a.cSize, b.cStart, b.cSize)
      ) {
        const g = b.start - (a.start + a.size);
        if (g > 0) gaps.push({ g, a, b });
      }
    }
  }
  for (const n of others) {
    if (!overlaps(cStart, cSize, n.cStart, n.cSize)) continue;
    for (const { g, a, b } of gaps) {
      const rightStart = n.start + n.size + g;
      const leftStart = n.start - g - size;
      for (const cand of [rightStart, leftStart]) {
        const d = Math.abs(main - cand);
        if (d <= SNAP_T && d < best) {
          best = d;
          snapped = cand;
          line = null;
          const label = `${Math.round(g)} px`;
          const refSeg = {
            from: a.start + a.size,
            to: b.start,
            cross: crossMid(a.cStart, a.cSize, b.cStart, b.cSize),
            label,
          };
          const newSeg =
            cand === rightStart
              ? { from: n.start + n.size, to: cand, cross: 0, label }
              : { from: cand + size, to: n.start, cross: 0, label };
          newSeg.cross = crossMid(cStart, cSize, n.cStart, n.cSize);
          segs = [refSeg, newSeg];
        }
      }
    }
  }

  return { snapped, line, segs };
}

export const GlassCanvas: React.FC<GlassCanvasProps> = ({
  tiles,
  backgroundUrl,
  backgroundWidth,
  backgroundHeight,
  editable,
  refreshIntervalMs,
  onTilesChange,
  onEditTile,
  fitToken,
  onActivityChange,
  onBackgroundSize,
  onBackgroundError,
}) => {
  const [bounds, setBounds] = useState({
    width: backgroundWidth ?? FALLBACK.width,
    height: backgroundHeight ?? FALLBACK.height,
  });
  const [scale, setScale] = useState(1);
  const [guides, setGuides] = useState<{
    x: number | null;
    y: number | null;
    spacing: SpacingSeg[];
  }>({ x: null, y: null, spacing: [] });
  const [selected, setSelected] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const groupDrag = useRef<{
    startX: number;
    startY: number;
    origins: Map<string, { x: number; y: number }>;
  } | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    baseSelected: string[];
  } | null>(null);

  const isSelected = (id: string) => selected.includes(id);

  // Aggregate per-tile query activity into a single "something is loading" flag.
  const loadingIdsRef = useRef<Set<string>>(new Set());
  const [activeCount, setActiveCount] = useState(0);
  const onTileLoadingChange = useCallback((id: string, loading: boolean) => {
    const set = loadingIdsRef.current;
    if (loading) set.add(id);
    else set.delete(id);
    setActiveCount(set.size);
  }, []);
  useEffect(() => {
    onActivityChange?.(activeCount > 0);
  }, [activeCount, onActivityChange]);

  // Only keep selections for tiles that still exist.
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => tiles.some((t) => t.id === id)));
  }, [tiles]);

  useEffect(() => {
    if (backgroundWidth && backgroundHeight) {
      setBounds({ width: backgroundWidth, height: backgroundHeight });
    }
  }, [backgroundWidth, backgroundHeight]);

  const zoomIn = useCallback(
    () => setScale((s) => clampScale(s + SCALE_STEP)),
    [],
  );
  const zoomOut = useCallback(
    () => setScale((s) => clampScale(s - SCALE_STEP)),
    [],
  );
  const resetZoom = useCallback(() => setScale(1), []);

  const fitToScreen = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const availW = el.clientWidth - 48; // account for padding
    const availH = el.clientHeight - 48;
    if (availW <= 0 || availH <= 0) return;
    const next = Math.min(availW / bounds.width, availH / bounds.height);
    setScale(clampScale(next));
  }, [bounds.width, bounds.height]);

  // Fit to screen when asked (e.g. entering/leaving full-screen presentation),
  // deferred a frame so the new layout size is measured.
  useEffect(() => {
    if (!fitToken) return;
    const id = requestAnimationFrame(() => fitToScreen());
    return () => cancelAnimationFrame(id);
  }, [fitToken, fitToScreen]);

  // Ctrl/Cmd + wheel to zoom (non-passive so we can prevent browser zoom).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale((s) =>
        clampScale(s + (e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP)),
      );
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    if (size.width && size.height) {
      setBounds(size);
      onBackgroundSize?.(size);
    }
  }

  function updateTile(updated: MetricTileModel) {
    onTilesChange(tiles.map((t) => (t.id === updated.id ? updated : t)));
  }

  function removeTile(id: string) {
    onTilesChange(tiles.filter((t) => t.id !== id));
  }

  // ----- Selection & z-order -----

  function deleteSelected() {
    if (selected.length === 0) return;
    const ids = new Set(selected);
    onTilesChange(tiles.filter((t) => !ids.has(t.id)));
    setSelected([]);
  }

  function bringSelectedToFront() {
    if (selected.length === 0) return;
    const ids = new Set(selected);
    onTilesChange([
      ...tiles.filter((t) => !ids.has(t.id)),
      ...tiles.filter((t) => ids.has(t.id)),
    ]);
  }

  function sendSelectedToBack() {
    if (selected.length === 0) return;
    const ids = new Set(selected);
    onTilesChange([
      ...tiles.filter((t) => ids.has(t.id)),
      ...tiles.filter((t) => !ids.has(t.id)),
    ]);
  }

  // Delete/Backspace removes the current selection while editing.
  useEffect(() => {
    if (!editable) return;
    function onKey(e: KeyboardEvent) {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selected.length > 0
      ) {
        const tag = (e.target as HTMLElement)?.tagName;
        // Don't hijack the key while typing in an input/editor.
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if ((e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, selected, tiles]);

  /**
   * Called from a tile's drag handle on pointer down. Updates the selection and
   * decides whether the canvas takes over the drag (group move). Returns true if
   * the tile should NOT start its own single-tile drag.
   */
  function onTileHeaderPointerDown(
    id: string,
    additive: boolean,
    clientX: number,
    clientY: number,
  ): boolean {
    if (additive) {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
      return true; // toggle only, no drag
    }
    if (selected.includes(id) && selected.length > 1) {
      startGroupDrag(clientX, clientY);
      return true; // canvas handles the group move
    }
    setSelected([id]);
    return false; // let the tile run its own single-tile drag
  }

  function startGroupDrag(clientX: number, clientY: number) {
    const origins = new Map<string, { x: number; y: number }>();
    for (const t of tiles) {
      if (selected.includes(t.id)) origins.set(t.id, { x: t.x, y: t.y });
    }
    groupDrag.current = { startX: clientX, startY: clientY, origins };
    window.addEventListener("pointermove", onGroupDragMove);
    window.addEventListener("pointerup", onGroupDragEnd);
  }

  function onGroupDragMove(e: PointerEvent) {
    const g = groupDrag.current;
    if (!g) return;
    let dx = (e.clientX - g.startX) / scale;
    let dy = (e.clientY - g.startY) / scale;
    // Clamp the shared delta so no selected tile leaves the canvas.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const t of tiles) {
      const o = g.origins.get(t.id);
      if (!o) continue;
      minX = Math.min(minX, o.x);
      maxX = Math.max(maxX, o.x + t.width);
      minY = Math.min(minY, o.y);
      maxY = Math.max(maxY, o.y + t.height);
    }
    dx = Math.max(-minX, Math.min(dx, bounds.width - maxX));
    dy = Math.max(-minY, Math.min(dy, bounds.height - maxY));
    onTilesChange(
      tiles.map((t) => {
        const o = g.origins.get(t.id);
        return o ? { ...t, x: o.x + dx, y: o.y + dy } : t;
      }),
    );
  }

  function onGroupDragEnd() {
    groupDrag.current = null;
    window.removeEventListener("pointermove", onGroupDragMove);
    window.removeEventListener("pointerup", onGroupDragEnd);
  }

  // Marquee (rubber-band) selection, started on empty canvas.
  function toCanvasCoords(clientX: number, clientY: number) {
    const rect = canvasBoxRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (!editable) return;
    // Only start on truly empty canvas (not on a tile or its children).
    if (e.target !== canvasBoxRef.current) return;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    marqueeRef.current = {
      startX: x,
      startY: y,
      baseSelected: additive ? [...selected] : [],
    };
    if (!additive) setSelected([]);
    setMarquee({ x, y, w: 0, h: 0 });
    window.addEventListener("pointermove", onMarqueeMove);
    window.addEventListener("pointerup", onMarqueeEnd);
  }

  function onMarqueeMove(e: PointerEvent) {
    const m = marqueeRef.current;
    if (!m) return;
    const { x: cx, y: cy } = toCanvasCoords(e.clientX, e.clientY);
    const x = Math.min(m.startX, cx);
    const y = Math.min(m.startY, cy);
    const w = Math.abs(cx - m.startX);
    const h = Math.abs(cy - m.startY);
    setMarquee({ x, y, w, h });
    const hits = tiles
      .filter(
        (t) =>
          t.x < x + w &&
          x < t.x + t.width &&
          t.y < y + h &&
          y < t.y + t.height,
      )
      .map((t) => t.id);
    setSelected(Array.from(new Set([...m.baseSelected, ...hits])));
  }

  function onMarqueeEnd() {
    marqueeRef.current = null;
    setMarquee(null);
    window.removeEventListener("pointermove", onMarqueeMove);
    window.removeEventListener("pointerup", onMarqueeEnd);
  }

  // Snap a dragged tile to other tiles' edges/centers (alignment) and to gaps
  // matching an existing gap between two tiles (equal spacing), and surface the
  // matched coordinates as alignment / spacing guides.
  function snapPosition(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): { x: number; y: number } {
    const others = tiles.filter((t) => t.id !== id);

    const xr = snapAxis(
      x,
      width,
      y,
      height,
      others.map((t) => ({
        start: t.x,
        size: t.width,
        cStart: t.y,
        cSize: t.height,
      })),
    );
    const yr = snapAxis(
      y,
      height,
      x,
      width,
      others.map((t) => ({
        start: t.y,
        size: t.height,
        cStart: t.x,
        cSize: t.width,
      })),
    );

    const spacing: SpacingSeg[] = [
      ...xr.segs.map((s) => ({ axis: "x" as const, ...s })),
      ...yr.segs.map((s) => ({ axis: "y" as const, ...s })),
    ];
    setGuides({ x: xr.line, y: yr.line, spacing });
    return { x: xr.snapped, y: yr.snapped };
  }

  function clearGuides() {
    setGuides({ x: null, y: null, spacing: [] });
  }

  function duplicateTile(tile: MetricTileModel) {
    const offset = 24;
    const copy: MetricTileModel = {
      ...tile,
      id: generateId(),
      thresholds: tile.thresholds?.map((t) => ({ ...t, id: generateId("th") })),
      x: Math.min(tile.x + offset, Math.max(0, bounds.width - tile.width)),
      y: Math.min(tile.y + offset, Math.max(0, bounds.height - tile.height)),
    };
    onTilesChange([...tiles, copy]);
  }

  return (
    <div style={{ position: "relative", flexGrow: 1, minWidth: 0, height: "100%" }}>
      <div
        ref={scrollRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "auto",
          background: Colors.Background.Base.Default,
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        {/* Sizer reserves scroll space equal to the scaled canvas. */}
        <div
          style={{
            width: bounds.width * scale,
            height: bounds.height * scale,
            margin: "0 auto",
          }}
        >
          <div
            ref={canvasBoxRef}
            onPointerDown={onCanvasPointerDown}
            style={{
              position: "relative",
              width: bounds.width,
              height: bounds.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              background: Colors.Background.Container.Neutral.Default,
              border: `1px solid ${Colors.Border.Neutral.Default}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            }}
          >
            {backgroundUrl ? (
              <img
                src={backgroundUrl}
                alt="View background"
                onLoad={handleImageLoad}
                onError={() => onBackgroundError?.()}
                draggable={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "fill",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            ) : (
              editable && (
                <Flex
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  gap={8}
                  style={{ width: "100%", height: "100%" }}
                >
                  <ImageIcon />
                  <Text style={{ color: Colors.Text.Neutral.Default }}>
                    Blank canvas — add a background from the toolbar, or place
                    tiles directly.
                  </Text>
                </Flex>
              )
            )}

            {tiles.map((tile) => (
              <MetricTile
                key={tile.id}
                tile={tile}
                editable={editable}
                selected={isSelected(tile.id)}
                refreshIntervalMs={refreshIntervalMs}
                bounds={bounds}
                scale={scale}
                onChange={updateTile}
                onRemove={removeTile}
                onEdit={onEditTile}
                onDuplicate={duplicateTile}
                onSnap={snapPosition}
                onGestureEnd={clearGuides}
                onHeaderPointerDown={onTileHeaderPointerDown}
                onLoadingChange={onTileLoadingChange}
              />
            ))}

            {editable && marquee && (
              <div
                style={{
                  position: "absolute",
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                  border: `1px solid ${Colors.Border.Primary.Default}`,
                  background: "rgba(59, 63, 190, 0.12)",
                  pointerEvents: "none",
                  zIndex: 7,
                }}
              />
            )}

            {editable && guides.x != null && (
              <div
                style={{
                  position: "absolute",
                  left: guides.x,
                  top: 0,
                  width: 0,
                  height: bounds.height,
                  borderLeft: `1px dashed ${Colors.Border.Primary.Default}`,
                  pointerEvents: "none",
                  zIndex: 5,
                }}
              />
            )}
            {editable && guides.y != null && (
              <div
                style={{
                  position: "absolute",
                  top: guides.y,
                  left: 0,
                  height: 0,
                  width: bounds.width,
                  borderTop: `1px dashed ${Colors.Border.Primary.Default}`,
                  pointerEvents: "none",
                  zIndex: 5,
                }}
              />
            )}
            {editable &&
              guides.spacing.map((s, i) => {
                const lo = Math.min(s.from, s.to);
                const len = Math.abs(s.to - s.from);
                const mid = lo + len / 2;
                const isX = s.axis === "x";
                return (
                  <React.Fragment key={i}>
                    <div
                      style={{
                        position: "absolute",
                        pointerEvents: "none",
                        zIndex: 6,
                        background: SPACING_COLOR,
                        ...(isX
                          ? { left: lo, top: s.cross, width: len, height: 2 }
                          : { top: lo, left: s.cross, height: len, width: 2 }),
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        pointerEvents: "none",
                        zIndex: 6,
                        left: isX ? mid - 16 : s.cross + 4,
                        top: isX ? s.cross - 18 : mid - 8,
                        padding: "1px 4px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#fff",
                        background: SPACING_COLOR,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.label}
                    </div>
                  </React.Fragment>
                );
              })}
          </div>
        </div>
      </div>

      {/* Floating selection toolbar */}
      {editable && selected.length > 0 && (
        <Flex
          alignItems="center"
          gap={8}
          style={{
            position: "absolute",
            left: 16,
            top: 16,
            padding: "6px 10px",
            borderRadius: 8,
            background: Colors.Background.Surface.Default,
            border: `1px solid ${Colors.Border.Neutral.Default}`,
            boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: 600 }}>
            {selected.length} selected
          </Text>
          <Button variant="default" onClick={bringSelectedToFront}>
            Bring to front
          </Button>
          <Button variant="default" onClick={sendSelectedToBack}>
            Send to back
          </Button>
          <Button
            variant="default"
            onClick={deleteSelected}
            aria-label="Delete selected"
          >
            <Button.Prefix>
              <DeleteIcon />
            </Button.Prefix>
            Delete
          </Button>
          <Button variant="default" onClick={() => setSelected([])}>
            Clear
          </Button>
        </Flex>
      )}

      {/* Floating zoom controls */}
      <Flex
        alignItems="center"
        gap={2}
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          padding: 4,
          borderRadius: 8,
          background: Colors.Background.Surface.Default,
          border: `1px solid ${Colors.Border.Neutral.Default}`,
          boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        }}
      >
        <Tooltip text="Zoom out">
          <Button
            variant="default"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
            style={{ minWidth: "auto", padding: 4 }}
          >
            <Button.Prefix>
              <ZoomOutIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
        <Tooltip text="Reset to 100%">
          <Button
            variant="default"
            onClick={resetZoom}
            aria-label="Reset zoom"
            style={{ minWidth: 56 }}
          >
            {Math.round(scale * 100)}%
          </Button>
        </Tooltip>
        <Tooltip text="Zoom in">
          <Button
            variant="default"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
            style={{ minWidth: "auto", padding: 4 }}
          >
            <Button.Prefix>
              <ZoomInIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
        <Tooltip text="Fit to screen">
          <Button
            variant="default"
            onClick={fitToScreen}
            aria-label="Fit to screen"
            style={{ minWidth: "auto", padding: 4 }}
          >
            <Button.Prefix>
              <ZoomToFitIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      </Flex>
    </div>
  );
};
