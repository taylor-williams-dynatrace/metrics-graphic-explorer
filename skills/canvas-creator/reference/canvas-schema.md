# Canvas document schema (reference)

A **Canvas** is a single Dynatrace Document Service document of type
`metrics-graphic-view`. Its *content* is one JSON object (a `MetricsGraphicView`).
The Canvases app reads this content to render the canvas; it stores **instructions,
never live values** — every tile queries Grail at render time.

This file is the contract the generator (`scripts/generate_canvas.py`) targets.
The authoritative source is `ui/app/types/metricsView.ts` in the Canvases app.

## Document envelope

- **type**: `metrics-graphic-view` (required — this is how the app lists canvases).
- **name**: the canvas title (document metadata name).
- **content**: the `MetricsGraphicView` JSON below.

## Opening a canvas (deep link)

The Canvases app is a normal Dynatrace app, addressed by its **app id**, not by
the document type. Build the URL as:

```
https://<env-host>/ui/apps/<appId>/view/<docId>
```

- **appId:** resolved from the app's `app.config.json` (`app.id`) — do **not**
  hard-code it, since the app is deployed to multiple environments. Currently it
  is `my.metrics.graphic.explorer`, but always read it from `app.config.json`.
- **route:** `view` (the app's route is `/view/:id`).
- **docId:** the Document Service id returned on create.
- **env-host:** the environment you uploaded to (per-tenant), e.g.
  `abc12345.apps.dynatrace.com`.

Use `scripts/canvas_url.py` to build this without hard-coding anything:

```
python3 scripts/canvas_url.py --env <env-host> --id <docId>
# → https://<env-host>/ui/apps/<appId>/view/<docId>
```

It reads the app id from `app.config.json` (auto-discovered when run in the repo,
or via `--app-config <path>` / `--app-id <id>` when standalone).

> Do **not** use the URL dtctl prints for a custom document — it derives the app
> id from the document type (`dynatrace.metrics-graphic-views`) and produces an
> invalid link ("app id has invalid format").

## MetricsGraphicView (document content)

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | number | Always `1`. |
| `name` | string | Canvas title (mirror the document name). |
| `backgroundImage` | string \| null | Data URL of a background, or `null` for a blank canvas. |
| `backgroundDocId` | string \| null | Legacy; keep `null`. |
| `backgroundWidth` | number | Canvas width in px (defines the layout area even when blank). |
| `backgroundHeight` | number | Canvas height in px. |
| `tiles` | Tile[] | The tiles placed on the canvas. |

## Tile (recipe)

Common fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique, e.g. `tile-ab12cd34ef`. |
| `source` | `"metric"` \| `"dql"` \| `"markdown"` \| `"shape"` | v1 of this skill emits `metric` and `dql`. |
| `filters` | Filter[] | Always present (may be empty). Metric-only in practice. |
| `label` | string? | Optional display label (or table title). |
| `unit` | string? | Optional unit suffix (value tiles). |
| `thresholds` | Threshold[]? | Color rules; numeric values only. |
| `x`, `y`, `width`, `height` | number | Position/size in canvas pixel space. |

**Metric source** (`source: "metric"`):

| Field | Type | Notes |
| --- | --- | --- |
| `metricKey` | string | e.g. `dt.host.cpu.usage`. |
| `aggregation` | `avg`\|`sum`\|`min`\|`max`\|`count` | |
| `lookback` | `-5m`\|`-15m`\|`-1h` | Aggregation window. |
| `filters` | `{dimension, value}[]` | e.g. `{ "dimension": "dt.entity.host", "value": "HOST-1" }`. |

The app runs: `timeseries val = <agg>(`<metricKey>`, scalar:true [, filter:{…}]), from:<lookback>`.

**DQL source** (`source: "dql"`):

| Field | Type | Notes |
| --- | --- | --- |
| `dql` | string | The query. |
| `dqlDisplay` | `"value"` \| `"table"` | Single value or a table. |
| `tableColumns` | string[]? | Table only: ordered result fields to show as columns. Omit to show all. |
| `transparent` | boolean? | Table only: show just gridlines + values (no surface block). |

- **value**: the query must return exactly one value (numeric or text). Prefer
  `scalar:true` or a `summarize` that yields a single cell.
- **table**: the query may return many rows/columns; pick columns via `tableColumns`.

**Threshold**: `{ id, comparator, value, color }`
- `comparator`: `gte` | `gt` | `lte` | `lt` | `eq`
- `color`: hex (`#rrggbb`). Preset hexes: healthy `#2a7453`, warning `#eea53c`,
  degraded `#d56b1a`, critical `#c62239`, info `#134fc9`, neutral `#5b5c81`.
- Evaluated top to bottom; **first match wins**. Order strictest → loosest.

## Spec format (input to the generator)

You write a compact spec; the generator produces the document content above,
including all `id`s and grid coordinates. See `examples/spec.example.json`.

```jsonc
{
  "name": "Production Host Health",
  "canvas": { "width": 1600, "height": 900, "columns": 3, "margin": 40, "gap": 24 },
  "tiles": [
    { "kind": "metric", "metricKey": "dt.host.cpu.usage", "aggregation": "avg",
      "lookback": "-15m", "label": "CPU", "unit": "%",
      "thresholds": [ { "comparator": "gte", "value": 90, "color": "critical" } ] },
    { "kind": "dql", "display": "value",
      "dql": "timeseries v = avg(dt.host.memory.usage, scalar:true)",
      "label": "Memory", "unit": "%" },
    { "kind": "dql", "display": "table",
      "dql": "fetch logs | filter loglevel==\"ERROR\" | summarize c=count(), by:{host} | sort c desc | limit 20",
      "columns": ["host", "c"], "label": "Top error hosts", "span": 2 }
  ]
}
```

Spec tile fields: `kind` (`metric`|`dql`), `metricKey`, `aggregation`, `lookback`,
`filters`, `dql`, `display` (`value`|`table`), `columns`, `transparent`, `label`,
`unit`, `thresholds` (`color` accepts a preset name or hex), and `span` (how many
grid columns the tile occupies, default 1 — use 2 for tables). `canvas` is
optional (defaults: 1600×900, 3 columns).
