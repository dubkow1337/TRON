// ─────────────────────────────────────────────────────────────
//  NEON GRID: НАСЛЕДИЕ — глобальные константы, физика и баланс
// ─────────────────────────────────────────────────────────────

export const TICK = 1 / 120; // фиксированный шаг симуляции
export const BASE_SPEED = 22; // клеток/сек
export const BOOST_SPEED = 36;
export const BRAKE_SPEED = 12;
export const GRIND_SPEED_BONUS = 4.5;
export const BOOST_DRAIN = 0.42; // энергия/сек
export const BOOST_REGEN = 0.075;
export const GRIND_REGEN = 0.45;
export const BIKE_LEN = 2.62; // от точки выхода стены (зад) до носа
export const WALL_HEIGHT = 1.25;
export const WALL_THICK = 0.12;
export const KMH = 11.4; // множитель отображения скорости
export const MAX_BIKES = 12;

// ── Вертикальность и уровни арены ──
export const LEVEL_HEIGHT = 4.6; // высота второго яруса
export const JUMP_VELOCITY = 16.5; // скорость прыжка с трамплина
export const GRAVITY = 30.0; // гравитация в воздухе

// ── Плавное руление ──
export const TURN_RADIUS = 6.2; // радиус дуги поворота (в клетках) — чем больше, тем плавнее
export const MIN_TURN_RATE = 1.5; // минимальная угловая скорость (рад/с)
export const MAX_TURN_RATE = 5.4; // максимальная угловая скорость (рад/с)
export const PATH_SPACING = 2.0; // шаг точек световой стены на прямой

// ── Помощь при заезде на пандус ──
export const RAMP_ASSIST_ANGLE = 0.85; // рад: в каком секторе работает автодоводка
export const RAMP_ASSIST_RATE = 2.6; // сила автодоводки (рад/с)
export const PATH_SPACING_TURN = 0.75; // шаг точек в повороте (плавная дуга)

export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export type ColorKey =
  | 'cyan'
  | 'white'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'magenta'
  | 'orange'
  | 'red'
  | 'amber'
  | 'violet'
  | 'lime'
  | 'pink';

export interface NeonColor {
  key: ColorKey;
  name: string;
  hex: number;
  css: string;
}

export const NEON: Record<ColorKey, NeonColor> = {
  cyan: { key: 'cyan', name: 'Циан', hex: 0x22eeff, css: '#22eeff' },
  white: { key: 'white', name: 'Белый', hex: 0xdff4ff, css: '#dff4ff' },
  yellow: { key: 'yellow', name: 'Жёлтый', hex: 0xffe23a, css: '#ffe23a' },
  green: { key: 'green', name: 'Изумруд', hex: 0x2dff86, css: '#2dff86' },
  blue: { key: 'blue', name: 'Кобальт', hex: 0x3b74ff, css: '#3b74ff' },
  magenta: { key: 'magenta', name: 'Маджента', hex: 0xff36ee, css: '#ff36ee' },
  orange: { key: 'orange', name: 'Оранжевый', hex: 0xff6a12, css: '#ff6a12' },
  red: { key: 'red', name: 'Красный', hex: 0xff2436, css: '#ff2436' },
  amber: { key: 'amber', name: 'Янтарь', hex: 0xffa51c, css: '#ffa51c' },
  violet: { key: 'violet', name: 'Фиолет', hex: 0x9a4bff, css: '#9a4bff' },
  lime: { key: 'lime', name: 'Лайм', hex: 0xb3ff36, css: '#b3ff36' },
  pink: { key: 'pink', name: 'Розовый', hex: 0xff5aa5, css: '#ff5aa5' },
};

export const PLAYER_COLORS: ColorKey[] = ['cyan', 'white', 'yellow', 'green', 'blue', 'magenta'];
export const ENEMY_COLOR_ORDER: ColorKey[] = [
  'orange',
  'red',
  'amber',
  'violet',
  'pink',
  'lime',
  'yellow',
  'magenta',
  'green',
  'blue',
  'white',
  'cyan',
];

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';

export interface AIProfile {
  look: number; // клеток обзора вперёд
  flood: number; // лимит заливки (оценка свободного пространства)
  aggression: number; // 0..1 — стремление отрезать соперника
  boost: number; // 0..1 — использование турбо
  strategic: number; // шанс переоценить маршрут на клетку
  fatal: number; // шанс «проспать» поворот в упор
  noise: number; // случайность решений
  hug: number; // вес «прижиматься к стенам» в ловушке
}

export const AI_PROFILES: Record<Difficulty, AIProfile> = {
  easy: { look: 13, flood: 160, aggression: 0.1, boost: 0.15, strategic: 0.025, fatal: 0.05, noise: 24, hug: 0.4 },
  normal: { look: 18, flood: 450, aggression: 0.42, boost: 0.45, strategic: 0.04, fatal: 0.01, noise: 12, hug: 1 },
  hard: { look: 26, flood: 1000, aggression: 0.72, boost: 0.75, strategic: 0.05, fatal: 0.002, noise: 6, hug: 1.5 },
  insane: { look: 34, flood: 1900, aggression: 0.94, boost: 0.96, strategic: 0.06, fatal: 0, noise: 2, hug: 2 },
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Лёгкий',
  normal: 'Средний',
  hard: 'Сложный',
  insane: 'Безумный',
};

// ── Бонусы (Power-ups) ──
export type PickupType = 'turbo' | 'shield' | 'emp' | 'phase' | 'jump' | 'mult' | 'ammo';

export interface PickupDef {
  type: PickupType;
  name: string;
  sub: string;
  color: number;
  css: string;
  duration?: number;
}

export const PICKUPS: Record<PickupType, PickupDef> = {
  turbo: { type: 'turbo', name: 'ТУРБО-ЗАРЯД', sub: 'Полная энергия + разгон', color: 0x22eeff, css: '#22eeff' },
  shield: { type: 'shield', name: 'ЩИТ СИСТЕМЫ', sub: 'Защита от 1 столкновения', color: 0x2dff86, css: '#2dff86' },
  emp: { type: 'emp', name: 'ЭМИ-ИМПУЛЬС', sub: 'Стирает стены врагов рядом', color: 0xff36ee, css: '#ff36ee' },
  phase: { type: 'phase', name: 'ФАЗОВЫЙ СДВИГ', sub: 'Проезд сквозь стены (4 сек)', color: 0xffe23a, css: '#ffe23a', duration: 4 },
  jump: { type: 'jump', name: 'СУПЕР-ТРАМПЛИН', sub: 'Мощный прыжок через стены', color: 0xffa51c, css: '#ffa51c' },
  mult: { type: 'mult', name: 'МНОЖИТЕЛЬ 2×', sub: 'Двойные очки (15 сек)', color: 0xdff4ff, css: '#dff4ff', duration: 15 },
  ammo: { type: 'ammo', name: 'НЕОН-ПАТРОНЫ', sub: '+2 выстрела · пробой следа', color: 0x9ff8ff, css: '#9ff8ff' },
};

// ── Неоновые выстрелы ──
/** Сколько патронов может лежать на арене одновременно. */
export const AMMO_ON_ARENA = 5;
/** Сколько выстрелов даёт один патронный бонус. */
export const AMMO_PER_PICKUP = 2;
/** Максимальный запас выстрелов у цикла. */
export const AMMO_CAP = 6;
/** Скорость неоновой пули (клеток/сек). */
export const BULLET_SPEED = 120;
/** Максимальная дальность пули (клеток). */
export const BULLET_RANGE = 95;
/** Сколько попаданий нужно, чтобы пробить участок светового следа. */
export const TRAIL_HITS_TO_BREAK = 2;
/** Радиус взрыва следа в пиксели (клеток): обеспечивает широкий свободный проезд для байка. */
export const TRAIL_BREACH_RADIUS = 3.6;

export interface EnemyDef {
  name: string;
  ai: Difficulty;
  color: ColorKey;
  boss?: boolean;
  /** Тяжёлая техника: четырёхколёсный внедорожник вместо цикла. */
  runner?: boolean;
}

// ── Босс ДЖАГГЕРНАУТ (Light Runner) ──
export const RUNNER_HP = 5; // ядер брони
export const RUNNER_ARMOR_MAX = 2; // зарядов тарана сквозь чужие стены
export const RUNNER_ARMOR_REGEN = 14; // сек на восстановление заряда
export const RUNNER_CHARGE_CD = 11; // сек между таранами
export const RUNNER_TELEGRAPH_T = 1.15; // сек прицеливания
export const RUNNER_CHARGE_T = 2.1; // сек тарана
export const RUNNER_STUN_T = 1.25; // оглушение после аварии
export const RUNNER_INVULN_T = 2.0; // неуязвимость после урона
export const RUNNER_SHOCK_CD = 18; // сек между ударными волнами

export interface LevelDef {
  code: string;
  name: string;
  brief: string;
  arena: number;
  cells: number;
  hasTiers?: boolean;
  /** Идентификатор визуальной темы арены (см. arenas.ts). */
  theme?: string;
  enemies: EnemyDef[];
}

export const CAMPAIGN: LevelDef[] = [
  {
    code: '01',
    theme: 'grid',
    name: 'ПРОБУЖДЕНИЕ',
    brief: 'Первый бой на Сетке. Одна программа-новобранец. Освойся с плавным рулением и турбо.',
    arena: 130,
    cells: 3,
    enemies: [{ name: 'НОВОБРАНЕЦ', ai: 'easy', color: 'orange' }],
  },
  {
    code: '02',
    theme: 'grid',
    name: 'ДУЭЛЬ ТЕНЕЙ',
    brief: 'Две программы охраны. Езжай вплотную к стенам — так заряжается турбо.',
    arena: 150,
    cells: 4,
    enemies: [
      { name: 'СТРАЖ-1', ai: 'easy', color: 'orange' },
      { name: 'СТРАЖ-2', ai: 'normal', color: 'amber' },
    ],
  },
  {
    code: '03',
    theme: 'portal',
    name: 'НЕБЕСНЫЙ МОСТ',
    brief: 'Двухуровневая арена! Используй эстакаду и трамплины, чтобы прыгать через вражеские стены.',
    arena: 170,
    cells: 5,
    hasTiers: true,
    enemies: [
      { name: 'ОХОТНИК-А', ai: 'normal', color: 'red' },
      { name: 'ОХОТНИК-Б', ai: 'normal', color: 'orange' },
      { name: 'ОХОТНИК-В', ai: 'normal', color: 'amber' },
    ],
  },
  {
    code: '04',
    theme: 'citadel',
    name: 'ЛАБИРИНТ СИСТЕМЫ',
    brief: 'Четыре агрессивные программы. Собирай щиты и ЭМИ-импульсы для выживания в замкнутом пространстве.',
    arena: 190,
    cells: 6,
    hasTiers: true,
    enemies: [
      { name: 'ДЕМОН', ai: 'hard', color: 'red' },
      { name: 'ВИРУС', ai: 'normal', color: 'violet' },
      { name: 'ФАНТОМ', ai: 'hard', color: 'amber' },
      { name: 'ГЛИТЧ', ai: 'normal', color: 'pink' },
    ],
  },
  {
    code: '05',
    theme: 'highway',
    name: 'ЭЛИТНАЯ ГВАРДИЯ',
    brief: 'Гигантская двухуровневая арена. Пять элитных программ Системы. Трамплины спасут из любой ловушки.',
    arena: 220,
    cells: 8,
    hasTiers: true,
    enemies: [
      { name: 'ГВАРДЕЕЦ-I', ai: 'hard', color: 'red' },
      { name: 'ГВАРДЕЕЦ-II', ai: 'hard', color: 'orange' },
      { name: 'ГВАРДЕЕЦ-III', ai: 'hard', color: 'amber' },
      { name: 'ГВАРДЕЕЦ-IV', ai: 'hard', color: 'violet' },
      { name: 'ГВАРДЕЕЦ-V', ai: 'normal', color: 'pink' },
    ],
  },
  {
    code: '06',
    theme: 'clu',
    name: 'ДЖАГГЕРНАУТ',
    brief:
      'Финал: четырёхколёсный Light Runner и его эскорт. Заманивай гиганта в свои стены, бей ЭМИ и тараном в корму — у него 5 ядер брони!',
    arena: 240,
    cells: 8,
    hasTiers: true,
    enemies: [
      { name: 'ДЖАГГЕРНАУТ', ai: 'insane', color: 'red', boss: true, runner: true },
      { name: 'ЭСКОРТ-1', ai: 'hard', color: 'orange' },
      { name: 'ЭСКОРТ-2', ai: 'hard', color: 'amber' },
    ],
  },
];

// ── Размеры арены (включая Колосс 300) ──
export const ARENA_SIZES = { small: 130, medium: 180, large: 240, colossus: 300 } as const;
export type ArenaSize = keyof typeof ARENA_SIZES;
export const ARENA_LABEL: Record<ArenaSize, string> = {
  small: 'Малая (130)',
  medium: 'Средняя (180)',
  large: 'Большая (240)',
  colossus: 'Колосс (300)',
};

export const ENEMY_NAMES = [
  'КРОНОС',
  'ВЕКТОР',
  'ПУЛЬСАР',
  'ГЛИТЧ',
  'ФАНТОМ',
  'ДЕМОН',
  'ВИРУС',
  'ОМЕГА',
  'СИГМА',
  'КВАЗАР',
  'ТЕССЕРАКТ',
  'НУЛЬ',
  'РИНЗЛЕР',
  'КЛЮ',
  'ТРОН',
  'АНОНИМ',
];

// ─────────────────────────────────────────────────────────────
//  Геометрия двухъярусной арены: эстакада, пандусы, трамплины
// ─────────────────────────────────────────────────────────────

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface RampDef extends Rect {
  axis: 'x' | 'z';
  /** координата начала подъёма (t = 0 → высота 0) */
  ascendFrom: number;
  /** координата конца подъёма (t = 1 → высота LEVEL_HEIGHT) */
  ascendTo: number;
}

export interface TierLayout {
  deck: Rect[];
  ramps: RampDef[];
  pads: { x: number; z: number }[];
  armHalf: number;
  armWidth: number;
  rampLen: number;
  padR: number;
}

export function inRect(r: Rect, x: number, z: number, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}

/** Высота поверхности пандуса в точке (0 .. LEVEL_HEIGHT). */
export function rampHeight(r: RampDef, x: number, z: number): number {
  const c = r.axis === 'x' ? x : z;
  const span = r.ascendTo - r.ascendFrom;
  if (Math.abs(span) < 0.001) return 0;
  const t = Math.max(0, Math.min(1, (c - r.ascendFrom) / span));
  // плавный S-профиль — без излома на стыке с полом и эстакадой
  const s = t * t * (3 - 2 * t);
  return s * LEVEL_HEIGHT;
}

export function buildTierLayout(size: number): TierLayout {
  const armHalf = size * 0.3; // половина длины arms эстакады
  const armWidth = Math.max(14, size * 0.075); // ширина полотна
  const rampLen = Math.max(20, size * 0.13);
  const padR = Math.max(4, size * 0.022);

  const deck: Rect[] = [
    // продольное полотно (вдоль X)
    { x0: -armHalf, z0: -armWidth / 2, x1: armHalf, z1: armWidth / 2 },
    // поперечное полотно (вдоль Z)
    { x0: -armWidth / 2, z0: -armHalf, x1: armWidth / 2, z1: armHalf },
  ];

  const ramps: RampDef[] = [
    // Each continuous ramp connects the ground to the deck in both directions.
    { axis: 'x', x0: armHalf, z0: -armWidth / 2, x1: armHalf + rampLen, z1: armWidth / 2, ascendFrom: armHalf + rampLen, ascendTo: armHalf },
    { axis: 'x', x0: -armHalf - rampLen, z0: -armWidth / 2, x1: -armHalf, z1: armWidth / 2, ascendFrom: -armHalf - rampLen, ascendTo: -armHalf },
    { axis: 'z', x0: -armWidth / 2, z0: armHalf, x1: armWidth / 2, z1: armHalf + rampLen, ascendFrom: armHalf + rampLen, ascendTo: armHalf },
    { axis: 'z', x0: -armWidth / 2, z0: -armHalf - rampLen, x1: armWidth / 2, z1: -armHalf, ascendFrom: -armHalf - rampLen, ascendTo: -armHalf },
  ];

  const pd = size * 0.29;
  const pads = [
    { x: -pd, z: -pd },
    { x: pd, z: -pd },
    { x: -pd, z: pd },
    { x: pd, z: pd },
  ];

  return { deck, ramps, pads, armHalf, armWidth, rampLen, padR };
}
