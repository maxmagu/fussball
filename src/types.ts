// --- Shared types for Fussball Commander ---

export interface PlayerStats {
  speed: number;           // base max speed (px/frame)
  acceleration: number;    // how fast they reach max speed
  stamina: number;         // max stamina
  staminaRecovery: number; // recovery rate per tick when not sprinting
  passAccuracy: number;    // 1.0 = perfect, 0.5 = wild
  shotPower: number;       // max shot velocity
  shotAccuracy: number;    // shot cone tightness
  tackling: number;        // success chance on tackle attempt
  foulRisk: number;        // chance a failed tackle is a foul
}

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

  // Stats (Phase 1)
  stats: PlayerStats;
  currentStamina: number;
  currentSpeed: number;
  isSprinting: boolean;

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

// Position-based stat templates
export const STAT_TEMPLATES: Record<AIRole, PlayerStats> = {
  gk:  { speed: 2.0, acceleration: 0.4, stamina: 80,  staminaRecovery: 0.3, passAccuracy: 0.75, shotPower: 14, shotAccuracy: 0.6,  tackling: 0.3,  foulRisk: 0.05 },
  def: { speed: 2.5, acceleration: 0.45, stamina: 90,  staminaRecovery: 0.3, passAccuracy: 0.80, shotPower: 8,  shotAccuracy: 0.5,  tackling: 0.85, foulRisk: 0.20 },
  mid: { speed: 3.0, acceleration: 0.5, stamina: 100, staminaRecovery: 0.35, passAccuracy: 0.90, shotPower: 10, shotAccuracy: 0.7,  tackling: 0.60, foulRisk: 0.15 },
  fwd: { speed: 3.5, acceleration: 0.55, stamina: 85,  staminaRecovery: 0.25, passAccuracy: 0.80, shotPower: 13, shotAccuracy: 0.90, tackling: 0.40, foulRisk: 0.10 },
};

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

export type Phase = 'plan' | 'preview' | 'play' | 'setpiece' | 'halftime';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type AnimState = 'idle' | 'run' | 'kick';
export type AIRole = 'gk' | 'def' | 'mid' | 'fwd';
export type AIMood = 'pressing' | 'counter' | 'possession' | 'parkbus' | 'balanced';
export type AIMode = 'heuristic' | 'llm' | 'rules' | 'neural' | 'hybrid';

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

  // LLM AI state
  llmThinking: boolean;
  llmError: string | null;
  llmReasoning: string | null;
  llmPlayerReasons: Map<number, string>;

  // Soccer rules state (Phase 1)
  rules: RulesConfig;
  half: 1 | 2;
  roundsPerHalf: number;
  clockMinutes: number;
  subsRemaining: [number, number];
  bench: [Player[], Player[]]; // bench players per team
  setpiece: SetPiece | null;
  penalty: PenaltyState | null;
  foulCount: [number, number];
  shotCount: [number, number];
  passCount: [number, number];
  possessionCount: [number, number]; // rounds with ball per team
  halfTimeShown: boolean;
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

// --- Rules config ---
export interface RulesConfig {
  wallBounce: boolean;
  offside: boolean;
  throwIns: boolean;
  corners: boolean;
  goalKicks: boolean;
  fouls: boolean;
  penalties: boolean;
  freeKicks: boolean;
  substitutions: boolean;
  halves: boolean;
}

export const RULES_FUTSAL: RulesConfig = {
  wallBounce: true, offside: false, throwIns: false, corners: false,
  goalKicks: false, fouls: true, penalties: true, freeKicks: true,
  substitutions: true, halves: true,
};

export const RULES_OUTDOOR: RulesConfig = {
  wallBounce: false, offside: true, throwIns: true, corners: true,
  goalKicks: true, fouls: true, penalties: true, freeKicks: true,
  substitutions: true, halves: true,
};

// --- Set piece ---
export type SetPieceType = 'freekick' | 'penalty' | 'kickoff' | 'throwin' | 'corner' | 'goalkick';

export interface SetPiece {
  type: SetPieceType;
  side: 0 | 1; // team that takes the set piece
  x: number;
  y: number;
}

// --- Penalty state ---
export interface PenaltyState {
  shooterZone: number | null;  // 0-5 (left/center/right × low/high)
  gkDive: number | null;       // 0-2 (left/center/right)
  phase: 'choose-shooter' | 'choose-gk' | 'execute' | null;
  side: 0 | 1; // attacking team
}

// --- Half-time stats ---
export interface HalfTimeStats {
  possession: [number, number]; // % of rounds with ball
  shots: [number, number];
  passes: [number, number];
  fouls: [number, number];
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
