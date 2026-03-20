// --- AI planning ---
// Depends on globals from index.html: teamA, teamB, ball, possession, score, round,
// W, H, MOVE_RADIUS, GOAL_Y, GOAL_H, dist(), clamp(), kickBall()

// Team mood system — picked each round based on game state + randomness
let aiMood = 'balanced';

// Set to true after planAI() runs so draw() knows to show the AI plan overlay
let aiPlanReady = false;
// When true, draw all scored actions for every player (not just chosen)
let aiShowAllActions = false;

// Stores scored action data for each team B player after planAI() runs.
// Each entry: { p, actions, chosen }
let aiLastPlan = [];

// The team B player the mouse is hovering over during 'preview' phase (or null).
let aiHoveredPlayer = null;

function pickAIMood() {
  const scoreDiff = score[1] - score[0]; // positive = AI winning
  const ballInAIHalf = ball.x > W / 2;

  // Weight table: [pressing, counter, possession, parkbus]
  let w = [25, 25, 25, 25];

  if (scoreDiff < 0) { w[0] += 30; w[2] += 15; w[3] -= 15; } // losing: press more
  if (scoreDiff > 0) { w[3] += 25; w[1] += 15; w[0] -= 15; } // winning: sit back
  if (scoreDiff === 0 && round > 20) { w[0] += 20; w[2] += 10; } // late tie: push
  if (ballInAIHalf) { w[0] += 10; w[3] += 10; } // ball in our half: defensive bias
  if (!ballInAIHalf) { w[1] += 15; w[2] += 10; } // ball in their half: keep possession

  // Clamp negatives
  w = w.map(v => Math.max(5, v));
  const total = w.reduce((a, b) => a + b);
  let r = Math.random() * total;
  const moods = ['pressing', 'counter', 'possession', 'parkbus'];
  for (let i = 0; i < 4; i++) {
    r -= w[i];
    if (r <= 0) return moods[i];
  }
  return 'possession';
}

// Role helper: 0=GK, 1-4=DEF, 5-8=MID, 9-10=FWD
function aiRole(p) {
  if (p.index === 0) return 'gk';
  if (p.index <= 4) return 'def';
  if (p.index <= 8) return 'mid';
  return 'fwd';
}

// Find open space — pick a random point biased by zone, avoid clustering
function findSpace(p, zoneX, zoneY, spread) {
  let bestX = zoneX + (Math.random() - 0.5) * spread;
  let bestY = zoneY + (Math.random() - 0.5) * spread * 0.8;
  // Nudge away from nearest teammate
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

// Check if a teammate is "open" (no team A player within radius)
function isOpen(p, radius) {
  for (const a of teamA) {
    if (dist(a, p) < radius) return false;
  }
  return true;
}

// Distance from point (px,py) to line segment (ax,ay)-(bx,by)
function pointToSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

// Returns an intercept risk score (0 = safe, up to ~80 = highly dangerous).
// For each team A player, finds their closest point on the pass segment, then
// compares: time for ball to reach that point vs. time for player to run there.
// If the player wins the race (or is very close to the path), risk is high.
function passInterceptRisk(from, to) {
  const pdx = to.x - from.x, pdy = to.y - from.y;
  const passDist = Math.sqrt(pdx * pdx + pdy * pdy);
  if (passDist < 1) return 0;
  // Ball's effective average speed (initial speed minus friction decay)
  const ballSpeed = Math.max(6, passDist / 8) * 0.85;
  const playerSpeed = 3.0; // typical player speed px/frame

  let maxRisk = 0;
  for (const a of teamA) {
    // Fraction along segment of closest point
    const t = Math.max(0, Math.min(1, ((a.x - from.x) * pdx + (a.y - from.y) * pdy) / (passDist * passDist)));
    const cx = from.x + t * pdx, cy = from.y + t * pdy;
    const playerDist = Math.sqrt((a.x - cx) ** 2 + (a.y - cy) ** 2);

    // Only threaten if reachable within one round's sprint
    if (playerDist > MOVE_RADIUS) continue;

    const ballDist = t * passDist;
    const playerTime = playerDist / playerSpeed;
    const ballTime = ballDist / ballSpeed;
    const timeAdvantage = ballTime - playerTime; // positive = player wins the race

    let risk = 0;
    if (timeAdvantage > 0) {
      // Player can reach the path before the ball — real interception threat
      risk = Math.min(80, 20 + timeAdvantage * 4 + (1 - playerDist / MOVE_RADIUS) * 30);
    } else {
      // Ball is faster, but still risky if player is right on the path
      risk = Math.max(0, (40 - playerDist) * 0.6);
    }
    maxRisk = Math.max(maxRisk, risk);
  }
  return maxRisk;
}

// GK angle positioning: stand on the line from threat to goal center at the goal line x.
// This narrows the shooting angle rather than just tracking the ball's y.
function gkAngleY(threatX, threatY, gkHomeX) {
  const goalCenterY = H / 2;
  const dx = W - threatX;
  if (Math.abs(dx) < 1) return goalCenterY; // threat is at the goal line
  const t = (gkHomeX - threatX) / dx;
  const y = threatY + t * (goalCenterY - threatY);
  return clamp(y, GOAL_Y + 16, GOAL_Y + GOAL_H - 16);
}

// Nearest team A player to a point
function nearestOpponent(x, y) {
  let best = null, bestD = Infinity;
  for (const a of teamA) {
    const d = Math.sqrt((a.x - x) ** 2 + (a.y - y) ** 2);
    if (d < bestD) { best = a; bestD = d; }
  }
  return { p: best, d: bestD };
}

function aiSetTarget(p, tx, ty) {
  const dx = tx - p.x, dy = ty - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > MOVE_RADIUS) {
    p.tx = p.x + (dx / d) * MOVE_RADIUS;
    p.ty = p.y + (dy / d) * MOVE_RADIUS;
  } else {
    p.tx = tx; p.ty = ty;
  }
}

// Score an action for a player given mood — returns {action, score, target}
function scoreActions(p, mood) {
  const role = aiRole(p);
  const hasBall = possession === p;
  const teamHasBall = possession && possession.side === 1;
  const oppHasBall = possession && possession.side === 0;
  const actions = [];
  const noise = () => Math.random() * 20; // unpredictability

  // --- GK always special ---
  if (role === 'gk' && !hasBall) {
    const threat = possession || ball;
    const ty = gkAngleY(threat.x, threat.y, p.homeX);
    actions.push({ action: 'hold', score: 100, tx: p.homeX, ty });
    // GK comes out for loose ball if very close
    if (!possession && dist(p, ball) < 150) {
      actions.push({ action: 'chase', score: 80 + noise(), tx: ball.x, ty: ball.y });
    }
    return actions;
  }

  // --- PRESS: close down ball carrier ---
  if (oppHasBall && role !== 'gk') {
    const dp = dist(p, possession);
    let pressScore = 30 + noise();
    if (mood === 'pressing') pressScore += 40;
    if (mood === 'counter') pressScore -= 10;
    if (mood === 'parkbus') pressScore -= 20;
    if (dp < 250) pressScore += 30; // closer = more likely to press
    if (role === 'fwd') pressScore += 10; // forwards press from front
    if (role === 'def' && dp > 300) pressScore -= 30; // defenders don't chase far
    actions.push({ action: 'press', score: pressScore, tx: possession.x, ty: possession.y, tackle: true });
  }

  // --- MARK: shadow nearest opponent ---
  if (oppHasBall && (role === 'def' || role === 'mid')) {
    // Find nearest team A player that isn't the ball carrier
    let markTarget = null, markDist = Infinity;
    for (const a of teamA) {
      if (a === possession) continue;
      const d = dist(p, a);
      // Prefer marking players in dangerous positions
      const dangerBonus = (a.x > W / 2) ? 30 : 0;
      if (d - dangerBonus < markDist) { markTarget = a; markDist = d - dangerBonus; }
    }
    if (markTarget) {
      let markScore = 25 + noise();
      if (mood === 'parkbus') markScore += 30;
      if (mood === 'pressing') markScore -= 10;
      if (role === 'def') markScore += 15;
      // Track runners making dangerous runs into our half
      if (markTarget.x > W * 0.6) markScore += 25;  // entering attacking zone
      if (markTarget.x > W * 0.75) markScore += 20; // near penalty area — must track
      const dToMark = dist(p, markTarget);
      if (dToMark < 120) markScore += 15; // close: stay tight on them
      // Covering shadow: stand goal-side of the runner, angled toward goal center
      // This blocks both the pass to them AND their run to goal simultaneously
      const mx = markTarget.x * 0.5 + (W - 50) * 0.5;
      const my = markTarget.y * 0.75 + (H / 2) * 0.25;
      actions.push({ action: 'mark', score: markScore, tx: mx, ty: my });
    }
  }

  // --- CLOSE DOWN: cover nearby team A players who could receive a pass ---
  if (oppHasBall && role !== 'gk') {
    for (const a of teamA) {
      if (a === possession) continue;
      const d = dist(p, a);
      if (d > 220) continue; // only close down players already nearby
      let closeScore = 38 + noise();
      if (role === 'mid') closeScore += 12;
      if (role === 'def') closeScore += 8;
      if (a.x > W * 0.5) closeScore += 20; // dangerous receiving zone
      if (a.x > W * 0.7) closeScore += 15; // near box — must close
      if (d < 100) closeScore += 15; // very close: get tight
      actions.push({ action: 'closedown', score: closeScore, tx: a.x, ty: a.y });
    }
  }

  // --- STEP UP: defenders goal-side of ball close the space ---
  if (oppHasBall && (role === 'def' || role === 'mid') && possession.x > W * 0.5 && p.x > possession.x + 20) {
    // We're between the ball and our goal — squeeze toward ball to cut space
    const stepX = Math.max(possession.x + 25, p.x - MOVE_RADIUS * 0.8);
    const stepY = p.homeY + (possession.y / H - 0.5) * 50;
    let stepScore = 48 + noise();
    if (role === 'def') stepScore += 10;
    if (possession.x > W * 0.65) stepScore += 15; // more urgent near box
    actions.push({ action: 'stepup', score: stepScore, tx: stepX, ty: stepY });
  }

  // --- HOLD SHAPE: shift with ball position ---
  if (!hasBall) {
    let holdScore = 20 + noise();
    if (mood === 'parkbus') holdScore += 25;
    if (mood === 'counter' && !teamHasBall) holdScore += 20;
    let hx, hy;

    if (oppHasBall && role !== 'gk') {
      // Block compression: each player moves a randomised fraction toward the ball,
      // breaking the "army" look while still reducing space.
      const gravFactor = 0.2 + Math.random() * 0.25; // 0.20–0.45, different per player
      hx = p.homeX + (ball.x - p.homeX) * gravFactor;
      hx = Math.max(hx, ball.x + 45); // stay goal-side of the carrier
      const yFactor = (role === 'def' ? 0.2 : 0.35) + Math.random() * 0.15;
      hy = p.homeY + (ball.y - H / 2) * yFactor;
      // Per-player position jitter so they don't line up identically
      hx += (Math.random() - 0.5) * 50;
      hy += (Math.random() - 0.5) * 50;
      holdScore += 22;
      if (mood === 'parkbus') hx = Math.max(hx, W * 0.55);
      if (role === 'mid') hx = Math.max(hx, W * 0.65); // mid drop — screen defense
    } else {
      // Standard positional shift when team has ball or no possession
      const shiftX = (ball.x / W - 0.5) * (mood === 'parkbus' ? 80 : 140);
      const shiftY = (ball.y / H - 0.5) * 60;
      hx = p.homeX + shiftX;
      hy = p.homeY + shiftY;
      if (mood === 'parkbus') hx = Math.max(hx, W * 0.55);
    }

    actions.push({ action: 'hold', score: holdScore, tx: hx, ty: hy });
  }

  // --- MOVE TO SPACE: find open field ---
  if (teamHasBall && !hasBall) {
    let spaceScore = 20 + noise();
    if (mood === 'possession') spaceScore += 30;
    if (mood === 'counter' && teamHasBall) spaceScore += 25;
    // Zone depends on role
    let zx, zy;
    if (role === 'fwd') {
      zx = W * 0.2 + Math.random() * W * 0.25; // attacking third
      zy = H * 0.5;
    } else if (role === 'mid') {
      zx = W * 0.35 + Math.random() * W * 0.2;
      zy = p.homeY;
    } else {
      zx = W * 0.55 + Math.random() * W * 0.15;
      zy = p.homeY;
    }
    const sp = findSpace(p, zx, zy, 200);
    actions.push({ action: 'space', score: spaceScore, tx: sp.x, ty: sp.y });
  }

  // --- MAKE A RUN: sprint toward goal ---
  if (teamHasBall && !hasBall && (role === 'fwd' || role === 'mid')) {
    let runScore = 35 + noise();
    if (mood === 'counter' && teamHasBall) runScore += 35;
    if (mood === 'pressing') runScore += 20;
    if (role === 'fwd') runScore += 25;
    // Bonus if already in attacking half
    if (p.x < W / 2) runScore += 15;
    // Run toward a point near their goal
    const runX = 50 + Math.random() * 150;
    const runY = H * 0.2 + Math.random() * H * 0.6;
    actions.push({ action: 'run', score: runScore, tx: runX, ty: runY });
  }

  // --- CHASE LOOSE BALL ---
  if (!possession) {
    const db = dist(p, ball);
    let chaseScore = 50 + noise();
    if (db < 200) chaseScore += 40;
    if (role === 'fwd' || role === 'mid') chaseScore += 15;
    if (role === 'def' && db > 300) chaseScore -= 30;
    actions.push({ action: 'chase', score: chaseScore, tx: ball.x, ty: ball.y });
  }

  // --- WITH BALL: dribble / pass / shoot ---
  if (hasBall) {
    const opp = nearestOpponent(p.x, p.y);

    // Shoot if in range — high priority, scales with proximity
    if (p.x < 350) {
      const shotY = H / 2 + (Math.random() - 0.5) * GOAL_H * 0.8;
      let shotScore = 70 + noise();
      shotScore += (350 - p.x) / 3; // up to +116 when right at goal
      actions.push({ action: 'shoot', score: shotScore, tx: 10, ty: shotY });
    }

    // Dribble toward goal
    const goalX = Math.max(30, p.x - MOVE_RADIUS * 0.7);
    const goalY = H / 2 + (Math.random() - 0.5) * 100;
    let dribScore = 40 + noise();
    if (mood === 'counter') dribScore += 20;
    if (opp.d < 60) dribScore -= 25; // pressure: prefer passing
    if (opp.d > 120) dribScore += 15; // space ahead: go for it
    if (role === 'fwd') dribScore += 10;
    actions.push({ action: 'dribble', score: dribScore, tx: goalX, ty: goalY });

    // Pass to open teammate
    for (const t of teamB) {
      if (t === p || t.index === 0) continue;
      const td = dist(p, t);
      if (td < 50 || td > 500) continue;
      const open = isOpen(t, 80);
      const interceptRisk = passInterceptRisk(p, t);
      let passScore = 35 + noise();
      if (mood === 'possession') passScore += 20;
      if (open) passScore += 20;
      passScore -= interceptRisk; // penalise based on how easily a player can intercept
      // Forward pass bonus
      const forwardGain = (p.x - t.x) / W;
      if (forwardGain > 0) passScore += forwardGain * 40;
      if (opp.d < 60) passScore += 25; // under pressure: pass!
      if (aiRole(t) === 'fwd') passScore += 10;
      if (t.x < 350) passScore += 15; // pass into shooting range
      actions.push({ action: 'pass', score: passScore, tx: t.x, ty: t.y, passTarget: t });
    }
  }

  return actions;
}

function planAI() {
  aiMood = pickAIMood();
  aiLastPlan = [];

  const MAX_BALL_CHASERS = aiMood === 'pressing' ? 4 : aiMood === 'parkbus' ? 2 : 3;

  // First pass: score all actions for each player
  const playerActions = [];
  for (const p of teamB) {
    if (p.index === 0 && possession !== p) {
      playerActions.push({ p, best: null, gk: true });
      continue;
    }
    const actions = scoreActions(p, aiMood);
    actions.sort((a, b) => b.score - a.score);
    playerActions.push({ p, actions, best: null, gk: false });
  }

  // Determine who gets to chase/press the ball (max 2, pick closest)
  const ballChasers = playerActions
    .filter(pa => !pa.gk && pa.actions && pa.actions.length > 0 && (pa.actions[0].action === 'chase' || pa.actions[0].action === 'press'))
    .sort((a, b) => dist(a.p, ball) - dist(b.p, ball));

  const allowedChasers = new Set(ballChasers.slice(0, MAX_BALL_CHASERS).map(pa => pa.p));

  // Second pass: assign actions, redirecting excess chasers to mark/hold
  for (const pa of playerActions) {
    const { p } = pa;

    if (pa.gk) {
      const threat = possession || ball;
      const ty = gkAngleY(threat.x, threat.y, p.homeX);
      aiSetTarget(p, p.homeX, ty);
      if (!possession && dist(p, ball) < 120) {
        aiSetTarget(p, ball.x, ball.y);
      }
      // Record GK in aiLastPlan with a synthetic hold action
      aiLastPlan.push({ p, actions: [{ action: 'hold', score: 100, tx: p.homeX, ty }], chosen: { action: 'hold', score: 100 } });
      continue;
    }

    const { actions } = pa;
    if (!actions || actions.length === 0) continue;

    // Pick best action, but skip chase/press if not in allowed chasers
    let best = null;
    for (const a of actions) {
      if ((a.action === 'chase' || a.action === 'press') && !allowedChasers.has(p)) continue;
      best = a;
      break;
    }
    if (!best) best = actions[actions.length - 1]; // fallback to lowest-scored

    // Record for visualizer
    aiLastPlan.push({ p, actions, chosen: best });

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

  // Double-team: if team A has ball near our goal, second player converges
  if (possession && possession.side === 0 && possession.x > W - 200) {
    let helper = null, helperDist = Infinity;
    for (const p of teamB) {
      if (p.index === 0) continue; // skip GK
      if (p.tackleTarget) continue; // already assigned to tackle
      const d = dist(p, possession);
      if (d < helperDist && d < 280) { helper = p; helperDist = d; }
    }
    if (helper) {
      aiSetTarget(helper, possession.x, possession.y);
      helper.tackleTarget = possession;
    }
  }

  // Make pass receivers hold position near where the pass is aimed
  for (const p of teamB) {
    if (p.plannedPass && !p.plannedPass.isShot) {
      // Find the teammate closest to the pass target
      const pt = p.plannedPass;
      let receiver = null, bestD = Infinity;
      for (const t of teamB) {
        if (t === p || t.index === 0) continue;
        const d = Math.sqrt((t.x - pt.x) ** 2 + (t.y - pt.y) ** 2);
        if (d < bestD) { receiver = t; bestD = d; }
      }
      if (receiver && bestD < 100) {
        // Tell receiver to stay put or move only slightly toward the pass
        aiSetTarget(receiver, pt.x, pt.y);
        receiver._receivingPass = true;
      }
    }
  }

  // Spread out AI targets that are too close together
  const MIN_TARGET_DIST = 60;
  for (let i = 0; i < teamB.length; i++) {
    for (let j = i + 1; j < teamB.length; j++) {
      const a = teamB[i], b = teamB[j];
      // Skip GK and ball carrier
      if (a.index === 0 || b.index === 0) continue;
      if (possession === a || possession === b) continue;
      const dx = b.tx - a.tx, dy = b.ty - a.ty;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < MIN_TARGET_DIST && d > 0.1) {
        const push = (MIN_TARGET_DIST - d) / 2;
        const nx = dx / d, ny = dy / d;
        // Push targets apart, re-clamp to move radius
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

  // Ball gravity: nudge every non-ball-carrier's final target slightly toward the ball.
  // Strength is randomised per player so they drift at different rates — breaks sync.
  if (possession && possession.side === 0) {
    for (const p of teamB) {
      if (possession === p || p.index === 0) continue;
      const d = dist(p, ball);
      // Gravity weakens with distance so far-away players aren't dragged wildly
      const pull = (Math.random() * 0.18) * Math.min(1, 180 / Math.max(d, 60));
      p.tx += (ball.x - p.tx) * pull;
      p.ty += (ball.y - p.ty) * pull;
      // Re-clamp to move radius
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > MOVE_RADIUS) { p.tx = p.x + (dx / dd) * MOVE_RADIUS; p.ty = p.y + (dy / dd) * MOVE_RADIUS; }
      p.tx = clamp(p.tx, 30, W - 30);
      p.ty = clamp(p.ty, 30, H - 30);
    }
  }

  // Execute AI planned passes/shots immediately for pass-first
  for (const p of teamB) {
    if (p.plannedPass && possession === p) {
      if (p.plannedPass.isShot) {
        // Shots execute after dribble arrives (handled in movePlayer)
      } else if (p.passFirst) {
        const pp = p.plannedPass;
        const passDist = Math.sqrt((pp.x - ball.x) ** 2 + (pp.y - ball.y) ** 2);
        const power = pp.isShot ? Math.max(20, passDist / 4) : Math.max(6, passDist / 8);
        kickBall(pp.x, pp.y, power, pp.isShot);
        p.plannedPass = null;
        p.passFirst = false;
      }
    }
  }

  aiPlanReady = true;
}

// --- AI plan visualizer ---
// Call from draw() during 'preview' phase.
// Depends on globals: ctx, teamB, possession, aiMood, aiLastPlan, aiHoveredPlayer,
//                     aiShowAllActions, W, H
function drawAIPlan() {
  if (!aiPlanReady) return;

  // --- Helpers ---
  function arrowHead(ex, ey, dx, dy, size) {
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle - Math.PI / 6), ey - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(ex - size * Math.cos(angle + Math.PI / 6), ey - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function drawBadge(bx, by, text, bgColor, textColor) {
    ctx.save();
    ctx.font = 'bold 10px monospace';
    const tw = ctx.measureText(text).width;
    const padX = 5;
    const bw = tw + padX * 2, bh = 18;
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 4);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, by);
    ctx.restore();
  }

  // Returns a color and lineWidth based on a score value
  function scoreStyle(score) {
    if (score > 60)  return { color: 'rgba(80,255,100,0.80)',  lw: 2.5 };
    if (score > 40)  return { color: 'rgba(255,220,50,0.75)',  lw: 1.8 };
    if (score > 20)  return { color: 'rgba(255,140,40,0.60)',  lw: 1.2 };
    return               { color: 'rgba(255,80,80,0.35)',    lw: 0.8 };
  }

  // Returns a label for an action — includes target player number for passes
  function actionLabel(a) {
    const s = Math.round(a.score);
    if (a.action === 'pass' && a.passTarget) return `→#${a.passTarget.index + 1}: ${s}`;
    if (a.action === 'shoot') return `SHOT: ${s}`;
    return `${a.action}: ${s}`;
  }

  // --- 1. Player numbers for all team B players ---
  for (const pa of aiLastPlan) {
    const p = pa.p;
    ctx.save();
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Small dark circle behind number
    ctx.fillStyle = 'rgba(10,10,30,0.75)';
    ctx.beginPath();
    ctx.arc(p.x + 14, p.y - 14, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffaaaa';
    ctx.fillText('' + (p.index + 1), p.x + 14, p.y - 14);
    ctx.restore();
  }

  // --- 2. Per-player: chosen move arrow + pass/shot line + action badge ---
  for (const pa of aiLastPlan) {
    const p = pa.p;

    // Chosen move arrow (dashed red)
    const moveDx = p.tx - p.x, moveDy = p.ty - p.y;
    const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
    if (moveDist > 8) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.75)';
      ctx.fillStyle = 'rgba(255, 80, 80, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.tx, p.ty);
      ctx.stroke();
      ctx.setLineDash([]);
      arrowHead(p.tx, p.ty, moveDx, moveDy, 8);
      ctx.restore();
    }

    // Chosen pass/shot line
    if (p.plannedPass) {
      const pp = p.plannedPass;
      const passDx = pp.x - p.x, passDy = pp.y - p.y;
      const passDist = Math.sqrt(passDx * passDx + passDy * passDy);
      if (passDist > 8) {
        ctx.save();
        if (pp.isShot) {
          ctx.strokeStyle = 'rgba(255, 230, 0, 0.9)';
          ctx.fillStyle = 'rgba(255, 230, 0, 0.9)';
          ctx.lineWidth = 2.5;
        } else {
          ctx.strokeStyle = 'rgba(255, 160, 0, 0.85)';
          ctx.fillStyle = 'rgba(255, 160, 0, 0.85)';
          ctx.lineWidth = 2;
        }
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(pp.x, pp.y);
        ctx.stroke();
        if (pp.isShot) {
          const angle = Math.atan2(passDy, passDx), sz = 10;
          ctx.beginPath();
          ctx.moveTo(pp.x, pp.y);
          ctx.lineTo(pp.x - sz * Math.cos(angle - Math.PI / 5), pp.y - sz * Math.sin(angle - Math.PI / 5));
          ctx.lineTo(pp.x - sz * 1.5 * Math.cos(angle), pp.y - sz * 1.5 * Math.sin(angle));
          ctx.lineTo(pp.x - sz * Math.cos(angle + Math.PI / 5), pp.y - sz * Math.sin(angle + Math.PI / 5));
          ctx.closePath();
          ctx.fill();
        } else {
          arrowHead(pp.x, pp.y, passDx, passDy, 9);
        }
        ctx.restore();
      }
    }

    // Chosen action badge (skip GK)
    if (pa.chosen && p.index !== 0) {
      const label = actionLabel(pa.chosen);
      drawBadge(p.x + 18, p.y - 30, label, 'rgba(20,20,40,0.88)', '#ff9090');
    }
  }

  // --- 3. All-actions mode: draw every scored action for every player ---
  if (aiShowAllActions) {
    for (const pa of aiLastPlan) {
      if (!pa.actions) continue;
      const p = pa.p;
      for (const a of pa.actions) {
        const isChosen = a === pa.chosen;
        if (isChosen) continue; // already drawn above
        const tx = a.passTarget ? a.passTarget.x : a.tx;
        const ty = a.passTarget ? a.passTarget.y : a.ty;
        const dx = tx - p.x, dy = ty - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 8) continue;
        const { color, lw } = scoreStyle(a.score);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lw;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        arrowHead(tx, ty, dx, dy, 6);
        // Label at midpoint
        const mx = (p.x + tx) / 2, my = (p.y + ty) / 2;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(actionLabel(a), mx, my - 6);
        ctx.restore();
      }
    }
  } else {
    // Even without all-actions mode: show pass/shoot considerations for the ball carrier
    for (const pa of aiLastPlan) {
      if (possession !== pa.p || !pa.actions) continue;
      const p = pa.p;
      for (const a of pa.actions) {
        if (a.action !== 'pass' && a.action !== 'shoot') continue;
        if (a === pa.chosen) continue;
        const tx = a.passTarget ? a.passTarget.x : a.tx;
        const ty = a.passTarget ? a.passTarget.y : a.ty;
        const dx = tx - p.x, dy = ty - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 5) continue;
        const { color, lw } = scoreStyle(a.score);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        arrowHead(tx, ty, dx, dy, 6);
        const mx = (p.x + tx) / 2, my = (p.y + ty) / 2;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(actionLabel(a), mx, my - 6);
        ctx.restore();
      }
    }
  }

  // --- 4. Hover panel ---
  if (aiHoveredPlayer && aiHoveredPlayer.side === 1) {
    const pa = aiLastPlan.find(e => e.p === aiHoveredPlayer);
    if (pa && pa.actions && pa.actions.length > 0) {
      const p = aiHoveredPlayer;
      const top5 = pa.actions.slice(0, 5);
      const lineH = 18;
      const panelW = 190;
      const panelH = 22 + top5.length * lineH;
      let px = p.x + 20, py = p.y - panelH - 10;
      if (px + panelW > W - 10) px = p.x - panelW - 20;
      if (py < 10) py = p.y + 20;

      ctx.save();
      ctx.fillStyle = 'rgba(10,10,30,0.92)';
      ctx.beginPath();
      ctx.roundRect(px, py, panelW, panelH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#ff9090';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`#${p.index + 1} ${aiRole(p)}`, px + 8, py + 6);

      const circled = ['①','②','③','④','⑤'];
      for (let i = 0; i < top5.length; i++) {
        const a = top5[i];
        const isChosen = a === pa.chosen;
        const rowY = py + 22 + i * lineH;
        if (isChosen) {
          ctx.fillStyle = 'rgba(255,120,120,0.18)';
          ctx.fillRect(px + 2, rowY - 1, panelW - 4, lineH);
        }
        ctx.font = (isChosen ? 'bold' : '') + ' 10px monospace';
        ctx.fillStyle = isChosen ? '#ffdddd' : '#aaaaaa';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        // Action name with pass target if applicable
        const aLabel = a.action === 'pass' && a.passTarget
          ? `pass → #${a.passTarget.index + 1}`
          : a.action;
        ctx.fillText(circled[i] + ' ' + aLabel, px + 8, rowY + 2);
        ctx.textAlign = 'right';
        ctx.fillText('' + Math.round(a.score), px + panelW - 8, rowY + 2);
      }
      ctx.restore();
    }
  }

  // --- 5. AI mood label (top-right) ---
  const moodColors = { pressing:'#ff6060', counter:'#60d0ff', possession:'#80ff80', parkbus:'#ffcc40', balanced:'#cccccc' };
  const moodColor = moodColors[aiMood] || '#ffffff';
  const moodLabel = 'AI: ' + aiMood;
  ctx.save();
  ctx.font = 'bold 13px monospace';
  const textW = ctx.measureText(moodLabel).width;
  const lx = W - textW - 18, ly = 16;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(lx - 6, ly - 13, textW + 12, 20);
  ctx.fillStyle = moodColor;
  ctx.fillText(moodLabel, lx, ly);
  ctx.restore();
}
