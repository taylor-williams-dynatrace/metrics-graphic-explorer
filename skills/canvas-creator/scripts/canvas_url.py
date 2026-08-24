#!/usr/bin/env python3
"""
canvas_url.py — build the correct deep link to open a Canvas in a Dynatrace
environment, without hard-coding the app id.

The Canvases app is addressed by its **app id** (from app.config.json), not by
the document type. dtctl's auto-printed URL for a custom document is wrong
(it guesses `dynatrace.<type>s`), so build the URL here instead:

    https://<env-host>/ui/apps/<appId>/view/<docId>

The app id is resolved from app.config.json (the value that gets deployed to
every environment), so it stays correct across tenants and if the id ever
changes. Only the environment host differs per tenant, and you pass that in.

Examples:
    python3 canvas_url.py --env abc12345 --id 081cc8fc-...
    python3 canvas_url.py --env https://abc12345.apps.dynatrace.com --id <docId>
    python3 canvas_url.py --env abc12345 --id <docId> --app-id my.metrics.graphic.explorer
    python3 canvas_url.py --env abc12345 --id <docId> --app-config /path/to/app.config.json

Zero dependencies — Python 3.8+ standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# The app's internal route for a single canvas (App.tsx: <Route path="/view/:id">).
CANVAS_ROUTE = "view"


def _find_app_config(explicit: str | None) -> str | None:
    """Locate app.config.json: explicit path, then walk up from CWD and from
    this script's directory (covers running inside the repo)."""
    if explicit:
        return explicit if os.path.isfile(explicit) else None
    starts = [os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
    seen = set()
    for start in starts:
        d = start
        while d and d not in seen:
            seen.add(d)
            candidate = os.path.join(d, "app.config.json")
            if os.path.isfile(candidate):
                return candidate
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
    return None


def _app_id_from_config(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        cfg = json.load(fh)
    app_id = (cfg.get("app") or {}).get("id")
    if not app_id:
        raise ValueError(f"no app.id found in {path}")
    return str(app_id)


def _host(env: str) -> str:
    """Normalize an env argument to a bare host.
    Accepts 'abc12345', 'abc12345.apps.dynatrace.com', or a full URL."""
    e = env.strip().rstrip("/")
    if e.startswith("http://") or e.startswith("https://"):
        e = e.split("://", 1)[1]
    e = e.split("/", 1)[0]  # drop any path
    if "." not in e:
        e = f"{e}.apps.dynatrace.com"
    return e


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--id", required=True, help="Canvas document id")
    p.add_argument(
        "--env",
        required=True,
        help="Environment host or URL (e.g. abc12345 or https://abc12345.apps.dynatrace.com)",
    )
    p.add_argument("--app-id", help="Override the app id instead of reading app.config.json")
    p.add_argument("--app-config", help="Path to app.config.json (else auto-discovered)")
    args = p.parse_args(argv)

    app_id = args.app_id
    if not app_id:
        cfg_path = _find_app_config(args.app_config)
        if not cfg_path:
            print(
                "error: could not find app.config.json to resolve the app id.\n"
                "  Run this from the app repo, pass --app-config <path>, or pass\n"
                "  --app-id <id> (resolve it from the environment with your CLI, e.g.\n"
                "  by listing installed apps and matching the Canvases app).",
                file=sys.stderr,
            )
            return 2
        try:
            app_id = _app_id_from_config(cfg_path)
        except (OSError, ValueError, json.JSONDecodeError) as e:
            print(f"error: {e}", file=sys.stderr)
            return 2

    url = f"https://{_host(args.env)}/ui/apps/{app_id}/{CANVAS_ROUTE}/{args.id}"
    print(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
