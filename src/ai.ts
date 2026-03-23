// --- AI planning ---

import type { Player, GameState, ScoredAction, AIPlanEntry, AIMood, AIRole } from './types';
import { W, H, MOVE_RADIUS, GOAL_Y, GOAL_H } from './types';
import { dist, clamp, kickBall } from './engine';

// --- Role helper ---
export function aiRole(p: Player): AIRole {
  if (p.index === 0) return 'gk';
  if (p.index <= 4) return 'def';
  if (p.index <= 8) return 'mid';
  return 'fwd';
}

// --- Mood picker ---
function pickAIMood(state: GameState): AIMood {
  const scoreDiff = state.score[1] - state.score[0];
  const ballInAIHalf = state.ball.x > W / 2;

  let w = [25, 25, 25, 25];

  if (scoreDiff < 0) { w[0] += 30; w[2] += 15; w[3] -= 15; }
  if (scoreDiff > 0) { w[3] += 25; w[1] += 15; w[0] -= 15; }
  if (scoreDiff === 0 && state.round > 20) { w[0] += 20; w[2] += 10; }
  if (ballInAIHalf) { w[0] += 10; w[3] += 10; }
  if (!ballInAIHalf) { w[1] += 15; w[2] += 10; }

  w = w.map(v => Math.max(5, v));
  const total = w.reduce((a, b) => a + b);
  let r = Math.random() * total;
  const moods: AIMood[] = ['pressing', 'counter', 'possession', 'parkbus'];
  for (let i = 0; i < 4; i++) {
    r -= w[i];
    if (r <= 0) return moods[i];
  }
  return 'possession';
}

// --- Helpers ---
function findSpace(p: Player, zoneX: number, zoneY: number, spread: number, teamB: Player[]): { x: number; y: number } {
  let bestX = zoneX + (Math.random() - 0.5) * spread;
  let bestY = zoneY + (Math.random() - 0.5) * spread * 0.8;
  for (const t of teamB) {
    if (t === p) continue;
    const dx = bestX - t.x, dy = bestY - t.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 80) {
      bestX += (dx / (d || 1)) * 30;
      bestY += (dy / (d || 1)) * 30;
    }
  }
  return { x: clamp(bestX, 30, W - 30), y: clamp(bestY, 30, H - 30) };
}

function isOpen(p: Player, radius: number, teamA: Player[]): boolean {
  for (const a of teamA) {
    if (dist(a, p) < radius) return false;
  }
  return true;
}

function pointToSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

function passInterceptRisk(from: Player, to: Player, teamA: Player[]): number {
  const pdx = to.x - from.x, pdy = to.y - from.y;
  const passDist = Math.sqrt(pdx * pdx + pdy * pdy);
  if (passDist < 1) return 0;
  const ballSpeed = Math.max(6, passDist / 8) * 0.85;
  const playerSpeed = 3.0;

  let maxRisk = 0;
  for (const a of teamA) {
    const t = Math.max(0, Math.min(1, ((a.x - from.x) * pdx + (a.y - from.y) * pdy) / (passDist * passDist)));
    const cx = from.x + t * pdx, cy = from.y + t * pdy;
    const playerDist = Math.sqrt((a.x - cx) ** 2 + (a.y - cy) ** 2);

    if (playerDist > MOVE_RADIUS) continue;

    const ballDist = t * passDist;
    const playerTime = playerDist / playerSpeed;
    const ballTime = ballDist / ballSpeed;
    const timeAdvantage = ballTime - playerTime;

    let risk = 0;
    if (timeAdvantage > 0) {
      risk = Math.min(80, 20 + timeAdvantage * 4 + (1 - playerDist / MOVE_RADIUS) * 30);
    } else {
      risk = Math.max(0, (40 - playerDist) * 0.6);
    }
    maxRisk = Math.max(maxRisk, risk);
  }
  return maxRisk;
}

function gkAngleY(threatX: number, threatY: number, gkHomeX: number): number {
  const goalCenterY = H / 2;
  const dx = W - threatX;
  if (Math.abs(dx) < 1) return goalCenterY;
  const t = (gkHomeX - threatX) / dx;
  const y = threatY + t * (goalCenterY - threatY);
  return clamp(y, GOAL_Y + 16, GOAL_Y + GOAL_H - 16);
}

function nearestOpponent(x: number, y: number, teamA: Player[]): { p: Player; d: number } {
  let best: Player = teamA[0], bestD = Infinity;
  for (const a of teamA) {
    const d = Math.sqrt((a.x - x) ** 2 + (a.y - y) ** 2);
    if (d < bestD) { best = a; bestD = d; }
  }
  return { p: best, d: bestD };
}

function aiSetTarget(p: Player, tx: number, ty: number): void {
  const dx = tx - p.x, dy = ty - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > MOVE_RADIUS) {
    p.tx = p.x + (dx / d) * MOVE_RADIUS;
    p.ty = p.y + (dy / d) * MOVE_RADIUS;
  } else {
    p.tx = tx; p.ty = ty;
  }
}

// --- Score actions for a player ---
function scoreActions(p: Player, mood: AIMood, state: GameState): ScoredAction[] {
  const { teamA, teamB, ball, possession } = state;
  const role = aiRole(p);
  const hasBall = possession === p;
  const teamHasBall = possession !== null && possession.side === 1;
  const oppHasBall = possession !== null && possession.side === 0;
  const actions: ScoredAction[] = [];
  const noise = () => Math.random() * 20;

  // GK always special
  if (role === 'gk' && !hasBall) {
    const threat = possession || ball;
    const ty = gkAngleY(threat.x, threat.y, p.homeX);
    actions.push({ action: 'hold', score: 100, tx: p.homeX, ty });
    if (!possession && dist(p, ball) < 150) {
      actions.push({ action: 'chase', score: 80 + noise(), tx: ball.x, ty: ball.y });
    }
    return actions;
  }

  // PRESS
  if (oppHasBall && role !== 'gk') {
    const dp = dist(p, possession!);
    let pressScore = 30 + noise();
    if (mood === 'pressing') pressScore += 40;
    if (mood === 'counter') pressScore -= 10;
    if (mood === 'parkbus') pressScore -= 20;
    if (dp < 250) pressScore += 30;
    if (role === 'fwd') pressScore += 10;
    if (role === 'def' && dp > 300) pressScore -= 30;
    actions.push({ action: 'press', score: pressScore, tx: possession!.x, ty: possession!.y, tackle: true });
  }

  // MARK
  if (oppHasBall && (role === 'def' || role === 'mid')) {
    let markTarget: Player | null = null, markDist = Infinity;
    for (const a of teamA) {
      if (a === possession) continue;
      const d = dist(p, a);
      const dangerBonus = (a.x > W / 2) ? 30 : 0;
      if (d - dangerBonus < markDist) { markTarget = a; markDist = d - dangerBonus; }
    }
    if (markTarget) {
      let markScore = 25 + noise();
      if (mood === 'parkbus') markScore += 30;
      if (mood === 'pressing') markScore -= 10;
      if (role === 'def') markScore += 15;
      if (markTarget.x > W * 0.6) markScore += 25;
      if (markTarget.x > W * 0.75) markScore += 20;
      const dToMark = dist(p, markTarget);
      if (dToMark < 120) markScore += 15;
      const mx = markTarget.x * 0.5 + (W - 50) * 0.5;
      const my = markTarget.y * 0.75 + (H / 2) * 0.25;
      actions.push({ action: 'mark', score: markScore, tx: mx, ty: my });
    }
  }

  // CLOSE DOWN
  if (oppHasBall && role !== 'gk') {
    for (const a of teamA) {
      if (a === possession) continue;
      const d = dist(p, a);
      if (d > 220) continue;
      let closeScore = 38 + noise();
      if (role === 'mid') closeScore += 12;
      if (role === 'def') closeScore += 8;
      if (a.x > W * 0.5) closeScore += 20;
      if (a.x > W * 0.7) closeScore += 15;
      if (d < 100) closeScore += 15;
      actions.push({ action: 'closedown', score: closeScore, tx: a.x, ty: a.y });
    }
  }

  // STEP UP
  if (oppHasBall && (role === 'def' || role === 'mid') && possession!.x > W * 0.5 && p.x > possession!.x + 20) {
    const stepX = Math.max(possession!.x + 25, p.x - MOVE_RADIUS * 0.8);
    const stepY = p.homeY + (possession!.y / H - 0.5) * 50;
    let stepScore = 48 + noise();
    if (role === 'def') stepScore += 10;
    if (possession!.x > W * 0.65) stepScore += 15;
    actions.push({ action: 'stepup', score: stepScore, tx: stepX, ty: stepY });
  }

  // HOLD SHAPE
  if (!hasBall) {
    let holdScore = 20 + noise();
    if (mood === 'parkbus') holdScore += 25;
    if (mood === 'counter' && !teamHasBall) holdScore += 20;
    let hx: number, hy: number;

    if (oppHasBall && role !== 'gk') {
      const gravFactor = 0.2 + Math.random() * 0.25;
      hx = p.homeX + (ball.x - p.homeX) * gravFactor;
      hx = Math.max(hx, ball.x + 45);
      const yFactor = (role === 'def' ? 0.2 : 0.35) + Math.random() * 0.15;
      hy = p.homeY + (ball.y - H / 2) * yFactor;
      hx += (Math.random() - 0.5) * 50;
      hy += (Math.random() - 0.5) * 50;
      holdScore += 22;
      if (mood === 'parkbus') hx = Math.max(hx, W * 0.55);
      if (role === 'mid') hx = Math.max(hx, W * 0.65);
    } else {
      const shiftX = (ball.x / W - 0.5) * (mood === 'parkbus' ? 80 : 140);
      const shiftY = (ball.y / H - 0.5) * 60;
      hx = p.homeX + shiftX;
      hy = p.homeY + shiftY;
      if (mood === 'parkbus') hx = Math.max(hx, W * 0.55);
    }

    actions.push({ action: 'hold', score: holdScore, tx: hx, ty: hy });
  }

  // MOVE TO SPACE
  if (teamHasBall && !hasBall) {
    let spaceScore = 20 + noise();
    if (mood === 'possession') spaceScore += 30;
    if (mood === 'counter' && teamHasBall) spaceScore += 25;
    let zx: number, zy: number;
    if (role === 'fwd') {
      zx = W * 0.2 + Math.random() * W * 0.25;
      zy = H * 0.5;
    } else if (role === 'mid') {
      zx = W * 0.35 + Math.random() * W * 0.2;
      zy = p.homeY;
    } else {
      zx = W * 0.55 + Math.random() * W * 0.15;
      zy = p.homeY;
    }
    const sp = findSpace(p, zx, zy, 200, teamB);
    actions.push({ action: 'space', score: spaceScore, tx: sp.x, ty: sp.y });
  }

  // MAKE A RUN
  if (teamHasBall && !hasBall && (role === 'fwd' || role === 'mid')) {
    let runScore = 35 + noise();
    if (mood === 'counter' && teamHasBall) runScore += 35;
    if (mood === 'pressing') runScore += 20;
    if (role === 'fwd') runScore += 25;
    if (p.x < W / 2) runScore += 15;
    const runX = 50 + Math.random() * 150;
    const runY = H * 0.2 + Math.random() * H * 0.6;
    actions.push({ action: 'run', score: runScore, tx: runX, ty: runY });
  }

  // CHASE LOOSE BALL
  if (!possession) {
    const db = dist(p, ball);
    let chaseScore = 50 + noise();
    if (db < 200) chaseScore += 40;
    if (role === 'fwd' || role === 'mid') chaseScore += 15;
    if (role === 'def' && db > 300) chaseScore -= 30;
    actions.push({ action: 'chase', score: chaseScore, tx: ball.x, ty: ball.y });
  }

  // WITH BALL
  if (hasBall) {
    const opp = nearestOpponent(p.x, p.y, teamA);

    if (p.x < 350) {
      const shotY = H / 2 + (Math.random() - 0.5) * GOAL_H * 0.8;
      let shotScore = 70 + noise();
      shotScore += (350 - p.x) / 3;
      actions.push({ action: 'shoot', score: shotScore, tx: 10, ty: shotY });
    }

    const goalX = Math.max(30, p.x - MOVE_RADIUS * 0.7);
    const goalY = H / 2 + (Math.random() - 0.5) * 100;
    let dribScore = 40 + noise();
    if (mood === 'counter') dribScore += 20;
    if (opp.d < 60) dribScore -= 25;
    if (opp.d > 120) dribScore += 15;
    if (role === 'fwd') dribScore += 10;
    actions.push({ action: 'dribble', score: dribScore, tx: goalX, ty: goalY });

    for (const t of teamB) {
      if (t === p || t.index === 0) continue;
      const td = dist(p, t);
      if (td < 50 || td > 500) continue;
      const open = isOpen(t, 80, teamA);
      const interceptRisk = passInterceptRisk(p, t, teamA);
      let passScore = 35 + noise();
      if (mood === 'possession') passScore += 20;
      if (open) passScore += 20;
      passScore -= interceptRisk;
      const forwardGain = (p.x - t.x) / W;
      if (forwardGain > 0) passScore += forwardGain * 40;
      if (opp.d < 60) passScore += 25;
      if (aiRole(t) === 'fwd') passScore += 10;
      if (t.x < 350) passScore += 15;
      actions.push({ action: 'pass', score: passScore, tx: t.x, ty: t.y, passTarget: t });
    }
  }

  return actions;
}

// --- Main AI planning ---
export function planAI(state: GameState): void {
  const { teamA, teamB, ball, possession } = state;
  state.aiMood = pickAIMood(state);
  state.aiLastPlan = [];

  const MAX_BALL_CHASERS = state.aiMood === 'pressing' ? 4 : state.aiMood === 'parkbus' ? 2 : 3;

  const playerActions: { p: Player; actions?: ScoredAction[]; best: ScoredAction | null; gk: boolean }[] = [];
  for (const p of teamB) {
    if (p.index === 0 && possession !== p) {
      playerActions.push({ p, best: null, gk: true });
      continue;
    }
    const actions = scoreActions(p, state.aiMood, state);
    actions.sort((a, b) => b.score - a.score);
    playerActions.push({ p, actions, best: null, gk: false });
  }

  const ballChasers = playerActions
    .filter(pa => !pa.gk && pa.actions && pa.actions.length > 0 && (pa.actions[0].action === 'chase' || pa.actions[0].action === 'press'))
    .sort((a, b) => dist(a.p, ball) - dist(b.p, ball));

  const allowedChasers = new Set(ballChasers.slice(0, MAX_BALL_CHASERS).map(pa => pa.p));

  for (const pa of playerActions) {
    const { p } = pa;

    if (pa.gk) {
      const threat = possession || ball;
      const ty = gkAngleY(threat.x, threat.y, p.homeX);
      aiSetTarget(p, p.homeX, ty);
      if (!possession && dist(p, ball) < 120) {
        aiSetTarget(p, ball.x, ball.y);
      }
      state.aiLastPlan.push({ p, actions: [{ action: 'hold', score: 100, tx: p.homeX, ty }], chosen: { action: 'hold', score: 100, tx: p.homeX, ty } });
      continue;
    }

    const { actions } = pa;
    if (!actions || actions.length === 0) continue;

    let best: ScoredAction | null = null;
    for (const a of actions) {
      if ((a.action === 'chase' || a.action === 'press') && !allowedChasers.has(p)) continue;
      best = a;
      break;
    }
    if (!best) best = actions[actions.length - 1];

    state.aiLastPlan.push({ p, actions, chosen: best });

    if (best.action === 'shoot') {
      p.plannedPass = { x: best.tx, y: best.ty, isShot: true };
      const goalDir = { x: best.tx - p.x, y: best.ty - p.y };
      const gd = Math.sqrt(goalDir.x ** 2 + goalDir.y ** 2) || 1;
      aiSetTarget(p, p.x + (goalDir.x / gd) * Math.min(MOVE_RADIUS * 0.5, gd), p.y + (goalDir.y / gd) * Math.min(MOVE_RADIUS * 0.5, gd));
    } else if (best.action === 'pass') {
      p.plannedPass = { x: best.tx, y: best.ty };
      p.passFirst = true;
    } else if (best.action === 'press') {
      aiSetTarget(p, best.tx, best.ty);
      if (best.tackle) p.tackleTarget = possession;
    } else {
      aiSetTarget(p, best.tx, best.ty);
    }
  }

  // Double-team near goal
  if (possession && possession.side === 0 && possession.x > W - 200) {
    let helper: Player | null = null, helperDist = Infinity;
    for (const p of teamB) {
      if (p.index === 0) continue;
      if (p.tackleTarget) continue;
      const d = dist(p, possession);
      if (d < helperDist && d < 280) { helper = p; helperDist = d; }
    }
    if (helper) {
      aiSetTarget(helper, possession.x, possession.y);
      helper.tackleTarget = possession;
    }
  }

  // Pass receivers hold position
  for (const p of teamB) {
    if (p.plannedPass && !p.plannedPass.isShot) {
      const pt = p.plannedPass;
      let receiver: Player | null = null, bestD = Infinity;
      for (const t of teamB) {
        if (t === p || t.index === 0) continue;
        const d = Math.sqrt((t.x - pt.x) ** 2 + (t.y - pt.y) ** 2);
        if (d < bestD) { receiver = t; bestD = d; }
      }
      if (receiver && bestD < 100) {
        aiSetTarget(receiver, pt.x, pt.y);
        receiver._receivingPass = true;
      }
    }
  }

  // Spread targets
  const MIN_TARGET_DIST = 60;
  for (let i = 0; i < teamB.length; i++) {
    for (let j = i + 1; j < teamB.length; j++) {
      const a = teamB[i], b = teamB[j];
      if (a.index === 0 || b.index === 0) continue;
      if (possession === a || possession === b) continue;
      const dx = b.tx - a.tx, dy = b.ty - a.ty;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < MIN_TARGET_DIST && d > 0.1) {
        const push = (MIN_TARGET_DIST - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.tx -= nx * push;
        a.ty -= ny * push;
        b.tx += nx * push;
        b.ty += ny * push;
        a.tx = clamp(a.tx, 30, W - 30);
        a.ty = clamp(a.ty, 30, H - 30);
        b.tx = clamp(b.tx, 30, W - 30);
        b.ty = clamp(b.ty, 30, H - 30);
      }
    }
  }

  // Ball gravity
  if (possession && possession.side === 0) {
    for (const p of teamB) {
      if (possession === p || p.index === 0) continue;
      const d = dist(p, ball);
      const pull = (Math.random() * 0.18) * Math.min(1, 180 / Math.max(d, 60));
      p.tx += (ball.x - p.tx) * pull;
      p.ty += (ball.y - p.ty) * pull;
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > MOVE_RADIUS) { p.tx = p.x + (dx / dd) * MOVE_RADIUS; p.ty = p.y + (dy / dd) * MOVE_RADIUS; }
      p.tx = clamp(p.tx, 30, W - 30);
      p.ty = clamp(p.ty, 30, H - 30);
    }
  }

  // Execute AI pass-first
  for (const p of teamB) {
    if (p.plannedPass && possession === p) {
      if (p.plannedPass.isShot) {
        // Shots execute after dribble
      } else if (p.passFirst) {
        const pp = p.plannedPass;
        const passDist = Math.sqrt((pp.x - ball.x) ** 2 + (pp.y - ball.y) ** 2);
        const power = pp.isShot ? Math.max(20, passDist / 4) : Math.max(6, passDist / 8);
        kickBall(state, pp.x, pp.y, power, pp.isShot);
        p.plannedPass = null;
        p.passFirst = false;
      }
    }
  }

  state.aiPlanReady = true;
}
