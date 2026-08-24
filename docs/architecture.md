# Architecture

**Canvases** is a Dynatrace App for building fully customizable and fluid views 
within Dynatrace: you upload a static background image (or start blank) and pin 
live, self-refreshing tiles onto specific spots of it. The background never changes; 
the tiles on top query Grail and update themselves.

This document explains how the app is structured and, in particular, how a
canvas you assemble by hand in edit mode ends up as a single static JSON
document stored in Dynatrace.

## The big idea

Take a static picture — an architecture diagram, a floor plan, a network map —
and place live Dynatrace tiles onto exact points of that picture. A saved
arrangement of a background plus its tiles is called a **canvas** (stored,
historically, under the document type `metrics-graphic-view`).

A tile can be one of four kinds:

- **Metric** — a single current value for a platform metric, with aggregation,
  window, and dimension filters.
- **DQL** — a custom Dynatrace Query Language query, displayed either as a
  **single value** or as an interactive **table**.
- **Markdown** — static rich text (titles, notes, legends).
- **Shape** — a purely decorative shape with no data behind it.

## How a canvas is stored

Each saved canvas is a **single JSON document** in the Dynatrace **Document
Service**, tagged with the type `metrics-graphic-view`. The JSON holds:

- the canvas `name`,
- `backgroundImage` — the background embedded as a data URL (e.g.
  `data:image/png;base64,…`),
- the image's natural pixel dimensions (`backgroundWidth` / `backgroundHeight`),
- and a `tiles` array.

The background image is embedded **directly inside the canvas document** as a
data URL. This is deliberate: the image then travels with the (shareable) JSON,
so it loads for every user who can read the canvas.

> **Why not a separate image document?** Earlier versions stored the image as its
> own binary document and referenced it by `backgroundDocId`. That binary did not
> round-trip reliably across users — non-owners received byte-identical-but-
> undecodable content, so shared canvases showed a broken background. Embedding
> the image in the JSON fixed this class of sharing bugs. `backgroundDocId` is
> still read as a fallback for canvases created before embedding; re-saving such a
> canvas (via **Change background**) migrates it. Uploads are capped at 8 MB
> (`MAX_BACKGROUND_BYTES`) so the base64-inflated document stays well under the
> 50 MB document limit.

Each entry in `tiles` is a compact **recipe** describing *what* to show, *how*,
and *where* — never the value itself:

| Field | Purpose |
| --- | --- |
| `source` | `metric`, `dql`, `markdown`, or `shape`. |
| `metricKey`, `aggregation`, `lookback`, `filters` | Metric source: what to query and how to aggregate it. |
| `dql` | DQL source: the custom query string. |
| `dqlDisplay` | DQL source: `value` (single value) or `table`. |
| `tableColumns` | DQL table: the ordered result fields to show as columns. |
| `markdown` | Markdown source: the text content. |
| `shape` | Tile shape (rectangle, circle, server, globe, line, …). |
| `shapeOnly`, `transparent`, `backgroundColor` | Fill/appearance options. |
| `valuePosition` | Where the value/label sit for outline icon shapes. |
| `rotation`, `lineWeight`, `lineDashed`, `lineArrows` | Shape/line styling. |
| `thresholds` | Ordered color rules (comparator + value + color). |
| `label`, `unit` | Optional display label/title and unit suffix. |
| `link` | Optional drill-down (another canvas or a URL). |
| `x`, `y`, `width`, `height` | Position and size, in the background image's own pixel space. |

**No live values are ever saved** — only the instructions for fetching them.
Values are always pulled fresh from Grail at render time.

The data model lives in [`ui/app/types/metricsView.ts`](../ui/app/types/metricsView.ts),
and all reading/writing of documents is wrapped in
[`ui/app/services/documentService.ts`](../ui/app/services/documentService.ts).

## How the canvas page is built

The canvas (`ui/app/components/GlassCanvas.tsx`) is a layered,
absolutely-positioned layout:

1. A scrolling outer container.
2. A "sizer" div whose size equals the canvas size multiplied by the current
   zoom, so scrollbars reflect the zoomed dimensions.
3. An inner canvas box drawn at the background image's natural size. The
   background `<img>` fills this box from the embedded data URL (or, for legacy
   canvases, from the separate document fetched into an object URL).
4. Each tile is placed on top at its saved `x`/`y`, with its saved `width`/`height`.

Because tile coordinates are stored in the **image's own pixel space**, a tile
always lands on the same spot regardless of screen size or zoom. **Zoom** applies
a single CSS `scale` transform to the inner box, so background and tiles scale
together; drag/resize divide pointer movement by the zoom factor to stay
pixel-accurate. Zoom is a viewing preference and is intentionally not persisted.

## How a tile gets its data

Each tile (`ui/app/components/MetricTile.tsx`) is self-contained and runs its own
query against Grail via the `useDql` hook, refetching on an interval. Queries are
built in [`ui/app/services/metricsQuery.ts`](../ui/app/services/metricsQuery.ts).

- **Metric tiles** run a scalar timeseries query:
  ```
  timeseries val = <aggregation>(`<metricKey>`, scalar:true [, filter:{ ... }]), from:<lookback>
  ```
  `scalar:true` collapses the window into one current number.
- **DQL value tiles** run the user's query and read a single cell (numeric or
  text).
- **DQL table tiles** run the user's query, discover the returned fields, and
  build normalized rows for a Strato **DataTable** (sortable, resizable,
  scrollable). Cell values are normalized so numbers sort numerically and
  arrays/objects render as compact JSON. To stay robust across refreshes, a table
  keeps its **last good result** and keeps showing it if a given refresh is
  in-flight, errors, or transiently returns no rows; it only clears when a
  refresh settles successfully with zero rows.

A numeric value is then checked against the tile's color thresholds (evaluated
top to bottom, **first match wins**); a matching rule fills the tile with that
color and flips the text to black or white for readable contrast.

The metric list in the explorer is discovered with the DQL `metrics` command
(`metrics | dedup metric.key | ...`); a tile's dimension keys/values are
discovered with similar exploratory queries.

## Appearance & interactions

- **Shapes** — basic geometry, outline **icon** shapes (server, database, globe,
  user…), and line/arrow shapes; rendered by `ui/app/components/TileShapeLayer.tsx`.
- **Value position** — for outline icons, the value/label can sit center, bottom,
  left, or right; off-center placements shrink the icon into part of the tile so
  the value has its own reserved, readable space.
- **Transparency** — shapes, value tiles, and table tiles can be made
  transparent so only the lines/values (or table gridlines/values) show over the
  canvas.
- **Editing** — tiles drag, resize, duplicate, and delete; multi-select via
  marquee or Shift/Ctrl-click; alignment guides and equal-spacing snapping help
  line tiles up. (Table tiles drag/select from their title strip so the table
  body stays interactive.)

## Edit mode vs. view mode

The same page (`ui/app/pages/ViewPage.tsx`) runs in two modes:

- **Edit (workshop) mode** — shows the metrics explorer sidebar
  (`ui/app/components/MetricExplorer.tsx`) and the tile config form
  (`ui/app/components/TileConfigForm.tsx`). Tiles are draggable/resizable with
  edit / duplicate / delete controls, and a toolbar lets you rename the canvas,
  change the background, share, and save.
- **View mode** — all editing chrome disappears, tiles re-run their queries every
  30 seconds, and a single **Edit** button returns to the workshop (owner only).

## From a hand-built canvas to a static document

This is the heart of the app. In edit mode you are manipulating an **in-memory
object**, not the stored document. Every action — dropping a tile, dragging it,
resizing it, picking a metric or writing DQL, choosing columns, setting
thresholds — mutates that in-memory canvas object and marks the page "unsaved".
Tiles run live queries the whole time so you can see real values as you arrange
them, but those values are just display; they are never written down.

On **Save** (or **Done**), the entire in-memory canvas object is serialized to
JSON and written to the Document Service:

1. The background image (already a data URL) and every tile recipe are
   `JSON.stringify`-ed into one blob.
2. The write uses **optimistic locking**: it sends the document's current version
   number; the service rejects the write if the document changed in the meantime,
   and on success returns a new version the page keeps for the next save
   (`createView` / `updateView` in `documentService.ts`).

The result is a single, self-contained, **static** JSON file in Dynatrace: it
captures the picture and the layout of instructions, but none of the live data.
Opening that document later — by you or anyone you shared it with — rehydrates
the in-memory object, redraws the background and tiles at their saved
coordinates, and each tile starts querying Grail again. So the file is static,
but what it renders is always live.

The persistence loop in one line: **load the JSON recipe → edit the recipe live
on the canvas → serialize the recipe back to one document.**

## Sharing & visibility

Visibility is managed explicitly (never silently changed by a save), via the
**Share** dialog (`ui/app/components/ShareDialog.tsx`,
`ui/app/services/shareService.ts`):

- A canvas is **private** by default (owner + explicit recipients only) or can be
  made **public** (read-only to everyone in the environment).
- Owners can grant/revoke access to specific **users or groups** through a people
  picker backed by `iam:users:read` / `iam:groups:read`, using the Document
  Service **direct-shares** APIs.
- Access is derived from document metadata: write access → can edit; delete
  access (owner) → can manage sharing. Non-owners open a canvas read-only, so
  Edit/Delete/Share controls are hidden for them.

Because the background image is embedded in the JSON, sharing the canvas is all
that's needed — there is no separate image document to share.

The library landing page (`ui/app/pages/ViewLibrary.tsx`, **Saved Canvases**)
lists every document of type `metrics-graphic-view` you can access, where you can
open, create, rename, or delete canvases.

## One-sentence summary

> Canvases is a Dynatrace app where you upload a background image and drag live
> metric/DQL/text/shape tiles onto it; each saved canvas is a single JSON
> document listing which tiles go where, and the tiles query Grail live, recolor
> themselves on thresholds, and refresh every 30 seconds in view mode.

## Key files

| File | Responsibility |
| --- | --- |
| `ui/app/types/metricsView.ts` | Data model, constants, defaults. |
| `ui/app/services/documentService.ts` | Document Service CRUD, optimistic locking, and image-to-data-URL embedding (plus legacy image fetch). |
| `ui/app/services/shareService.ts` | Public/private toggle and direct-share management (users/groups). |
| `ui/app/services/metricsQuery.ts` | DQL builders, single-value + table extraction/validation, row normalization, threshold evaluation, value formatting. |
| `ui/app/components/GlassCanvas.tsx` | Canvas, background, zoom, tile placement, selection/snapping. |
| `ui/app/components/MetricTile.tsx` | Per-tile live query, value/table/markdown/shape rendering, drag/resize, threshold coloring. |
| `ui/app/components/TileShapeLayer.tsx` | Shape/outline/line rendering and the shape-picker glyphs. |
| `ui/app/components/TileConfigForm.tsx` | Tile configuration (source, DQL display, columns, appearance, thresholds, link). |
| `ui/app/components/ColumnPicker.tsx` | Choose/reorder columns for DQL table tiles. |
| `ui/app/components/MetricExplorer.tsx` | Metric browser sidebar. |
| `ui/app/components/ShareDialog.tsx` | Public/private and per-user/group sharing UI. |
| `ui/app/pages/ViewPage.tsx` | Edit/view modes, save flow, rename, background. |
| `ui/app/pages/ViewLibrary.tsx` | Library of saved canvases. |
