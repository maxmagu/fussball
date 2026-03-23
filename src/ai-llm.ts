// --- LLM AI planning (Phase 0.5) ---

import type { Player, GameState } from './types';
import { W, H, MOVE_RADIUS, GOAL_Y, GOAL_H } from './types';
import { clamp, kickBall } from './engine';
import { aiRole } from './ai';

// --- Serialize game state to normalized 0-1 JSON for LLM ---
export function serializeStateForLLM(state: GameState): object {
  const norm = (p: Player) => ({
    index: p.index,
    role: aiRole(p),
    x: +(p.x / W).toFixed(3),
    y: +(p.y / H).toFixed(3),
  });

  const ballCarrier = state.possession;
  let possession: { team: string; index: number } | null = null;
  if (ballCarrier) {
    possession = {
      team: ballCarrier.side === 0 ? 'A' : 'B',
      index: ballCarrier.index,
    };
  }

  return {
    score: [state.score[0], state.score[1]],
    round: state.round,
    ball: {
      x: +(state.ball.x / W).toFixed(3),
      y: +(state.ball.y / H).toFixed(3),
    },
    possession,
    teamA: state.teamA.map(norm),
    teamB: state.teamB.map(norm),
  };
}

// --- LLM response types ---
interface LLMAction {
  type: 'move' | 'pass' | 'shoot';
  x: number;
  y: number;
}

interface LLMOrder {
  index: number;
  reasoning?: string;
  actions: LLMAction[];
}

interface LLMResponse {
  reasoning?: string;
  orders: LLMOrder[];
}

// --- Parse and validate LLM response ---
function parseLLMResponse(text: string): LLMResponse | null {
  // Strip markdown fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.orders || !Array.isArray(parsed.orders)) return null;
    return parsed as LLMResponse;
  } catch {
    return null;
  }
}

// --- Apply LLM orders to team B players ---
export function applyLLMOrders(state: GameState, response: LLMResponse): void {
  const { teamB } = state;
  const orderedIndices = new Set<number>();

  state.llmReasoning = response.reasoning || null;
  state.llmPlayerReasons.clear();

  for (const order of response.orders) {
    if (order.index < 0 || order.index > 10) continue;
    if (!order.actions || !Array.isArray(order.actions) || order.actions.length === 0) continue;

    const p = teamB[order.index];
    if (!p) continue;
    orderedIndices.add(order.index);

    if (order.reasoning) {
      state.llmPlayerReasons.set(order.index, order.reasoning);
    }

    for (const action of order.actions) {
      // Convert normalized 0-1 to pixel coords, clamped to field
      const px = clamp(action.x * W, 0, W);
      const py = clamp(action.y * H, 0, H);

      if (action.type === 'move') {
        // Clamp to move radius
        const dx = px - p.x, dy = py - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > MOVE_RADIUS) {
          p.tx = p.x + (dx / d) * MOVE_RADIUS;
          p.ty = p.y + (dy / d) * MOVE_RADIUS;
        } else {
          p.tx = px;
          p.ty = py;
        }
      } else if (action.type === 'pass' && state.possession === p) {
        p.plannedPass = { x: px, y: py, isShot: false };
        p.passFirst = true;
      } else if (action.type === 'shoot' && state.possession === p) {
        p.plannedPass = { x: px, y: py, isShot: true };
        // Dribble slightly toward goal before shooting
        const goalX = Math.max(30, p.x - MOVE_RADIUS * 0.5);
        const goalY = H / 2 + (Math.random() - 0.5) * 100;
        const dx = goalX - p.x, dy = goalY - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > MOVE_RADIUS) {
          p.tx = p.x + (dx / d) * MOVE_RADIUS;
          p.ty = p.y + (dy / d) * MOVE_RADIUS;
        } else {
          p.tx = goalX;
          p.ty = goalY;
        }
      }
    }
  }

  // Return set of indices that got valid orders (for gap-filling)
  return orderedIndices as any;
}

// --- Call LLM API ---
export async function callLLMPlan(state: GameState): Promise<LLMResponse | null> {
  const gameState = serializeStateForLLM(state);

  try {
    const res = await fetch('/api/ai-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameState }),
    });

    if (!res.ok) {
      console.error(`LLM API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const text = await res.text();
    return parseLLMResponse(text);
  } catch (err) {
    console.error('LLM API call failed:', err);
    return null;
  }
}
