# canvas-creator skill

An [Agent Skill](https://agentskills.io) that lets an AI coding agent (Claude
Code, GitHub Copilot, Cursor, VS Code, Gemini CLI, …) create a **Dynatrace
Canvas** — a document of type `metrics-graphic-view` for the Canvases app — from
a natural-language request, and publish it with **dtctl**.

It owns the canvas JSON schema and a deterministic grid layout (via
`scripts/generate_canvas.py`) and delegates DQL knowledge to the Dynatrace domain
skills and the upload to dtctl.

## Install

Copy this directory into your agent's skills path, e.g.:

```
cp -r skills/canvas-creator ~/.claude/skills/        # Claude Code
cp -r skills/canvas-creator ~/.github/skills/        # GitHub Copilot
cp -r skills/canvas-creator ~/.agents/skills/        # cross-client
```

Pair it with the dtctl skill and the Dynatrace domain skills:

```
dtctl skills install                 # teaches the agent how to run dtctl
npx skills add dynatrace/dynatrace-for-ai   # DQL + observability domain knowledge
```

## Use

Ask your agent something like *"create a Dynatrace canvas showing CPU, memory,
and the top error hosts for production and publish it."* The agent will follow
`SKILL.md`: gather intent, ground the queries with dtctl, write a spec, run the
generator, and upload with `dtctl create document -f canvas.json --type
metrics-graphic-view`.

## Quick manual test

```
python3 scripts/generate_canvas.py examples/spec.example.json -o /tmp/canvas.json
dtctl create document -f /tmp/canvas.json --type metrics-graphic-view
```

## Contents

| Path | Purpose |
| --- | --- |
| `SKILL.md` | Agent instructions + workflow. |
| `reference/canvas-schema.md` | Canvas document/tile contract and spec format. |
| `scripts/generate_canvas.py` | Spec → validated canvas JSON (Python stdlib only). |
| `scripts/canvas_url.py` | Build the canvas deep link; resolves the app id from `app.config.json` (no hard-coded ids). |
| `examples/spec.example.json` | Sample spec. |
| `examples/canvas.example.json` | Generated output for the sample spec. |

Scope is v1 (blank canvas, metric + DQL value/table tiles). The authoritative
data model is `ui/app/types/metricsView.ts` in the Canvases app; extend the
generator and schema reference together as the app grows.
