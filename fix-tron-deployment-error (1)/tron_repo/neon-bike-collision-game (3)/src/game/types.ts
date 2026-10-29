import type { ArenaSize, ColorKey, Difficulty, PickupType } from './config';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type CamMode = 'chase' | 'smooth' | 'far' | 'cockpit' | 'top';

export const CAM_LABEL: Record<CamMode, string> = {
  smooth: 'За байком',
  chase: 'Погоня',
  far: 'Дальняя',
  cockpit: 'Кокпит',
  top: 'Тактическая',
};

export type GameModeKey = 'campaign' | 'multitier' | 'survival' | 'dischunt' | 'practice' | 'quick' | 'boss' | 'race' | 'attract';

export interface Settings {
  quality: Quality;
  bloom: boolean;
  reflections: boolean;
  postfx: boolean;
  shake: boolean;
  camSmooth: boolean; // сверхплавная кинематографичная камера
  fov: number;
  master: number;
  music: number;
  sfx: number;
  playerColor: ColorKey;
  camera: CamMode;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  bloom: true,
  reflections: true,
  postfx: true,
  shake: true,
  camSmooth: true,
  fov: 70,
  master: 0.8,
  music: 0.55,
  sfx: 0.85,
  playerColor: 'cyan',
  camera: 'smooth',
};

export interface QuickSettings {
  enemies: number;
  difficulty: Difficulty;
  arena: ArenaSize;
  rounds: number;
  cells: boolean;
  hasTiers: boolean;
  /** Выбранная карта арены. */
  map: string;
  /** Добавить босса-внедорожника в быстрый бой. */
  boss: boolean;
}

export interface HudBike {
  id: number;
  name: string;
  color: string;
  alive: boolean;
  kills: number;
  isPlayer: boolean;
  boss: boolean;
  level: number;
  y: number;
  shield?: boolean;
  runner?: boolean;
  armor?: number;
  armorMax?: number;
  charging?: boolean;
}

export interface ActivePowerups {
  shield: boolean;
  phaseLeft: number;
  multLeft: number;
  hasJump: boolean;
  ammo: number;
  ammoCap: number;
}

export interface RaceHudState {
  place: number;
  entrants: number;
  lap: number;
  laps: number;
  progress: number;
  penalty: number;
  finished: boolean;
  clean: number;
}

export interface HudState {
  mode: GameModeKey;
  speed: number;
  speedN: number;
  boost: number;
  boosting: boolean;
  braking: boolean;
  grinding: number;
  score: number;
  kills: number;
  alive: number;
  total: number;
  time: number;
  lives: number;
  levelCode: string;
  levelName: string;
  wins: number;
  losses: number;
  target: number;
  camera: CamMode;
  bikes: HudBike[];
  playerAlive: boolean;
  playerColor: string;
  playerLevel: number;
  playerY: number;
  playerAirborne: boolean;
  playerHeading: number;
  powerups: ActivePowerups;
  beatPulse: number;
  kickPulse: number;
  discsCollected?: number;
  survivalWave?: number;
  rampHint?: { angle: number; dist: number } | null;
  arenaName?: string;
  race?: RaceHudState | null;
  boss?: { name: string; color: string; hp: number; maxHp: number; phase: number; charging: boolean; armor: number; armorMax: number } | null;
}

export interface IntroEnemy {
  name: string;
  color: string;
  diff: string;
  boss?: boolean;
  runner?: boolean;
}

export type ResultAction = 'next' | 'retry' | 'menu' | 'restart';

export type PhaseEvent =
  | { type: 'none' }
  | {
      type: 'intro';
      mode: GameModeKey;
      code: string;
      title: string;
      brief: string;
      enemies: IntroEnemy[];
      arena: number;
      lives: number;
      roundLabel: string;
      hasTiers?: boolean;
      arenaName?: string;
      arenaTag?: string;
    }
  | { type: 'countdown'; value: number }
  | { type: 'playing' }
  | {
      type: 'result';
      win: boolean;
      final: boolean;
      title: string;
      subtitle: string;
      stats: { label: string; value: string }[];
      actions: ResultAction[];
      record: boolean;
    };

export interface GameMessage {
  id: number;
  kind: 'popup' | 'feed' | 'banner';
  text: string;
  sub?: string;
  color: string;
  icon?: PickupType;
}

export interface GameCallbacks {
  onHud(h: HudState): void;
  onPhase(p: PhaseEvent): void;
  onMessage(m: GameMessage): void;
  onPauseRequest(): void;
}
