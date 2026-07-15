# Metrics Canvas Explorer

A Dynatrace App that allows you to create a saved
**Metrics Canvas View**, choose a static background image (or a blank
canvas), then place live metric value tiles anywhere on top of it. Finished
views run in a read-only **View mode** that auto-refreshes every 30 seconds.

It uses React + TypeScript with the Strato Design System.

## How it works

- **Library (`/`)** — lists all saved views (Document Service documents of type
  `metrics-graphic-view`). Create a view by giving it a name and either
  uploading a background image or starting with a blank canvas.
- **Editor / workshop mode (`/view/:id?mode=edit`)** — the background fills the
  canvas; the **Metrics explorer** on the right lists every metric available in
  the environment (discovered via the DQL `metrics` command). Pick a metric,
  choose an aggregation (avg / sum / min / max / count), an aggregation window
  (5 min / 15 min / 1 hour), optional dimension filters, and optional color
  thresholds, then add it as a tile. Tiles can be dragged, freely resized into
  rectangles, duplicated, and edited. You can rename the view, change the
  background, and zoom the canvas (buttons or Ctrl/⌘-scroll).
- **View mode (`/view/:id`)** — the editor chrome disappears and each tile's
  value refreshes every 30 s via a scalar `timeseries` query
  (`<agg>(metric, scalar:true)`). Tiles recolor themselves based on their
  thresholds. Click **Edit** to return to the workshop (owner only).

### Storage & data

- Saved views are single JSON documents (Document Service, type
  `metrics-graphic-view`), published as read-only to the environment so any user
  can view them; only the owner can edit or delete.
- The background image is embedded **inside** the view document as a data URL
  (`backgroundImage`), so it loads for every user who can read the view. (A
  legacy `backgroundDocId` pointing at a separate image document is still read as
  a fallback for older views; re-saving migrates them.) Uploads are capped at
  8 MB.
- Metric values are read live from Grail with DQL — no values are persisted.

### Source layout

- `ui/app/types/metricsView.ts` — data model and constants.
- `ui/app/services/documentService.ts` — Document Service CRUD, publishing, and
  image-to-data-URL embedding.
- `ui/app/services/metricsQuery.ts` — DQL builders, threshold evaluation, and
  value formatting.
- `ui/app/components/` — `GlassCanvas`, `MetricTile`, `MetricExplorer`,
  `TileConfigForm`, `FilterRow`, `ThresholdRow`, `CreateViewModal`, `NativeField`.
- `ui/app/pages/` — `ViewLibrary`, `ViewPage`.

See [`docs/architecture.md`](docs/architecture.md) for a deeper walkthrough.

### Required scopes (`app.config.json`)

`storage:metrics:read`, `storage:buckets:read`,
`document:documents:read`, `document:documents:write`,
`document:documents:delete`.

Other users need `document:documents:read` (and `write` to create their own)
granted via an IAM policy to see shared canvases.

> Note: the old starter pages (`Home.tsx`, `Data.tsx`, `Card.tsx`) are no longer
> routed and can be deleted.

---

## Getting Started with your Dynatrace App

This project was bootstrapped with Dynatrace App Toolkit.

## Available Scripts

In the project directory, you can run:

### `npm run start`

Runs the app in the development mode. A new browser window with your running app will be automatically opened.

Edit a component file in `ui` and save it. The page will reload when you make changes. You may also see any errors in the console.

### `npm run build`

Builds the app for production to the `dist` folder. It correctly bundles your app in production mode and optimizes the build for the best performance.

### `npm run deploy`

Builds the app and deploys it to the specified environment in `app.config.json`.

### `npm run uninstall

Uninstalls the app from the specified environment in `app.config.json`.

### `npm run generate:function`

Generates a new serverless function for your app in the `api` folder.

### `npm run update`

Updates @dynatrace-scoped packages to the latest version and applies automatic migrations.

### `npm run info`

Outputs the CLI and environment information.

### `npm run help`

Outputs help for the Dynatrace App Toolkit.

## Learn more

You can find more information on how to use all the features of the new Dynatrace Platform in [Dynatrace Developer](https://dt-url.net/developers).

To learn React, check out the [React documentation](https://reactjs.org/).
