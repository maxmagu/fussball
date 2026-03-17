# Neural Net Fussball AI — PPO Self-Play

## Goal

Train a small neural network via self-play reinforcement learning to play the turn-based Fussball Commander game. The trained model replaces the hand-tuned `planAI()` as the game opponent. AI-vs-AI matches run headless for training and viewing. Human-vs-AI uses a localhost inference server.

## Architecture

Three components sharing a single game engine:

### 1. Shared Game Engine (`engine.js`)

Extracted from `index.html` — all game logic with no DOM, canvas, or browser APIs.

**Game state object schema:**
```js
{
  teamA: [{ x, y, tx, ty, homeX, homeY, speed, radius, side, index,
             tackleCooldown, tackleTarget, hasOrder, plannedPass, passFirst }],
  teamB: [/* same structure */],
  ball: { x, y, vx, vy, radius, friction },
  possession: null | playerIndex,  // index into teamA/teamB + side flag
  score: [0, 0],
  round: 1,
  phase: 'plan',
  kickoffSide: 0,
  goalsScoredThisRound: [0, 0],  // reset each round, used for reward
  lastKicker: null,
  lastKickerCooldown: 0,
  tackleCooldown: 0,
}
```

State uses player indices (not object references) so it can be serialized/cloned.

Exports:
- `createGameState()` — returns a fresh game state
- `getObservation(state, side)` — returns flat observation vector (mirror-space, always "attacking right")
- `applyActions(state, side, actions)` — translates network outputs into game orders for one team (see Action Translation below)
- `stepRound(state)` — simulates one full play phase (120 frames of physics), updates state in place, populates `goalsScoredThisRound`
- `isTerminal(state)` — true if `state.round > MAX_ROUNDS` (MAX_ROUNDS = 60)
- `getReward(state, side)` — computes reward from `goalsScoredThisRound` and ball progress (in mirror-space)
- `resetRound(state)` — clears per-round state (orders, cooldowns) for next planning phase

### 2. Training System (`train/`)

All Node.js. No ML framework — manual forward/backward pass.

**`agent.js`** — PPO agent:
- MLP: 120 inputs -> 256 (ReLU) -> 128 (ReLU) -> 26 outputs (policy, tanh) + 1 output (value)
- ~50K parameters
- Diagonal Gaussian policy (tanh-squashed) with learned log-std per output
- PPO clipped surrogate loss with tanh change-of-variables correction for log-prob
- Adam optimizer with gradient clipping (max norm 0.5)
- Weight save/load as JSON with version field and architecture metadata
- Realistic scope: ~600-800 lines for agent.js including all numerical code

**`self-play.js`** — Headless game runner:
- Runs N games in parallel using the shared engine
- Both sides use the current policy (with exploration noise from the Gaussian)
- Collects trajectories: (observation, action, reward, value, log_prob) per round per side
- Computes GAE (Generalized Advantage Estimation) for each trajectory

**`train.js`** — Main training loop (CLI entry point):
- Outer loop: collect B games of self-play, then run E epochs of PPO updates
- Every 50 iterations: save checkpoint, log stats (avg reward, goals per game, policy entropy)
- Opponent update: every 10 training iterations, opponent snapshot updates to latest policy

**`serve.js`** — Localhost inference server for human-vs-AI:
- Loads a checkpoint
- Exposes `POST /api/plan` — accepts full serialized game state, returns team B move orders
- Stateless: browser sends complete state each request (not deltas)

### 3. Browser Integration

`index.html` changes:
- Game logic replaced with `engine.js` import (via `<script src="engine.js">`)
- Rendering code stays inline, reads from the engine's state object
- `planAI()` becomes async: fetches `POST /api/plan`, Play button handler awaits it before transitioning to play phase
- Fallback: if server unreachable (fetch fails/times out), use the existing hand-tuned AI
- Deploy scripts in `../vps/deploy/fussball2/` must be updated to include `engine.js`

## State Representation

Flat float vector, all values normalized to [-1, 1]. **Always in mirror-space** — the acting team attacks right (positive x).

**Mirror transform (for team B / side 1):**
- All x positions: `x_mirror = W - x`
- All x velocities: `vx_mirror = -vx`
- homeX values: `homeX_mirror = W - homeX`
- y values unchanged

| Field | Count | Notes |
|-------|-------|-------|
| Ball x, y | 2 | Normalized by W, H |
| Possession: carrier index | 1 | -1 if no one, else 0-10 (own team) or 11-21 (opponent). Divided by 21. |
| Per own player (x11): x, y, homeX, homeY | 44 | Positions normalized by W, H |
| Per opponent (x11): x, y, homeX, homeY | 44 | Positions normalized by W, H |
| Score differential | 1 | (own - opponent), clamped [-5, 5], divided by 5 |
| Round number | 1 | Divided by MAX_ROUNDS |
| **Total** | **93** | |

Dropped ball velocity (near-zero at plan time) and per-player hasBall (redundant with carrier index).

## Action Space

26 continuous values, output via tanh [-1, 1], scaled to game coordinates:

| Output | Count | Mapping |
|--------|-------|---------|
| Per player (x11): dx, dy | 22 | Scaled by MOVE_RADIUS, added to current position (in mirror-space) |
| Ball carrier: pass_dx, pass_dy | 2 | Scaled to field dimensions. Magnitude < 15 = no pass (dribble only) |
| Ball carrier: tackle_intent | 1 | > 0 = nearest player to move target sets tackleTarget on closest opponent |
| Ball carrier: pass_first | 1 | > 0 = pass before moving, <= 0 = move then pass |
| **Total** | **26** | |

If no player has the ball, outputs 22-25 are ignored.

### Action Translation (`applyActions`)

Converts network outputs (in mirror-space) to game orders:

1. **Un-mirror**: if side === 1, flip dx signs: `game_dx = -mirror_dx`
2. **Move targets**: for each player, `tx = x + dx * MOVE_RADIUS`, `ty = y + dy * MOVE_RADIUS`, clamped to field
3. **Pass/shoot**: if carrier exists and pass magnitude >= 15:
   - Compute absolute target from carrier position + pass_dx/dy (un-mirrored)
   - If target is within 50px of opponent goal → set `plannedPass.isShot = true`
   - Set `passFirst` from the pass_first output
4. **Tackle**: if tackle_intent > 0, find the player whose move target is closest to an opponent with the ball, set `tackleTarget`
5. Mark all non-GK players as `hasOrder = true`

## Reward Signal

Per round, computed in mirror-space:
- **+1.0** for each goal scored this round (from `goalsScoredThisRound`)
- **-1.0** for each goal conceded this round
- **+0.01 * delta_ball_x** toward opponent goal (positive x in mirror-space), clamped to [-0.05, 0.05]
- **+0.005** if own team has possession at end of round
- Shaping rewards are small enough to not distort the goal-scoring objective

Discount factor: gamma = 0.99. GAE lambda = 0.95.

## PPO Hyperparameters (starting points)

- Learning rate: 3e-4 (Adam)
- Clip epsilon: 0.2
- Entropy coefficient: 0.01
- Value loss coefficient: 0.5
- Minibatch size: 64 rounds
- Epochs per update: 4
- Games per collection: 128
- Max rounds per game (MAX_ROUNDS): 60
- Checkpoint interval: every 50 training iterations
- Opponent update interval: every 10 training iterations
- Gradient clipping: max norm 0.5

## File Structure

```
engine.js                    — shared game logic, no DOM, exports state + sim functions
index.html                   — rendering + async browser integration, imports engine.js
train/
  agent.js                   — MLP, forward/backward, PPO loss, Adam, weight I/O (~700 lines)
  self-play.js               — headless game runner, trajectory collection, GAE
  train.js                   — CLI training loop
  serve.js                   — localhost inference server (POST /api/plan)
  checkpoints/               — JSON weight files with version + architecture metadata
```

## Implementation Notes

- **No ML framework.** The MLP is ~50K params. Forward pass is matrix multiply + ReLU. Backprop, PPO loss (with tanh log-prob correction), Adam, and GAE total ~700 lines. This avoids any native dependency.
- **Perspective mirroring.** Both observation and actions use mirror-space. `getObservation` flips x for side 1. `applyActions` un-flips dx for side 1. Reward shaping uses mirror-space ball progress. All three must use the same transform.
- **Headless speed.** Without rendering, one game (~60 rounds, each simulating 120 physics frames) should run in <100ms. 128 games ≈ ~12 seconds per collection batch.
- **Checkpoint format.** JSON with: `{ version: 1, architecture: {layers: [120,256,128,26], value_head: true}, weights: {W1: [...], b1: [...], ...}, metadata: {iteration, avgReward, goalsPerGame} }`. Version field prevents silent corruption from architecture changes.
- **Async browser integration.** The Play button handler becomes async. It disables the button, awaits the fetch to `/api/plan`, applies returned orders, then transitions to play phase. Timeout of 2s triggers fallback to hand-tuned AI.
- **Kickoff handling.** After a goal, `stepRound` resets positions and gives possession to the conceding team's forward (index 9). The observation at this point looks different from open play — the network will see these states during training and learn kickoff behavior naturally.
- **Gradual rollout.** The hand-tuned AI stays as a fallback. Neural AI is opt-in (requires running serve.js). Later, weights can be bundled in the browser for standalone play (inference only, ~50 lines + weights JSON).
