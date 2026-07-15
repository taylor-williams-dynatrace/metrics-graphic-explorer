# Architecture

Metrics Canvas Explorer is a Dynatrace App that lets you upload a static
background image and pin live metric values onto specific spots on it. The
picture never changes; the numbers on top of it refresh themselves.

This document explains how the app is structured and how the core "glass
canvas" page builds, renders, and saves a view.

## The big idea

Take a static picture — an architecture diagram, a floor plan, a network map —
and place live Dynatrace metric tiles onto specific points of that picture.
Each tile shows a single current value for a metric, can recolor itself based on
thresholds, and (in display mode) refreshes every 30 seconds. A saved
arrangement of a background plus its tiles is called a **view**.

## How a view is stored

Each saved view is a single JSON document in the Dynatrace **Document Service**,
tagged with the type `metrics-graphic-view`. The JSON holds:

- the view's `name`,
- `backgroundImage` — the background embedded as a data URL (e.g.
  `data:image/png;base64,…`),
- the image's natural pixel dimensions (`backgroundWidth` / `backgroundHeight`),
- and a `tiles` array.

The background image is embedded **directly inside the view document** as a data
URL. This is deliberate: the image then travels with the (shareable) view JSON,
so it loads for every user who can read the view.

> **Why not a separate image document?** Earlier versions stored the image as
> its own binary document and referenced it by `backgroundDocId`. That binary
> did not round-trip reliably across users in practice — non-owners received
> byte-identical-but-undecodable content, so shared canvases showed a broken
> background. Embedding the image in the view JSON (which *does* deliver intact
> cross-user, since tiles render) fixed this class of sharing bugs. `backgroundDocId`
> is still read as a fallback for views created before embedding; re-saving such
> a view (via **Change background**) migrates it to the embedded format. Uploads
> are capped at 8 MB (`MAX_BACKGROUND_BYTES`) so the base64-inflated document
> stays well under the 50 MB document limit.

Each entry in `tiles` is a compact recipe describing *what* to show and
*where* — not the value itself:

| Field | Purpose |
| --- | --- |
| `metricKey` | The Grail metric to query (e.g. `dt.host.cpu.usage`). |
| `aggregation` | `avg` / `sum` / `min` / `max` / `count`. |
| `lookback` | Window the value is aggregated over: `-5m`, `-15m`, or `-1h`. |
| `filters` | Optional dimension filters (e.g. `dt.entity.host == "HOST-1"`). |
| `thresholds` | Ordered color rules (comparator + value + color). |
| `label`, `unit` | Optional display label and unit suffix. |
| `x`, `y`, `width`, `height` | Position and size, in the background image's own pixel space. |

**No metric values are ever saved** — only the instructions for fetching them.
Values are always pulled live from Grail.

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
   background `<img>` fills this box, sourced from the embedded data URL (or, for
   legacy views, from the separate document fetched into an object URL).
4. Each tile is placed on top at its saved `x`/`y`, with its saved `width` and
   `height`.

Because tile coordinates are stored in the **image's own pixel space**, a tile
always lands on the same spot of the picture regardless of screen size or zoom.

**Zoom** applies a single CSS `scale` transform to the inner box, so the
background and all tiles scale together. Dragging and resizing divide pointer
movement by the zoom factor, so positioning stays pixel-accurate at any zoom
level. Zoom is a viewing preference and is intentionally not persisted.

## How a tile gets its number

Each tile (`ui/app/components/MetricTile.tsx`) is a self-contained component
that runs its own DQL query against Grail via the `useDql` hook. The query is
built in [`ui/app/services/metricsQuery.ts`](../ui/app/services/metricsQuery.ts)
and looks roughly like:

```
timeseries val = <aggregation>(`<metricKey>`, scalar:true [, filter:{ ... }]), from:<lookback>
```

`scalar:true` collapses the chosen time window into a single current number,
which is what the tile displays. The tile then checks that number against its
color thresholds (evaluated top to bottom, **first match wins**) and, if a rule
matches, fills itself with that color and flips the text to black or white for
readable contrast.

The metric list in the explorer is discovered with the DQL `metrics` command
(`metrics | dedup metric.key | ...`), and a tile's available dimension keys and
values are discovered with similar exploratory queries.

## Edit mode vs. view mode

The same page (`ui/app/pages/ViewPage.tsx`) runs in two modes:

- **Edit (workshop) mode** — shows the metrics explorer sidebar
  (`ui/app/components/MetricExplorer.tsx`) for browsing and configuring metrics.
  Tiles become draggable and resizable and gain edit / duplicate / delete
  controls. A toolbar lets you rename the view, change the background, and save.
- **View mode** — all editing chrome disappears, tiles re-run their queries
  automatically every 30 seconds, and a single **Edit** button returns to the
  workshop.

## The save flow

While editing, changes only mutate an in-memory copy of the view, and the page
marks itself "unsaved." On **Save** (or **Done**), the whole view object is
serialized back to JSON and written to the Document Service using **optimistic
locking**: the request includes the document's current version number, the
service rejects the write if the document changed in the meantime, and on
success it returns the new version (which the page keeps for the next save).

The persistence loop in one line: **load the JSON recipe → edit the recipe in
place on the canvas → write the recipe back.**

**Sharing / visibility.** On create and save, the view document is published
(`isPrivate: false`), i.e. "visible to anyone in the environment (read-only)",
so every user with `document:documents:read` sees it in their library. Only the
owner (write access) can edit, rename, or delete it; other users open it
read-only, so the **Edit**/**Delete** controls are hidden for them. Because the
background image is embedded in the view JSON, publishing the view is all that's
needed — there is no separate image document to share.

The library landing page (`ui/app/pages/ViewLibrary.tsx`) simply lists every
document of type `metrics-graphic-view`, where you can open, create, rename, or
delete views.

## One-sentence summary

> It's a Dynatrace app where you upload a background image and drag live metric
> tiles onto it; each saved "view" is just a JSON document listing which metrics
> go where, and the tiles query Grail live and recolor themselves based on
> thresholds, refreshing every 30 seconds in display mode.

## Key files

| File | Responsibility |
| --- | --- |
| `ui/app/types/metricsView.ts` | Data model, constants, defaults. |
| `ui/app/services/documentService.ts` | Document Service CRUD, publishing, and image-to-data-URL embedding (plus legacy image fetch). |
| `ui/app/services/metricsQuery.ts` | DQL query builders, threshold evaluation, value formatting. |
| `ui/app/components/GlassCanvas.tsx` | Canvas, background, zoom, tile placement. |
| `ui/app/components/MetricTile.tsx` | Per-tile live query, drag/resize, threshold coloring. |
| `ui/app/components/MetricExplorer.tsx` | Metric browser sidebar. |
| `ui/app/components/TileConfigForm.tsx` | Tile configuration (aggregation, window, filters, thresholds). |
| `ui/app/pages/ViewPage.tsx` | Edit/view modes, save flow, rename, background. |
| `ui/app/pages/ViewLibrary.tsx` | Library of saved views. |
