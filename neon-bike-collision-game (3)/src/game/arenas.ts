import { LEVEL_HEIGHT, type RampDef, type Rect, type TierLayout } from './config';

export type ArenaLayoutKind = 'cross' | 'ring' | 'lanes' | 'hub' | 'flat';

export interface ArenaTheme {
  id: string;
  name: string;
  tagline: string;
  layout: ArenaLayoutKind;
  /** Цвет сетки пола и границ арены. */
  grid: [number, number, number];
  /** Цвет световых стен по периметру. */
  wall: [number, number, number];
  /** Цвет полотна эстакады. */
  deck: [number, number, number];
  /** Палитра костюмов зрителей на трибунах. */
  crowd: number[];
  /** Палитра салютов. */
  fireworks: number[];
  /** Эмблема в центре арены. */
  emblem: 'disc' | 'triangle' | 'hex';
}

export const ARENA_THEMES: ArenaTheme[] = [
  {
    id: 'grid',
    name: 'КЛАССИКА СЕТКИ',
    tagline: 'Перекрёстная эстакада · циан',
    layout: 'cross',
    grid: [0.16, 0.75, 1.0],
    wall: [0.2, 0.8, 1.0],
    deck: [0.2, 0.85, 1.1],
    crowd: [0x25dff7, 0x66eeff, 0x208fce, 0xc1faff, 0xff8b30],
    fireworks: [0x55e6ff, 0xdff6ff, 0x1fa8d8, 0xff8b30],
    emblem: 'disc',
  },
  {
    id: 'portal',
    name: 'КОЛЬЦО ПОРТАЛА',
    tagline: 'Кольцевая эстакада · белый неон',
    layout: 'ring',
    grid: [0.3, 0.64, 0.9],
    wall: [0.32, 0.68, 0.95],
    deck: [0.36, 0.72, 1.0],
    crowd: [0xdff4ff, 0x9fe8ff, 0x58cdf0, 0xffffff, 0x3b74ff],
    fireworks: [0xffffff, 0xaeefff, 0x58cdf0, 0x3b74ff],
    emblem: 'hex',
  },
  {
    id: 'highway',
    name: 'МАГИСТРАЛЬ',
    tagline: 'Две параллельные эстакады · кобальт',
    layout: 'lanes',
    grid: [0.13, 0.36, 1.0],
    wall: [0.15, 0.38, 1.05],
    deck: [0.2, 0.45, 1.1],
    crowd: [0x3b74ff, 0x6fa0ff, 0x22eeff, 0xc9dcff, 0xff8b30],
    fireworks: [0x4f86ff, 0x22eeff, 0xe6f0ff, 0x9a4bff],
    emblem: 'triangle',
  },
  {
    id: 'citadel',
    name: 'ЦИТАДЕЛЬ',
    tagline: 'Центральная платформа · фиолет',
    layout: 'hub',
    grid: [0.4, 0.2, 0.95],
    wall: [0.44, 0.22, 1.0],
    deck: [0.5, 0.26, 1.05],
    crowd: [0x9a4bff, 0xc07bff, 0x22eeff, 0xe8d8ff, 0xff5aa5],
    fireworks: [0xa964ff, 0xff5aa5, 0xdff4ff, 0x22eeff],
    emblem: 'hex',
  },
  {
    id: 'clu',
    name: 'СЕКТОР КЛУ',
    tagline: 'Территория Системы · янтарь',
    layout: 'cross',
    grid: [0.95, 0.4, 0.07],
    wall: [1.0, 0.36, 0.06],
    deck: [1.05, 0.44, 0.09],
    crowd: [0xff8b30, 0xffb257, 0xff6a12, 0xffd9a0, 0xff2436],
    fireworks: [0xffa24a, 0xff6a12, 0xffe0b0, 0xff2436],
    emblem: 'triangle',
  },
  {
    id: 'openfield',
    name: 'ЧИСТОЕ ПОЛЕ',
    tagline: 'Без эстакад · изумруд',
    layout: 'flat',
    grid: [0.13, 0.82, 0.42],
    wall: [0.14, 0.86, 0.44],
    deck: [0.16, 0.88, 0.46],
    crowd: [0x2dff86, 0x7dffb8, 0x22eeff, 0xd8ffe8, 0xffe23a],
    fireworks: [0x4dff9b, 0x22eeff, 0xe8fff2, 0xffe23a],
    emblem: 'disc',
  },
];

export const DEFAULT_THEME = ARENA_THEMES[0];

export function themeById(id: string | undefined): ArenaTheme {
  if (!id) return DEFAULT_THEME;
  return ARENA_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

function ramp(axis: 'x' | 'z', x0: number, z0: number, x1: number, z1: number, from: number, to: number): RampDef {
  return { axis, x0, z0, x1, z1, ascendFrom: from, ascendTo: to };
}

/**
 * Строит геометрию яруса для выбранной планировки.
 * Все варианты держат одинаковый контракт: каждый пандус непрерывно
 * соединяет пол с полотном эстакады, поэтому заезд и съезд работают всегда.
 */
export function buildLayout(size: number, kind: ArenaLayoutKind): TierLayout | null {
  if (kind === 'flat') return null;

  const armWidth = Math.max(14, size * 0.075);
  const rampLen = Math.max(20, size * 0.13);
  const padR = Math.max(4, size * 0.022);
  const halfW = armWidth / 2;
  const pd = size * 0.29;

  const pads = [
    { x: -pd, z: -pd },
    { x: pd, z: -pd },
    { x: -pd, z: pd },
    { x: pd, z: pd },
  ];

  if (kind === 'ring') {
    // Квадратное кольцо: четыре полосы по периметру центральной зоны.
    const armHalf = size * 0.3;
    const inner = armHalf - armWidth;
    const deck: Rect[] = [
      { x0: -armHalf, z0: -armHalf, x1: armHalf, z1: -inner },
      { x0: -armHalf, z0: inner, x1: armHalf, z1: armHalf },
      { x0: -armHalf, z0: -inner, x1: -inner, z1: inner },
      { x0: inner, z0: -inner, x1: armHalf, z1: inner },
    ];
    const ramps: RampDef[] = [
      ramp('x', armHalf, -halfW, armHalf + rampLen, halfW, armHalf + rampLen, armHalf),
      ramp('x', -armHalf - rampLen, -halfW, -armHalf, halfW, -armHalf - rampLen, -armHalf),
      ramp('z', -halfW, armHalf, halfW, armHalf + rampLen, armHalf + rampLen, armHalf),
      ramp('z', -halfW, -armHalf - rampLen, halfW, -armHalf, -armHalf - rampLen, -armHalf),
    ];
    return { deck, ramps, pads, armHalf, armWidth, rampLen, padR };
  }

  if (kind === 'lanes') {
    // Две параллельные магистрали вдоль X со съездами на обоих концах.
    const armHalf = size * 0.32;
    const offset = size * 0.17;
    const deck: Rect[] = [
      { x0: -armHalf, z0: -offset - halfW, x1: armHalf, z1: -offset + halfW },
      { x0: -armHalf, z0: offset - halfW, x1: armHalf, z1: offset + halfW },
    ];
    const ramps: RampDef[] = [
      ramp('x', armHalf, -offset - halfW, armHalf + rampLen, -offset + halfW, armHalf + rampLen, armHalf),
      ramp('x', -armHalf - rampLen, -offset - halfW, -armHalf, -offset + halfW, -armHalf - rampLen, -armHalf),
      ramp('x', armHalf, offset - halfW, armHalf + rampLen, offset + halfW, armHalf + rampLen, armHalf),
      ramp('x', -armHalf - rampLen, offset - halfW, -armHalf, offset + halfW, -armHalf - rampLen, -armHalf),
    ];
    return { deck, ramps, pads, armHalf, armWidth, rampLen, padR };
  }

  if (kind === 'hub') {
    // Одна большая центральная платформа с четырьмя подъездами.
    const armHalf = size * 0.19;
    const deck: Rect[] = [{ x0: -armHalf, z0: -armHalf, x1: armHalf, z1: armHalf }];
    const ramps: RampDef[] = [
      ramp('x', armHalf, -halfW, armHalf + rampLen, halfW, armHalf + rampLen, armHalf),
      ramp('x', -armHalf - rampLen, -halfW, -armHalf, halfW, -armHalf - rampLen, -armHalf),
      ramp('z', -halfW, armHalf, halfW, armHalf + rampLen, armHalf + rampLen, armHalf),
      ramp('z', -halfW, -armHalf - rampLen, halfW, -armHalf, -armHalf - rampLen, -armHalf),
    ];
    return { deck, ramps, pads, armHalf, armWidth, rampLen, padR };
  }

  // cross — перекрёстная эстакада (классика)
  const armHalf = size * 0.3;
  const deck: Rect[] = [
    { x0: -armHalf, z0: -halfW, x1: armHalf, z1: halfW },
    { x0: -halfW, z0: -armHalf, x1: halfW, z1: armHalf },
  ];
  const ramps: RampDef[] = [
    ramp('x', armHalf, -halfW, armHalf + rampLen, halfW, armHalf + rampLen, armHalf),
    ramp('x', -armHalf - rampLen, -halfW, -armHalf, halfW, -armHalf - rampLen, -armHalf),
    ramp('z', -halfW, armHalf, halfW, armHalf + rampLen, armHalf + rampLen, armHalf),
    ramp('z', -halfW, -armHalf - rampLen, halfW, -armHalf, -armHalf - rampLen, -armHalf),
  ];
  return { deck, ramps, pads, armHalf, armWidth, rampLen, padR };
}

export { LEVEL_HEIGHT };
