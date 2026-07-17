/**
 * Data model for the "Metrics Graphical View" feature.
 *
 * A view is persisted in the Dynatrace Document Service as a JSON document of
 * type {@link VIEW_DOC_TYPE}. The background image is stored as a *separate*
 * binary document of type {@link BG_DOC_TYPE} and referenced by its id, so the
 * (small) view JSON stays well below document size limits.
 */

/** Document Service `type` used to tag and list saved views. */
export const VIEW_DOC_TYPE = "metrics-graphic-view";

/** Document Service `type` used for uploaded background images. */
export const BG_DOC_TYPE = "metrics-graphic-background";

/** Current schema version of the persisted view JSON. */
export const VIEW_SCHEMA_VERSION = 1 as const;

/** Aggregation applied to a metric when computing the tile's single value. */
export type AggregationType = "avg" | "sum" | "min" | "max" | "count";

/** Visual shape of a metric tile. */
export type TileShape =
  | "rectangle"
  | "rounded"
  | "circle"
  | "triangle"
  | "diamond"
  | "cloud"
  | "server"
  | "application"
  | "database"
  | "user"
  | "users"
  | "globe"
  | "laptop"
  | "mobile"
  | "document"
  | "shield";

export const TILE_SHAPES: { value: TileShape; label: string }[] = [
  { value: "rectangle", label: "Rectangle" },
  { value: "rounded", label: "Rounded rectangle" },
  { value: "circle", label: "Circle / ellipse" },
  { value: "triangle", label: "Triangle" },
  { value: "diamond", label: "Diamond" },
  { value: "cloud", label: "Cloud" },
  { value: "server", label: "Server" },
  { value: "application", label: "Application" },
  { value: "database", label: "Database" },
  { value: "user", label: "User" },
  { value: "users", label: "Users" },
  { value: "globe", label: "Globe" },
  { value: "laptop", label: "Laptop" },
  { value: "mobile", label: "Mobile" },
  { value: "document", label: "Document" },
  { value: "shield", label: "Shield" },
];

export const DEFAULT_TILE_SHAPE: TileShape = "rectangle";

/** The original geometric shapes, rendered as solid fills on the canvas. */
const SOLID_TILE_SHAPES = new Set<TileShape>([
  "rectangle",
  "rounded",
  "circle",
  "triangle",
  "diamond",
  "cloud",
]);

/**
 * Whether a shape is drawn as a clean outline icon (threshold-colored lines +
 * subtle fill) rather than a solid fill. True for the icon shapes (server,
 * database, user, globe, …), false for the basic geometric shapes.
 */
export function isOutlineTileShape(shape: TileShape): boolean {
  return !SOLID_TILE_SHAPES.has(shape);
}

export const AGGREGATIONS: { value: AggregationType; label: string }[] = [
  { value: "avg", label: "Average" },
  { value: "sum", label: "Sum" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "count", label: "Count" },
];

/** Lookback window over which a tile's value is aggregated (DQL `from:` value). */
export type LookbackWindow = "-5m" | "-15m" | "-1h";

export const LOOKBACK_OPTIONS: { value: LookbackWindow; label: string }[] = [
  { value: "-5m", label: "Last 5 minutes" },
  { value: "-15m", label: "Last 15 minutes" },
  { value: "-1h", label: "Last 1 hour" },
];

export const DEFAULT_LOOKBACK: LookbackWindow = "-15m";

/** A single dimension filter applied to a metric, e.g. dt.entity.host == "HOST-1". */
export interface TileFilter {
  /** Dimension key, e.g. `dt.entity.host`. */
  dimension: string;
  /** Dimension value to match. */
  value: string;
}

/** Comparison used by a threshold rule. */
export type ThresholdComparator = "gte" | "gt" | "lte" | "lt" | "eq";

export const COMPARATORS: { value: ThresholdComparator; label: string }[] = [
  { value: "gte", label: "≥" },
  { value: "gt", label: ">" },
  { value: "lte", label: "≤" },
  { value: "lt", label: "<" },
  { value: "eq", label: "=" },
];

/**
 * A color threshold for a tile. When the tile's live value satisfies the
 * comparator against `value`, the tile is rendered in `color`. Rules are
 * evaluated in list order and the first match wins.
 */
export interface Threshold {
  id: string;
  comparator: ThresholdComparator;
  value: number;
  /** Any valid CSS color; typically a hex string. */
  color: string;
}

/**
 * Suggested palette for threshold colors, aligned with Dynatrace design tokens
 * (Charts `Status`/`Threshold`/`Apdex` semantic palettes). Stored as hex so the
 * color picker and text-contrast logic keep working.
 * @see https://developer.dynatrace.com/design/design-tokens/Colors/
 */
export const THRESHOLD_COLOR_PRESETS: { color: string; label: string }[] = [
  { color: "#2a7453", label: "Healthy" }, // Charts.Threshold.Good
  { color: "#eea53c", label: "Warning" }, // Charts.Status.Warning
  { color: "#d56b1a", label: "Degraded" }, // Charts.Apdex.Poor
  { color: "#c62239", label: "Critical" }, // Charts.Status.Critical
  { color: "#134fc9", label: "Info" }, // Charts.Categorical.Color01
  { color: "#5b5c81", label: "Neutral" }, // Charts.Status.Neutral
];

/**
 * Optional drill-down link attached to a tile. `view` links to another saved
 * canvas (by document id); `url` links to an arbitrary external URL.
 */
export interface TileLink {
  type: "view" | "url";
  /** For `view`: the target view document id. For `url`: the URL string. */
  target: string;
}

/**
 * What a tile displays: an existing platform metric (with aggregation / window
 * / filters), a user-supplied custom DQL query, or static markdown text.
 */
export type TileSource = "metric" | "dql" | "markdown";

/** A metric value tile positioned on top of the background image. */
export interface MetricTile {
  /** Stable client-generated id. */
  id: string;
  /** Value source (defaults to "metric" for backward compatibility). */
  source?: TileSource;
  /** Metric key, e.g. `dt.host.cpu.usage`. Used when source is "metric". */
  metricKey?: string;
  /** Aggregation used to compute the displayed value (metric source). */
  aggregation?: AggregationType;
  /** Custom DQL query returning a single value. Used when source is "dql". */
  dql?: string;
  /** Markdown text content. Used when source is "markdown". */
  markdown?: string;
  /** Visual shape of the tile (defaults to rectangle). */
  shape?: TileShape;
  /** Clockwise rotation of the tile in degrees (0–359, defaults to 0). */
  rotation?: number;
  /** When true, hide the value/label and show only the shape + threshold color. */
  shapeOnly?: boolean;
  /** When true, render no shape/background — just the text/value over the canvas. */
  transparent?: boolean;
  /** Static background/fill color (hex). Used as the resting fill; a matching
   *  threshold color still overrides it at runtime. */
  backgroundColor?: string;
  /** Lookback window the value is aggregated over (metric source). */
  lookback?: LookbackWindow;
  /** Optional dimension filters narrowing the metric (metric source). */
  filters: TileFilter[];
  /** Optional color thresholds, evaluated in order (first match wins). */
  thresholds?: Threshold[];
  /** Optional user-facing label (defaults to the metric key). */
  label?: string;
  /** Optional unit suffix shown next to the value. */
  unit?: string;
  /** Optional drill-down link opened when the tile is clicked in view mode. */
  link?: TileLink;
  /** X position in pixels, relative to the canvas top-left. */
  x: number;
  /** Y position in pixels, relative to the canvas top-left. */
  y: number;
  /** Tile width in pixels. */
  width: number;
  /** Tile height in pixels. */
  height: number;
}

/** The full persisted view payload (stored as the document content). */
export interface MetricsGraphicView {
  schemaVersion: typeof VIEW_SCHEMA_VERSION;
  /** Display name (mirrors the document metadata name). */
  name: string;
  /**
   * Background image embedded as a data URL (e.g. `data:image/png;base64,…`).
   * Embedding keeps the image inside the (shareable) view document so it loads
   * for every user who can read the view — unlike a separate binary document,
   * which does not round-trip reliably across users.
   */
  backgroundImage?: string | null;
  /**
   * Legacy: id of a separate background-image document. Kept for backward
   * compatibility with views created before images were embedded. New/updated
   * views use {@link backgroundImage} instead.
   */
  backgroundDocId?: string | null;
  /** Natural pixel width of the background image, if known. */
  backgroundWidth?: number;
  /** Natural pixel height of the background image, if known. */
  backgroundHeight?: number;
  /** Metric tiles placed on the canvas. */
  tiles: MetricTile[];
}

/**
 * Maximum accepted background image file size. Base64 inflates by ~33%, so this
 * keeps the embedded view document comfortably under the 50 MB document limit.
 */
export const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;

/** A view together with its document id and optimistic-locking version. */
export interface LoadedView {
  id: string;
  version: string;
  name: string;
  view: MetricsGraphicView;
  /** Whether the current user may edit this view (owner / write access). */
  canEdit: boolean;
}

/** Default tile dimensions when a metric is first added. */
export const DEFAULT_TILE_SIZE = 140;

/** Create an empty view payload. */
export function createEmptyView(name: string): MetricsGraphicView {
  return {
    schemaVersion: VIEW_SCHEMA_VERSION,
    name,
    backgroundDocId: null,
    tiles: [],
  };
}

/** Generate a reasonably unique id for tiles. */
export function generateId(prefix = "tile"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
