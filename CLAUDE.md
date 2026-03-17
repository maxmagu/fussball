# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Fussball Commander — a browser-based turn-based football/soccer game. Pure client-side HTML/CSS/JS with no build step, no dependencies, no package manager.

## Project Structure

- `index.html` — Main game (turn-based mode). Single-file app: all CSS in `<style>`, all JS in `<script>`. ~1025 lines.
- `index-alt.html` — Alternative version (real-time/continuous mode with speed slider instead of plan/play phases).
- `stadium-sound.mp3` — Ambient audio, auto-plays on first click.

## Development

Open `index.html` directly in a browser or serve with any static server (`python3 -m http.server`). No build, lint, or test commands exist.

## Deployment

Static site served by nginx at `fsbl.maxapps.live`. Deploy scripts are in `../vps/deploy/fussball2/`.

## Architecture (index.html — turn-based)

The game loop alternates between two phases:

1. **Plan phase** — Player (team A / blue) drags to set move orders. Left-drag = move/dribble, right-drag from ball carrier = pass/shoot. AI plans team B moves when Play is pressed.
2. **Play phase** — Orders execute simultaneously for `PLAY_DURATION` frames (2s). Round ends when all players arrive and ball stops, or timer expires.

Key globals: `teamA`/`teamB` (arrays of 11 player objects), `ball`, `possession` (player holding ball or null), `phase` ('plan'|'play'), `round`.

Player objects carry per-round state: `tx/ty` (move target), `hasOrder`, `plannedPass`, `passFirst`, `tackleTarget`. These reset each round in `endRound()`.

Formation is 4-4-2 defined in `formationBase` as normalized [0-1] coordinates, mirrored for team B.

The AI logic lives in `planAI()` — team B chases the ball carrier, dribbles toward goal, and shoots when close. No separate AI module.

Canvas rendering uses Y-sort for pseudo-depth. All drawing happens in `draw()` via the 2D canvas API.
