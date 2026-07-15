import React, { useCallback, useEffect, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Tooltip } from "@dynatrace/strato-components-preview/overlays";
import {
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
  /** Reports the natural background size once the image has loaded. */
  onBackgroundSize?: (size: { width: number; height: number }) => void;
  /** Fired when the <img> element fails to decode/render the fetched source. */
  onBackgroundError?: () => void;
}

const FALLBACK = { width: 1000, height: 600 };
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

const clampScale = (s: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));

export const GlassCanvas: React.FC<GlassCanvasProps> = ({
  tiles,
  backgroundUrl,
  backgroundWidth,
  backgroundHeight,
  editable,
  refreshIntervalMs,
  onTilesChange,
  onEditTile,
  onBackgroundSize,
  onBackgroundError,
}) => {
  const [bounds, setBounds] = useState({
    width: backgroundWidth ?? FALLBACK.width,
    height: backgroundHeight ?? FALLBACK.height,
  });
  const [scale, setScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

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
                refreshIntervalMs={refreshIntervalMs}
                bounds={bounds}
                scale={scale}
                onChange={updateTile}
                onRemove={removeTile}
                onEdit={onEditTile}
                onDuplicate={duplicateTile}
              />
            ))}
          </div>
        </div>
      </div>

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
