import { useEffect, useRef, useState } from 'react';
import { KeyCap, useMenuNav } from './common';
import type { PhaseEvent, ResultAction } from '../game/types';

type Snd = (k: 'move' | 'select' | 'back') => void;
type IntroPhase = Extract<PhaseEvent, { type: 'intro' }>;
type ResultPhase = Extract<PhaseEvent, { type: 'result' }>;

// ───────────────────────── Брифинг ─────────────────────────
export function IntroOverlay({
  p,
  onStart,
  onExit,
  sound,
}: {
  p: IntroPhase;
  onStart: () => void;
  onExit: () => void;
  sound: Snd;
}) {
  const ref = useRef({ onStart, onExit });
  ref.current = { onStart, onExit };
  useEffect(() => {
    let armed = false;
    const t = window.setTimeout(() => (armed = true), 500);
    const h = (e: KeyboardEvent) => {
      if (!armed) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        sound('select');
        ref.current.onStart();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        sound('back');
        ref.current.onExit();
      }
    };
    window.addEventListener('keydown', h, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', h, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="anim-fade absolute inset-0 z-20">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="absolute bottom-6 left-4 right-4 md:bottom-12 md:left-12 md:right-auto md:w-[580px]">
        <div className="anim-fade-in flex items-center gap-2">
          <span className="font-display text-[11px] tracking-[0.5em] text-cyan-300/80">{p.roundLabel.toUpperCase()}</span>
          {p.hasTiers && (
            <span className="border border-cyan-400 bg-cyan-950/60 px-2 py-0.5 font-display text-[9px] font-bold tracking-widest text-cyan-200">
              3D ЯРУСЫ И ТРАМПЛИНЫ
            </span>
          )}
        </div>
        <div
          className="anim-fade-in mt-2 font-display text-2xl font-bold tracking-[0.25em] text-cyan-200 neon-soft md:text-3xl"
          style={{ animationDelay: '0.1s' }}
        >
          {p.code}
        </div>
        <h1
          className="anim-fade-in mt-1 font-head text-4xl tracking-[0.18em] text-white neon-soft md:text-5xl"
          style={{ animationDelay: '0.2s' }}
        >
          {p.title}
        </h1>
        <div className="mt-4 h-px w-full bg-gradient-to-r from-cyan-300/80 to-transparent" />
        <p className="anim-fade-in mt-4 text-sm leading-relaxed text-cyan-50/80 md:text-base" style={{ animationDelay: '0.3s' }}>
          {p.brief}
        </p>

        <div className="tron-panel anim-fade-in mt-5 p-4" style={{ animationDelay: '0.4s' }}>
          <div className="mb-2 flex justify-between font-display text-[10px] tracking-[0.4em] text-cyan-300/70">
            <span>ПРОГРАММЫ ПРОТИВНИКА</span>
            <span>
              {p.arenaName ? `${p.arenaName} · ` : ''}АРЕНА {p.arena}×{p.arena}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {p.enemies.length === 0 && <span className="text-sm text-cyan-100/60">На арене нет соперников</span>}
            {p.enemies.map((e) => (
              <div key={e.name} className="flex items-center gap-2 text-sm">
                <span className="inline-block h-3 w-1.5" style={{ background: e.color, boxShadow: `0 0 8px ${e.color}` }} />
                <span className="font-head tracking-[0.1em] text-white/90">{e.name}</span>
                {e.boss && <span className="border border-red-400/70 px-1 text-[9px] tracking-[0.2em] text-red-300">БОСС</span>}
                <span className="ml-auto text-[11px] tracking-[0.15em] text-cyan-100/50">{e.diff}</span>
              </div>
            ))}
          </div>
          {p.mode === 'campaign' && (
            <div className="mt-3 text-[11px] tracking-[0.3em] text-cyan-100/60">
              ЖИЗНЕЙ: <span className="font-display text-cyan-100">{p.lives}</span>
            </div>
          )}
        </div>

        <div className="anim-fade-in mt-6 flex flex-wrap items-center gap-3" style={{ animationDelay: '0.55s' }}>
          <button
            className="tron-action primary active"
            onClick={() => {
              sound('select');
              onStart();
            }}
          >
            Начать бой ▸
          </button>
          <button
            className="tron-action"
            onClick={() => {
              sound('back');
              onExit();
            }}
          >
            В меню
          </button>
          <span className="hidden items-center gap-2 text-[11px] tracking-[0.2em] text-cyan-100/50 md:inline-flex">
            <KeyCap>ENTER</KeyCap> старт
          </span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Итоги ─────────────────────────
const ACTION_LABEL: Record<ResultAction, string> = {
  next: 'Далее ▸',
  retry: 'Повторить',
  restart: 'Играть снова',
  menu: 'В меню',
};

export function ResultOverlay({
  p,
  onAction,
  sound,
}: {
  p: ResultPhase;
  onAction: (a: ResultAction) => void;
  sound: Snd;
}) {
  const [sel, setSel] = useState(0);
  const ref = useRef({ sel, p, onAction });
  ref.current = { sel, p, onAction };
  useEffect(() => {
    let armed = false;
    const t = window.setTimeout(() => (armed = true), 700);
    const h = (e: KeyboardEvent) => {
      const r = ref.current;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') {
        setSel((s) => (s + r.p.actions.length - 1) % r.p.actions.length);
        sound('move');
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') {
        setSel((s) => (s + 1) % r.p.actions.length);
        sound('move');
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (!armed) return;
        sound('select');
        r.onAction(r.p.actions[r.sel]);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = p.win ? '#9ff6ff' : '#ff5a4a';
  return (
    <div className="anim-fade absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4">
      <div className="tron-panel anim-fade-in w-[min(94vw,640px)] p-6 text-center md:p-10">
        <div className="font-display text-[10px] tracking-[0.55em] text-cyan-300/70">{p.final ? 'ФИНАЛЬНЫЙ ОТЧЁТ' : 'ОТЧЁТ О РАУНДЕ'}</div>
        <h2 className="mt-3 font-head text-4xl tracking-[0.22em] neon-text md:text-5xl" style={{ color }}>
          {p.title}
        </h2>
        <div className="mt-2 text-sm tracking-[0.25em] text-white/75">{p.subtitle}</div>
        {p.record && (
          <div className="anim-pulse mx-auto mt-4 inline-block border border-yellow-300/70 px-3 py-1 font-head text-xs tracking-[0.4em] text-yellow-200">
            НОВЫЙ РЕКОРД
          </div>
        )}
        <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-left">
          {p.stats.map((s) => (
            <div key={s.label} className="contents">
              <div className="border-b border-cyan-300/10 py-1.5 text-xs tracking-[0.15em] text-cyan-100/60">{s.label}</div>
              <div className="border-b border-cyan-300/10 py-1.5 text-right font-display text-sm text-white">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {p.actions.map((a, i) => (
            <button
              key={a}
              className={`tron-action ${i === 0 ? 'primary' : ''} ${i === sel ? 'active' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                sound('select');
                onAction(a);
              }}
            >
              {ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Пауза ─────────────────────────
const PAUSE_ITEMS = ['Продолжить', 'Настройки', 'Управление', 'Выйти в меню'];

export function PauseMenu({
  onResume,
  onSettings,
  onControls,
  onExit,
  sound,
}: {
  onResume: () => void;
  onSettings: () => void;
  onControls: () => void;
  onExit: () => void;
  sound: Snd;
}) {
  const actions = [onResume, onSettings, onControls, onExit];
  const [idx, setIdx] = useMenuNav(
    PAUSE_ITEMS.length,
    (i) => {
      sound('select');
      actions[i]();
    },
    null,
    true,
    () => sound('move'),
  );
  return (
    <div className="anim-fade absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-4">
      <div className="tron-panel anim-fade-in w-[min(92vw,440px)] p-8">
        <div className="text-center font-display text-[10px] tracking-[0.55em] text-cyan-300/70">СИСТЕМА ПРИОСТАНОВЛЕНА</div>
        <h2 className="mb-6 mt-2 text-center font-head text-4xl tracking-[0.35em] text-white neon-soft">ПАУЗА</h2>
        <div className="space-y-2">
          {PAUSE_ITEMS.map((l, i) => (
            <button
              key={l}
              className={`tron-btn ${i === idx ? 'active' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => {
                sound('select');
                actions[i]();
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mt-6 text-center text-[11px] tracking-[0.25em] text-cyan-100/45">ESC — ПРОДОЛЖИТЬ</div>
      </div>
    </div>
  );
}

// ───────────────────────── Сенсорное управление ─────────────────────────
export function TouchControls({
  onSteer,
  onBoost,
  onBrake,
  onJump,
  onShoot,
  onPause,
}: {
  onSteer: (d: number, pressed: boolean) => void;
  onBoost: (v: boolean) => void;
  onBrake: (v: boolean) => void;
  onJump?: () => void;
  onShoot?: () => void;
  onPause: () => void;
}) {
  const btn =
    'pointer-events-auto flex items-center justify-center border border-cyan-300/40 bg-cyan-300/10 font-head text-cyan-100 active:bg-cyan-300/30 backdrop-blur-sm';
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <button
        className={`${btn} absolute bottom-6 left-4 h-24 w-24 rounded-full text-3xl`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          onSteer(-1, true);
        }}
        onPointerUp={() => onSteer(-1, false)}
        onPointerCancel={() => onSteer(-1, false)}
        onLostPointerCapture={() => onSteer(-1, false)}
        aria-label="Поворот налево"
      >
        ◄
      </button>
      <button
        className={`${btn} absolute bottom-6 left-32 h-24 w-24 rounded-full text-3xl`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          onSteer(1, true);
        }}
        onPointerUp={() => onSteer(1, false)}
        onPointerCancel={() => onSteer(1, false)}
        onLostPointerCapture={() => onSteer(1, false)}
        aria-label="Поворот направо"
      >
        ►
      </button>

      <button
        className={`${btn} absolute bottom-6 right-4 h-24 w-24 rounded-full text-xs tracking-[0.2em]`}
        onPointerDown={() => onBoost(true)}
        onPointerUp={() => onBoost(false)}
        onPointerLeave={() => onBoost(false)}
        onPointerCancel={() => onBoost(false)}
      >
        ТУРБО
      </button>
      <button
        className={`${btn} absolute bottom-32 right-6 h-16 w-16 rounded-full text-[10px] tracking-[0.15em]`}
        onPointerDown={() => onBrake(true)}
        onPointerUp={() => onBrake(false)}
        onPointerLeave={() => onBrake(false)}
        onPointerCancel={() => onBrake(false)}
      >
        ТОРМ.
      </button>

      {onJump && (
        <button
          className={`${btn} absolute bottom-32 right-26 h-16 w-16 rounded-full text-[10px] tracking-[0.15em] border-orange-400/50 text-orange-200`}
          onPointerDown={() => onJump()}
        >
          ПРЫЖОК
        </button>
      )}

      {onShoot && (
        <button
          className={`${btn} absolute bottom-6 right-32 h-20 w-20 rounded-full border-cyan-200/60 bg-cyan-200/15 text-[11px] tracking-[0.15em]`}
          onPointerDown={() => onShoot()}
          aria-label="Выстрел"
        >
          ОГОНЬ
        </button>
      )}
      <button className={`${btn} absolute left-1/2 top-20 h-10 w-10 -translate-x-1/2 text-sm`} onPointerDown={onPause}>
        ❚❚
      </button>
    </div>
  );
}
