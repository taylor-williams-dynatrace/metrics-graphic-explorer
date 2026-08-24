---
name: canvas-creator
description: >-
  Create a Dynatrace "Canvas" (a document of type metrics-graphic-view for the
  Canvases app) from a natural-language request, and upload it to a Dynatrace
  environment with dtctl. Use when someone asks to build, generate, or publish a
  Dynatrace canvas / glass-table view with metric or DQL tiles. Handles the
  canvas JSON schema and a deterministic grid layout; delegates DQL knowledge to
  the Dynatrace domain skills and the upload to dtctl.
---

# Canvas creator

Turn a request like *"make me a canvas showing CPU, memory, and the top error
hosts for production"* into a valid **Canvases** document and publish it to
Dynatrace with **dtctl**.

A Canvas is a Document Service document of type `metrics-graphic-view` whose
content is a `MetricsGraphicView` JSON object. This skill owns the **schema** and
**layout**; it produces the JSON with `scripts/generate_canvas.py` and uploads it
with dtctl. Read `reference/canvas-schema.md` for the full contract.

**Scope (v1):** blank canvas, data tiles only — metric tiles and DQL tiles
(single value or table), with thresholds, labels/units, and automatic grid
layout. No background images, shapes, or markdown yet.

## Prerequisites

- **dtctl** installed and authenticated to the target environment
  (`dtctl auth login --context <env> --environment https://<env>.apps.dynatrace.com`,
  or a platform token). Creating documents needs the `document:documents:write`
  scope. Verify with `dtctl doctor`.
- **python3** (standard library only) to run the generator.
- Recommended: the [`dynatrace/dynatrace-for-ai`](https://github.com/Dynatrace/dynatrace-for-ai)
  domain skills for correct DQL and metric-key choices.

## Workflow

1. **Clarify the request.** Determine: the canvas name; each tile's data
   (a platform metric with aggregation/window/filters, or a DQL query); whether a
   DQL tile is a single **value** or a **table** (and which columns); any color
   **thresholds**; and labels/units. Ask only what you genuinely need.

2. **Pick correct queries and metric keys.** Use the Dynatrace domain skills
   and/or dtctl to ground these in the real environment rather than guessing:
   - Discover metrics: `dtctl query "metrics | fields metric.key | limit 200"`.
   - Validate a DQL query actually returns what you expect before adding it:
     `dtctl query "<your DQL>"`. For **value** tiles the query must return a
     single cell (use `scalar:true` or a `summarize` to one value); for **table**
     tiles it should return the rows/columns you want to show.

3. **Write a spec** (see `reference/canvas-schema.md` and
   `examples/spec.example.json`). It's a compact JSON file: a `name`, an optional
   `canvas` size/grid, and a `tiles` list. Save it as `spec.json`.

4. **Generate the canvas JSON:**
   ```
   python3 scripts/generate_canvas.py spec.json -o canvas.json
   ```
   The generator validates enums, assigns tile ids, and lays out tiles in a
   non-overlapping grid on a blank canvas. A non-zero exit means the spec has an
   error — read the message and fix the spec.

5. **Confirm the exact dtctl flags at runtime** (don't assume). dtctl is
   self-documenting:
   ```
   dtctl create document --help
   ```
   Confirm how to pass the document **name** and **type** for a custom document
   on the installed version.

6. **Upload with dtctl.** The documented form for a custom-type document is:
   ```
   dtctl create document -f canvas.json --type metrics-graphic-view
   ```
   Use `dtctl apply -f canvas.json --type metrics-graphic-view` for
   create-or-update. Capture the **document id** dtctl returns on success. Set the
   canvas name via the flag surfaced by `--help` (e.g. `--name "<name>"`) if the
   content name isn't used as the document name.

7. **Build the canvas URL yourself — do not use the URL dtctl prints.** For a
   custom document type, dtctl guesses a link from the *document type* (e.g.
   `.../ui/apps/dynatrace.metrics-graphic-views/metrics-graphic-view/<id>`), which
   is **invalid** ("app id has invalid format"). The Canvases app is a normal
   Dynatrace app, addressed by its **app id** at
   `https://<env-host>/ui/apps/<appId>/view/<docId>`.

   Never hard-code the app id — the app runs in multiple environments. Resolve it
   and build the URL with the helper (it reads the app id from `app.config.json`,
   the value deployed to every environment):
   ```
   python3 scripts/canvas_url.py --env "<env-host>" --id "<docId>"
   ```
   - `<env-host>` is the environment you uploaded to — the same one dtctl targets
     (check `dtctl config`). Accepts `abc12345`, the full host, or a full URL.
   - The app id is read from `app.config.json` automatically when you run inside
     the app repo. If the skill is installed **standalone** (outside the repo),
     pass `--app-config <path-to-app.config.json>`, or `--app-id <id>` resolved
     from the environment (list installed apps with your CLI and match the
     Canvases app), so nothing is hard-coded.

8. **Report back** the canvas name, the document id, the canvas URL from step 7,
   and a one-line summary of the tiles created. Mention that the canvas is
   **private by default**; the owner can share or publish it from the Canvases app
   (or `dtctl share`).

## Calibration (recommended once per environment)

Document Service manifest details (how the document *name* is carried) can vary
by dtctl version. If an upload's title or listing looks wrong, round-trip a
canvas the Canvases app itself created to see the exact manifest shape, then
mirror it:
```
dtctl get documents --filter "type == 'metrics-graphic-view'"
dtctl get document <id> -o yaml > sample-canvas.yaml
```

## Rules & gotchas

- **Schema fidelity is everything.** A malformed tile simply won't render. Only
  use the enums in `reference/canvas-schema.md` (`aggregation`, `lookback`,
  `comparator`, `dqlDisplay`, …). Let the generator produce ids and coordinates —
  never hand-write pixel positions.
- **No live data is stored.** You save queries, not values; the app fetches live.
- **Value vs table.** Value tiles need a single-cell result; table tiles take
  `columns` (ordered) and can be `transparent`.
- **Thresholds** are evaluated first-match-wins, so order them strictest →
  loosest.
- **This is v1.** For backgrounds, shapes, markdown, value-position, or links,
  extend the generator and `reference/canvas-schema.md` together (the app's
  authoritative model is `ui/app/types/metricsView.ts`).

## Files

- `scripts/generate_canvas.py` — spec → validated canvas JSON (zero deps).
- `scripts/canvas_url.py` — build the canvas deep link (resolves the app id from
  `app.config.json`; no hard-coded ids).
- `reference/canvas-schema.md` — the document/tile contract and spec format.
- `examples/spec.example.json` — a sample spec.
- `examples/canvas.example.json` — its generated output.
