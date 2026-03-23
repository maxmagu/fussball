// --- Pure game engine (zero DOM references) ---

import type { Player, Ball, GameState, PlannedPass } from './types';
import {
  W, H, GOAL_W, GOAL_H, GOAL_Y, PLAY_DURATION, MOVE_RADIUS,
  GAME_SPEED, TACKLE_RANGE, TACKLE_SUCCESS, PICKUP_RANGE,
  DRIBBLE_SPEED_PENALTY, BALL_SPEED_MULT, FORMATION_BASE,
} from './types';

// --- Utility ---
export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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

    return {
      x, y, tx: x, ty: y,
      homeX: x, homeY: y,
      speed: i === 0 ? 2.5 : 3.0 + Math.random() * 0.5,
      radius: 14,
      side,
      index: i,
      tackleCooldown: 0,
      tackleTarget: null,
      hasOrder: false,
      plannedPass: null,
      passFirst: false,
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

// --- Ball kicking ---
export function kickBall(state: GameState, targetX: number, targetY: number, power: number, isShot = false): void {
  const { ball } = state;
  const dx = targetX - ball.x, dy = targetY - ball.y;
  const dd = Math.sqrt(dx * dx + dy * dy);
  if (dd < 1) return;
  ball.vx = (dx / dd) * power * BALL_SPEED_MULT;
  ball.vy = (dy / dd) * power * BALL_SPEED_MULT;
  ball.x += (dx / dd) * 20;
  ball.y += (dy / dd) * 20;
  ball.friction = isShot ? 0.94 : 0.98;
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
    let spd = p.speed * GAME_SPEED;
    if (state.possession === p) spd *= DRIBBLE_SPEED_PENALTY;
    p.x += (dx / d) * spd;
    p.y += (dy / d) * spd;
    p._moving = true;
  } else if (state.possession === p && p.plannedPass) {
    p._kicking = true;
    const pp = p.plannedPass;
    const passDist = Math.sqrt((pp.x - p.x) ** 2 + (pp.y - p.y) ** 2);
    const power = pp.isShot ? Math.max(20, passDist / 4) : Math.max(6, passDist / 8);
    kickBall(state, pp.x, pp.y, power, pp.isShot);
    p.plannedPass = null;
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
        const successRate = isDirectedTackle ? 0.95 : TACKLE_SUCCESS;
        p.tackleCooldown = 15;
        if (Math.random() < successRate) {
          const victim = state.possession;
          state.possession = p;
          state.tackleCooldown = 15;
          p.tackleTarget = null;
          victim.tackleCooldown = 120;
        } else {
          const dx2 = p.x - state.possession.x, dy2 = p.y - state.possession.y;
          const dd = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
          p.x += (dx2 / dd) * 8;
          p.y += (dy2 / dd) * 8;
          p.tackleCooldown = 30;
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

// --- End round ---
export function endRound(state: GameState): void {
  state.phase = 'plan';
  state.round++;
  state.selected = null;
  state.aiPlanReady = false;
  state.aiHoveredPlayer = null;

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
