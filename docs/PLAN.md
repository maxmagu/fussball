# Fussball Commander — Feature Development Plan

**Status**: In progress — updated 2026-03-23
**Scope**: 8 phases (0-7), iterative over days/weeks

---

## Vision

Two core ideas in one game:

1. **Chess meets Soccer** — A turn-based tactical mode. Plan your moves, watch them execute simultaneously. Strategic depth through discrete decisions, like chess with 11 pieces per side.
2. **Live-action coach simulator** — A real-time mode where you're the coach. Give live commands — drag, click, or speak — as the match unfolds.

Both modes share one engine. The project is also a tech experiment and AI playground: hand-coded tactics, natural-language rules translated to code at runtime, and a neural net trained via self-play all compete on the same pitch.

This is a feasibility study / demo. Ambition over polish. Explore what's possible.

---

## Decisions Log

All decisions made during the grill-me session on 2026-03-20.

| # | Question | Decision |
|---|----------|----------|
| 1 | Stay pure client-side? | No. Add minimal server for LLM + rule persistence + training. Game engine stays client-side. |
| 2 | NL→JS translation client or server? | Server-side (`POST /api/translate-rule`). No API keys in client. |
| 3 | Neural net ambition level? | Real neural net (option b). Not just tuned weights. |
| 4 | Unify codebases or keep separate? | Unify. Single codebase, runtime `gameMode` toggle. |
| 5 | Real-time input style? | Drag-based (same as turn-based), executes immediately. Speed slider controls pace. |
| 6 | Voice command scope? | Hybrid: fast local keyword dict + LLM fallback for complex commands. |
| 7 | Voice in real-time mode? | Yes. Team-wide tactics ("press!") AND individual ("pass to number 7"). |
| 8 | How NL rules work under the hood? | Structured rule modifiers (JSON) consumed by `scoreActions()`. Not raw eval'd JS. |
| 9 | Rules for own team? | Auto-plan un-ordered team A players using your rules. Optional full-auto for AI vs AI. |
| 10 | Neural net I/O? | State → raw player positions + pass/shoot decisions. Bypasses `scoreActions()` entirely. Maximum creative freedom for novel tactics. |
| 11 | Headless simulation? | Extract engine into pure JS module. Canvas rendering is a separate layer. |
| 12 | Training approach? | TBD — will experiment. Likely imitation learning → RL. |
| 13 | Where does training run? | Local machine (more powerful than VPS). |
| 14 | Neural net framework? | TensorFlow.js. Train in Node.js, inference in browser. |
| 15 | AI mode switcher UI? | Toggle panel next to existing debug buttons. |
| 16 | Rule persistence? | JSON files on server. Manual review before git commit. |
| 17 | Build order? | Phase 0→1→2→3→4→5→6→7. Phase 1 (stats+rules) inserted before mode toggle since the engine needs these mechanics. |
| 18 | Module system? | TypeScript + Vite. ES modules with TS compilation and HMR dev server. |
| 19 | Server infra? | Node.js on existing Hetzner VPS behind nginx. |
| 20 | LLM provider? | Provider-agnostic API design. Pick provider at runtime. |
| 21 | Voice player references? | Both jersey numbers ("number 7") and positions ("the striker"). |
| 22 | Headless simulation fidelity? | Frame-accurate (identical physics to browser). No simplified/analytical resolution. Optimize with tight loops, not by simplifying the sim. |
| 23 | Neural net within-round sequencing? | Single decision per round for v1. Pass = immediate (passFirst). Revisit later: higher-frequency re-evaluation during play phase. |
| 24 | Rule modifier conditions? | Expand schema: score conditions, spatial conditions, proximity ("3 closest"), specific player targeting. |
| 25 | Voice command lifetime in real-time? | Tactical shifts ("press!") are sticky until changed. Individual orders ("pass to 7") are one-shot, consumed immediately. |
| 26 | Explainability layer? | Per-player decision log for rule-based modes (which rules fired, how they modified scores). Neural net stays black-box by design. |
| 27 | Chess identity features? | Add later: move radius circles, threat zones, game notation/replay, undo. Needs design pass. |
| 28 | Player stat granularity? | Position-based profiles (6-8 stats). Defenders slow+strong, forwards fast+weak. No named players yet. |
| 29 | Stamina recovery timing? | Depletes/recovers during play phase only. No free recovery between rounds. Creates genuine sprint-or-conserve decisions. |
| 30 | Pass/shoot accuracy model? | Base cone from stat + widened by pressure (nearby opponents) + widened by fatigue. All three stack. |
| 31 | Offside strictness? | Full FIFA (checked at moment of pass, second-to-last defender). Toggleable on/off. |
| 32 | Throw-ins? | Full throw-in planning in turn-based (pick target like a pass). Auto-throw in real-time. |
| 33 | Corners? | Full set-piece planning in turn-based (position attackers, pick delivery). Auto-corner in real-time. |
| 34 | Fouls? | Simple fouls — aggressive tackles have % chance of foul → free kick. Skip cards for v1. |
| 35 | Penalties? | Mini-game: shooter picks corner, GK picks dive direction (blind commit). AI handles both sides in real-time. |
| 36 | Other rules? | Goal kicks: yes. GK hand restriction: skip. Substitutions: yes (3 per half, tactical with stamina). Half-time: yes (pause, switch sides, stats). Ball out of play: yes. Stoppage time: skip. |
| 37 | 90-min clock vs round count? | Round count is the real end condition (e.g., 30 rounds per half). Clock is cosmetic/atmospheric, displayed as "23:45 — 1st Half". |
| 38 | Training time tolerance? | Overnight runs OK. Imitation learning ~1hr, RL self-play ~19hrs for 100K games. |
| 39 | Neural net and set pieces? | Net handles open play only. Rule-based AI handles set pieces. Keeps training focused on where novel tactics emerge. |
| 40 | Set-piece planning in turn-based? | Sequential for high-stakes (corners, free kicks near goal): defense positions → revealed → attack plans. Blind simultaneous for low-stakes (throw-ins, goal kicks). Penalties: blind commit mini-game. **Revisit after playtesting.** |
| 41 | Undo orders? | Both: right-click player to clear their order, "Clear all" button to reset round. |
| 42 | Pass targeting? | Location-based (current). No snap-to-player. Through-balls and space-passes are core tactics. |
| 43 | Multi-select? | No for now. Rule system + voice commands handle group orders. Revisit if planning feels too slow. |
| 44 | Post-round replay? | Replay button: re-runs last round at half speed from stored snapshot. Enables future game notation. |
| 45 | Extract sprites? | Yes. Move ~500 lines of pixel array data from `makeSprites()` to `sprites.js` during Phase 0. Keeps renderer clean and makes future visual upgrades a data-file swap. |
| 46 | Futsal vs outdoor MVP? | Start with 11v11 full-sized field but futsal rules (walls, no offside, no corners/throw-ins). Make rules configurable from day one so outdoor rules are a toggle, not a rewrite. |
| 47 | TypeScript + Vite? | Yes, at Phase 0. TS for type safety on complex state/configs. Vite for dev server + HMR + TS compilation. React: evaluate at Phase 3-4 for UI chrome only. Canvas rendering stays vanilla TS. |
| 48 | LLM AI mode server tech? | Vite dev proxy for dev, standalone for prod. `npm run dev` and everything works. |
| 49 | LLM coordinate system? | Normalized 0-1. LLM reasons better with unit ranges than pixel values. Convert on the boundary. |
| 50 | LLM conversation history? | Stateless. Fresh call each round. Game state encodes everything needed. |
| 51 | LLM error handling? | Fall back to heuristic with visible warning. Per-player fallback for partial responses. |
| 52 | LLM timing? | Fire on every transition to plan phase. Play button disabled until response. LLM plans in parallel with human planning. |
| 53 | LLM structured output? | Prompt-only JSON (no tool use). Fallback to heuristic on parse failure. |
| 54 | LLM model selection? | Configurable via `LLM_MODEL` env var. Default `claude-sonnet-4-6`. |

---

## User Stories

1. **Mode toggle** — Toggle between live mode and pause-to-plan-then-simulate mode
2. **Voice commands** — Give commands to my team by voice
3. **AI rules as markdown** — Write AI strategy as markdown, translated into code
4. **Live NL rules** — Add natural language rules during a game, live-translated to JS modifiers
5. **Rule persistence** — Save handwritten rules to server for repository inclusion
6. **Neural net AI** — Pre-train AI via self-play (AlphaGo-style), use during planning phase
7. **AI mode switcher** — Toggle between baseline, custom rules, neural net, hybrid
8. **Team A rules** — Write English rules for own team, select from menu (e.g., "defense move forward")
9. **AI vs AI spectator** — Watch AI play against AI in both continuous and stop-to-plan modes, with independent AI mode selection per team
10. **Player stats** — Position-based stat profiles: speed, stamina, pass accuracy, tackling, shot power
11. **Stamina system** — Sprinting depletes max speed, recovers during play (not between rounds). Tactical cost to sprinting.
12. **Accuracy physics** — Passes/shots deviate from intended direction. Base cone from accuracy stat, widened by pressure + fatigue.
13. **Configurable soccer rules** — MVP: futsal rules (walls, fouls, free kicks, penalties, kickoffs, halves, subs). Later: outdoor rules (offside, throw-ins, corners, goal kicks, ball out of play). Toggled via rules config object.
14. **UX: Contextual tooltips** — Show available actions when hovering players during plan phase
15. **UX: Undo orders** — Right-click to clear a player's order, "Clear all" button to reset round
16. **UX: Order counter** — Show "7/11 ordered" + pulsing ring on un-ordered players
17. **UX: Pass danger viz** — Accuracy cone shown during pass/shot planning, informed by stats + pressure
18. **UX: Remove click-to-move** — Move orders are drag-only. Click reserved for select + tackle.
19. **UX: Round replay** — Replay button re-runs last round at half speed from stored snapshot
20. **LLM AI mode** — LLM steers the opponent team. API call fires during plan phase (parallel with human planning). Prompt loaded from markdown file. Response includes per-player positions, actions, and reasoning.

---

## Progress

| Phase | Name | Status |
|-------|------|--------|
| 0 | Engine Extraction | ✅ Done. UX improvements & headless validation pending. |
| 0.5 | LLM AI Mode (Story 20) | Not started |
| 1 | Player Stats, Accuracy & Soccer Rules | Not started |
| 2 | Game Mode Toggle (turn-based ↔ real-time) | Not started |
| 3 | Rule Modifier System | Not started |
| 4 | Server API + NL Translation | Not started |
| 5 | Voice Commands | Not started |
| 6 | Neural Net Training + Inference | Not started |
| 7 | AI Mode Switcher | Partial — dropdown UI + AIMode type done, implementations depend on Phases 3 & 6 |

---

## Phase 0: Engine Extraction (Foundation) ✅ DONE

**Goal**: Split monolith into typed modules. Set up Vite + TypeScript. Everything still works identically in the browser. Headless mode becomes possible.

**Completed 2026-03-23**: Monolithic `index.html` extracted into `src/` modules (`engine.ts`, `ai.ts`, `renderer.ts`, `sprites.ts`, `ui.ts`, `types.ts`, `main.ts`). Vite + TypeScript build working. Game plays identically in browser.

**Partially done**: AI mode switcher UI added (dropdown next to debug buttons) with `AIMode` type (`heuristic | rules | neural | hybrid`). Heuristic active, others stubbed as "coming soon". This was pulled forward from Phase 7 since the UI is trivial and sets up the architecture for future modes.

**Not yet done**: UX improvements bundled with Phase 0 (tooltips, undo, order counter, pass danger viz, drag-only moves, round replay). Headless mode validation.

### Setup

```bash
npm init -y
npm install -D vite typescript
# tsconfig.json: strict mode, ES2022 target, module: ESNext
# vite.config.ts: minimal — just serves index.html + TS
```

### Files to create

```
src/
  engine.ts      — Game state, physics, formations, collision, ball, possession logic
  ai.ts          — AI planning (scoreActions, planAI, moods)
  renderer.ts    — Canvas drawing, debug overlays, AI plan visualization
  sprites.ts     — Pixel sprite data (24x24 grids, animation frames)
  ui.ts          — DOM event handlers, input (drag, keyboard), UI elements
  types.ts       — Shared types: GameState, Player, Ball, RulesConfig, SetPiece, etc.
  main.ts        — Entry point: imports ui.ts which wires everything together
index.html       — Shell: <script type="module" src="/src/main.ts">
vite.config.ts
tsconfig.json
package.json
```

### Extraction rules

- `engine.ts` exports: `createGameState()`, `tick(state)`, `resetAfterGoal(state, side)`, `endRound(state)`, `kickBall(state, x, y, power, isShot)`, plus constants (`W`, `H`, `MOVE_RADIUS`, `PLAY_DURATION`, etc.)
- `engine.ts` has ZERO DOM/canvas references. Pure state-in, state-out.
- `types.ts` defines all shared interfaces: `GameState`, `Player`, `Ball`, `RulesConfig`, `SetPiece`, `AIMode`, `RuleModifier`, etc.
- `ai.ts` imports from `engine.ts` + `types.ts`, exports: `planAI(state, options)`, `scoreActions(player, mood, state)`
- `renderer.ts` imports from `types.ts`, exports: `createRenderer(canvas)` → `{ draw(state), drawAIPlan(state, aiPlan) }`
- `ui.ts` imports all three, wires DOM events to engine, renders each frame
- Game state is a single typed object passed around (not scattered globals)

### State object shape (draft)

```js
{
  teamA: [...],        // 11 player objects (+ bench: 3 subs)
  teamB: [...],        // 11 player objects (+ bench: 3 subs)
  ball: { x, y, vx, vy, ... },
  possession: null | playerRef,
  phase: 'plan' | 'preview' | 'play' | 'setpiece',
  gameMode: 'turnbased' | 'realtime',
  round: 1,
  half: 1,             // 1 or 2
  roundsPerHalf: 30,   // configurable
  clockMinutes: 0,     // cosmetic, derived from round/roundsPerHalf
  score: [0, 0],
  playTimer: 0,
  subsRemaining: [3, 3],
  rules: RULES_FUTSAL,     // or RULES_OUTDOOR — configurable ruleset
  // Set-piece state
  setpiece: null,       // null | { type: 'throwin'|'corner'|'goalkick'|'freekick'|'penalty'|'kickoff', side, x, y }
  // ... other state currently in globals
}
```

### Headless mode requirement

The engine must support a tight synchronous loop for self-play training:

```js
import { createGameState, tick, isRoundOver, endRound, planAI } from './engine.js';

const state = createGameState();
for (let round = 0; round < 30; round++) {
  planAI(state, { side: 0, mode: 'baseline' });
  planAI(state, { side: 1, mode: 'baseline' });
  state.phase = 'play';
  while (!isRoundOver(state)) {
    tick(state); // pure state mutation, no DOM, no timers
  }
  endRound(state);
}
// → state.score is the final result
```

Frame-accurate: identical physics to the browser game. No simplified resolution. Optimize with tight loops, not by cutting corners. ~36M ticks for 10K games should run in seconds on modern hardware.

### Validation

- Open in browser → game plays identically to current version
- `node -e "import('./engine.js')"` works without errors (headless-capable)
- Headless loop: 100 games complete in <1 second

### UX improvements (bundled with Phase 0)

These are interaction fixes to apply during the refactor:

**Contextual tooltips**: When hovering a player during plan phase, show available actions:
- Own player (ball carrier): "Drag: Dribble | Right-drag: Pass/Shoot"
- Own player (no ball): "Drag: Move"
- Enemy ball carrier (with player selected): "Click: Tackle"

**Undo orders**:
- Right-click own player with an order → clears that player's order (move, pass, tackle)
- "Clear all" button (next to Play) → resets all team A orders for the round

**Order counter**: Show "7/11 ordered" near the Play button. Un-ordered players get a subtle pulsing ring during plan phase, so you know who you haven't given instructions to.

**Pass/shot danger visualization**: During right-drag (pass/shot planning), show the accuracy cone — a faint triangle from the kicker showing the realistic deviation range. Long passes to positions near opponents → wider cone = visible risk. Informed by the player's accuracy stat + pressure.

**Remove click-to-move**: Click on field no longer sets a move order. Click remains for: select own player, tackle enemy ball carrier. Move orders are drag-only.

**Round replay**: After each play phase ends, a "Replay" button appears (next to Play). Clicking it re-runs the last round's animation at 0.5x speed from a stored state snapshot. The snapshot is the full game state captured at the start of each play phase.

### Estimated scope

~800 lines to reorganize across files + UX improvements above.

---

## Phase 0.5: LLM AI Mode (Story 20)

**Goal**: Add an LLM-powered AI mode where Claude Sonnet steers team B. The LLM plans in parallel with the human — API call fires as soon as plan phase starts, play button disabled until response arrives.

### Architecture

- **Dev**: Vite dev server proxy handles `POST /api/ai-plan`. No separate server process.
- **Prod**: Standalone server on Hetzner VPS (reused when Phase 4 adds NL translation).
- **Prompt**: System prompt loaded from `src/prompts/ai-plan.md`. User message is serialized game state JSON.
- **Stateless**: Each round is an independent API call. No conversation history.

### API call flow

1. Plan phase begins → client serializes game state → `POST /api/ai-plan`
2. Vite proxy reads `src/prompts/ai-plan.md` as system prompt
3. Proxy sends system prompt + game state JSON to Claude Sonnet API
4. Response parsed → orders applied to team B players
5. `aiPlanReady = true` → play button enabled

### Game state sent to LLM (normalized 0-1)

```json
{
  "score": [0, 1],
  "round": 5,
  "ball": { "x": 0.45, "y": 0.52 },
  "possession": { "team": "B", "index": 10 },
  "teamB": [
    { "index": 0, "role": "gk", "x": 0.92, "y": 0.50 },
    { "index": 1, "role": "def", "x": 0.80, "y": 0.15 }
  ],
  "teamA": [
    { "index": 0, "role": "gk", "x": 0.08, "y": 0.50 }
  ]
}
```

### LLM response schema

```json
{
  "reasoning": "Dropping deep to absorb pressure, looking for counter.",
  "orders": [
    {
      "index": 0,
      "reasoning": "Tracking ball position",
      "actions": [{ "type": "move", "x": 0.92, "y": 0.48 }]
    },
    {
      "index": 9,
      "reasoning": "Dribbling past defender then passing to open winger",
      "actions": [
        { "type": "move", "x": 0.35, "y": 0.45 },
        { "type": "pass", "x": 0.20, "y": 0.30 }
      ]
    },
    {
      "index": 10,
      "reasoning": "Making a run toward goal for a shot",
      "actions": [
        { "type": "move", "x": 0.15, "y": 0.50 },
        { "type": "shoot", "x": 0.0, "y": 0.50 }
      ]
    }
  ]
}
```

**Action types**: `move` (move/dribble to position), `pass` (pass ball to position), `shoot` (shoot at goal). Max 2 actions per player. Array order = execution order (e.g., `[move, pass]` = dribble first then pass). Non-ball-carriers have a single `[move]`. Move radius (120px) explained in prompt, clamped client-side.

### Error handling

- API failure / timeout → fall back to heuristic AI with visible warning
- Malformed JSON → fall back to heuristic
- Partial response (valid orders for some players, garbage for others) → heuristic fills in the gaps
- Per-player: out-of-range coordinates clamped, missing players get heuristic orders

### Reasoning display

- Global reasoning + per-player reasoning stored on `GameState`
- Visible in debug mode (existing overlay), hover a player to see why the LLM moved them

### Configuration

`.env` file (gitignored):
```
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-6
```

### Files

```
.env                        — API key + model config (gitignored)
src/prompts/ai-plan.md      — System prompt (game rules, output schema, constraints)
vite.config.ts              — Add dev proxy plugin for /api/ai-plan
src/ai.ts                   — Add llm mode to dispatcher
src/ai-llm.ts               — State serializer, response parser, API call
src/types.ts                — Add 'llm' to AIMode, add LLM state fields
```

### Validation

- Select "LLM" mode → plan phase fires API call, play button shows "AI thinking..."
- LLM response applies valid moves to team B, visible in debug overlay
- Kill network → warning shown, heuristic takes over seamlessly
- Reasoning visible per-player in debug mode on hover

---

## Phase 1: Player Stats, Accuracy & Soccer Rules (Stories 10-13)

**Goal**: Transform the toy simulation into a proper soccer game with player differentiation and real rules.

### 1a. Player stats (Story 10)

Position-based stat profiles. Each player gets:

```js
{
  // ... existing fields (x, y, side, index, etc.)
  stats: {
    speed: 3.0,           // base max speed (px/frame)
    acceleration: 0.5,    // how fast they reach max speed
    stamina: 100,         // max stamina (depletes on sprint)
    staminaRecovery: 0.3, // recovery rate per tick when not sprinting
    passAccuracy: 0.9,    // 1.0 = perfect, 0.5 = wild (base cone angle)
    shotPower: 12,        // max shot velocity
    shotAccuracy: 0.8,    // shot cone tightness
    tackling: 0.7,        // success chance on tackle attempt
    foulRisk: 0.15,       // chance a failed tackle is a foul
  },
  // Runtime state
  currentStamina: 100,
  currentSpeed: 3.0,      // actual speed (reduced by fatigue)
  isSprinting: false,
}
```

**Position templates:**

| Position | Speed | Stamina | Pass Acc | Shot Power | Shot Acc | Tackling | Foul Risk |
|----------|-------|---------|----------|------------|----------|----------|-----------|
| GK       | 2.0   | 80      | 0.75     | 14         | 0.6      | 0.3      | 0.05      |
| DEF      | 2.5   | 90      | 0.80     | 8          | 0.5      | 0.85     | 0.20      |
| MID      | 3.0   | 100     | 0.90     | 10         | 0.7      | 0.60     | 0.15      |
| FWD      | 3.5   | 85      | 0.80     | 13         | 0.90     | 0.40     | 0.10      |

Add ±10% random variation per player at game start for individuality.

### 1b. Stamina system (Story 11)

- Sprinting: player moves at `stats.speed`. Stamina depletes at ~1/tick while sprinting.
- Walking/jogging: player moves at `stats.speed * 0.6`. No stamina cost.
- When `currentStamina < 30`: `currentSpeed` degrades proportionally. A spent player is noticeably slow.
- Recovery: `staminaRecovery` per tick when not sprinting. Only during play phase (not between rounds in turn-based mode).
- Sprint trigger: in turn-based, dragging beyond ~60% of MOVE_RADIUS = sprint. In real-time, any move order = sprint.
- Visual: stamina bar below player sprite (green→yellow→red).

### 1c. Accuracy physics (Story 12)

Passes and shots get random angular deviation:

```js
function applyAccuracy(targetX, targetY, fromX, fromY, accuracy, pressure, stamina) {
  // Base cone: ±(1 - accuracy) * 15° = e.g., ±1.5° for 0.9 accuracy
  let maxAngle = (1 - accuracy) * 15 * (Math.PI / 180);

  // Pressure: nearby opponents widen cone
  // pressure = count of opponents within 60px
  maxAngle *= (1 + pressure * 0.3);

  // Fatigue: low stamina widens cone
  if (stamina < 50) maxAngle *= (1 + (50 - stamina) / 50 * 0.5);

  // Apply random deviation
  const angle = Math.atan2(targetY - fromY, targetX - fromX);
  const deviation = (Math.random() * 2 - 1) * maxAngle;
  const dist = Math.sqrt((targetX - fromX) ** 2 + (targetY - fromY) ** 2);

  return {
    x: fromX + Math.cos(angle + deviation) * dist,
    y: fromY + Math.sin(angle + deviation) * dist,
  };
}
```

### 1d. Soccer rules (Story 13)

Rules are **configurable**. The engine has a rules config object that toggles between rulesets:

```js
const RULES_FUTSAL = {
  wallBounce: true,       // ball bounces off all walls (sidelines + end lines outside goal)
  offside: false,
  throwIns: false,        // no throw-ins, ball bounces
  corners: false,         // no corners, ball bounces
  goalKicks: false,       // no goal kicks, ball bounces off end wall
  fouls: true,
  penalties: true,
  freeKicks: true,
  substitutions: true,
  halves: true,
};

const RULES_OUTDOOR = {
  wallBounce: false,      // ball goes out of play
  offside: true,
  throwIns: true,
  corners: true,
  goalKicks: true,
  fouls: true,
  penalties: true,
  freeKicks: true,
  substitutions: true,
  halves: true,
};
```

#### MVP rules (futsal-style — Phase 1)

The MVP ships with futsal rules on a full-sized 11v11 field. This keeps the existing wall-bounce behavior, skips the most complex rules (offside, throw-ins, corners, goal kicks), and lets us get to a playable game + NN training faster.

**Wall bounce** (existing behavior, keep as-is):
- Ball bounces off sidelines and end lines (outside the goal area)
- No stoppages for ball out of play
- This is already implemented and working

**Fouls:**
- When a tackle fails (based on `tackling` stat), roll against `foulRisk`
- Foul → play stops → free kick at that location
- Foul inside penalty area → penalty kick
- No cards in v1 (but `foulRisk` per player means defenders foul more — realistic)

**Free kicks:**
- `setpiece = { type: 'freekick', side, x, y }` at foul location
- Near goal (sequential — **revisit after playtesting**):
  1. Defending team positions wall (auto-placed 10yd from ball, player can adjust individuals)
  2. Wall visible to attacker
  3. Attacking team plans: shoot over/around wall, or pass short to a runner
  4. Kick executed → play resumes
- Far from goal: simultaneous (just a pass restart, low stakes)
- Real-time: auto-kick

**Penalties** (blind commit mini-game):
- `setpiece = { type: 'penalty', side }`
- Shooter picks a zone (left/center/right × low/high = 6 zones). GK picks a dive direction (left/center/right).
- Both commit blind simultaneously. Neither sees the other's choice.
- If GK guesses the side: save (unless center-center, then 50/50). If GK guesses wrong: goal.
- Turn-based: player picks zone, AI picks dive. Beautiful chess moment.
- Real-time: AI handles both.

**Kickoff:**
- After goals and at start of each half
- `setpiece = { type: 'kickoff', side }`
- Opposing team must stay outside center circle until ball is played
- Ball must move forward on kickoff

**Half-time:**
- After `roundsPerHalf` rounds: whistle, pause, switch sides (mirror all positions/home positions)
- Brief stats display: possession %, shots, passes, fouls
- Substitution opportunity (see below)

**Substitutions:**
- 3 per half per team (configurable — futsal traditionally has unlimited rolling subs, but 3 is simpler for v1)
- In turn-based: during plan phase, button to swap a field player for a bench player
- Bench players have full stamina — the tactical choice is when to use them
- In real-time: substitution panel, takes effect at next stoppage (or immediately)
- Bench size: 3 players (1 per position type: DEF, MID, FWD)

**90-minute clock:**
- Cosmetic. `clockMinutes = (round / roundsPerHalf) * 45 + (half - 1) * 45`
- Display as "23:45 — 1st Half"
- Game ends after `roundsPerHalf * 2` total rounds

#### Outdoor rules (later expansion — toggle on when ready)

These are designed now but NOT implemented in the MVP. The engine config supports them; the code is added later.

**Ball out of play** (replaces wall bounce):
- Ball crosses sideline → throw-in for the other team
- Ball crosses goal line off attacker → goal kick
- Ball crosses goal line off defender → corner kick

**Throw-ins** (simultaneous, quick):
- `setpiece = { type: 'throwin', side, x, y }`
- Turn-based: both teams plan simultaneously. Thrower picks target (right-drag, like a pass).
- Real-time: auto-throw to nearest open teammate.
- Throw range limited (~200px).

**Corners** (sequential, chess moment — **revisit after playtesting**):
- `setpiece = { type: 'corner', side, x, y }` (corner flag position)
- Turn-based (sequential planning):
  1. Defending team positions first: GK, markers in the box.
  2. Defensive positions revealed to attacker.
  3. Attacking team plans: position runners in the box, kicker aims delivery.
  4. Corner delivered → play resumes.
- Real-time: auto-delivery to the box.

**Goal kicks** (simultaneous, quick):
- `setpiece = { type: 'goalkick', side, x, y }` (6-yard box)
- Turn-based: both teams plan simultaneously. GK picks target.
- Real-time: AI decides.

**Offside:**
- Checked at the moment a forward pass is played (not at receipt)
- Player is offside if: in opponent's half AND behind the second-to-last defender
- If offside: play stops → free kick to defending team at the offside position
- Toggleable via `state.rules.offside`
- The AI needs to understand offside — both to avoid it and to exploit the trap

### Validation (MVP — futsal rules)

- Players visibly differ: forward outruns defender, defender wins tackles
- Sprinting 5 rounds straight → player noticeably slower
- Pass to a pressed, tired player → wild deviation
- Ball bounces off walls (no stoppages for out-of-play)
- Foul in the box → penalty mini-game
- Free kick near goal → wall + sequential planning
- Half-time → sides switch, stats shown, subs available
- Full game plays to completion (60 rounds, 90 min clock)
- `state.rules = RULES_OUTDOOR` → outdoor rules activate (implemented later, but config exists)

---

## Phase 2: Game Mode Toggle (Story 1)
**Goal**: Single UI with a toggle button. Flip between turn-based and real-time mid-game.

### Changes

- Add `gameMode` to state: `'turnbased'` (default) | `'realtime'`
- Toggle button in UI (next to debug toggles)
- In `'realtime'` mode:
  - No plan/preview/play cycle. Continuous simulation.
  - Player drag orders execute immediately (no "Play" button).
  - AI runs `planAI()` every N ticks (e.g., every 60 frames = once per second) instead of once per round.
  - Speed slider (from index-alt.html) appears, controls `gameSpeed` multiplier.
  - "Play" button hidden. "Round" counter hidden.
- In `'turnbased'` mode: current behavior exactly.
- Switching mode mid-game: if switching to realtime during plan phase, just start continuous sim. If switching to turnbased during realtime, pause and enter plan phase.

### Validation

- Turn-based mode identical to current game
- Real-time mode feels like index-alt.html but with the full AI system
- Can toggle mid-game without crashes

---

## Phase 3: Rule Modifier System (Stories 4, 8)
**Goal**: A structured modifier system that augments `scoreActions()`. Rules apply to team A (user) and/or team B (AI).

### Rule modifier format

```js
{
  id: 'defense-forward',
  name: 'Defense Move Forward',
  description: 'All defenders push up as far as possible',
  side: 0,                    // 0=team A, 1=team B, null=both
  conditions: {
    roles: ['def'],           // which roles: 'gk','def','mid','fwd' (null=all)
    phase: null,              // null=always, 'attacking'|'defending'|'looseball'
    score: null,              // null=always, 'winning'|'losing'|'tied'
    spatial: null,            // null=always, 'own-third'|'mid-third'|'opp-third' (where ball is)
    proximity: null,          // null=all matching roles, or { closest: 3, to: 'ball'|'carrier' }
    players: null,            // null=role-based, or [7, 9] (specific jersey numbers)
    targetPlayer: null,       // null=no marking, or { opponent: 9 } (mark specific opponent)
  },
  modifiers: {
    actionScores: {
      'hold': -30,            // discourage holding position
      'space': +40,           // encourage moving to space
      'run': +30,             // encourage forward runs
    },
    targetBias: { x: -0.3 },  // bias targets toward opponent goal (negative x = toward left goal)
  }
}
```

This expanded schema handles:
- "If we're losing, midfield push up" → `{ roles: ['mid'], score: 'losing' }`
- "3 closest players press the ball carrier" → `{ proximity: { closest: 3, to: 'carrier' } }`
- "Pass short in our half" → `{ spatial: 'own-third', actionScores: { 'pass': +20 } }` (combined with distance filtering)
- "Player 7 marks their number 9" → `{ players: [7], targetPlayer: { opponent: 9 } }`

### How it integrates

1. `scoreActions(player, mood, state, ruleModifiers)` — new parameter
2. After scoring all actions, apply matching rule modifiers:
   - Filter rules by `side`, `conditions.roles`, `conditions.phase`
   - Add `actionScores` bonuses to matching action types
   - Apply `targetBias` to `tx/ty` after action selection
3. Multiple rules stack additively

### Team A auto-planning

- During plan phase, after player submits manual orders, un-ordered team A players get auto-planned using the same `scoreActions()` + user's rule modifiers
- Toggle: "Auto-assist: ON/OFF" in UI
- In full-auto mode (AI vs AI): both teams use `planAI()` with their respective rule sets

### Rule menu UI

- Panel on left side of screen (collapsible)
- Lists available rules with checkboxes to enable/disable
- "Add rule..." button opens text input for natural language (Phase 3)
- Pre-built rules ship with the game:
  - "Defense forward", "Defense deep", "Press high", "Counter attack", "Possession play", "Park the bus", "Wing play", "Through the middle"

### Validation

- Enable "Defense forward" for team A → defenders visibly push up
- Enable "Park the bus" for team B → AI plays more defensively than baseline
- Stack multiple rules → effects combine
- Disable all rules → identical to current behavior

---

## Phase 4: Server API + NL Translation (Stories 3, 4, 5)
**Goal**: Server endpoint translates natural language to rule modifiers. Rules can be saved/loaded.

### Server (Node.js on Hetzner VPS)

```
server/
  index.js          — Express/Fastify server
  routes/
    translate.js    — POST /api/translate-rule
    rules.js        — GET/POST/DELETE /api/rules
  llm/
    provider.js     — LLM abstraction (provider-agnostic)
    prompt.js       — System prompt + few-shot examples for rule translation
```

### Endpoints

**`POST /api/translate-rule`**
- Input: `{ text: "3 closest players attack the ball carrier", side: 0 }`
- Output: `{ rule: { ...ruleModifier }, confidence: 0.9, explanation: "..." }`
- LLM receives: the rule modifier schema, the list of valid actions/roles/conditions, few-shot examples
- LLM returns: structured JSON (via structured output / JSON mode)

**`GET /api/rules`**
- Returns all saved rules as JSON array

**`POST /api/rules`**
- Saves a new rule to `server/rules/{id}.json`
- Does NOT auto-commit to git

**`DELETE /api/rules/:id`**
- Removes a saved rule

### Markdown rules (Story 3)

- Developer writes a `.md` file like:
  ```markdown
  # High Press
  When defending, all midfielders and forwards press the ball carrier aggressively.
  Defenders step up to compress space.
  ```
- A CLI script `node server/tools/parse-rules.js rules/*.md` runs each through the LLM and outputs `.json` rule modifiers
- These become the pre-built rules that ship with the game

### Client integration

- "Add rule..." button in rule panel opens a text input
- User types English, client calls `POST /api/translate-rule`
- Shows the explanation + preview of the modifier
- User confirms → rule added to active list
- "Save" button → `POST /api/rules` persists it

### Validation

- Type "defense move forward" → get a sensible rule modifier back
- Enable it → see defenders push up
- Save → appears in GET /api/rules
- Restart game → can load saved rules

---

## Phase 5: Voice Commands (Story 2)
**Goal**: Speak commands to control your team. Works in both game modes.

### Architecture

```
voice.js
  — Uses Web Speech API (SpeechRecognition)
  — Continuous listening with push-to-talk (hold V key) or toggle
  — Pipeline: speech → text → keyword match → (fallback: server LLM) → action
```

### Keyword dictionary (local, instant)

```js
const KEYWORDS = {
  // Team-wide tactics
  'press': { type: 'tactic', modifier: pressHighRule },
  'fall back': { type: 'tactic', modifier: fallBackRule },
  'counter': { type: 'tactic', modifier: counterAttackRule },
  'park the bus': { type: 'tactic', modifier: parkBusRule },

  // Individual actions (need player reference)
  'pass to number {N}': { type: 'action', action: 'pass', targetRef: 'jersey' },
  'pass to the striker': { type: 'action', action: 'pass', targetRef: 'position' },
  'shoot': { type: 'action', action: 'shoot' },
  'dribble': { type: 'action', action: 'dribble' },

  // Player references
  'number {N}': { type: 'select', ref: 'jersey' },
  'the striker': { type: 'select', ref: 'position', role: 'fwd' },
  'the keeper': { type: 'select', ref: 'position', role: 'gk' },
  'left back': { type: 'select', ref: 'position', index: 1 },
  // ... etc
};
```

### Behavior by game mode

**Turn-based (plan phase)**:
- Voice sets orders for specific players or team-wide tactics
- "Number 7 move forward" → sets move target for player 7
- "Press high" → enables press-high rule modifier for this round

**Real-time**:
- Team-wide tactical commands are **sticky** — "press!" stays active until you say "fall back!" or toggle it off. Like a real coach setting a tactical stance.
- Individual commands are **one-shot** — "pass to number 7" is consumed immediately. The ball carrier passes, and the command is gone.
- This mirrors real coaching: you set a formation/tactic (persists), you shout a specific instruction (happens once).

### UI

- Microphone icon in top-right, shows listening state
- Transcript overlay: shows recognized text briefly (fades after 2s)
- Push-to-talk: hold `V`. Toggle: click mic icon.

### Validation

- Say "press" → team visibly pushes forward
- Say "pass to number 7" → ball carrier passes to #7
- Say something complex ("have the midfield hold a high line") → falls back to LLM → becomes a rule modifier
- Works in both game modes

---

## Phase 6: Neural Net Training + Inference (Story 6)
**Goal**: Train a small neural net via self-play to produce action score modifiers. Load in browser for inference.

### Network architecture (draft)

**Design philosophy**: The neural net is a completely independent brain — it does NOT use or augment `scoreActions()`. It takes raw game state and outputs raw decisions. This maximizes its ability to discover novel tactics that no human would code.

```
Input (~330 features):
  Per player (11 × ~15 features each, for BOTH teams = 22 players):
    - Position (x, y) normalized to [0,1]
    - Velocity (vx, vy) normalized
    - Role one-hot (gk, def, mid, fwd)
    - Has ball (0/1)
    - Home position (x, y) — formation reference
  Ball:
    - Position (x, y)
    - Velocity (vx, vy)
  Global:
    - Score differential (normalized)
    - Round number (normalized)
    - Which side has possession (one-hot: teamA / teamB / loose)

Output (11 players × 5 = 55 values):
  Per player on the net's team:
    - tx, ty (normalized move target position)
    - pass_probability (sigmoid, 0-1)
    - shoot_probability (sigmoid, 0-1)
    - pass_target_index (softmax over 10 teammates → index)

Architecture: 330 → 256 → 128 → 64 → 55 (3 hidden layers, ReLU, ~100K params)
```

**Key difference from rule-based AI**: The net decides WHERE each player goes (raw coordinates), not which action type to pick. It can invent formations, movements, and passing patterns that don't exist in the `scoreActions()` vocabulary. The pass/shoot outputs replace the planned-pass system entirely.

### Training pipeline

```
training/
  headless-sim.js    — Imports engine.js, runs games without rendering
  self-play.js       — Runs two AIs against each other, collects trajectories
  train.js           — TensorFlow.js training script
  models/            — Saved model checkpoints
  data/              — Recorded game trajectories
```

### Training phases

1. **Data collection**: Run rule-based AI vs rule-based AI for 10K+ games headlessly. Record (state, actions, outcome) tuples.
2. **Imitation learning**: Train the net to predict the rule-based AI's positions/decisions given the state. Loss = MSE on position outputs + BCE on pass/shoot probabilities.
3. **Self-play RL** (stretch): Use the imitation-trained net as starting point. Play against itself, reward = goal differential. PPO or simple REINFORCE. This is where novel tactics emerge.

**Set pieces**: The neural net handles **open play only**. When a set piece occurs (corner, free kick, throw-in, etc.), the rule-based AI takes over for that phase. This keeps the net focused on the emergent, creative part of the game.

### Feasibility analysis (home training)

With player stats + soccer rules, the input space is ~560 features, net is ~170K params. Still small.

| Phase | Games | Time per game | Total time |
|-------|-------|---------------|------------|
| Data collection (rule-based AI vs AI) | 10K | ~360ms | ~1 hour |
| Imitation learning (supervised, no sim) | — | — | ~10 min (GPU) / ~1 hr (CPU) |
| Self-play RL (sim + inference) | 100K | ~700ms | ~19 hours |
| Self-play RL (aggressive) | 1M | ~700ms | ~8 days |

**100K RL games (overnight run) is the practical target.** Optimization levers if needed:
- Batch inference: run 32 games in parallel, batch net forward passes → ~4x speedup
- Shorter games for early experiments (15 rounds instead of 60)
- Smaller net for rapid iteration, scale up once pipeline works
- Games with rare events (corners, penalties) are handled by rule-based AI → no need for the net to learn these

### Inference in browser

- Trained model saved as TFJS format (`model.json` + weight shards)
- Loaded in browser via `tf.loadLayersModel('/models/latest/model.json')`
- During `planAI()`, if neural net mode is active:
  1. Encode game state → input tensor (~560 floats)
  2. Run inference (`model.predict(input)`) → 55 floats
  3. Decode output → per-player `(tx, ty)` + pass/shoot decisions
  4. Set player targets directly — **bypasses `scoreActions()` entirely**
  5. If `pass_probability > threshold` for ball carrier → execute pass to `pass_target_index`
  6. If `shoot_probability > threshold` for ball carrier → execute shot
  7. For set pieces → delegate to rule-based AI

### Validation

- Headless sim runs 1000 games in <1 minute
- Imitation-trained net achieves >70% action prediction accuracy
- Net-enhanced AI beats baseline AI >55% of the time
- Browser inference adds <5ms per planning phase

---

## Phase 7: AI Mode Switcher (Story 7) — partially started

**Goal**: Toggle between AI modes from the UI.

**Started in Phase 0**: `AIMode` type and dropdown UI added. Heuristic mode active, others stubbed with fallback to heuristic. Full implementation depends on Phases 3 (rules), 6 (neural net).

### Modes

| Mode | Code name | Description | How it works |
|------|-----------|-------------|-------------|
| Heuristic | `heuristic` | Current hand-coded AI | `scoreActions()` only |
| Rules | `rules` | User's rule modifiers | `scoreActions()` + active rule modifiers |
| LLM | `llm` | Claude Sonnet steers team B | API call each round, raw positions + actions. Bypasses `scoreActions()`. See Phase 0.5. |
| Neural Net | `neural` | Trained net — independent brain | Net outputs raw `(tx, ty)` per player + pass/shoot decisions. Bypasses `scoreActions()` entirely. |
| Hybrid | `hybrid` | Net proposes, rules adjust | Net outputs positions, then rule modifiers post-adjust targets |

### UI

- Dropdown select next to debug toggles (already implemented in Phase 0)
- Mode applies to team B (AI team). Team A uses rules if enabled (Phase 2).
- For AI vs AI testing: can set mode independently for each team

### AI vs AI spectator mode (Story 9)

- Toggle: "AI vs AI" button (next to mode switcher)
- Both teams get auto-planned — player input disabled (drag, voice)
- Independent mode selector per team: Team A dropdown + Team B dropdown
  - e.g., Team A = `neural-net`, Team B = `baseline`
- Works in **both game modes**:
  - **Turn-based**: Both teams auto-plan each round. "Play" button still advances rounds (or auto-advance toggle for hands-free watching).
  - **Continuous**: Both teams replan on the AI tick interval. Speed slider controls pace. Fully autonomous.
- Auto-advance toggle: when enabled in turn-based mode, rounds execute automatically with a configurable delay (e.g., 0.5s between rounds) — lets you sit back and watch
- Useful for: comparing AI modes head-to-head, watching neural net discover tactics, regression testing AI changes

### Validation

- Switch modes mid-game → AI behavior visibly changes
- AI vs AI in turn-based: rounds auto-advance, both teams plan, game plays to completion
- AI vs AI in continuous: game runs autonomously at chosen speed
- AI vs AI: baseline vs neural-net → can watch the game play out
- Stats tracking: win/loss record per mode across games (stored in localStorage)

---

## Open Questions (to revisit)

- [ ] Training approach details (Q12) — decide after Phase 5 data collection
- [ ] Exact neural net architecture — tune after initial experiments
- [ ] Rule modifier schema — may need expansion as we discover edge cases
- [ ] Voice command coverage — expand keyword dictionary iteratively
- [ ] Mobile support — voice + drag interactions on touch devices?
- [ ] Neural net within-round sequencing (Q23) — v1 uses single-decision-per-round (pass = immediate). Later improvement: re-evaluate every N ticks during play phase, enabling multi-step plays (dribble → draw defender → pass) within a single round.
- [ ] Chess identity features (Q27) — move radius circles, threat zones, game notation/replay, undo during plan phase. Design pass needed. Affects Phase 0 if we want state history for undo/replay.
- [ ] Per-player decision log for rule-based modes (Q26b) — extend debug overlay to show which rules fired and how they modified scores. Neural net stays black-box by design.
- [ ] Set-piece interaction design (Q40) — sequential planning for corners/free kicks feels right on paper but may be slow in practice. Revisit after playtesting.
- [ ] Player stat balance — position templates are first-draft numbers. Tune after playing several games.
- [ ] Foul rate tuning — `foulRisk` values need to feel right (not too many stoppages, not too few).

---

## File Structure (final state)

```
index.html                — Game shell (<script type="module" src="/src/main.ts">)
.env                      — API keys + config (gitignored)
package.json
tsconfig.json
vite.config.ts            — Includes dev proxy plugin for /api/ai-plan
src/
  main.ts                 — Entry point, wires everything together
  types.ts                — Shared interfaces: GameState, Player, Ball, RulesConfig, etc.
  engine.ts               — Pure game engine (headless-capable, zero DOM)
  ai.ts                   — AI mode dispatcher + heuristic planning
  ai-llm.ts               — LLM mode: state serializer, response parser, API call
  renderer.ts             — Canvas rendering + debug overlays
  sprites.ts              — Pixel sprite data (extracted from makeSprites)
  ui.ts                   — DOM event handlers, input, UI panels
  voice.ts                — Voice recognition + command parsing
  rules.ts                — Rule modifier system (client-side)
  neural.ts               — Neural net inference (TFJS model loading + state encoding)
  prompts/
    ai-plan.md            — LLM system prompt (game rules, output schema, constraints)
public/
  models/                 — Trained TFJS models (model.json + weights)
  rules/                  — Pre-built rule modifier JSONs
  stadium-sound.mp3
server/                   — Node.js API server (standalone, for prod)
  index.ts
  routes/translate.ts
  routes/rules.ts
  llm/provider.ts
  llm/prompt.ts
  rules/                  — User-saved rules
training/                 — Self-play + training scripts (Node.js)
  headless-sim.ts         — Imports src/engine.ts, runs games without rendering
  self-play.ts
  train.ts
  models/
  data/
```
