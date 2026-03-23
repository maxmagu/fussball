// --- DOM event handlers, input, UI elements ---

import type { Player, GameState } from './types';
import { W, H, MOVE_RADIUS, GOAL_Y, GOAL_H, PLAY_DURATION } from './types';
import { createGameState, resetAfterGoal, endRound, tick, autoplanGK, prepareRound, kickBall } from './engine';
import { planAIForMode } from './ai';
import type { AIMode } from './types';

import { createRenderer, type DragState } from './renderer';

export function initGame(canvas: HTMLCanvasElement): void {
  const renderer = createRenderer(canvas);
  let state = createGameState();

  // DOM elements
  const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
  const roundInfoEl = document.getElementById('round-info')!;
  const timerBar = document.getElementById('timer-bar') as HTMLElement;
  const timerFill = document.getElementById('timer-fill') as HTMLElement;
  const debugBtn = document.getElementById('debug-btn') as HTMLButtonElement;
  const allActionsBtn = document.getElementById('ai-all-actions-btn') as HTMLButtonElement;
  const scoreEl = document.getElementById('score')!;

  const aiModeSelect = document.getElementById('ai-mode-select') as HTMLSelectElement;

  let aiDebugMode = false;
  let hoveredPlayer: Player | null = null;

  // --- AI mode selector ---
  aiModeSelect.value = state.aiMode;
  aiModeSelect.addEventListener('change', () => {
    state.aiMode = aiModeSelect.value as AIMode;
  });

  // Drag state
  const drag: DragState = {
    dragging: null,
    dragMouse: null,
    dragActive: false,
    dragStartPos: null,
    dragButton: -1,
  };
  let suppressClick = false;
  const DRAG_THRESHOLD = 10;

  function updateRoundInfo(): void {
    if (state.phase === 'plan') {
      roundInfoEl.textContent = `Round ${state.round} — Plan your moves`;
    } else if (state.phase === 'preview') {
      roundInfoEl.textContent = `Round ${state.round} — Reviewing AI plan`;
    } else {
      roundInfoEl.textContent = `Round ${state.round} — Playing...`;
    }
  }

  function updateScoreDisplay(): void {
    scoreEl.textContent = `${state.score[0]} : ${state.score[1]}`;
  }

  function onResetAfterGoal(concedingSide: 0 | 1): void {
    resetAfterGoal(state, concedingSide);
    playBtn.disabled = false;
    allActionsBtn.style.display = 'none';
    updateRoundInfo();
    updateScoreDisplay();
  }

  function executePlay(): void {
    state.phase = 'play';
    state.playTimer = PLAY_DURATION;
    playBtn.disabled = true;
    allActionsBtn.style.display = 'none';
    state.aiShowAllActions = false;
    allActionsBtn.textContent = '\u2610 all actions';
    allActionsBtn.classList.remove('active');
    timerBar.style.display = 'block';
    state.aiHoveredPlayer = null;
    updateRoundInfo();
  }

  function getMousePos(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
  }

  function playerAt(mx: number, my: number, team: Player[]): Player | null {
    for (const p of team) {
      const dx = p.x - mx, dy = p.y - my;
      if (Math.sqrt(dx * dx + dy * dy) < p.radius + 6) return p;
    }
    return null;
  }

  // --- Mouse tracking for hover ---
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (W / rect.width);
    const mouseY = (e.clientY - rect.top) * (H / rect.height);

    hoveredPlayer = null;
    const allP = [...state.teamA, ...state.teamB];
    for (const p of allP) {
      const dx = p.x - mouseX, dy = p.y - mouseY;
      if (Math.sqrt(dx * dx + dy * dy) < p.radius + 6) {
        hoveredPlayer = p;
        break;
      }
    }

    if (state.phase === 'preview') {
      state.aiHoveredPlayer = null;
      for (const p of state.teamB) {
        const dx = p.x - mouseX, dy = p.y - mouseY;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          state.aiHoveredPlayer = p;
          break;
        }
      }
    }

    // Drag tracking
    if (drag.dragging) {
      drag.dragMouse = getMousePos(e);
      if (!drag.dragActive && drag.dragStartPos) {
        const dx = drag.dragMouse.x - drag.dragStartPos.x, dy = drag.dragMouse.y - drag.dragStartPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
          drag.dragActive = true;
        }
      }
    }
  });

  // --- Mouse down ---
  canvas.addEventListener('mousedown', (e) => {
    if (state.phase !== 'plan') return;
    if (e.button !== 0 && e.button !== 2) return;
    const { x: mx, y: my } = getMousePos(e);

    if (e.button === 2) {
      const carrier = state.teamA.find(p => state.possession === p);
      if (carrier && carrier.hasOrder && !carrier.plannedPass) {
        const dx = carrier.tx - mx, dy = carrier.ty - my;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          drag.dragging = carrier;
          drag.dragStartPos = { x: carrier.tx, y: carrier.ty };
          drag.dragMouse = { x: mx, y: my };
          drag.dragActive = false;
          drag.dragButton = 2;
          return;
        }
      }
      if (carrier) {
        const dx = carrier.x - mx, dy = carrier.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < carrier.radius + 6) {
          drag.dragging = carrier;
          drag.dragStartPos = { x: mx, y: my };
          drag.dragMouse = { x: mx, y: my };
          drag.dragActive = false;
          drag.dragButton = 2;
          state.selected = carrier;
          return;
        }
      }
      return;
    }

    const clickedA = playerAt(mx, my, state.teamA);
    if (clickedA) {
      drag.dragging = clickedA;
      drag.dragStartPos = { x: mx, y: my };
      drag.dragMouse = { x: mx, y: my };
      drag.dragActive = false;
      drag.dragButton = 0;
      state.selected = clickedA;
    }
  });

  // --- Mouse up ---
  canvas.addEventListener('mouseup', (e) => {
    if (drag.dragging && drag.dragActive) {
      const { x: mx, y: my } = getMousePos(e);

      if (drag.dragButton === 2 && state.possession === drag.dragging) {
        const isShot = mx > W * 0.82 && my > GOAL_Y - 40 && my < GOAL_Y + GOAL_H + 40;
        drag.dragging.plannedPass = { x: mx, y: my, isShot };
        const hasDribble = drag.dragging.hasOrder && (Math.abs(drag.dragging.tx - drag.dragging.x) > 5 || Math.abs(drag.dragging.ty - drag.dragging.y) > 5);
        if (!hasDribble) {
          drag.dragging.passFirst = true;
        }
      } else if (drag.dragButton === 0) {
        const dx = mx - drag.dragging.x, dy = my - drag.dragging.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= MOVE_RADIUS) {
          drag.dragging.tx = mx;
          drag.dragging.ty = my;
        } else {
          drag.dragging.tx = drag.dragging.x + (dx / d) * MOVE_RADIUS;
          drag.dragging.ty = drag.dragging.y + (dy / d) * MOVE_RADIUS;
        }
      }
      drag.dragging.hasOrder = true;
      drag.dragging = null;
      drag.dragMouse = null;
      drag.dragActive = false;
      drag.dragStartPos = null;
      drag.dragButton = -1;
      suppressClick = true;
      return;
    }
    drag.dragging = null;
    drag.dragMouse = null;
    drag.dragActive = false;
    drag.dragStartPos = null;
    drag.dragButton = -1;
  });

  // --- Click ---
  canvas.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    if (state.phase !== 'plan') return;
    const { x: mx, y: my } = getMousePos(e);

    const clickedTeammate = playerAt(mx, my, state.teamA);
    if (clickedTeammate) {
      state.selected = clickedTeammate;
      return;
    }

    if (state.selected) {
      const targetEnemy = playerAt(mx, my, state.teamB);
      if (targetEnemy && state.possession === targetEnemy) {
        state.selected.tackleTarget = targetEnemy;
        state.selected.tx = targetEnemy.x;
        state.selected.ty = targetEnemy.y;
        state.selected.hasOrder = true;
        return;
      }

      const dx = mx - state.selected.x, dy = my - state.selected.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= MOVE_RADIUS) {
        state.selected.tx = mx;
        state.selected.ty = my;
      } else {
        state.selected.tx = state.selected.x + (dx / d) * MOVE_RADIUS;
        state.selected.ty = state.selected.y + (dy / d) * MOVE_RADIUS;
      }
      state.selected.hasOrder = true;
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Debug toggle ---
  debugBtn.addEventListener('click', () => {
    aiDebugMode = !aiDebugMode;
    debugBtn.textContent = (aiDebugMode ? '\u2611' : '\u2610') + ' debug';
    debugBtn.classList.toggle('active', aiDebugMode);
  });

  // --- Play button ---
  playBtn.addEventListener('click', () => {
    if (state.phase === 'preview') { executePlay(); return; }
    if (state.phase !== 'plan') return;
    prepareRound(state);
    planAIForMode(state);
    if (aiDebugMode) {
      state.phase = 'preview';
      allActionsBtn.style.display = 'inline-block';
      updateRoundInfo();
    } else {
      executePlay();
      updateRoundInfo();
    }
  });

  // --- All actions toggle ---
  allActionsBtn.addEventListener('click', () => {
    state.aiShowAllActions = !state.aiShowAllActions;
    allActionsBtn.textContent = (state.aiShowAllActions ? '\u2611' : '\u2610') + ' all actions';
    allActionsBtn.classList.toggle('active', state.aiShowAllActions);
  });

  // --- Spacebar ---
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (state.phase === 'plan' || state.phase === 'preview')) {
      e.preventDefault();
      playBtn.click();
    }
  });

  // --- Stadium ambience ---
  const ambience = new Audio('stadium-sound.mp3');
  ambience.loop = true;
  ambience.volume = 0.3;
  canvas.addEventListener('click', () => { if (ambience.paused) ambience.play(); }, { once: true });

  // --- Game loop ---
  function update(): void {
    if (state.phase === 'play') {
      const result = tick(state);

      timerFill.style.width = ((PLAY_DURATION - state.playTimer) / PLAY_DURATION * 100) + '%';

      if (result === 'goal-0') {
        updateScoreDisplay();
        setTimeout(() => onResetAfterGoal(0), 1200);
      } else if (result === 'goal-1') {
        updateScoreDisplay();
        setTimeout(() => onResetAfterGoal(1), 1200);
      } else if (result === 'round-end') {
        endRound(state);
        playBtn.disabled = false;
        allActionsBtn.style.display = 'none';
        timerBar.style.display = 'none';
        updateRoundInfo();
      }
    }

    if (state.phase === 'plan' || state.phase === 'preview') {
      autoplanGK(state);
    }
  }

  function loop(): void {
    update();
    renderer.draw(state, drag, hoveredPlayer);
    requestAnimationFrame(loop);
  }

  updateRoundInfo();
  loop();
}
