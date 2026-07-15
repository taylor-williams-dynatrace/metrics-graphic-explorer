import React, { useEffect, useMemo, useState } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { RunQueryButton, type QueryStateType } from "@dynatrace/strato-components-preview/buttons";
import { DQLEditor } from "@dynatrace/strato-components-preview/editors";
import { PlusIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { DocumentMetaData } from "@dynatrace-sdk/client-document";
import {
  AGGREGATIONS,
  DEFAULT_LOOKBACK,
  DEFAULT_TILE_SHAPE,
  generateId,
  LOOKBACK_OPTIONS,
  THRESHOLD_COLOR_PRESETS,
  TILE_SHAPES,
  type AggregationType,
  type LookbackWindow,
  type Threshold,
  type TileFilter,
  type TileLink,
  type TileShape,
  type TileSource,
} from "../types/metricsView";
import {
  dimensionKeysFromRecord,
  dimensionProbeQuery,
  readDqlCell,
  validateDqlResult,
} from "../services/metricsQuery";
import { listViews } from "../services/documentService";
import { FilterRow } from "./FilterRow";
import { ThresholdRow } from "./ThresholdRow";
import { NativeInput } from "./NativeField";
import { SelectField } from "./SelectField";
import { ShapeGlyph } from "./TileShapeLayer";

export interface TileConfig {
  source: TileSource;
  metricKey?: string;
  aggregation?: AggregationType;
  lookback?: LookbackWindow;
  dql?: string;
  shape: TileShape;
  shapeOnly: boolean;
  filters: TileFilter[];
  thresholds: Threshold[];
  label?: string;
  unit?: string;
  link?: TileLink;
}

type LinkChoice = "none" | "view" | "url";
type TestState = { status: "idle" | "running" | "ok" | "error"; message: string };

interface TileConfigFormProps {
  /** Whether the tile is metric-based or uses a custom DQL query. */
  source: TileSource;
  /** Metric key (metric source only). */
  metricKey?: string;
  initial?: Partial<TileConfig>;
  submitLabel: string;
  /** Current view's id, excluded from the drill-down canvas list. */
  currentViewId?: string;
  onSubmit: (config: TileConfig) => void;
  onCancel?: () => void;
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: Colors.Text.Neutral.Default,
};

/** Color of the shape picker glyphs and captions. */
const SHAPE_PICKER_COLOR = "#3b3fbe";

/** Compact captions for the shape picker buttons. */
const SHORT_SHAPE_LABELS: Record<TileShape, string> = {
  rectangle: "Rectangle",
  rounded: "Rounded",
  circle: "Circle",
  triangle: "Triangle",
  diamond: "Diamond",
  cloud: "Cloud",
  server: "Server",
  application: "App",
  database: "Database",
  user: "User",
  users: "Users",
  globe: "Globe",
  laptop: "Laptop",
  mobile: "Mobile",
  document: "Document",
  shield: "Shield",
};

export const TileConfigForm: React.FC<TileConfigFormProps> = ({
  source,
  metricKey,
  initial,
  submitLabel,
  currentViewId,
  onSubmit,
  onCancel,
}) => {
  const isDql = source === "dql";
  const [aggregation, setAggregation] = useState<AggregationType>(
    initial?.aggregation ?? "avg",
  );
  const [lookback, setLookback] = useState<LookbackWindow>(
    initial?.lookback ?? DEFAULT_LOOKBACK,
  );
  const [dql, setDql] = useState<string>(initial?.dql ?? "");
  const [test, setTest] = useState<TestState>({ status: "idle", message: "" });
  const [shape, setShape] = useState<TileShape>(
    initial?.shape ?? DEFAULT_TILE_SHAPE,
  );
  const [shapeOnly, setShapeOnly] = useState<boolean>(
    initial?.shapeOnly ?? false,
  );
  const [filters, setFilters] = useState<TileFilter[]>(initial?.filters ?? []);
  const [thresholds, setThresholds] = useState<Threshold[]>(
    initial?.thresholds ?? [],
  );
  const [label, setLabel] = useState<string>(initial?.label ?? "");
  const [unit, setUnit] = useState<string>(initial?.unit ?? "");

  const [linkChoice, setLinkChoice] = useState<LinkChoice>(
    initial?.link?.type ?? "none",
  );
  const [linkView, setLinkView] = useState<string>(
    initial?.link?.type === "view" ? initial.link.target : "",
  );
  const [linkUrl, setLinkUrl] = useState<string>(
    initial?.link?.type === "url" ? initial.link.target : "",
  );
  const [views, setViews] = useState<DocumentMetaData[] | null>(null);

  // Load the list of canvases lazily when the user chooses a canvas link.
  useEffect(() => {
    if (linkChoice !== "view" || views !== null) return;
    let active = true;
    listViews()
      .then((docs) => active && setViews(docs))
      .catch(() => active && setViews([]));
    return () => {
      active = false;
    };
  }, [linkChoice, views]);

  // Probe one series to discover this metric's dimension keys (metric source).
  const { data } = useDql(
    { query: metricKey ? dimensionProbeQuery(metricKey) : "" },
    { enabled: !isDql && Boolean(metricKey) },
  );

  const dimensionOptions = useMemo(() => {
    const records =
      (data?.records as Array<Record<string, unknown>> | undefined) ?? [];
    return dimensionKeysFromRecord(records[0]);
  }, [data]);

  // Deferred query used to test/validate a custom DQL query on demand.
  const dqlTest = useDql({ query: dql }, { enabled: false });

  async function runDqlTest() {
    const q = dql.trim();
    if (!q) return;
    setTest({ status: "running", message: "Running query…" });
    try {
      const result = await dqlTest.refetch();
      const cell = readDqlCell(
        result.data?.records as Array<Record<string, unknown>> | undefined,
      );
      const validation = validateDqlResult(cell);
      setTest({
        status: validation.ok ? "ok" : "error",
        message: validation.message,
      });
    } catch (e) {
      setTest({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Auto-validate an existing DQL query when editing a DQL tile.
  useEffect(() => {
    if (isDql && (initial?.dql ?? "").trim()) {
      void runDqlTest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateFilter(index: number, next: TileFilter) {
    setFilters((prev) => prev.map((f, i) => (i === index ? next : f)));
  }

  function removeFilter(index: number) {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }

  function addFilter() {
    setFilters((prev) => [...prev, { dimension: "", value: "" }]);
  }

  function updateThreshold(index: number, next: Threshold) {
    setThresholds((prev) => prev.map((t, i) => (i === index ? next : t)));
  }

  function removeThreshold(index: number) {
    setThresholds((prev) => prev.filter((_, i) => i !== index));
  }

  function addThreshold() {
    setThresholds((prev) => [
      ...prev,
      {
        id: generateId("th"),
        comparator: "gte",
        value: 0,
        color:
          THRESHOLD_COLOR_PRESETS[prev.length % THRESHOLD_COLOR_PRESETS.length]
            .color,
      },
    ]);
  }

  function resolveLink(): TileLink | undefined {
    if (linkChoice === "view" && linkView) {
      return { type: "view", target: linkView };
    }
    if (linkChoice === "url" && linkUrl.trim()) {
      return { type: "url", target: linkUrl.trim() };
    }
    return undefined;
  }

  const canSubmit = isDql ? test.status === "ok" : Boolean(metricKey);

  function handleSubmit() {
    onSubmit({
      source,
      metricKey: isDql ? undefined : metricKey,
      aggregation: isDql ? undefined : aggregation,
      lookback: isDql ? undefined : lookback,
      dql: isDql ? dql.trim() : undefined,
      shape,
      shapeOnly,
      filters: isDql
        ? []
        : filters.filter((f) => f.dimension && f.value !== ""),
      thresholds: thresholds.filter((t) => Number.isFinite(t.value)),
      label: label.trim() || undefined,
      unit: unit.trim() || undefined,
      link: resolveLink(),
    });
  }

  const dqlQueryState: QueryStateType =
    test.status === "running"
      ? "loading"
      : test.status === "ok"
        ? "success"
        : test.status === "error"
          ? "error"
          : "idle";

  return (
    <Flex flexDirection="column" gap={12} style={{ width: "100%" }}>
      {isDql ? (
        <Flex flexDirection="column" gap={6}>
          <Text style={fieldLabelStyle}>Custom DQL query</Text>
          <DQLEditor
            value={dql}
            placeholder="timeseries v = avg(dt.host.cpu.usage, scalar:true)"
            onChange={(v) => {
              setDql(v);
              setTest({ status: "idle", message: "" });
            }}
          />
          <Flex justifyContent="space-between" alignItems="center" gap={8}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 500,
                color:
                  test.status === "error"
                    ? Colors.Text.Critical.Default
                    : test.status === "ok"
                      ? Colors.Text.Success.Default
                      : Colors.Text.Neutral.Default,
              }}
            >
              {test.message ||
                "Query must return a single numeric or text value."}
            </Text>
            <RunQueryButton
              onClick={() => void runDqlTest()}
              queryState={dqlQueryState}
            />
          </Flex>
        </Flex>
      ) : (
        <>
          <Flex flexDirection="column" gap={4}>
            <Text style={fieldLabelStyle}>Metric</Text>
            <Text
              style={{ fontSize: 13, fontWeight: 500, wordBreak: "break-all" }}
            >
              {metricKey}
            </Text>
          </Flex>

          <Flex gap={8}>
            <Flex flexDirection="column" gap={4} style={{ flex: 1 }}>
              <Text style={fieldLabelStyle}>Aggregation</Text>
              <SelectField
                value={aggregation}
                ariaLabel="Aggregation"
                onChange={(v) => setAggregation(v as AggregationType)}
                options={AGGREGATIONS}
              />
            </Flex>
            <Flex flexDirection="column" gap={4} style={{ flex: 1 }}>
              <Text style={fieldLabelStyle}>Aggregation window</Text>
              <SelectField
                value={lookback}
                ariaLabel="Aggregation window"
                onChange={(v) => setLookback(v as LookbackWindow)}
                options={LOOKBACK_OPTIONS}
              />
            </Flex>
          </Flex>

          <Flex flexDirection="column" gap={6}>
            <Flex justifyContent="space-between" alignItems="center">
              <Text style={fieldLabelStyle}>Filters</Text>
              <Button variant="default" onClick={addFilter}>
                <Button.Prefix>
                  <PlusIcon />
                </Button.Prefix>
                Add filter
              </Button>
            </Flex>
            {filters.length === 0 ? (
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: Colors.Text.Neutral.Default,
                }}
              >
                No filters — the metric is aggregated across all series.
              </Text>
            ) : (
              filters.map((filter, i) => (
                <FilterRow
                  key={i}
                  metricKey={metricKey ?? ""}
                  filter={filter}
                  dimensionOptions={dimensionOptions}
                  onChange={(next) => updateFilter(i, next)}
                  onRemove={() => removeFilter(i)}
                />
              ))
            )}
          </Flex>
        </>
      )}

      <Flex flexDirection="column" gap={6}>
        <Text style={fieldLabelStyle}>Tile shape</Text>
        <Flex gap={6} style={{ flexWrap: "wrap" }}>
          {TILE_SHAPES.map((s) => {
            const selected = shape === s.value;
            return (
              <button
                key={s.value}
                type="button"
                title={s.label}
                aria-label={s.label}
                aria-pressed={selected}
                onClick={() => setShape(s.value)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  width: 60,
                  padding: "8px 4px",
                  cursor: "pointer",
                  borderRadius: 6,
                  border: `1px solid ${selected
                      ? Colors.Border.Primary.Default
                      : Colors.Border.Neutral.Default
                    }`,
                  background: selected
                    ? Colors.Background.Container.Neutral.Emphasized
                    : Colors.Background.Surface.Default,
                  color: SHAPE_PICKER_COLOR,
                }}
              >
                <ShapeGlyph shape={s.value} size={24} />
                <span style={{ fontSize: 10, fontWeight: 600 }}>
                  {SHORT_SHAPE_LABELS[s.value]}
                </span>
              </button>
            );
          })}
        </Flex>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: Colors.Text.Neutral.Default,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={shapeOnly}
            onChange={(e) => setShapeOnly(e.target.checked)}
          />
          Show shape only (hide value &amp; label)
        </label>
      </Flex>

      <Flex flexDirection="column" gap={6}>
        <Flex justifyContent="space-between" alignItems="center">
          <Text style={fieldLabelStyle}>Color thresholds</Text>
          <Button variant="default" onClick={addThreshold}>
            <Button.Prefix>
              <PlusIcon />
            </Button.Prefix>
            Add threshold
          </Button>
        </Flex>
        {thresholds.length === 0 ? (
          <Text
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: Colors.Text.Neutral.Default,
            }}
          >
            No thresholds — the tile uses its default colors.
          </Text>
        ) : (
          <>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: Colors.Text.Neutral.Default,
              }}
            >
              Evaluated top to bottom; the first matching rule colors the tile.
            </Text>
            {thresholds.map((threshold, i) => (
              <ThresholdRow
                key={threshold.id}
                threshold={threshold}
                onChange={(next) => updateThreshold(i, next)}
                onRemove={() => removeThreshold(i)}
              />
            ))}
          </>
        )}
      </Flex>

      <Flex gap={8}>
        <Flex flexDirection="column" gap={4} style={{ flex: 1 }}>
          <Text style={fieldLabelStyle}>Label (optional)</Text>
          <NativeInput
            value={label}
            placeholder={metricKey ?? "Custom DQL"}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Flex>
        <Flex flexDirection="column" gap={4} style={{ width: 90 }}>
          <Text style={fieldLabelStyle}>Unit</Text>
          <NativeInput
            value={unit}
            placeholder="e.g. %"
            onChange={(e) => setUnit(e.target.value)}
          />
        </Flex>
      </Flex>

      <Flex flexDirection="column" gap={4}>
        <Text style={fieldLabelStyle}>Hyperlink (optional)</Text>
        <SelectField
          value={linkChoice}
          ariaLabel="Hyperlink type"
          onChange={(v) => setLinkChoice(v as LinkChoice)}
          options={[
            { value: "none", label: "No link" },
            { value: "view", label: "Open another canvas" },
            { value: "url", label: "Open a custom URL" },
          ]}
        />

        {linkChoice === "view" && (
          <SelectField
            value={linkView}
            ariaLabel="Target canvas"
            placeholder={
              views === null ? "Loading canvases…" : "Select a canvas…"
            }
            onChange={(v) => setLinkView(v)}
            options={(views ?? [])
              .filter((v) => v.id !== currentViewId)
              .map((v) => ({ value: v.id, label: v.name }))}
          />
        )}

        {linkChoice === "url" && (
          <NativeInput
            type="url"
            value={linkUrl}
            placeholder="https://example.com/dashboard"
            aria-label="Custom URL"
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        )}

        <Text
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: Colors.Text.Neutral.Default,
          }}
        >
          When set, the tile shows a link icon and opens this destination in a
          new tab when clicked in view mode.
        </Text>
      </Flex>

      <Flex gap={8} justifyContent="flex-end">
        {onCancel && (
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="accent" onClick={handleSubmit} disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </Flex>
    </Flex>
  );
};
