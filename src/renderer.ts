// --- Canvas rendering ---

import type { Player, GameState, AIPlanEntry, ScoredAction } from './types';
import { W, H, GOAL_W, GOAL_H, GOAL_Y, MOVE_RADIUS, PLAY_DURATION, TEAM_PALETTES } from './types';
import { dist } from './engine';
import { aiRole } from './ai';
import { drawPixelPlayer, advanceAnimation } from './sprites';

export interface DragState {
  dragging: Player | null;
  dragMouse: { x: number; y: number } | null;
  dragActive: boolean;
  dragStartPos: { x: number; y: number } | null;
  dragButton: number;
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = W;
  canvas.height = H;

  function drawField(): void {
    ctx.fillStyle = '#2d8a4e';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 60) {
      ctx.fillStyle = i % 120 === 0 ? '#2d8a4e' : '#278a46';
      ctx.fillRect(i, 0, 60, H);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 80, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    const paW = 150, paH = 350, paY = (H - paH) / 2;
    ctx.strokeRect(0, paY, paW, paH); ctx.strokeRect(W - paW, paY, paW, paH);
    const gaW = 50, gaH = 200, gaY = (H - gaH) / 2;
    ctx.strokeRect(0, gaY, gaW, gaH); ctx.strokeRect(W - gaW, gaY, gaW, gaH);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, GOAL_Y, GOAL_W, GOAL_H); ctx.fillRect(W - GOAL_W, GOAL_Y, GOAL_W, GOAL_H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, GOAL_Y - 3, GOAL_W, 6); ctx.fillRect(0, GOAL_Y + GOAL_H - 3, GOAL_W, 6);
    ctx.fillRect(W - GOAL_W, GOAL_Y - 3, GOAL_W, 6); ctx.fillRect(W - GOAL_W, GOAL_Y + GOAL_H - 3, GOAL_W, 6);
  }

  function drawPlayer(p: Player, state: GameState, hoveredPlayer: Player | null): void {
    const palette = TEAM_PALETTES[p.side];

    // Move radius for selected player
    if (state.phase === 'plan' && p === state.selected && p.side === 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, MOVE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,235,59,0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,235,59,0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Selection ring
    if (p === state.selected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Planned move target
    if (state.phase === 'plan' && p.side === 0 && p.hasOrder) {
      const dx = p.tx - p.x, dy = p.ty - p.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        ctx.beginPath();
        ctx.arc(p.tx, p.ty, 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,235,59,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.tx, p.ty);
        ctx.strokeStyle = 'rgba(255,235,59,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (p.tackleTarget) {
        ctx.fillStyle = 'rgba(255,100,100,0.9)';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('T', p.x, p.y - p.radius - 12);
      }
    }

    // Planned pass/kick
    if (state.phase === 'plan' && p.side === 0 && p.plannedPass) {
      const { x: tx, y: ty } = p.plannedPass;
      const hasDribble = p.hasOrder && (Math.abs(p.tx - p.x) > 5 || Math.abs(p.ty - p.y) > 5);
      const sx = (hasDribble && !p.passFirst) ? p.tx : p.x;
      const sy = (hasDribble && !p.passFirst) ? p.ty : p.y;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = 'rgba(100,200,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(tx, ty, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(100,200,255,0.6)';
      ctx.fill();
    }

    // Possession glow
    if (state.possession === p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = p.side === 0 ? 'rgba(33,150,243,0.5)' : 'rgba(244,67,54,0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Has order indicator
    if (state.phase === 'plan' && p.side === 0 && p.hasOrder) {
      ctx.beginPath();
      ctx.arc(p.x + p.radius + 3, p.y - p.radius - 6, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#4CAF50';
      ctx.fill();
    }

    // Shadow
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 10, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // Pixel sprite
    drawPixelPlayer(ctx, p, palette);

    // Stamina bar (below sprite)
    if (p.stats && p.currentStamina < p.stats.stamina * 0.95) {
      const barW = 20, barH = 3;
      const bx = p.x - barW / 2, by = p.y + p.radius + 2;
      const ratio = p.currentStamina / p.stats.stamina;
      const color = ratio > 0.6 ? '#4CAF50' : ratio > 0.3 ? '#FFC107' : '#f44336';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, barW * ratio, barH);
    }

    // Jersey number (always show on select, show on hover only if not showing stats panel)
    if (p === state.selected && p !== hoveredPlayer) {
      const label = '' + (p.index + 1);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(label).width;
      const px = p.x, py = p.y - 20;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.roundRect(px - tw / 2 - 4, py - 12, tw + 8, 14, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, px, py);
    }
  }

  function drawBall(state: GameState): void {
    const { ball } = state;
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 3, ball.radius + 1, ball.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
  }

  function drawDragLine(drag: DragState): void {
    if (!drag.dragging || !drag.dragMouse || !drag.dragActive) return;
    const isPass = drag.dragButton === 2;
    const color = isPass ? 'rgba(100,200,255,0.8)' : 'rgba(255,235,59,0.6)';

    const startX = isPass ? drag.dragStartPos!.x : drag.dragging.x;
    const startY = isPass ? drag.dragStartPos!.y : drag.dragging.y;

    let tx = drag.dragMouse.x, ty = drag.dragMouse.y;
    if (!isPass) {
      const dx = drag.dragMouse.x - drag.dragging.x, dy = drag.dragMouse.y - drag.dragging.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > MOVE_RADIUS) {
        tx = drag.dragging.x + (dx / d) * MOVE_RADIUS;
        ty = drag.dragging.y + (dy / d) * MOVE_RADIUS;
      }
    }

    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(tx, ty, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawGoalFlash(state: GameState): void {
    if (state.goalFlash <= 0) return;
    ctx.fillStyle = `rgba(255, 255, 100, ${state.goalFlash / 120})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 72px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOAL!', W / 2, H / 2);
    state.goalFlash--;
  }

  // --- AI Plan Visualizer ---
  function arrowHead(ex: number, ey: number, dx: number, dy: number, size: number): void {
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle - Math.PI / 6), ey - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(ex - size * Math.cos(angle + Math.PI / 6), ey - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function drawBadge(bx: number, by: number, text: string, bgColor: string, textColor: string): void {
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

  function scoreStyle(score: number): { color: string; lw: number } {
    if (score > 60) return { color: 'rgba(80,255,100,0.80)', lw: 2.5 };
    if (score > 40) return { color: 'rgba(255,220,50,0.75)', lw: 1.8 };
    if (score > 20) return { color: 'rgba(255,140,40,0.60)', lw: 1.2 };
    return { color: 'rgba(255,80,80,0.35)', lw: 0.8 };
  }

  function actionLabel(a: ScoredAction): string {
    const s = Math.round(a.score);
    if (a.action === 'pass' && a.passTarget) return `→#${a.passTarget.index + 1}: ${s}`;
    if (a.action === 'shoot') return `SHOT: ${s}`;
    return `${a.action}: ${s}`;
  }

  function drawAIPlan(state: GameState): void {
    if (!state.aiPlanReady) return;

    // Player numbers
    for (const pa of state.aiLastPlan) {
      const p = pa.p;
      ctx.save();
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(10,10,30,0.75)';
      ctx.beginPath();
      ctx.arc(p.x + 14, p.y - 14, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffaaaa';
      ctx.fillText('' + (p.index + 1), p.x + 14, p.y - 14);
      ctx.restore();
    }

    // Per-player: chosen move arrow + pass/shot line + action badge
    for (const pa of state.aiLastPlan) {
      const p = pa.p;

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

      if (pa.chosen && p.index !== 0) {
        const label = actionLabel(pa.chosen);
        drawBadge(p.x + 18, p.y - 30, label, 'rgba(20,20,40,0.88)', '#ff9090');
      }
    }

    // All-actions mode or ball carrier pass/shoot options
    if (state.aiShowAllActions) {
      for (const pa of state.aiLastPlan) {
        if (!pa.actions) continue;
        const p = pa.p;
        for (const a of pa.actions) {
          if (a === pa.chosen) continue;
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
          const mx = (p.x + tx) / 2, my = (p.y + ty) / 2;
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(actionLabel(a), mx, my - 6);
          ctx.restore();
        }
      }
    } else {
      for (const pa of state.aiLastPlan) {
        if (state.possession !== pa.p || !pa.actions) continue;
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

    // Hover panel
    if (state.aiHoveredPlayer && state.aiHoveredPlayer.side === 1) {
      const pa = state.aiLastPlan.find(e => e.p === state.aiHoveredPlayer);
      if (pa && pa.actions && pa.actions.length > 0) {
        const p = state.aiHoveredPlayer;
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

        const circled = ['\u2460', '\u2461', '\u2462', '\u2463', '\u2464'];
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

    // LLM reasoning display (hover panel for LLM-planned players)
    if (state.llmPlayerReasons.size > 0 && state.aiHoveredPlayer && state.aiHoveredPlayer.side === 1) {
      const reason = state.llmPlayerReasons.get(state.aiHoveredPlayer.index);
      if (reason) {
        const p = state.aiHoveredPlayer;
        const maxW = 220;
        ctx.save();
        ctx.font = '11px monospace';
        // Wrap text
        const words = reason.split(' ');
        const lines: string[] = [];
        let line = '';
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > maxW - 16) {
            lines.push(line);
            line = w;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);

        const lineH = 14;
        const panelH = 10 + lines.length * lineH;
        let px = p.x + 20, py = p.y + 25;
        if (px + maxW > W - 10) px = p.x - maxW - 20;
        if (py + panelH > H - 10) py = p.y - panelH - 10;

        ctx.fillStyle = 'rgba(10,10,40,0.92)';
        ctx.beginPath();
        ctx.roundRect(px, py, maxW, panelH, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,180,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#aaccff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], px + 8, py + 5 + i * lineH);
        }
        ctx.restore();
      }
    }

    // AI mood label
    const moodColors: Record<string, string> = { pressing: '#ff6060', counter: '#60d0ff', possession: '#80ff80', parkbus: '#ffcc40', balanced: '#cccccc' };
    const moodColor = moodColors[state.aiMood] || '#ffffff';
    const moodLabel = state.llmReasoning ? 'LLM' : 'AI: ' + state.aiMood;
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

  // --- Pulsing ring for un-ordered players ---
  let pulseTime = 0;
  function drawPulsingRing(p: Player): void {
    const alpha = 0.15 + Math.sin(pulseTime * 0.06) * 0.12;
    const radius = p.radius + 6 + Math.sin(pulseTime * 0.06) * 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 235, 59, ${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- Accuracy cone during pass/shot drag ---
  function drawAccuracyCone(drag: DragState, state: GameState): void {
    if (!drag.dragging || !drag.dragMouse || !drag.dragActive || drag.dragButton !== 2) return;
    if (state.possession !== drag.dragging) return;

    const startX = drag.dragStartPos!.x;
    const startY = drag.dragStartPos!.y;
    const tx = drag.dragMouse.x;
    const ty = drag.dragMouse.y;
    const dx = tx - startX, dy = ty - startY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 20) return;

    // Use player stats if available
    const isShot = drag.dragMouse.x > W * 0.82 && drag.dragMouse.y > GOAL_Y - 40 && drag.dragMouse.y < GOAL_Y + GOAL_H + 40;
    const accuracy = drag.dragging.stats
      ? (isShot ? drag.dragging.stats.shotAccuracy : drag.dragging.stats.passAccuracy)
      : 0.85;
    const baseAngle = (1 - accuracy) * 15 * (Math.PI / 180);

    // Count nearby opponents for pressure
    let pressure = 0;
    for (const opp of state.teamB) {
      if (dist(opp, drag.dragging) < 60) pressure++;
    }
    const maxAngle = baseAngle * (1 + pressure * 0.3);

    const angle = Math.atan2(dy, dx);
    const coneLen = d * 1.2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + Math.cos(angle - maxAngle) * coneLen, startY + Math.sin(angle - maxAngle) * coneLen);
    ctx.lineTo(startX + Math.cos(angle + maxAngle) * coneLen, startY + Math.sin(angle + maxAngle) * coneLen);
    ctx.closePath();
    ctx.fillStyle = pressure > 0 ? 'rgba(255, 100, 100, 0.08)' : 'rgba(255, 235, 59, 0.06)';
    ctx.fill();
    ctx.strokeStyle = pressure > 0 ? 'rgba(255, 100, 100, 0.2)' : 'rgba(255, 235, 59, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // --- Tooltip ---
  function drawTooltip(text: string | null, x: number, y: number): void {
    if (!text) return;
    ctx.save();
    ctx.font = '11px monospace';
    const tw = ctx.measureText(text).width;
    let px = x;
    if (px + tw + 12 > W - 10) px = W - tw - 22;
    const py = Math.max(y - 35, 16);
    ctx.fillStyle = 'rgba(10,10,30,0.88)';
    ctx.beginPath();
    ctx.roundRect(px - 6, py - 12, tw + 12, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#ddd';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, px, py - 10);
    ctx.restore();
  }

  // --- Player stats panel on hover ---
  function drawStatsPanel(p: Player): void {
    const role = aiRole(p);
    const roleLabels: Record<string, string> = { gk: 'GK', def: 'DEF', mid: 'MID', fwd: 'FWD' };
    const s = p.stats;
    const teamLabel = p.side === 0 ? 'Blue' : 'Red';
    const teamColor = p.side === 0 ? '#64b5f6' : '#ef9a9a';

    const header = `#${p.index + 1} ${roleLabels[role]} (${teamLabel})`;
    const rows = [
      { label: 'SPD', val: s.speed, max: 4.0 },
      { label: 'ACC', val: s.acceleration, max: 0.7 },
      { label: 'STA', val: p.currentStamina, max: s.stamina },
      { label: 'PAS', val: s.passAccuracy, max: 1.0 },
      { label: 'SHT', val: s.shotPower, max: 15 },
      { label: 'AIM', val: s.shotAccuracy, max: 1.0 },
      { label: 'TKL', val: s.tackling, max: 1.0 },
    ];

    const panelW = 130;
    const rowH = 14;
    const panelH = 24 + rows.length * rowH + 4;
    let px = p.x - panelW - 20;
    let py = p.y - panelH / 2;
    if (px < 10) px = p.x + 20;
    if (py < 10) py = 10;
    if (py + panelH > H - 10) py = H - panelH - 10;

    ctx.save();

    // Background
    ctx.fillStyle = 'rgba(10,10,30,0.92)';
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 6);
    ctx.fill();
    ctx.strokeStyle = p.side === 0 ? 'rgba(33,150,243,0.5)' : 'rgba(244,67,54,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = teamColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(header, px + 8, py + 6);

    // Stat rows with mini bars
    const barX = px + 38;
    const barW = 60;
    const barH = 8;
    for (let i = 0; i < rows.length; i++) {
      const ry = py + 22 + i * rowH;
      const r = rows[i];
      const ratio = Math.min(r.val / r.max, 1);

      // Label
      ctx.font = '10px monospace';
      ctx.fillStyle = '#999';
      ctx.textAlign = 'left';
      ctx.fillText(r.label, px + 8, ry);

      // Bar background
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(barX, ry + 1, barW, barH);

      // Bar fill
      const barColor = ratio > 0.7 ? '#4CAF50' : ratio > 0.4 ? '#FFC107' : '#f44336';
      ctx.fillStyle = barColor;
      ctx.fillRect(barX, ry + 1, barW * ratio, barH);

      // Value
      ctx.font = '9px monospace';
      ctx.fillStyle = '#ccc';
      ctx.textAlign = 'left';
      ctx.fillText(r.label === 'STA' ? `${Math.round(r.val)}` : r.val.toFixed(2), barX + barW + 4, ry);
    }

    ctx.restore();
  }

  // --- Main draw ---
  function draw(state: GameState, drag: DragState, hoveredPlayer: Player | null, tooltipText?: string | null, tooltipX?: number, tooltipY?: number): void {
    pulseTime++;
    advanceAnimation();
    drawField();

    if (!state.possession) drawBall(state);

    const allSorted = [
      ...state.teamA.map(p => ({ p, color: '#2196F3' })),
      ...state.teamB.map(p => ({ p, color: '#f44336' })),
    ];
    allSorted.sort((a, b) => a.p.y - b.p.y);
    for (const { p } of allSorted) {
      // Draw pulsing ring for un-ordered team A players during plan phase
      if (state.phase === 'plan' && p.side === 0 && !p.hasOrder) {
        drawPulsingRing(p);
      }
      drawPlayer(p, state, hoveredPlayer);
      if (state.possession === p) drawBall(state);
    }

    drawAccuracyCone(drag, state);
    drawDragLine(drag);
    drawGoalFlash(state);

    if (state.phase === 'preview') {
      drawAIPlan(state);
      ctx.save();
      const hint = 'AI plan preview — press Space or \u25B6 PLAY to execute';
      ctx.font = '13px monospace';
      const hw = ctx.measureText(hint).width;
      const hx = W / 2 - hw / 2 - 8;
      const hy = H - 28;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(hx, hy - 14, hw + 16, 20);
      ctx.fillStyle = 'rgba(220,220,255,0.9)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(hint, hx + 8, hy - 12);
      ctx.restore();
    } else if (state.phase === 'play' && state.playTimer > PLAY_DURATION - 30) {
      drawAIPlan(state);
    }

    if (state.phase === 'play') {
      ctx.fillStyle = 'rgba(0,0,0,0.03)';
      ctx.fillRect(0, 0, W, H);
    }

    // Half-time overlay
    if (state.phase === 'halftime') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.font = 'bold 48px monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HALF TIME', W / 2, H / 2 - 60);

      ctx.font = 'bold 32px monospace';
      ctx.fillText(`${state.score[0]} : ${state.score[1]}`, W / 2, H / 2);

      // Stats
      ctx.font = '16px monospace';
      ctx.fillStyle = '#aaa';
      const totalPoss = state.possessionCount[0] + state.possessionCount[1] || 1;
      const possA = Math.round(state.possessionCount[0] / totalPoss * 100);
      ctx.fillText(`Possession: ${possA}% — ${100 - possA}%`, W / 2, H / 2 + 50);
      ctx.fillText(`Fouls: ${state.foulCount[0]} — ${state.foulCount[1]}`, W / 2, H / 2 + 75);
      ctx.fillText(`Subs remaining: ${state.subsRemaining[0]} — ${state.subsRemaining[1]}`, W / 2, H / 2 + 100);
      ctx.restore();
    }

    // Player stats panel on hover
    if (hoveredPlayer && hoveredPlayer.stats) {
      drawStatsPanel(hoveredPlayer);
    }

    // Draw tooltip last (on top)
    if (tooltipText) {
      drawTooltip(tooltipText, tooltipX ?? 0, tooltipY ?? 0);
    }
  }

  return { draw };
}
