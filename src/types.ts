// --- Shared types for Fussball Commander ---

export interface Player {
  x: number;
  y: number;
  tx: number;
  ty: number;
  homeX: number;
  homeY: number;
  speed: number;
  radius: number;
  side: 0 | 1;
  index: number;
  tackleCooldown: number;
  tackleTarget: Player | null;
  hasOrder: boolean;
  plannedPass: PlannedPass | null;
  passFirst: boolean;

  // Runtime animation state (set by renderer/engine)
  _startX?: number;
  _startY?: number;
  _prevX?: number;
  _prevY?: number;
  _moving?: boolean;
  _kicking?: boolean;
  _lastFacing?: Direction;
  _receivingPass?: boolean;
}

export interface PlannedPass {
  x: number;
  y: number;
  isShot?: boolean;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  friction: number;
}

export type Phase = 'plan' | 'preview' | 'play';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type AnimState = 'idle' | 'run' | 'kick';
export type AIRole = 'gk' | 'def' | 'mid' | 'fwd';
export type AIMood = 'pressing' | 'counter' | 'possession' | 'parkbus' | 'balanced';
export type AIMode = 'heuristic' | 'rules' | 'neural' | 'hybrid';

export interface GameState {
  teamA: Player[];
  teamB: Player[];
  ball: Ball;
  possession: Player | null;
  passTarget: Player | null;
  selected: Player | null;
  phase: Phase;
  round: number;
  score: [number, number];
  playTimer: number;
  tackleCooldown: number;
  goalFlash: number;
  goalScored: boolean;
  kickoffSide: 0 | 1;
  lastKicker: Player | null;
  lastKickerCooldown: number;

  // AI state
  aiMode: AIMode;
  aiMood: AIMood;
  aiPlanReady: boolean;
  aiShowAllActions: boolean;
  aiLastPlan: AIPlanEntry[];
  aiHoveredPlayer: Player | null;
}

export interface ScoredAction {
  action: string;
  score: number;
  tx: number;
  ty: number;
  tackle?: boolean;
  passTarget?: Player;
}

export interface AIPlanEntry {
  p: Player;
  actions: ScoredAction[];
  chosen: ScoredAction;
}

// --- Constants ---
export const W = 1200;
export const H = 750;
export const GOAL_W = 12;
export const GOAL_H = 160;
export const GOAL_Y = (H - GOAL_H) / 2;
export const PLAY_DURATION = 120;
export const MOVE_RADIUS = 120;
export const GAME_SPEED = 1.0;
export const TACKLE_RANGE = 30;
export const TACKLE_SUCCESS = 0.45;
export const PICKUP_RANGE = 20;
export const DRIBBLE_SPEED_PENALTY = 0.7;
export const BALL_SPEED_MULT = 0.2;

// 4-4-2 formation as normalized [0-1] coordinates, all in own half
export const FORMATION_BASE: [number, number][] = [
  [0.08, 0.5],   // GK
  [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85], // DEF
  [0.38, 0.12], [0.38, 0.38], [0.38, 0.62], [0.38, 0.88], // MID
  [0.45, 0.28], [0.45, 0.72], // FWD
];

// Team color palettes
// Palette indices: 0=transparent, 1=jersey, 2=jersey_dark, 3=skin, 4=skin_shadow,
// 5=hair, 6=white(shorts/socks), 7=boots, 8=outline
export const TEAM_PALETTES: Record<number, Record<number, string>> = {
  0: { 1: '#2196F3', 2: '#1565C0', 3: '#FFCC80', 4: '#E8A850', 5: '#5D4037', 6: '#fff', 7: '#222', 8: '#1a1a1a' },
  1: { 1: '#f44336', 2: '#c62828', 3: '#FFCC80', 4: '#E8A850', 5: '#222', 6: '#fff', 7: '#222', 8: '#1a1a1a' },
};
