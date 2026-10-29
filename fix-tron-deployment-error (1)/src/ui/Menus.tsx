import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CycleSilhouette, KeyCap, Logo, SectionTitle } from './common';
import {
  ARENA_LABEL,
  DIFFICULTY_LABEL,
  NEON,
  PLAYER_COLORS,
  type ArenaSize,
  type ColorKey,
  type Difficulty,
} from '../game/config';
import { CAM_LABEL, type CamMode, type Quality, type QuickSettings, type Settings } from '../game/types';
import { ARENA_THEMES, themeById } from '../game/arenas';

type Snd = (k: 'move' | 'select' | 'back') => void;

// ───────────────────────── Заставка ─────────────────────────
export function BootScreen({ onStart }: { onStart: () => void }) {
  const cb = useRef(onStart);
  cb.current = onStart;
  useEffect(() => {
    const h = () => cb.current();
    const t = window.setTimeout(() => {
      window.addEventListener('keydown', h, { once: true });
      window.addEventListener('pointerdown', h, { once: true });
    }, 350);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', h);
      window.removeEventListener('pointerdown', h);
    };
  }, []);
  return (
    <div className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center bg-black/60">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(0,0,0,0.9)_100%)]" />
      <div className="relative w-[min(92vw,860px)] text-center">
        <Logo size="lg" />
        <p className="anim-fade-in mt-8 text-xs tracking-[0.45em] text-cyan-100/70 md:text-sm" style={{ animationDelay: '0.8s' }}>
          СВЕТОВЫЕ ЦИКЛЫ · 3D АРЕНА В СТИЛЕ ТРОН: НАСЛЕДИЕ
        </p>
        <div className="anim-fade-in mt-14" style={{ animationDelay: '1.2s' }}>
          <div className="anim-blink font-head text-base tracking-[0.45em] text-white neon-soft md:text-lg">НАЖМИТЕ ЛЮБУЮ КЛАВИШУ</div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-6 text-center text-[10px] tracking-[0.35em] text-cyan-100/40 md:text-xs">
        НАУШНИКИ РЕКОМЕНДУЮТСЯ · F11 — ПОЛНЫЙ ЭКРАН
      </div>
      <div className="scanlines opacity-40" />
    </div>
  );
}

export { MainMenu, type MenuItem } from './MainMenu';

// ───────────────────────── Быстрый бой ─────────────────────────
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];
const ARENAS: ArenaSize[] = ['small', 'medium', 'large', 'colossus'];
const ROUNDS = [1, 3, 5];
const MAP_IDS = ARENA_THEMES.map((t) => t.id);

export function QuickSetup({
  value,
  onChange,
  onStart,
  onBack,
  sound,
}: {
  value: QuickSettings;
  onChange: (q: QuickSettings) => void;
  onStart: () => void;
  onBack: () => void;
  sound: Snd;
}) {
  const [row, setRow] = useState(0);
  const ref = useRef({ value, row, onChange, onStart, onBack });
  ref.current = { value, row, onChange, onStart, onBack };

  const adjust = (r: number, d: number) => {
    const v = ref.current.value;
    const cyc = <T,>(arr: T[], cur: T) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
    let n: QuickSettings = v;
    if (r === 0) n = { ...v, enemies: Math.max(1, Math.min(7, v.enemies + d)) };
    else if (r === 1) n = { ...v, difficulty: cyc(DIFFS, v.difficulty) };
    else if (r === 2) n = { ...v, map: cyc(MAP_IDS, v.map) };
    else if (r === 3) n = { ...v, arena: cyc(ARENAS, v.arena) };
    else if (r === 4) n = { ...v, rounds: cyc(ROUNDS, v.rounds) };
    else if (r === 5) n = { ...v, hasTiers: !v.hasTiers };
    else if (r === 6) n = { ...v, cells: !v.cells };
    ref.current.onChange(n);
    sound('move');
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const r = ref.current;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        setRow((x) => (x + 1) % 8);
        sound('move');
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        setRow((x) => (x + 7) % 8);
        sound('move');
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (r.row < 7) adjust(r.row, -1);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (r.row < 7) adjust(r.row, 1);
      } else if (e.code === 'Enter') {
        sound('select');
        r.onStart();
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        sound('back');
        r.onBack();
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const row_ = (i: number, label: string, children: ReactNode) => (
    <div
      className={`flex flex-col gap-2 border-l-2 px-3 py-2 transition-colors md:flex-row md:items-center ${
        row === i ? 'border-cyan-300 bg-cyan-300/10' : 'border-cyan-300/15'
      }`}
      onMouseEnter={() => setRow(i)}
    >
      <div className="w-56 font-head text-xs tracking-[0.2em] text-cyan-100/80">{label}</div>
      <div className="flex flex-1 flex-wrap gap-2">{children}</div>
    </div>
  );

  return (
    <div className="anim-fade absolute inset-0 flex items-center justify-center bg-black/60 p-4">
      <div className="tron-panel anim-fade-in max-h-[92vh] w-[min(96vw,840px)] overflow-y-auto p-6 md:p-8">
        <SectionTitle kicker="ПРОТОКОЛ 05" title="БЫСТРЫЙ БОЙ" />
        <div className="space-y-1.5">
          {row_(0, 'СОПЕРНИКИ', (
            <>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button key={n} className={`tron-chip w-10 ${value.enemies === n ? 'on' : ''}`} onClick={() => onChange({ ...value, enemies: n })}>
                  {n}
                </button>
              ))}
            </>
          ))}
          {row_(1, 'СЛОЖНОСТЬ ИИ', (
            <>
              {DIFFS.map((d) => (
                <button key={d} className={`tron-chip ${value.difficulty === d ? 'on' : ''}`} onClick={() => onChange({ ...value, difficulty: d })}>
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </>
          ))}
          {row_(2, 'КАРТА АРЕНЫ', (
            <>
              {ARENA_THEMES.map((t) => (
                <button key={t.id} className={`tron-chip ${value.map === t.id ? 'on' : ''}`} onClick={() => onChange({ ...value, map: t.id })}>
                  {t.name}
                </button>
              ))}
            </>
          ))}
          {row_(3, 'РАЗМЕР АРЕНЫ', (
            <>
              {ARENAS.map((a) => (
                <button key={a} className={`tron-chip ${value.arena === a ? 'on' : ''}`} onClick={() => onChange({ ...value, arena: a })}>
                  {ARENA_LABEL[a]}
                </button>
              ))}
            </>
          ))}
          {row_(4, 'ПОБЕД ДЛЯ МАТЧА', (
            <>
              {ROUNDS.map((r) => (
                <button key={r} className={`tron-chip w-12 ${value.rounds === r ? 'on' : ''}`} onClick={() => onChange({ ...value, rounds: r })}>
                  {r}
                </button>
              ))}
            </>
          ))}
          {row_(5, '2-Й ЯРУС И ТРАМПЛИНЫ', (
            <>
              <button className={`tron-chip ${value.hasTiers ? 'on' : ''}`} onClick={() => onChange({ ...value, hasTiers: true })}>
                Включены (3D)
              </button>
              <button className={`tron-chip ${!value.hasTiers ? 'on' : ''}`} onClick={() => onChange({ ...value, hasTiers: false })}>
                Плоская арена
              </button>
            </>
          ))}
          {row_(6, 'БОНУСЫ НА АРЕНЕ', (
            <>
              <button className={`tron-chip ${value.cells ? 'on' : ''}`} onClick={() => onChange({ ...value, cells: true })}>
                Щиты, ЭМИ, Фаза, Прыжок
              </button>
              <button className={`tron-chip ${!value.cells ? 'on' : ''}`} onClick={() => onChange({ ...value, cells: false })}>
                Без бонусов
              </button>
            </>
          ))}
        </div>
        <div className="mt-4 border-l-2 border-cyan-300/30 bg-cyan-300/5 px-4 py-2 text-xs text-cyan-100/70">
          <span className="font-head tracking-[0.18em] text-cyan-200">{themeById(value.map).name}</span>
          <span className="ml-2">{themeById(value.map).tagline}</span>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="hidden items-center gap-2 text-[11px] tracking-[0.2em] text-cyan-100/50 md:flex">
            <KeyCap>←</KeyCap>
            <KeyCap>→</KeyCap> значение <KeyCap>ENTER</KeyCap> старт <KeyCap>ESC</KeyCap> назад
          </div>
          <div className="flex gap-3">
            <button
              className="tron-action"
              onClick={() => {
                sound('back');
                onBack();
              }}
            >
              Назад
            </button>
            <button
              className={`tron-action primary ${row === 7 ? 'active' : ''}`}
              onMouseEnter={() => setRow(7)}
              onClick={() => {
                sound('select');
                onStart();
              }}
            >
              В бой ▸
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Настройка заезда: число участников, круги, карта и сложность пелотона. */
export function RaceSetup({
  value,
  onChange,
  onStart,
  onBack,
  sound,
}: {
  value: QuickSettings;
  onChange: (q: QuickSettings) => void;
  onStart: () => void;
  onBack: () => void;
  sound: Snd;
}) {
  const [row, setRow] = useState(0);
  const update = (next: QuickSettings) => {
    onChange({ ...next, boss: false, hasTiers: false, cells: true });
    sound('move');
  };
  const item = (index: number, label: string, detail: string, children: ReactNode) => (
    <div
      className={`grid grid-cols-[1fr_auto] items-center gap-x-3 border-l-2 px-3 py-3 transition-colors ${
        row === index ? 'border-cyan-300 bg-cyan-300/10' : 'border-cyan-300/10'
      }`}
      onMouseEnter={() => setRow(index)}
    >
      <div>
        <div className="font-head text-xs tracking-[0.18em] text-white">{label}</div>
        <div className="mt-1 text-[11px] text-cyan-100/50">{detail}</div>
      </div>
      <div className="flex max-w-[60vw] flex-wrap justify-end gap-1.5">{children}</div>
    </div>
  );
  const changeRiders = (d: number) => update({ ...value, enemies: Math.max(1, Math.min(7, value.enemies + d)) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault(); setRow((r) => (r + 1) % 5); sound('move');
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault(); setRow((r) => (r + 4) % 5); sound('move');
      } else if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && row === 0) {
        e.preventDefault(); changeRiders(-1);
      } else if ((e.code === 'ArrowRight' || e.code === 'KeyD') && row === 0) {
        e.preventDefault(); changeRiders(1);
      } else if (e.code === 'Enter' && row === 4) {
        e.preventDefault(); sound('select'); onStart();
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault(); sound('back'); onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, value]);

  const laps = [1, 2, 3, 5];
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
      <div className="tron-panel w-[min(94vw,760px)] p-5 md:p-8">
        <SectionTitle kicker="ПРОТОКОЛ ГОНКИ" title="СТАРТОВАЯ РЕШЁТКА" />
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-cyan-50/65">
          Широкая овальная трасса на 7 полос: обгоняй по дуге, обходи блокираторы, собирай патроны и простреливай чужие следы. Твой шлейф короткий и тает за кормой.
        </p>
        <div className="space-y-1.5">
          {item(0, 'УЧАСТНИКИ', 'Ты и соперники на одной стартовой решётке', <>
            <button className="tron-chip w-9" onClick={() => changeRiders(-1)}>−</button>
            <span className="min-w-24 self-center text-center font-display text-sm text-cyan-100">{value.enemies + 1} ЦИКЛОВ</span>
            <button className="tron-chip w-9" onClick={() => changeRiders(1)}>+</button>
          </>)}
          {item(1, 'КРУГИ', 'Дистанция до пересечения финишной линии', <>
            {laps.map((n) => <button key={n} className={`tron-chip w-11 ${value.rounds === n ? 'on' : ''}`} onClick={() => update({ ...value, rounds: n })}>{n}</button>)}
          </>)}
          {item(2, 'АРЕНА', 'Выбери палитру и атмосферу трассы', <>
            {ARENA_THEMES.map((t) => <button key={t.id} className={`tron-chip text-[9px] ${value.map === t.id ? 'on' : ''}`} onClick={() => update({ ...value, map: t.id })}>{t.name}</button>)}
          </>)}
          {item(3, 'ПЕЛОТОН', 'Сложность пилотов-соперников', <>
            {DIFFS.map((d) => <button key={d} className={`tron-chip ${value.difficulty === d ? 'on' : ''}`} onClick={() => update({ ...value, difficulty: d })}>{DIFFICULTY_LABEL[d]}</button>)}
          </>)}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-cyan-300/15 pt-4">
          <div className="hidden text-[10px] tracking-widest text-cyan-100/50 sm:block">A/D — РУЛЕНИЕ · SHIFT — ТУРБО · ESC — НАЗАД</div>
          <div className="ml-auto flex gap-2">
            <button className="tron-action" onClick={onBack}>Назад</button>
            <button className="tron-action primary" onMouseEnter={() => setRow(4)} onClick={onStart}>На стартовую ▸</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Гараж ─────────────────────────
export function Garage({ color, onPick, onBack, sound }: { color: ColorKey; onPick: (c: ColorKey) => void; onBack: () => void; sound: Snd }) {
  const ref = useRef({ color, onPick, onBack });
  ref.current = { color, onPick, onBack };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const r = ref.current;
      const i = PLAYER_COLORS.indexOf(r.color);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        r.onPick(PLAYER_COLORS[(i + PLAYER_COLORS.length - 1) % PLAYER_COLORS.length]);
        sound('move');
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        r.onPick(PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length]);
        sound('move');
      } else if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Backspace') {
        sound('back');
        r.onBack();
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = NEON[color];
  return (
    <div className="anim-fade absolute inset-0 flex items-center justify-center bg-black/60 p-4">
      <div className="tron-panel anim-fade-in w-[min(96vw,900px)] p-6 md:p-10">
        <SectionTitle kicker="ПРОТОКОЛ 06" title="ГАРАЖ" />
        <div className="relative flex items-center justify-center py-6">
          <div className="absolute inset-x-10 bottom-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.css}, transparent)` }} />
          <CycleSilhouette key={color} color={c.css} className="anim-fade-in h-44 w-full max-w-[560px] md:h-56" />
        </div>
        <div className="text-center">
          <div className="font-display text-[10px] tracking-[0.5em] text-cyan-300/60">СВЕТОЦИКЛ СИСТЕМЫ · ПОКОЛЕНИЕ 5</div>
          <div className="mt-2 font-head text-3xl tracking-[0.3em] neon-text" style={{ color: c.css }}>
            {c.name.toUpperCase()}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {PLAYER_COLORS.map((k) => (
            <button
              key={k}
              onClick={() => {
                onPick(k);
                sound('move');
              }}
              className="group relative h-14 w-14 transition-transform hover:scale-110"
              style={{
                background: `radial-gradient(circle, ${NEON[k].css} 0%, ${NEON[k].css}55 45%, transparent 70%)`,
                outline: k === color ? `2px solid ${NEON[k].css}` : '1px solid rgba(255,255,255,0.12)',
                outlineOffset: 3,
                boxShadow: k === color ? `0 0 24px ${NEON[k].css}` : 'none',
              }}
              title={NEON[k].name}
            />
          ))}
        </div>
        <div className="mt-8 flex items-center justify-between">
          <div className="hidden items-center gap-2 text-[11px] tracking-[0.2em] text-cyan-100/50 md:flex">
            <KeyCap>←</KeyCap>
            <KeyCap>→</KeyCap> цвет <KeyCap>ENTER</KeyCap> готово
          </div>
          <button
            className="tron-action primary"
            onClick={() => {
              sound('back');
              onBack();
            }}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Настройки ─────────────────────────
const QUALS: { k: Quality; l: string }[] = [
  { k: 'low', l: 'Низкое' },
  { k: 'medium', l: 'Среднее' },
  { k: 'high', l: 'Высокое' },
  { k: 'ultra', l: 'Ультра' },
];
const CAMS: CamMode[] = ['smooth', 'chase', 'far', 'cockpit', 'top'];

export function SettingsPanel({
  value,
  onChange,
  onBack,
  sound,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  sound: Snd;
}) {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation();
        sound('back');
        back.current();
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...value, [k]: v });
  const toggle = (k: 'bloom' | 'reflections' | 'postfx' | 'shake' | 'camSmooth', label: string) => (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm tracking-[0.12em] text-cyan-50/85">{label}</span>
      <button
        className={`tron-chip w-24 ${value[k] ? 'on' : ''}`}
        onClick={() => {
          set(k, !value[k]);
          sound('move');
        }}
      >
        {value[k] ? 'Вкл' : 'Выкл'}
      </button>
    </div>
  );

  const slider = (
    k: 'master' | 'music' | 'sfx' | 'fov',
    label: string,
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string,
  ) => {
    const v = value[k];
    const pct = ((v - min) / (max - min)) * 100;
    return (
      <div className="py-1.5">
        <div className="mb-1.5 flex justify-between text-sm tracking-[0.12em] text-cyan-50/85">
          <span>{label}</span>
          <span className="font-display text-xs text-cyan-200">{fmt(v)}</span>
        </div>
        <input
          type="range"
          className="tron-range"
          min={min}
          max={max}
          step={step}
          value={v}
          style={{ ['--v' as string]: `${pct}%` }}
          onChange={(e) => set(k, Number(e.target.value))}
        />
      </div>
    );
  };

  return (
    <div className="anim-fade absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="tron-panel anim-fade-in max-h-[92vh] w-[min(96vw,900px)] overflow-y-auto p-6 md:p-10">
        <SectionTitle kicker="СИСТЕМНЫЕ ПАРАМЕТРЫ" title="НАСТРОЙКИ" />
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="mb-2 font-display text-[11px] tracking-[0.4em] text-cyan-300/70">УПРАВЛЕНИЕ И КАМЕРА</div>
            {toggle('camSmooth', 'Плавная камера (без резких поворотов)')}
            <div className="mb-3 mt-4 font-display text-[11px] tracking-[0.4em] text-cyan-300/70">РЕЖИМ КАМЕРЫ</div>
            <div className="flex flex-wrap gap-2">
              {CAMS.map((c) => (
                <button
                  key={c}
                  className={`tron-chip ${value.camera === c ? 'on' : ''}`}
                  onClick={() => {
                    set('camera', c);
                    sound('move');
                  }}
                >
                  {CAM_LABEL[c]}
                </button>
              ))}
            </div>

            <div className="mb-2 mt-6 font-display text-[11px] tracking-[0.4em] text-cyan-300/70">ГРАФИКА</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {QUALS.map((q) => (
                <button
                  key={q.k}
                  className={`tron-chip ${value.quality === q.k ? 'on' : ''}`}
                  onClick={() => {
                    set('quality', q.k);
                    sound('move');
                  }}
                >
                  {q.l}
                </button>
              ))}
            </div>
            {toggle('bloom', 'Неоновое свечение (bloom)')}
            {toggle('reflections', 'Зеркальные отражения пола')}
            {toggle('postfx', 'Кинематографичные эффекты')}
            {toggle('shake', 'Тряска камеры')}
            {slider('fov', 'Поле зрения (FOV)', 55, 95, 1, (v) => `${v}°`)}
          </div>
          <div>
            <div className="mb-2 font-display text-[11px] tracking-[0.4em] text-cyan-300/70">ЗВУК И МУЗЫКА В ТАКТ</div>
            {slider('master', 'Общая громкость', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {slider('music', 'Музыка (пульсация неона в такт)', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {slider('sfx', 'Эффекты, моторы и трамплины', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}

            <div className="mt-6 rounded border border-cyan-400/20 bg-cyan-950/30 p-4">
              <div className="font-head text-xs tracking-widest text-cyan-300">СВЕТ И МУЗЫКА:</div>
              <p className="mt-1.5 text-xs leading-relaxed text-cyan-100/70">
                Подсветка арены, сетка пола, башни города и границы автоматически синхронизируются с ритмом бас-бочки и синтезатора!
              </p>
            </div>
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <button
            className="tron-action primary"
            onClick={() => {
              sound('back');
              onBack();
            }}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Управление и Бонусы ─────────────────────────
export function ControlsPanel({ onBack, sound }: { onBack: () => void; sound: Snd }) {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation();
        sound('back');
        back.current();
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keys: [string[], string][] = [
    [['A', '←'], 'Удерживай для плавного поворота налево'],
    [['D', '→'], 'Удерживай для плавного поворота направо'],
    [['W', '↑', 'SHIFT', 'ПРОБЕЛ'], 'Турбо (удерживать) — расходует энергию'],
    [['S', '↓'], 'Торможение — для аккуратного входа в повороты'],
    [['E'], 'Использовать запасной прыжок'],
    [['F', 'ЛКМ'], 'Выстрел неоновой пулей (нужны патроны)'],
    [['C'], 'Смена камеры: плавная / погоня / дальняя / кокпит / тактическая'],
    [['ESC', 'P'], 'Пауза'],
  ];

  const bonuses: [string, string, string][] = [
    ['ЩИТ СИСТЕМЫ', '#2dff86', 'Поглощает одно столкновение со стеной, соперником или неоновой пулей.'],
    ['ЭМИ-ИМПУЛЬС', '#ff36ee', 'Стирает стены врагов поблизости.'],
    ['ФАЗОВЫЙ СДВИГ', '#ffe23a', 'Позволяет временно проезжать сквозь световые стены.'],
    ['ТРАМПЛИН', '#ffa51c', 'Запускает байк в воздух над стенами и ловушками.'],
    ['ТУРБО-ЗАРЯД', '#22eeff', 'Восполняет энергию турбо.'],
    ['МНОЖИТЕЛЬ 2×', '#dff4ff', 'Удваивает очки на 15 секунд.'],
    ['НЕОН-ПАТРОНЫ', '#9ff8ff', 'Дают +2 выстрела. Два попадания пробивают световой след в пиксели, одно — уничтожает программу. Щит и фаза защищают от выстрелов.'],
  ];

  return (
    <div className="anim-fade absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="tron-panel anim-fade-in max-h-[92vh] w-[min(96vw,1020px)] overflow-y-auto p-6 md:p-10">
        <SectionTitle kicker="ПРОТОКОЛ 07" title="УПРАВЛЕНИЕ И БОНУСЫ" />
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="mb-3 font-display text-[11px] tracking-[0.4em] text-cyan-300/70">КЛАВИШИ УПРАВЛЕНИЯ</div>
            <div className="space-y-3">
              {keys.map(([ks, d]) => (
                <div key={d} className="flex items-center gap-3 border-b border-cyan-300/10 pb-2.5">
                  <div className="flex w-44 flex-wrap gap-1">
                    {ks.map((k) => (
                      <KeyCap key={k}>{k}</KeyCap>
                    ))}
                  </div>
                  <div className="flex-1 text-xs text-cyan-50/80">{d}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded border border-cyan-400/25 bg-cyan-950/30 p-3">
              <div className="font-head text-xs tracking-wider text-cyan-300">ПЛАВНОСТЬ КАМЕРЫ:</div>
              <p className="mt-1 text-xs text-cyan-100/70">
                Камера остаётся позади байка. Удерживай клавишу поворота и отпусти её, чтобы выровнять курс.
              </p>
            </div>
          </div>
          <div>
            <div className="mb-3 font-display text-[11px] tracking-[0.4em] text-cyan-300/70">АРСЕНАЛ БОНУСОВ И ТРАМПЛИНОВ</div>
            <div className="space-y-3">
              {bonuses.map(([name, col, desc]) => (
                <div key={name} className="border-b border-cyan-300/10 pb-2.5">
                  <div className="font-head text-sm tracking-wider" style={{ color: col }}>
                    {name}
                  </div>
                  <p className="mt-0.5 text-xs text-cyan-100/70">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-8 flex justify-end">
          <button
            className="tron-action primary"
            onClick={() => {
              sound('back');
              onBack();
            }}
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
