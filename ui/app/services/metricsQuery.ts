/**
 * Helpers for building the DQL queries used by the metrics explorer and tiles.
 *
 * Required app scopes (see app.config.json):
 *   storage:metrics:read, storage:buckets:read
 */
import {
  DEFAULT_LOOKBACK,
  type AggregationType,
  type MetricTile,
  type Threshold,
  type TileFilter,
} from "../types/metricsView";

/**
 * Discover available metric keys. The `metrics` command is the documented way
 * to explore metric keys; we de-duplicate and sort them for the picker.
 */
export const METRIC_KEYS_QUERY =
  "metrics | dedup metric.key | fields metric.key | sort metric.key asc | limit 5000";

/** Fields returned by the `metrics` command that are *not* dimensions. */
const NON_DIMENSION_FIELDS = new Set([
  "metric.key",
  "timeframe",
  "interval",
  "value",
  "start",
  "end",
]);

/** Probe a single metric series to discover its dimension keys. */
export function dimensionProbeQuery(metricKey: string): string {
  return `metrics | filter metric.key == "${escapeValue(metricKey)}" | limit 1`;
}

/** Extract dimension keys from a probe-query record. */
export function dimensionKeysFromRecord(
  record: Record<string, unknown> | undefined,
): string[] {
  if (!record) return [];
  return Object.keys(record).filter((k) => !NON_DIMENSION_FIELDS.has(k));
}

/** Query distinct values for one dimension of a metric. */
export function dimensionValuesQuery(
  metricKey: string,
  dimension: string,
): string {
  return (
    `metrics | filter metric.key == "${escapeValue(metricKey)}"` +
    ` | dedup \`${dimension}\` | fields \`${dimension}\`` +
    ` | sort \`${dimension}\` asc | limit 200`
  );
}

/**
 * Build the scalar value query for a tile. `scalar:true` collapses the metric
 * to a single value spanning the timeframe, which is exactly what a tile shows.
 */
export function tileValueQuery(tile: MetricTile): string {
  const filterClause = buildFilterClause(tile.filters);
  const agg = aggExpression(tile.aggregation ?? "avg", tile.metricKey ?? "", filterClause);
  return `timeseries val=${agg}, from:${tile.lookback ?? DEFAULT_LOOKBACK}`;
}

function aggExpression(
  aggregation: AggregationType,
  metricKey: string,
  filterClause: string,
): string {
  // `count` does not take a rollup/rate; all support scalar + filter.
  return `${aggregation}(\`${metricKey}\`, scalar:true${filterClause})`;
}

function buildFilterClause(filters: TileFilter[]): string {
  const valid = filters.filter((f) => f.dimension && f.value !== "");
  if (valid.length === 0) return "";
  const conditions = valid
    .map((f) => `\`${f.dimension}\`=="${escapeValue(f.value)}"`)
    .join(" and ");
  return `, filter:{${conditions}}`;
}

function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Read the scalar value out of a tile query result. `scalar:true` yields one
 * record with a single number, but we defensively handle array results too.
 */
export function extractScalar(
  records: Array<Record<string, unknown>> | undefined,
): number | null {
  if (!records || records.length === 0) return null;
  const raw = records[0]?.val;
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    for (let i = raw.length - 1; i >= 0; i--) {
      if (raw[i] != null) return Number(raw[i]);
    }
    return null;
  }
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

/** Columns produced by DQL commands that aren't the tile's "value" field. */
const DQL_META_FIELDS = new Set(["timeframe", "interval", "start", "end"]);

export interface DqlCellResult {
  /** The single value (number or text), or null if none. */
  value: number | string | null;
  /** Number of result rows. */
  rows: number;
  /** Number of non-metadata fields in the first row. */
  dataFields: number;
  /** True when the value field is an array (a time series, not a single value). */
  isSeries: boolean;
}

/**
 * Read a single cell from a custom DQL result: the first non-metadata field of
 * the first row. Also reports shape info so callers can validate that the query
 * returns exactly one value.
 */
export function readDqlCell(
  records: Array<Record<string, unknown>> | undefined,
): DqlCellResult {
  const rows = records?.length ?? 0;
  if (!records || rows === 0) {
    return { value: null, rows: 0, dataFields: 0, isSeries: false };
  }
  const rec = records[0];
  const keys = Object.keys(rec).filter((k) => !DQL_META_FIELDS.has(k));
  const dataFields = keys.length;
  let raw: unknown = dataFields > 0 ? rec[keys[0]] : null;
  const isSeries = Array.isArray(raw);
  if (isSeries) {
    const arr = raw as unknown[];
    raw = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] != null) {
        raw = arr[i];
        break;
      }
    }
  }
  let value: number | string | null;
  if (raw == null) value = null;
  else if (typeof raw === "number") value = raw;
  else value = String(raw);
  return { value, rows, dataFields, isSeries };
}

/** Validate that a DQL result is a single numeric or text value. */
export function validateDqlResult(r: DqlCellResult): {
  ok: boolean;
  message: string;
} {
  if (r.rows === 0) return { ok: false, message: "Query returned no data." };
  if (r.dataFields === 0)
    return { ok: false, message: "No value field found in the result." };
  if (r.dataFields > 1)
    return {
      ok: false,
      message: `Query returns ${r.dataFields} fields — return exactly one value.`,
    };
  if (r.isSeries)
    return {
      ok: false,
      message:
        "Query returns a time series. Use scalar:true or summarize to a single value.",
    };
  if (r.rows > 1)
    return {
      ok: false,
      message: `Query returns ${r.rows} rows — return a single value.`,
    };
  if (r.value == null)
    return { ok: false, message: "The returned value is empty." };
  return { ok: true, message: `Returns a single value: ${r.value}` };
}

/**
 * Resolve the threshold color for a value. Rules are evaluated in list order
 * and the first satisfied rule wins. Returns null when nothing matches.
 */
export function evaluateThresholdColor(
  value: number | null,
  thresholds: Threshold[] | undefined,
): string | null {
  if (value == null || !thresholds || thresholds.length === 0) return null;
  for (const t of thresholds) {
    if (!Number.isFinite(t.value)) continue;
    const matches =
      (t.comparator === "gte" && value >= t.value) ||
      (t.comparator === "gt" && value > t.value) ||
      (t.comparator === "lte" && value <= t.value) ||
      (t.comparator === "lt" && value < t.value) ||
      (t.comparator === "eq" && value === t.value);
    if (matches) return t.color;
  }
  return null;
}

/**
 * Pick black or white text for readable contrast on a background color.
 * Accepts #rgb / #rrggbb hex; falls back to dark text for unknown formats.
 */
export function contrastTextColor(background: string): string {
  const rgb = hexToRgb(background);
  if (!rgb) return "#161616";
  // Relative luminance (sRGB approximation).
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? "#161616" : "#ffffff";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let h = match[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Format a metric value compactly for display in a tile. */
export function formatValue(value: number | null, unit?: string): string {
  if (value == null) return "–";
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1000) {
    text = value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else if (abs >= 1) {
    text = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } else if (abs === 0) {
    text = "0";
  } else {
    text = value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return unit ? `${text} ${unit}` : text;
}
