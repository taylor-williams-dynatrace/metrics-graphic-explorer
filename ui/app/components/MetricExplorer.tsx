import React, { useMemo, useState } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { METRIC_KEYS_QUERY } from "../services/metricsQuery";
import { TileConfigForm, type TileConfig } from "./TileConfigForm";
import { NativeInput } from "./NativeField";

type AddMode = "metric" | "dql";

interface MetricExplorerProps {
  /** Called with a finished tile configuration to place on the canvas. */
  onAddTile: (config: TileConfig) => void;
  /** Current view id, so a tile's canvas link can exclude the current canvas. */
  currentViewId?: string;
}

const MAX_VISIBLE = 250;

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
        width: 510,
        flexShrink: 0,
        height: "100%",
        padding: 16,
        boxSizing: "border-box",
        background: Colors.Background.Container.Neutral.Subdued,
        borderLeft: `1px solid ${Colors.Border.Neutral.Default}`,
        overflowY: "auto",
      }}
    >
      <Heading level={5}>Add a tile</Heading>

      <Flex gap={6}>
        <Button
          variant={addMode === "metric" ? "accent" : "default"}
          onClick={() => setAddMode("metric")}
          style={{ flex: 1 }}
        >
          Use existing metric
        </Button>
        <Button
          variant={addMode === "dql" ? "accent" : "default"}
          onClick={() => setAddMode("dql")}
          style={{ flex: 1 }}
        >
          Create via DQL
        </Button>
      </Flex>

      {addMode === "dql" ? (
        <div
          style={{
            borderTop: `1px solid ${Colors.Border.Neutral.Default}`,
            paddingTop: 12,
          }}
        >
          <TileConfigForm
            key={`dql-${dqlResetKey}`}
            source="dql"
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
