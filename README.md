# Canvases

A Dynatrace App for building **canvases**: upload a static background image (or
start blank), then place live metric tiles, text, and shapes anywhere on top of
it — much like a Splunk ITSI glass table. Finished canvases run in a read-only
**View mode** that auto-refreshes every 30 seconds.

Built with React + TypeScript and the Strato Design System.

## How it works

- **Saved Canvases (`/`)** — the library lists every canvas you can access
  (Document Service documents of type `metrics-graphic-view`). Create one by
  giving it a name and either uploading a background image or starting with a
  blank canvas.
- **Editor / workshop mode (`/view/:id?mode=edit`)** — the background fills the
  canvas and the **Add a tile** panel lets you place any of four kinds of tile:
  - **Use existing metric** — the metrics explorer lists every metric in the
    environment (discovered via the DQL `metrics` command). Pick a metric, an
    aggregation (avg / sum / min / max / count), an aggregation window
    (5 min / 15 min / 1 hour), and optional dimension filters.
  - **Create via DQL** — write and test a custom DQL query, then choose how to
    display it:
    - **Single value** — the validator requires the query to return exactly one
      value (numeric or text) before the tile can be added.
    - **Table** — the query can return many rows and columns; after testing,
      a column picker lets you choose and reorder which returned fields appear.
      The result renders as an interactive Strato **DataTable** (sortable,
      resizable, scrollable) that can optionally be made transparent to show only
      gridlines and values over the canvas.
  - **Markdown** — a free-form text tile authored in markdown (headings, bold,
    lists, links, etc.), for titles, notes, and legends.
  - **Shape** — a purely decorative shape with no data behind it.

  Metric and DQL tiles also share the value options: color thresholds, label,
  unit, "show shape only", and an optional drill-down hyperlink (to another
  canvas or an external URL).

- **View mode (`/view/:id`)** — the editor chrome disappears and each tile's
  value refreshes every 30 s. Metric tiles run a scalar `timeseries` query
  (`<agg>(metric, scalar:true)`); DQL tiles run the user's query and either read
  its single value (numeric or text) or render its rows as a table. Tiles recolor
  based on their thresholds (numeric values only), and a linked tile opens its
  destination in a new tab. Table tiles keep showing the last good result through
  a transient failed/empty refresh instead of blanking. Click **Edit** to return
  to the workshop (owner only).

### Tile appearance

- **Shapes** — basic geometry (rectangle, rounded rectangle, circle/ellipse,
  triangle, diamond, cloud), outline **icon** shapes (server, application,
  database, user, users, globe, laptop, mobile, document, shield), and
  **line/arrow** shapes with configurable weight, solid/dashed style, and
  arrowheads on either or both ends.
- **Value position** — for the outline icon shapes, the value and label can be
  placed **center / bottom / left / right**. Off-center placements shrink the
  icon into part of the tile and give the value its own reserved space, so it
  stays readable over busy graphics instead of overlapping them.
- **Background** — default surface, a custom fill color, or fully transparent
  (text only, no shape).
- **Rotation** — any angle (with 0 / 90 / 180 / 270 presets).

### Table tiles

A DQL tile set to **Table** renders as a plain surface with an optional title
caption and an embedded, interactive DataTable. Because the table body stays
clickable (sorting, scrolling), table tiles are dragged and selected from their
title/caption strip rather than the body. Columns are whatever you selected in
the column picker (falling back to all returned fields), and cell values are
normalized so numbers sort numerically and arrays/objects show as compact JSON.
A **Transparent background** option removes the surface block and cell fills,
leaving just the gridlines and values over the canvas — the same idea as the
transparent shape/value tiles.

### Canvas interactions

Tiles can be dragged, freely resized, duplicated, and edited. Select multiple
tiles with a marquee or Shift/Ctrl-click to move them as a group; alignment
guides and snapping help line tiles up. You can rename the canvas, change the
background, and zoom (buttons or Ctrl/⌘-scroll).

### Sharing

Each canvas is either **private** (visible only to the owner and explicit share
recipients) or **public** to the whole environment. Owners can manage sharing
from the **Share** dialog, searching for individual users or groups via a people
picker and granting or revoking access. Only the owner can edit or delete a
canvas.

### Storage & data

- Saved canvases are single JSON documents (Document Service, type
  `metrics-graphic-view`); only the owner can edit or delete.
- The background image is embedded **inside** the canvas document as a data URL
  (`backgroundImage`), so it loads for every user who can read the canvas. (A
  legacy `backgroundDocId` pointing at a separate image document is still read as
  a fallback for older canvases; re-saving migrates them.) Uploads are capped at
  8 MB.
- Each tile stores its value source: a metric tile keeps `metricKey`,
  `aggregation`, `lookback`, and `filters`; a DQL tile keeps its custom `dql`
  string plus its `dqlDisplay` (`value` or `table`) and, for tables, the ordered
  `tableColumns`; markdown and shape tiles keep their content/appearance only.
  Tile values are always read live from Grail — no values are persisted.

### Source layout

- `ui/app/types/metricsView.ts` — data model and constants.
- `ui/app/services/documentService.ts` — Document Service CRUD, publishing, and
  image-to-data-URL embedding.
- `ui/app/services/shareService.ts` — direct-share management (users/groups).
- `ui/app/services/metricsQuery.ts` — DQL builders, DQL single-value
  extraction/validation, table field discovery + row normalization, threshold
  evaluation, and value formatting.
- `ui/app/components/` — `GlassCanvas`, `MetricTile`, `TileShapeLayer`,
  `MetricExplorer`, `TileConfigForm`, `ColumnPicker`, `FilterRow`,
  `ThresholdRow`, `CreateViewModal`, `ShareDialog`, `NativeField`, `SelectField`,
  `MultiSelectField`, `ConfigSection`.
- `ui/app/pages/` — `ViewLibrary`, `ViewPage`.

See [`docs/architecture.md`](docs/architecture.md) for a deeper walkthrough.

### Required scopes (`app.config.json`)

- **Data (DQL):** `storage:metrics:read`, `storage:buckets:read`,
  `storage:events:read`, `storage:bizevents:read`, `storage:user.events:read`,
  `storage:user.sessions:read`, `storage:logs:read`, `storage:spans:read`.
- **Documents:** `document:documents:read`, `document:documents:write`,
  `document:documents:delete`.
- **Sharing:** `document:direct-shares:read`, `document:direct-shares:write`,
  `document:direct-shares:delete`.
- **People picker:** `iam:users:read`, `iam:groups:read`.

Other users need `document:documents:read` (and `write` to create their own)
granted via an IAM policy to see shared canvases.

---

## Getting started

This project was bootstrapped with the Dynatrace App Toolkit (`dt-app`).

### Prerequisites

- **Node.js ≥ 20** (required by `dt-app`; the build/dev tooling will not run on
  older versions).
- After cloning, install exactly what the lock file specifies:

  ```
  npm ci
  ```

  All dependencies resolve from the public npm registry, so no custom `.npmrc`
  or registry authentication is needed.

## Available scripts

In the project directory you can run:

### `npm run start`

Runs the app in development mode and opens a browser window automatically. Edit a
component in `ui` and save — the page hot-reloads and errors surface in the
console.

### `npm run build`

Builds the app for production into the `dist` folder, bundled and optimized.

### `npm run lint`

Runs ESLint across the project.

### `npm run deploy`

Builds and deploys the app to the environment specified in `app.config.json`.

### `npm run uninstall`

Uninstalls the app from the environment specified in `app.config.json`.

### `npm run create:function`

Generates a new serverless function for the app.

### `npm run update`

Updates `@dynatrace`-scoped packages to the latest version and applies automatic
migrations.

### `npm run info`

Outputs CLI and environment information.

### `npm run help`

Outputs help for the Dynatrace App Toolkit.

## Learn more

Find more on the Dynatrace platform in
[Dynatrace Developer](https://dt-url.net/developers), and learn React from the
[React documentation](https://react.dev/).
