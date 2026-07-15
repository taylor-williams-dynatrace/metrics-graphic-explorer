import React, { useMemo, useRef, useState } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { DotMenuIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { METRIC_KEYS_QUERY } from "../services/metricsQuery";
import { TileConfigForm, type TileConfig } from "./TileConfigForm";
import { NativeInput } from "./NativeField";

type AddMode = "metric" | "dql" | "markdown";

interface MetricExplorerProps {
  /** Called with a finished tile configuration to place on the canvas. */
  onAddTile: (config: TileConfig) => void;
  /** Current view id, so a tile's canvas link can exclude the current canvas. */
  currentViewId?: string;
}

const MAX_VISIBLE = 250;
const DEFAULT_WIDTH = 510;
const MIN_WIDTH = 320;
const MAX_WIDTH = 820;

/**
 * Right-side panel listing all available Dynatrace metrics (searchable). After
 * selecting a metric the user configures aggregation and filters, then adds it
 * to the canvas as a tile.
 */
export const MetricExplorer: React.FC<MetricExplorerProps> = ({
  onAddTile,
  currentViewId,
}) => {
  const [addMode, setAddMode] = useState<AddMode>("metric");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dqlResetKey, setDqlResetKey] = useState(0);

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [handleHover, setHandleHover] = useState(false);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  function onResizeDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: width,
    };
  }

  function onResizeMove(e: React.PointerEvent) {
    const s = resizeRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    // The panel sits on the right, so dragging left (smaller clientX) widens it.
    const next = s.startWidth + (s.startX - e.clientX);
    setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)));
  }

  function onResizeUp(e: React.PointerEvent) {
    if (resizeRef.current?.pointerId === e.pointerId) resizeRef.current = null;
  }

  const { data, error, isLoading } = useDql(
    { query: METRIC_KEYS_QUERY },
    { staleTime: 5 * 60 * 1000 },
  );

  const metricKeys = useMemo(() => {
    const records =
      (data?.records as Array<Record<string, unknown>> | undefined) ?? [];
    return records
      .map((r) => r["metric.key"])
      .filter((k): k is string => typeof k === "string");
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? metricKeys.filter((k) => k.toLowerCase().includes(term))
      : metricKeys;
    return list;
  }, [metricKeys, search]);

  return (
    <Flex
      flexDirection="column"
      gap={12}
      style={{
        position: "relative",
        width,
        flexShrink: 0,
        height: "100%",
        padding: 16,
        boxSizing: "border-box",
        background: Colors.Background.Container.Neutral.Subdued,
        borderLeft: `1px solid ${Colors.Border.Neutral.Default}`,
        overflowY: "auto",
      }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        onMouseEnter={() => setHandleHover(true)}
        onMouseLeave={() => setHandleHover(false)}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "col-resize",
          zIndex: 3,
          userSelect: "none",
          touchAction: "none",
          background: handleHover
            ? Colors.Border.Primary.Default
            : "transparent",
          transition: "background 120ms",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 30,
            borderRadius: 8,
            background: Colors.Background.Surface.Default,
            border: `1px solid ${
              handleHover
                ? Colors.Border.Primary.Default
                : Colors.Border.Neutral.Default
            }`,
            color: handleHover
              ? Colors.Text.Primary.Default
              : Colors.Text.Neutral.Subdued,
          }}
        >
          <DotMenuIcon />
        </div>
      </div>

      <Heading level={5}>Add a tile</Heading>

      <Flex gap={6} style={{ flexWrap: "wrap" }}>
        <Button
          variant={addMode === "metric" ? "accent" : "default"}
          onClick={() => setAddMode("metric")}
          style={{ flex: 1 }}
        >
          Metric
        </Button>
        <Button
          variant={addMode === "dql" ? "accent" : "default"}
          onClick={() => setAddMode("dql")}
          style={{ flex: 1 }}
        >
          DQL
        </Button>
        <Button
          variant={addMode === "markdown" ? "accent" : "default"}
          onClick={() => setAddMode("markdown")}
          style={{ flex: 1 }}
        >
          Markdown
        </Button>
      </Flex>

      {addMode === "dql" || addMode === "markdown" ? (
        <div
          style={{
            borderTop: `1px solid ${Colors.Border.Neutral.Default}`,
            paddingTop: 12,
          }}
        >
          <TileConfigForm
            key={`${addMode}-${dqlResetKey}`}
            source={addMode}
            currentViewId={currentViewId}
            submitLabel="Add to canvas"
            onSubmit={(config) => {
              onAddTile(config);
              setDqlResetKey((k) => k + 1);
            }}
          />
        </div>
      ) : (
        <>
          <NativeInput
            type="search"
            value={search}
            placeholder="Search metrics…"
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />

          {isLoading ? (
        <Flex justifyContent="center" padding={16}>
          <ProgressCircle aria-label="Loading metrics" />
        </Flex>
      ) : error ? (
        <Text style={{ color: Colors.Text.Critical.Default, fontSize: 13 }}>
          Failed to load metrics: {error.message}
        </Text>
      ) : (
        <Flex flexDirection="column" gap={4}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: Colors.Text.Neutral.Default,
            }}
          >
            {filtered.length} metric{filtered.length === 1 ? "" : "s"}
            {filtered.length > MAX_VISIBLE
              ? ` (showing first ${MAX_VISIBLE})`
              : ""}
          </Text>
          <div
            style={{
              maxHeight: 260,
              overflowY: "auto",
              border: `1px solid ${Colors.Border.Neutral.Default}`,
              borderRadius: 4,
              background: Colors.Background.Surface.Default,
            }}
          >
            {filtered.slice(0, MAX_VISIBLE).map((key) => {
              const isSel = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    fontWeight: 600,
                    wordBreak: "break-all",
                    background: isSel
                      ? Colors.Background.Container.Neutral.Default
                      : "transparent",
                    color: Colors.Text.Neutral.Default,
                  }}
                >
                  {key}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: 10,
                  color: Colors.Text.Neutral.Default,
                }}
              >
                No metrics match “{search}”.
              </Text>
            )}
          </div>
        </Flex>
      )}

          {selected && (
            <div
              style={{
                borderTop: `1px solid ${Colors.Border.Neutral.Default}`,
                paddingTop: 12,
              }}
            >
              <TileConfigForm
                key={selected}
                source="metric"
                metricKey={selected}
                currentViewId={currentViewId}
                submitLabel="Add to canvas"
                onSubmit={(config) => {
                  onAddTile(config);
                  setSelected(null);
                }}
                onCancel={() => setSelected(null)}
              />
            </div>
          )}
        </>
      )}
    </Flex>
  );
};
