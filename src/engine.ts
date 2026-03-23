// --- Pure game engine (zero DOM references) ---

import type { Player, Ball, GameState, PlannedPass, PlayerStats, AIRole, SetPiece } from './types';
import {
  W, H, GOAL_W, GOAL_H, GOAL_Y, PLAY_DURATION, MOVE_RADIUS,
  GAME_SPEED, TACKLE_RANGE, TACKLE_SUCCESS, PICKUP_RANGE,
  DRIBBLE_SPEED_PENALTY, BALL_SPEED_MULT, FORMATION_BASE, STAT_TEMPLATES, RULES_FUTSAL,
} from './types';

// Role helper (duplicated here to avoid circular dep with ai.ts)
function roleForIndex(i: number): AIRole {
  if (i === 0) return 'gk';
  if (i <= 4) return 'def';
  if (i <= 8) return 'mid';
  return 'fwd';
}

// --- Utility ---
export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// --- Stat generation with ±10% variation ---
function generateStats(role: AIRole): PlayerStats {
  const base = STAT_TEMPLATES[role];
  const vary = (v: number) => v * (0.9 + Math.random() * 0.2);
  return {
    speed: vary(base.speed),
    acceleration: vary(base.acceleration),
    stamina: vary(base.stamina),
    staminaRecovery: vary(base.staminaRecovery),
    passAccuracy: Math.min(1, vary(base.passAccuracy)),
    shotPower: vary(base.shotPower),
    shotAccuracy: Math.min(1, vary(base.shotAccuracy)),
    tackling: Math.min(1, vary(base.tackling)),
    foulRisk: Math.min(1, vary(base.foulRisk)),
  };
}

// --- Team creation ---
export function createTeam(side: 0 | 1, kickoffSide: number): Player[] {
  const isKickoff = side === kickoffSide;

  return FORMATION_BASE.map((pos, i) => {
    let x = side === 0 ? pos[0] * W : W - pos[0] * W;
    let y = pos[1] * H;

    if (isKickoff && i === 9) {
      x = W / 2 + (side === 0 ? -2 : 2);
      y = H / 2 - 18;
    } else if (isKickoff && i === 10) {
      x = W / 2 + (side === 0 ? -2 : 2);
      y = H / 2 + 40;
    }

    if (!isKickoff) {
      const dx = x - W / 2, dy = y - H / 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      const minDist = 220;
      if (d < minDist) {
        const pushX = side === 0 ? -1 : 1;
        x = W / 2 + pushX * minDist;
      }
    }

    const role = roleForIndex(i);
    const stats = generateStats(role);

    return {
      x, y, tx: x, ty: y,
      homeX: x, homeY: y,
      speed: stats.speed,
      radius: 14,
      side,
      index: i,
      tackleCooldown: 0,
      tackleTarget: null,
      hasOrder: false,
      plannedPass: null,
      passFirst: false,
      stats,
      currentStamina: stats.stamina,
      currentSpeed: stats.speed,
      isSprinting: false,
    } as Player;
  });
}

// --- Bench creation (3 subs: 1 DEF, 1 MID, 1 FWD) ---
function createBench(side: 0 | 1): Player[] {
  const roles: AIRole[] = ['def', 'mid', 'fwd'];
  return roles.map((role, i) => {
    const stats = generateStats(role);
    return {
      x: -100, y: -100, tx: -100, ty: -100,
      homeX: -100, homeY: -100,
      speed: stats.speed,
      radius: 14,
      side,
      index: 11 + i,
      tackleCooldown: 0,
      tackleTarget: null,
      hasOrder: false,
      plannedPass: null,
      passFirst: false,
      stats,
      currentStamina: stats.stamina, // bench players start fresh
      currentSpeed: stats.speed,
      isSprinting: false,
    } as Player;
  });
}

// --- Game state factory ---
export function createGameState(): GameState {
  const kickoffSide: 0 | 1 = 0;
  const teamA = createTeam(0, kickoffSide);
  const teamB = createTeam(1, kickoffSide);
  const ball: Ball = {
    x: W / 2, y: H / 2,
    vx: 0, vy: 0,
    radius: 8,
    friction: 0.98,
  };

  const state: GameState = {
    teamA,
    teamB,
    ball,
    possession: null,
    passTarget: null,
    selected: null,
    phase: 'plan',
    round: 1,
    score: [0, 0],
    playTimer: 0,
    tackleCooldown: 0,
    goalFlash: 0,
    goalScored: false,
    kickoffSide,
    lastKicker: null,
    lastKickerCooldown: 0,
    aiMode: 'heuristic',
    aiMood: 'balanced',
    aiPlanReady: false,
    aiShowAllActions: false,
    aiLastPlan: [],
    aiHoveredPlayer: null,
    llmThinking: false,
    llmError: null,
    llmReasoning: null,
    llmPlayerReasons: new Map(),

    // Soccer rules
    rules: RULES_FUTSAL,
    half: 1,
    roundsPerHalf: 30,
    clockMinutes: 0,
    subsRemaining: [3, 3],
    bench: [createBench(0), createBench(1)],
    setpiece: null,
    penalty: null,
    foulCount: [0, 0],
    shotCount: [0, 0],
    passCount: [0, 0],
    possessionCount: [0, 0],
    halfTimeShown: false,
  };

  setKickoffPossession(state);
  return state;
}

export function setKickoffPossession(state: GameState): void {
  const team = state.kickoffSide === 0 ? state.teamA : state.teamB;
  state.possession = team[9];
  state.ball.x = state.possession.x + state.possession.radius - 3;
  state.ball.y = state.possession.y;
  state.ball.vx = 0;
  state.ball.vy = 0;
}

// --- Accuracy physics ---
function applyAccuracy(
  targetX: number, targetY: number,
  fromX: number, fromY: number,
  accuracy: number, pressure: number, stamina: number, maxStamina: number
): { x: number; y: number } {
  // Base cone: ±(1 - accuracy) * 15°
  let maxAngle = (1 - accuracy) * 15 * (Math.PI / 180);
  // Pressure: nearby opponents widen cone
  maxAngle *= (1 + pressure * 0.3);
  // Fatigue: low stamina widens cone
  if (stamina < maxStamina * 0.5) {
    maxAngle *= (1 + (maxStamina * 0.5 - stamina) / (maxStamina * 0.5) * 0.5);
  }
  const angle = Math.atan2(targetY - fromY, targetX - fromX);
  const deviation = (Math.random() * 2 - 1) * maxAngle;
  const dd = Math.sqrt((targetX - fromX) ** 2 + (targetY - fromY) ** 2);
  return {
    x: fromX + Math.cos(angle + deviation) * dd,
    y: fromY + Math.sin(angle + deviation) * dd,
  };
}

function countNearbyOpponents(x: number, y: number, opponents: Player[], range: number): number {
  let count = 0;
  for (const opp of opponents) {
    if (dist({ x, y }, opp) < range) count++;
  }
  return count;
}

// --- Ball kicking ---
export function kickBall(state: GameState, targetX: number, targetY: number, power: number, isShot = false): void {
  const { ball } = state;
  const dx = targetX - ball.x, dy = targetY - ball.y;
  const dd = Math.sqrt(dx * dx + dy * dy);
  if (dd < 1) return;

  // Apply accuracy deviation if kicker has stats
  let finalX = targetX, finalY = targetY;
  if (state.possession && state.possession.stats) {
    const kicker = state.possession;
    const accuracy = isShot ? kicker.stats.shotAccuracy : kicker.stats.passAccuracy;
    const opponents = kicker.side === 0 ? state.teamB : state.teamA;
    const pressure = countNearbyOpponents(kicker.x, kicker.y, opponents, 60);
    const adjusted = applyAccuracy(targetX, targetY, ball.x, ball.y, accuracy, pressure, kicker.currentStamina, kicker.stats.stamina);
    finalX = adjusted.x;
    finalY = adjusted.y;
  }

  const fdx = finalX - ball.x, fdy = finalY - ball.y;
  const fdd = Math.sqrt(fdx * fdx + fdy * fdy);
  if (fdd < 1) return;

  // Use player's shot power if available
  let effectivePower = power;
  if (isShot && state.possession && state.possession.stats) {
    effectivePower = Math.max(power, state.possession.stats.shotPower);
  }

  ball.vx = (fdx / fdd) * effectivePower * BALL_SPEED_MULT;
  ball.vy = (fdy / fdd) * effectivePower * BALL_SPEED_MULT;
  ball.x += (fdx / fdd) * 20;
  ball.y += (fdy / fdd) * 20;
  ball.friction = isShot ? 0.97 : 0.98;
  state.lastKicker = state.possession;
  state.lastKickerCooldown = 40;
  state.possession = null;
}

// --- GK auto-plan ---
export function autoplanGK(state: GameState): void {
  const gk = state.teamA[0];
  if (gk.hasOrder) return;
  const ty = clamp(state.ball.y, GOAL_Y + 20, GOAL_Y + GOAL_H - 20);
  const dx = gk.homeX - gk.x, dy = ty - gk.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > MOVE_RADIUS) {
    gk.tx = gk.x + (dx / d) * MOVE_RADIUS;
    gk.ty = gk.y + (dy / d) * MOVE_RADIUS;
  } else {
    gk.tx = gk.homeX;
    gk.ty = ty;
  }
}

// --- Prepare round (execute team A passes, store start positions) ---
export function prepareRound(state: GameState): void {
  state.selected = null;
  for (const p of [...state.teamA, ...state.teamB]) {
    p._startX = p.x;
    p._startY = p.y;
  }
  for (const p of state.teamA) {
    if (p.plannedPass && state.possession === p) {
      if (p.passFirst) {
        const pp = p.plannedPass;
        const passDist = Math.sqrt((pp.x - state.ball.x) ** 2 + (pp.y - state.ball.y) ** 2);
        const power = pp.isShot ? Math.max(20, passDist / 4) : Math.max(6, passDist / 8);
        kickBall(state, pp.x, pp.y, power, pp.isShot);
        p.plannedPass = null;
        p.passFirst = false;
      } else {
        const hasDribble = (Math.abs(p.tx - p.x) > 5 || Math.abs(p.ty - p.y) > 5);
        if (!hasDribble) {
          const pp = p.plannedPass;
          const passDist = Math.sqrt((pp.x - state.ball.x) ** 2 + (pp.y - state.ball.y) ** 2);
          const power = pp.isShot ? Math.max(20, passDist / 4) : Math.max(6, passDist / 8);
          kickBall(state, pp.x, pp.y, power, pp.isShot);
          p.plannedPass = null;
        }
      }
    }
  }
}

// --- Player movement ---
function movePlayer(p: Player, state: GameState): void {
  if (p.tackleTarget) {
    if (state.possession === p.tackleTarget) {
      const tx = p.tackleTarget.x, ty = p.tackleTarget.y;
      const dx = tx - (p._startX ?? p.x), dy = ty - (p._startY ?? p.y);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= MOVE_RADIUS) {
        p.tx = tx;
        p.ty = ty;
      } else {
        p.tx = (p._startX ?? p.x) + (dx / d) * MOVE_RADIUS;
        p.ty = (p._startY ?? p.y) + (dy / d) * MOVE_RADIUS;
      }
    } else {
      p.tackleTarget = null;
    }
  }

  const dx = p.tx - p.x, dy = p.ty - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  p._moving = false;
  p._kicking = false;
  if (d > 2) {
    // Determine if sprinting: moving beyond 60% of MOVE_RADIUS from start
    const fromStart = Math.sqrt(((p._startX ?? p.x) - p.tx) ** 2 + ((p._startY ?? p.y) - p.ty) ** 2);
    p.isSprinting = fromStart > MOVE_RADIUS * 0.6;

    // Stamina: deplete when sprinting, recover when not
    if (p.isSprinting) {
      p.currentStamina = Math.max(0, p.currentStamina - 1);
    } else {
      p.currentStamina = Math.min(p.stats.stamina, p.currentStamina + p.stats.staminaRecovery);
    }

    // Compute effective speed
    let spd = p.isSprinting ? p.stats.speed : p.stats.speed * 0.6;
    // Fatigue: below 30 stamina, speed degrades proportionally
    if (p.currentStamina < 30) {
      spd *= 0.5 + (p.currentStamina / 30) * 0.5;
    }
    p.currentSpeed = spd;
    spd *= GAME_SPEED;
    if (state.possession === p) spd *= DRIBBLE_SPEED_PENALTY;

    p.x += (dx / d) * spd;
    p.y += (dy / d) * spd;
    p._moving = true;
  } else {
    // Standing still: recover stamina
    p.isSprinting = false;
    p.currentStamina = Math.min(p.stats.stamina, p.currentStamina + p.stats.staminaRecovery);

    if (state.possession === p && p.plannedPass) {
      p._kicking = true;
      const pp = p.plannedPass;
      const passDist = Math.sqrt((pp.x - p.x) ** 2 + (pp.y - p.y) ** 2);
      const power = pp.isShot ? Math.max(20, passDist / 4) : Math.max(6, passDist / 8);
      kickBall(state, pp.x, pp.y, power, pp.isShot);
      p.plannedPass = null;
    }
  }
  p.x = clamp(p.x, p.radius, W - p.radius);
  p.y = clamp(p.y, p.radius, H - p.radius);

  if (state.possession === p) {
    if (d > 2) {
      state.ball.x = p.x + (dx / d) * (p.radius - 3);
      state.ball.y = p.y + (dy / d) * (p.radius - 3);
    } else {
      state.ball.x = p.x + p.radius - 3;
      state.ball.y = p.y;
    }
    state.ball.vx = 0;
    state.ball.vy = 0;
  }
}

function separatePlayers(allPlayers: Player[]): void {
  const minDist = 28;
  for (let i = 0; i < allPlayers.length; i++) {
    for (let j = i + 1; j < allPlayers.length; j++) {
      const a = allPlayers[i], b = allPlayers[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        let nx: number, ny: number;
        if (d > 0.1) {
          nx = dx / d;
          ny = dy / d;
        } else {
          const angle = ((i * 7 + j * 13) % 12) * (Math.PI * 2 / 12);
          nx = Math.cos(angle);
          ny = Math.sin(angle);
        }
        const overlap = (minDist - d) / 2 + 0.5;
        const aMoving = Math.sqrt((a.tx - a.x) ** 2 + (a.ty - a.y) ** 2) > 3;
        const bMoving = Math.sqrt((b.tx - b.x) ** 2 + (b.ty - b.y) ** 2) > 3;
        if (aMoving || bMoving) {
          if (aMoving) { a.x -= nx * overlap; a.y -= ny * overlap; }
          if (bMoving) { b.x += nx * overlap; b.y += ny * overlap; }
        } else {
          b.x += nx * overlap * 2;
          b.y += ny * overlap * 2;
        }
      }
    }
  }
}

function handlePossession(allPlayers: Player[], state: GameState): void {
  state.tackleCooldown = Math.max(0, state.tackleCooldown - 1);
  state.lastKickerCooldown = Math.max(0, state.lastKickerCooldown - 1);
  if (state.lastKickerCooldown <= 0) state.lastKicker = null;

  if (!state.possession && state.passTarget) {
    const d = dist(state.passTarget, state.ball);
    if (d < PICKUP_RANGE * 2) {
      state.possession = state.passTarget;
      state.ball.vx = 0; state.ball.vy = 0;
      state.passTarget = null;
      return;
    }
    if (Math.abs(state.ball.vx) < 0.1 && Math.abs(state.ball.vy) < 0.1) {
      state.passTarget = null;
    }
  }

  for (const p of allPlayers) {
    const d = dist(p, state.ball);

    if (!state.possession && d < PICKUP_RANGE && state.tackleCooldown <= 0 && p !== state.lastKicker) {
      state.possession = p;
      state.passTarget = null;
      state.ball.vx = 0; state.ball.vy = 0;
      state.ball.friction = 0.98;
      return;
    }

    if (state.possession && state.possession !== p && state.possession.side !== p.side && p.tackleCooldown <= 0) {
      const dp = dist(p, state.possession);
      const isDirectedTackle = p.tackleTarget === state.possession;
      const range = isDirectedTackle ? TACKLE_RANGE * 1.5 : TACKLE_RANGE;
      if (dp < range && (isDirectedTackle || state.tackleCooldown <= 0)) {
        const baseRate = p.stats ? p.stats.tackling : TACKLE_SUCCESS;
        const successRate = isDirectedTackle ? Math.min(0.95, baseRate + 0.3) : baseRate;
        p.tackleCooldown = 15;
        if (Math.random() < successRate) {
          const victim = state.possession;
          state.possession = p;
          state.tackleCooldown = 15;
          p.tackleTarget = null;
          victim.tackleCooldown = 120;
        } else {
          // Foul check on failed tackle
          const foulChance = p.stats ? p.stats.foulRisk : 0.15;
          if (Math.random() < foulChance) {
            // Foul! For now just extra cooldown (full foul system in Phase 1d)
            p.tackleCooldown = 60;
          } else {
            p.tackleCooldown = 30;
          }
          const dx2 = p.x - state.possession.x, dy2 = p.y - state.possession.y;
          const dd = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
          p.x += (dx2 / dd) * 8;
          p.y += (dy2 / dd) * 8;
          p.tackleTarget = null;
        }
      }
    }
  }
}

function updateBall(state: GameState): void {
  const { ball } = state;
  if (state.possession || state.goalScored) return;
  ball.x += ball.vx * GAME_SPEED;
  ball.y += ball.vy * GAME_SPEED;
  ball.vx *= ball.friction;
  ball.vy *= ball.friction;
  if (Math.abs(ball.vx) < 0.05 && Math.abs(ball.vy) < 0.05) { ball.vx = 0; ball.vy = 0; }

  if (ball.y < ball.radius) { ball.y = ball.radius; ball.vy *= -0.7; }
  if (ball.y > H - ball.radius) { ball.y = H - ball.radius; ball.vy *= -0.7; }

  // Goal detection (ball in motion)
  if (ball.x <= ball.radius + GOAL_W && ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_H) {
    state.score[1]++;
    state.goalFlash = 60;
    state.goalScored = true;
    ball.vx = 0; ball.vy = 0;
    return;
  }
  if (ball.x >= W - ball.radius - GOAL_W && ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_H) {
    state.score[0]++;
    state.goalFlash = 60;
    state.goalScored = true;
    ball.vx = 0; ball.vy = 0;
    return;
  }

  // Wall bounce
  if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx *= -0.7; }
  if (ball.x > W - ball.radius) { ball.x = W - ball.radius; ball.vx *= -0.7; }
}

function checkGoalInPossession(state: GameState): void {
  if (!state.possession || state.goalScored) return;
  const { ball } = state;
  if (ball.x <= GOAL_W + ball.radius && ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_H) {
    state.score[1]++;
    state.goalFlash = 60;
    state.goalScored = true;
    state.possession = null;
  }
  if (ball.x >= W - GOAL_W - ball.radius && ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_H) {
    state.score[0]++;
    state.goalFlash = 60;
    state.goalScored = true;
    state.possession = null;
  }
}

// --- Reset after goal ---
export function resetAfterGoal(state: GameState, concedingSide: 0 | 1): void {
  state.kickoffSide = concedingSide;
  state.ball.x = W / 2;
  state.ball.y = H / 2;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.possession = null;
  state.passTarget = null;
  state.tackleCooldown = 0;
  state.goalScored = false;
  state.lastKicker = null;
  state.lastKickerCooldown = 0;
  state.teamA = createTeam(0, state.kickoffSide);
  state.teamB = createTeam(1, state.kickoffSide);
  setKickoffPossession(state);
  state.selected = null;
  state.phase = 'plan';
  state.aiHoveredPlayer = null;
  state.aiPlanReady = false;
}

// --- Update cosmetic clock ---
export function updateClock(state: GameState): void {
  const roundInHalf = state.half === 1 ? state.round : state.round - state.roundsPerHalf;
  state.clockMinutes = Math.floor((roundInHalf / state.roundsPerHalf) * 45) + (state.half - 1) * 45;
}

// --- Track possession stat ---
export function trackPossession(state: GameState): void {
  if (state.possession) {
    state.possessionCount[state.possession.side]++;
  }
}

// --- Check for half-time ---
export function isHalfTime(state: GameState): boolean {
  return state.rules.halves && state.half === 1 && state.round > state.roundsPerHalf && !state.halfTimeShown;
}

// --- Check for full-time ---
export function isFullTime(state: GameState): boolean {
  return state.round > state.roundsPerHalf * 2;
}

// --- Switch sides at half-time ---
export function switchSides(state: GameState): void {
  state.half = 2;
  state.halfTimeShown = true;
  state.kickoffSide = 1; // Team B kicks off second half

  // Mirror all positions
  for (const p of [...state.teamA, ...state.teamB]) {
    p.x = W - p.x;
    p.y = p.y; // y stays same
    p.tx = W - p.tx;
    p.homeX = W - p.homeX;
  }

  // Reset ball to center
  state.ball.x = W / 2;
  state.ball.y = H / 2;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.possession = null;
  state.passTarget = null;

  // Recreate teams from formation
  state.teamA = createTeam(0, state.kickoffSide);
  state.teamB = createTeam(1, state.kickoffSide);
  // Note: stats are regenerated — in a real game you'd preserve them
  // For now this is acceptable since it's a new half

  setKickoffPossession(state);
  state.phase = 'halftime';
}

// --- Substitution ---
export function substitutePlayer(state: GameState, side: 0 | 1, fieldIndex: number, benchIndex: number): boolean {
  if (state.subsRemaining[side] <= 0) return false;
  const team = side === 0 ? state.teamA : state.teamB;
  const bench = state.bench[side];
  if (fieldIndex < 0 || fieldIndex >= team.length) return false;
  if (benchIndex < 0 || benchIndex >= bench.length) return false;

  const fieldPlayer = team[fieldIndex];
  const benchPlayer = bench[benchIndex];

  // Swap positions
  benchPlayer.x = fieldPlayer.x;
  benchPlayer.y = fieldPlayer.y;
  benchPlayer.tx = fieldPlayer.x;
  benchPlayer.ty = fieldPlayer.y;
  benchPlayer.homeX = fieldPlayer.homeX;
  benchPlayer.homeY = fieldPlayer.homeY;
  benchPlayer.index = fieldPlayer.index;
  benchPlayer.side = side;

  // Put field player on bench
  fieldPlayer.x = -100;
  fieldPlayer.y = -100;

  team[fieldIndex] = benchPlayer;
  bench[benchIndex] = fieldPlayer;
  state.subsRemaining[side]--;
  return true;
}

// --- End round ---
export function endRound(state: GameState): void {
  // Track possession for the round
  trackPossession(state);

  state.phase = 'plan';
  state.round++;
  state.selected = null;
  state.aiPlanReady = false;
  state.aiHoveredPlayer = null;

  // Update cosmetic clock
  updateClock(state);

  for (const p of state.teamA) {
    p.hasOrder = false;
    p.tx = p.x;
    p.ty = p.y;
    p.tackleTarget = null;
    p.plannedPass = null;
    p.passFirst = false;
  }
  for (const p of state.teamB) {
    p.tx = p.x;
    p.ty = p.y;
    p.tackleTarget = null;
    p.plannedPass = null;
  }
}

// --- Deep clone game state for replay ---
export function cloneState(state: GameState): GameState {
  const clonePlayer = (p: Player): Player => ({ ...p, tackleTarget: null, plannedPass: p.plannedPass ? { ...p.plannedPass } : null });
  const teamA = state.teamA.map(clonePlayer);
  const teamB = state.teamB.map(clonePlayer);
  const ball: Ball = { ...state.ball };

  // Re-link possession/passTarget/selected to cloned players
  let possession: Player | null = null;
  let passTarget: Player | null = null;
  let lastKicker: Player | null = null;
  if (state.possession) {
    const team = state.possession.side === 0 ? teamA : teamB;
    possession = team[state.possession.index];
  }
  if (state.passTarget) {
    const team = state.passTarget.side === 0 ? teamA : teamB;
    passTarget = team[state.passTarget.index];
  }
  if (state.lastKicker) {
    const team = state.lastKicker.side === 0 ? teamA : teamB;
    lastKicker = team[state.lastKicker.index];
  }

  // Re-link tackle targets
  for (let i = 0; i < state.teamA.length; i++) {
    if (state.teamA[i].tackleTarget) {
      const tt = state.teamA[i].tackleTarget!;
      const tTeam = tt.side === 0 ? teamA : teamB;
      teamA[i].tackleTarget = tTeam[tt.index];
    }
  }
  for (let i = 0; i < state.teamB.length; i++) {
    if (state.teamB[i].tackleTarget) {
      const tt = state.teamB[i].tackleTarget!;
      const tTeam = tt.side === 0 ? teamA : teamB;
      teamB[i].tackleTarget = tTeam[tt.index];
    }
  }

  return {
    teamA, teamB, ball, possession, passTarget,
    selected: null,
    phase: state.phase,
    round: state.round,
    score: [state.score[0], state.score[1]],
    playTimer: state.playTimer,
    tackleCooldown: state.tackleCooldown,
    goalFlash: state.goalFlash,
    goalScored: state.goalScored,
    kickoffSide: state.kickoffSide,
    lastKicker,
    lastKickerCooldown: state.lastKickerCooldown,
    aiMode: state.aiMode,
    aiMood: state.aiMood,
    aiPlanReady: state.aiPlanReady,
    aiShowAllActions: false,
    aiLastPlan: state.aiLastPlan,
    aiHoveredPlayer: null,
    llmThinking: false,
    llmError: null,
    llmReasoning: null,
    llmPlayerReasons: new Map(),
    rules: state.rules,
    half: state.half,
    roundsPerHalf: state.roundsPerHalf,
    clockMinutes: state.clockMinutes,
    subsRemaining: [state.subsRemaining[0], state.subsRemaining[1]],
    bench: state.bench, // shared ref fine for replay
    setpiece: state.setpiece ? { ...state.setpiece } : null,
    penalty: state.penalty ? { ...state.penalty } : null,
    foulCount: [state.foulCount[0], state.foulCount[1]],
    shotCount: [state.shotCount[0], state.shotCount[1]],
    passCount: [state.passCount[0], state.passCount[1]],
    possessionCount: [state.possessionCount[0], state.possessionCount[1]],
    halfTimeShown: state.halfTimeShown,
  };
}

// --- Main tick (play phase simulation) ---
// Returns: 'goal-0' | 'goal-1' | 'round-end' | null
export function tick(state: GameState): 'goal-0' | 'goal-1' | 'round-end' | null {
  if (state.phase !== 'play') return null;

  state.playTimer--;

  const allPlayers = [...state.teamA, ...state.teamB];

  // Snapshot positions for animation detection
  for (const p of allPlayers) {
    p._prevX = p.x;
    p._prevY = p.y;
  }

  // GK shot reaction
  if (!state.possession && state.ball.vx > 0.5) {
    const gk = state.teamB[0];
    const tCross = (gk.homeX - state.ball.x) / state.ball.vx;
    if (tCross > 0 && tCross < 180) {
      const interceptY = state.ball.y + state.ball.vy * tCross;
      const clampedY = clamp(interceptY, GOAL_Y + 10, GOAL_Y + GOAL_H - 10);
      if (interceptY > GOAL_Y - 60 && interceptY < GOAL_Y + GOAL_H + 60) {
        gk.tx = gk.homeX;
        gk.ty = clampedY;
      }
    }
  }

  for (const p of allPlayers) {
    p.tackleCooldown = Math.max(0, p.tackleCooldown - 1);
    movePlayer(p, state);
  }
  separatePlayers(allPlayers);
  handlePossession(allPlayers, state);

  const prevScore0 = state.score[0];
  const prevScore1 = state.score[1];
  updateBall(state);
  checkGoalInPossession(state);

  // Check for goal scored this tick
  if (state.score[1] > prevScore1) return 'goal-0'; // team B scored on team A
  if (state.score[0] > prevScore0) return 'goal-1'; // team A scored on team B

  // Check if all actions complete
  const allDone = allPlayers.every(p => {
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const arrived = Math.sqrt(dx * dx + dy * dy) <= 3;
    const noPendingPass = !p.plannedPass;
    return arrived && noPendingPass;
  });
  const ballStopped = state.possession || (Math.abs(state.ball.vx) < 0.2 && Math.abs(state.ball.vy) < 0.2);

  if ((allDone && ballStopped) || state.playTimer <= 0) {
    return 'round-end';
  }

  return null;
}
