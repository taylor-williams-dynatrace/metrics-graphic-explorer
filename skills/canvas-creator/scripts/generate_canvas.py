#!/usr/bin/env python3
"""
generate_canvas.py — turn a compact, high-level spec into a valid Canvases
document (a Dynatrace Document Service payload of type `metrics-graphic-view`).

The output is the *content* of the document: a MetricsGraphicView JSON object
(schemaVersion, name, blank-canvas size, and a tiles[] array with deterministic,
non-overlapping grid coordinates). Upload it with dtctl, e.g.:

    python3 generate_canvas.py spec.json -o canvas.json
    dtctl create document -f canvas.json --type metrics-graphic-view

Scope (v1): blank canvas, data tiles only (metric + DQL value/table), thresholds,
labels/units, and auto grid layout. No background images, shapes, or markdown.

Zero dependencies — Python 3.8+ standard library only.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from typing import Any

SCHEMA_VERSION = 1

AGGREGATIONS = {"avg", "sum", "min", "max", "count"}
LOOKBACKS = {"-5m", "-15m", "-1h"}
COMPARATORS = {"gte", "gt", "lte", "lt", "eq"}
DISPLAYS = {"value", "table"}

# Convenience threshold palette (matches the app's presets) so a spec can say
# "color": "critical" instead of a hex string.
COLOR_PRESETS = {
    "healthy": "#2a7453",
    "good": "#2a7453",
    "warning": "#eea53c",
    "degraded": "#d56b1a",
    "critical": "#c62239",
    "info": "#134fc9",
    "neutral": "#5b5c81",
}

# Canvas + layout defaults (a blank canvas sized to define the layout area).
DEFAULT_CANVAS = {"width": 1600, "height": 900, "columns": 3, "margin": 40, "gap": 24}


class SpecError(Exception):
    """A problem with the user-provided spec (reported clearly, non-zero exit)."""


def _rand_id(prefix: str) -> str:
    return f"{prefix}-{random.getrandbits(40):010x}"


def _resolve_color(value: str) -> str:
    key = str(value).strip().lower()
    if key in COLOR_PRESETS:
        return COLOR_PRESETS[key]
    if value.startswith("#") and len(value) in (4, 7):
        return value
    raise SpecError(
        f"threshold color '{value}' is not a hex color (#rgb/#rrggbb) or a preset "
        f"({', '.join(sorted(COLOR_PRESETS))})"
    )


def _build_thresholds(raw: Any, where: str) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SpecError(f"{where}: 'thresholds' must be a list")
    out: list[dict[str, Any]] = []
    for i, t in enumerate(raw):
        if not isinstance(t, dict):
            raise SpecError(f"{where}: threshold #{i + 1} must be an object")
        comp = t.get("comparator", "gte")
        if comp not in COMPARATORS:
            raise SpecError(
                f"{where}: threshold #{i + 1} comparator '{comp}' invalid "
                f"(use {', '.join(sorted(COMPARATORS))})"
            )
        if "value" not in t:
            raise SpecError(f"{where}: threshold #{i + 1} needs a numeric 'value'")
        try:
            val = float(t["value"])
        except (TypeError, ValueError):
            raise SpecError(f"{where}: threshold #{i + 1} 'value' must be numeric")
        out.append(
            {
                "id": _rand_id("th"),
                "comparator": comp,
                "value": val,
                "color": _resolve_color(t.get("color", "neutral")),
            }
        )
    return out


def _build_filters(raw: Any, where: str) -> list[dict[str, str]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SpecError(f"{where}: 'filters' must be a list")
    out = []
    for i, f in enumerate(raw):
        if not isinstance(f, dict) or "dimension" not in f or "value" not in f:
            raise SpecError(
                f"{where}: filter #{i + 1} must have 'dimension' and 'value'"
            )
        out.append({"dimension": str(f["dimension"]), "value": str(f["value"])})
    return out


def _build_tile_core(spec_tile: dict[str, Any], index: int) -> dict[str, Any]:
    """Translate one spec tile into the app's MetricTile recipe (sans geometry)."""
    where = f"tile #{index + 1}"
    kind = spec_tile.get("kind")
    label = spec_tile.get("label")
    unit = spec_tile.get("unit")
    thresholds = _build_thresholds(spec_tile.get("thresholds"), where)

    tile: dict[str, Any] = {"id": _rand_id("tile"), "filters": []}
    if label:
        tile["label"] = str(label)

    if kind == "metric":
        metric_key = spec_tile.get("metricKey")
        if not metric_key:
            raise SpecError(f"{where}: metric tile needs 'metricKey'")
        agg = spec_tile.get("aggregation", "avg")
        if agg not in AGGREGATIONS:
            raise SpecError(
                f"{where}: aggregation '{agg}' invalid "
                f"(use {', '.join(sorted(AGGREGATIONS))})"
            )
        lookback = spec_tile.get("lookback", "-15m")
        if lookback not in LOOKBACKS:
            raise SpecError(
                f"{where}: lookback '{lookback}' invalid "
                f"(use {', '.join(sorted(LOOKBACKS))})"
            )
        tile.update(
            {
                "source": "metric",
                "metricKey": str(metric_key),
                "aggregation": agg,
                "lookback": lookback,
                "filters": _build_filters(spec_tile.get("filters"), where),
            }
        )
        if unit:
            tile["unit"] = str(unit)
        if thresholds:
            tile["thresholds"] = thresholds

    elif kind == "dql":
        dql = spec_tile.get("dql")
        if not dql:
            raise SpecError(f"{where}: dql tile needs a 'dql' query string")
        display = spec_tile.get("display", "value")
        if display not in DISPLAYS:
            raise SpecError(
                f"{where}: display '{display}' invalid (use 'value' or 'table')"
            )
        tile.update({"source": "dql", "dql": str(dql), "dqlDisplay": display})
        if display == "table":
            cols = spec_tile.get("columns")
            if cols is not None:
                if not isinstance(cols, list) or not all(
                    isinstance(c, str) for c in cols
                ):
                    raise SpecError(f"{where}: 'columns' must be a list of strings")
                tile["tableColumns"] = cols
            if spec_tile.get("transparent"):
                tile["transparent"] = True
        else:
            if unit:
                tile["unit"] = str(unit)
            if thresholds:
                tile["thresholds"] = thresholds

    else:
        raise SpecError(
            f"{where}: 'kind' must be 'metric' or 'dql' (got {kind!r}); "
            "v1 supports data tiles only"
        )

    return tile


def _layout(tiles: list[dict[str, Any]], spans: list[int], canvas: dict[str, Any]):
    """Place tiles in a uniform grid; `spans` is each tile's column span (>=1)."""
    width = int(canvas["width"])
    height = int(canvas["height"])
    cols = max(1, int(canvas["columns"]))
    margin = int(canvas["margin"])
    gap = int(canvas["gap"])

    cell_w = (width - 2 * margin - (cols - 1) * gap) / cols

    # First pass: assign each tile a (row, start-col) by wrapping across columns.
    placements = []
    cur_col = 0
    row = 0
    for span in spans:
        span = max(1, min(span, cols))
        if cur_col + span > cols:
            row += 1
            cur_col = 0
        placements.append((row, cur_col, span))
        cur_col += span
    rows = row + 1

    cell_h = (height - 2 * margin - (rows - 1) * gap) / rows

    for tile, (r, c, span) in zip(tiles, placements):
        tile["x"] = round(margin + c * (cell_w + gap))
        tile["y"] = round(margin + r * (cell_h + gap))
        tile["width"] = round(span * cell_w + (span - 1) * gap)
        tile["height"] = round(cell_h)
    return tiles


def build_canvas(spec: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise SpecError("spec must be a JSON object")
    name = spec.get("name")
    if not name:
        raise SpecError("spec needs a 'name'")
    spec_tiles = spec.get("tiles")
    if not isinstance(spec_tiles, list) or not spec_tiles:
        raise SpecError("spec needs a non-empty 'tiles' list")

    canvas = {**DEFAULT_CANVAS, **(spec.get("canvas") or {})}

    tiles: list[dict[str, Any]] = []
    spans: list[int] = []
    for i, st in enumerate(spec_tiles):
        if not isinstance(st, dict):
            raise SpecError(f"tile #{i + 1} must be an object")
        tiles.append(_build_tile_core(st, i))
        spans.append(int(st.get("span", 1)))

    _layout(tiles, spans, canvas)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "name": str(name),
        # Blank canvas: no image, but an explicit size defines the layout area.
        "backgroundImage": None,
        "backgroundDocId": None,
        "backgroundWidth": int(canvas["width"]),
        "backgroundHeight": int(canvas["height"]),
        "tiles": tiles,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "spec",
        nargs="?",
        help="Path to the spec JSON file (reads stdin if omitted)",
    )
    parser.add_argument(
        "-o", "--out", help="Write canvas JSON here (prints to stdout if omitted)"
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Seed the id generator for reproducible output (testing)",
    )
    args = parser.parse_args(argv)

    if args.seed is not None:
        random.seed(args.seed)

    try:
        raw = (
            open(args.spec, encoding="utf-8").read()
            if args.spec
            else sys.stdin.read()
        )
        spec = json.loads(raw)
        canvas = build_canvas(spec)
    except SpecError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as e:
        print(f"error: spec is not valid JSON: {e}", file=sys.stderr)
        return 2
    except OSError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    out = json.dumps(canvas, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(out + "\n")
        print(
            f"wrote {args.out}: {len(canvas['tiles'])} tile(s) on a "
            f"{canvas['backgroundWidth']}x{canvas['backgroundHeight']} canvas",
            file=sys.stderr,
        )
    else:
        print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
