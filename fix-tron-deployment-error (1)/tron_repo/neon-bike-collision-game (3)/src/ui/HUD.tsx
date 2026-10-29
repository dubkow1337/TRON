import { useEffect, useRef } from 'react';
import type { GameMessage, HudState } from '../game/types';
import { CAM_LABEL } from '../game/types';
import { LEVEL_HEIGHT } from '../game/config';

/** Стрелка-компас: куда ехать, чтобы заехать на эстакаду. */
function RampCompass({ hint, heading, onDeck }: { hint: { angle: number; dist: number } | null; heading: number; onDeck: boolean }) {
  if (!hint || onDeck) return null;
  const near = hint.dist < 26;
  const rel = hint.angle - heading;
  const deg = (rel * 180) / Math.PI;
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="relative h-9 w-9">
        <svg viewBox="-20 -20 40 40" className="h-9 w-9">
          <circle r="17" fill="rgba(0,10,20,0.55)" stroke="rgba(255,180,50,0.45)" strokeWidth="1.5" />
          <g transform={`rotate(${deg})`}>
            <path d="M0,-13 L5,3 L0,-1 L-5,3 Z" fill={near ? '#ffe23a' : '#ffa51c'} style={{ filter: `drop-shadow(0 0 5px ${near ? '#ffe23a' : '#ffa51c'})` }} />
          </g>
        </svg>
      </div>
      <div className="font-display text-[9px] leading-tight tracking-[0.2em] text-amber-200/90">
        <div>ПАНДУС</div>
        <div className="text-white/80">{Math.round(hint.dist)} м</div>
      </div>
    </div>
  );
}

/** Вертикальная шкала ярусов: где сейчас находится светоцикл. */
function TierGauge({ y, air, color, compact }: { y: number; air: boolean; color: string; compact: boolean }) {
  const H = compact ? 64 : 92;
  const frac = Math.max(0, Math.min(1, y / LEVEL_HEIGHT));
  const markerY = frac * H;
  return (
    <div className="flex items-end gap-2">
      <div className="relative" style={{ width: 12, height: H }}>
        <div className="absolute inset-0 border border-cyan-300/30 bg-black/50" />
        {/* зона нижнего яруса */}
        <div className="absolute inset-x-0 bottom-0 bg-cyan-400/10" style={{ height: H * 0.5 }} />
        {/* зона верхнего яруса */}
        <div
          className="absolute inset-x-0 border-t border-sky-400/60"
          style={{ bottom: H * 0.5, height: H * 0.5, background: 'linear-gradient(0deg, rgba(59,116,255,0.28), rgba(59,116,255,0.06))' }}
        />
        {/* текущая высота */}
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-100"
          style={{ height: H * frac, background: `linear-gradient(0deg, ${color}, ${color}55)` }}
        />
        {/* маркер */}
        <div
          className="absolute -left-1 h-[2px] w-[14px] transition-[bottom] duration-100"
          style={{ bottom: markerY - 1, background: air ? '#ffe23a' : '#fff', boxShadow: `0 0 8px ${air ? '#ffe23a' : color}` }}
        />
      </div>
      <div className="flex flex-col justify-between pb-0.5" style={{ height: H }}>
        <span className="font-display text-[8px] leading-none tracking-[0.2em] text-sky-300/90">ВЕРХ</span>
        <span className="font-display text-[8px] leading-none tracking-[0.2em] text-cyan-200/70">НИЗ</span>
      </div>
    </div>
  );
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function Gauge({
  speed,
  speedN,
  boosting,
  braking,
  color,
  beatPulse,
}: {
  speed: number;
  speedN: number;
  boosting: boolean;
  braking: boolean;
  color: string;
  beatPulse: number;
}) {
  const R = 64;
  const sweep = 240;
  const start = 150;
  const frac = Math.max(0, Math.min(1, speedN / 1.9));
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => {
      const r = (a * Math.PI) / 180;
      return [80 + Math.cos(r) * R, 80 + Math.sin(r) * R];
    };
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  };
  const len = (Math.PI * 2 * R * sweep) / 360;
  const c = boosting ? '#ffffff' : braking ? '#ffb347' : color;
  const ticks = [];
  for (let i = 0; i <= 24; i++) {
    const a = ((start + (sweep * i) / 24) * Math.PI) / 180;
    const r0 = i % 4 === 0 ? 50 : 54;
    ticks.push(
      <line
        key={i}
        x1={80 + Math.cos(a) * r0}
        y1={80 + Math.sin(a) * r0}
        x2={80 + Math.cos(a) * 57}
        y2={80 + Math.sin(a) * 57}
        stroke={i / 24 <= frac ? c : 'rgba(120,220,255,0.25)'}
        strokeWidth={i % 4 === 0 ? 2 : 1}
      />,
    );
  }

  const beatGlow = 1.0 + beatPulse * 0.45;

  return (
    <svg viewBox="0 0 160 130" className="h-28 w-36 md:h-32 md:w-40">
      <path d={arc(start, start + sweep)} stroke="rgba(80,200,255,0.15)" strokeWidth="7" fill="none" />
      <path
        d={arc(start, start + sweep)}
        stroke={c}
        strokeWidth="7"
        fill="none"
        strokeDasharray={`${len * frac} ${len}`}
        style={{
          filter: `drop-shadow(0 0 ${8 * beatGlow}px ${c})`,
          transition: 'stroke-dasharray 0.08s linear',
        }}
      />
      {ticks}
      <text
        x="80"
        y="84"
        textAnchor="middle"
        className="font-display"
        fontSize="28"
        fontWeight="700"
        fill="#fff"
        style={{ filter: `drop-shadow(0 0 6px ${c})` }}
      >
        {speed}
      </text>
      <text x="80" y="102" textAnchor="middle" className="font-display" fontSize="9" letterSpacing="3" fill="rgba(200,240,255,0.7)">
        КМ/Ч
      </text>
    </svg>
  );
}

function BoostBar({
  boost,
  boosting,
  grinding,
  color,
  beatPulse,
}: {
  boost: number;
  boosting: boolean;
  grinding: number;
  color: string;
  beatPulse: number;
}) {
  const N = 24;
  const filled = Math.round(boost * N);
  const low = boost < 0.2 && !boosting;
  const pulseGlow = 1.0 + beatPulse * 0.35;

  return (
    <div className="w-[min(68vw,300px)]">
      <div className="mb-1.5 flex items-end justify-between">
        <span
          className={`font-head text-[11px] tracking-[0.35em] ${boosting ? 'text-white neon-text' : 'text-cyan-100/80'}`}
          style={{ textShadow: `0 0 ${8 * pulseGlow}px ${color}` }}
        >
          ТУРБО
        </span>
        <span className={`font-head text-[10px] tracking-[0.25em] text-yellow-200 transition-opacity ${grinding > 0.4 ? 'anim-pulse opacity-100' : 'opacity-0'}`}>
          ЗАРЯДКА ×{(1 + grinding * 5).toFixed(1)}
        </span>
        <span className="font-display text-xs text-cyan-100/80">{Math.round(boost * 100)}%</span>
      </div>
      <div className="flex gap-[3px]">
        {Array.from({ length: N }, (_, i) => {
          const on = i < filled;
          const bg = on ? (boosting ? '#ffffff' : low ? '#ff5a4a' : color) : 'rgba(120,220,255,0.12)';
          return (
            <div
              key={i}
              className="h-2.5 flex-1"
              style={{
                background: bg,
                boxShadow: on ? `0 0 ${6 * pulseGlow}px ${bg}` : 'none',
                transform: 'skewX(-20deg)',
                transition: 'background 0.1s',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}


function BossBar({ boss, playerColor }: { boss: NonNullable<HudState['boss']>; playerColor: string }) {
  const pct = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));
  const phaseColor = boss.phase === 1 ? '#ffa51c' : boss.phase === 2 ? '#ff344d' : '#ffffff';
  return (
    <div className="pointer-events-none absolute left-1/2 top-[64px] w-[min(88vw,620px)] -translate-x-1/2 md:top-[78px]">
      <div
        className="relative border px-3 py-2 backdrop-blur-sm"
        style={{ borderColor: `${phaseColor}88`, background: 'linear-gradient(180deg, rgba(10,4,2,0.85), rgba(3,7,10,0.9))', clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rotate-45 border" style={{ borderColor: phaseColor, background: phaseColor, boxShadow: `0 0 14px ${phaseColor}` }} />
            <span className="font-head text-xs tracking-[0.3em] text-white md:text-sm">ДЖАГГЕРНАУТ</span>
            <span className="font-display text-[9px] tracking-[0.2em]" style={{ color: phaseColor }}>ФАЗА {boss.phase}</span>
          </div>
          <div className="flex items-center gap-2 font-display text-[9px] tracking-[0.15em] text-cyan-100/70">
            <span style={{ color: boss.armor > 0 ? '#ffa51c' : '#ff344d' }}>БРОНЯ {boss.armor}/{boss.armorMax}</span>
            <span className="text-white">{boss.hp}/{boss.maxHp}</span>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: boss.maxHp }, (_, i) => (
            <div
              key={i}
              className="h-2.5 flex-1"
              style={{
                background: i < boss.hp ? phaseColor : 'rgba(255,255,255,0.1)',
                boxShadow: i < boss.hp ? `0 0 10px ${phaseColor}` : 'none',
                transform: 'skewX(-18deg)',
              }}
            />
          ))}
        </div>
        <div className="mt-1 h-0.5 overflow-hidden bg-white/10">
          <div className="h-full transition-all" style={{ width: `${pct * 100}%`, background: playerColor }} />
        </div>
        {boss.charging && (
          <div className="absolute -bottom-6 inset-x-0 text-center font-head text-[10px] tracking-[0.4em] text-red-300 anim-blink">
            ТАРАН · УХОДИ С ЛИНИИ
          </div>
        )}
      </div>
    </div>
  );
}

function RacePanel({ race }: { race: NonNullable<HudState['race']> }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[62px] w-[min(90vw,540px)] -translate-x-1/2 md:top-[76px]">
      <div className="border border-cyan-300/35 bg-black/65 px-4 py-2 backdrop-blur-sm" style={{ clipPath: 'polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[10px] tracking-[0.3em] text-cyan-300/70">ПОЗИЦИЯ</span>
            <span className="font-head text-2xl leading-none text-white neon-soft">{race.place}</span>
            <span className="font-display text-xs text-cyan-100/50">/ {race.entrants}</span>
          </div>
          <div className="text-center">
            <span className="font-display text-[10px] tracking-[0.3em] text-cyan-300/70">КРУГ </span>
            <span className="font-head text-lg text-white">{race.lap}</span>
            <span className="font-display text-xs text-cyan-100/50"> / {race.laps}</span>
          </div>
          <div className="text-right">
            <div className="font-display text-[10px] tracking-[0.25em] text-cyan-300/70">ЧИСТО</div>
            <div className="font-head text-sm text-white">{Math.floor(race.clean)} м</div>
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden bg-cyan-300/15">
          <div className="h-full transition-[width] duration-100" style={{ width: `${race.progress * 100}%`, background: 'linear-gradient(90deg,#22eeff,#e8ffff)', boxShadow: '0 0 12px #22eeff' }} />
        </div>
        <div className="mt-1 flex justify-between font-display text-[9px] tracking-[0.2em] text-cyan-100/55">
          <span>СТАРТ</span>
          <span className="text-amber-300">ШТРАФ {race.penalty.toFixed(1)} с</span>
          <span>ФИНИШ</span>
        </div>
      </div>
    </div>
  );
}

export function HUD({
  hud,
  banners,
  popups,
  feed,
  countdown,
  camToast,
  onMinimap,
  dim,
  touch,
}: {
  hud: HudState;
  banners: GameMessage[];
  popups: GameMessage[];
  feed: GameMessage[];
  countdown: number | null;
  camToast: string | null;
  onMinimap: (c: HTMLCanvasElement | null) => void;
  dim: boolean;
  touch: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cbRef = useRef(onMinimap);
  cbRef.current = onMinimap;
  useEffect(() => {
    cbRef.current(canvasRef.current);
    return () => cbRef.current(null);
  }, []);

  const pc = hud.playerColor;
  const bp = hud.beatPulse || 0;
  const kp = hud.kickPulse || 0;
  const pw = hud.powerups;

  // Определение вертикального статуса
  const isAir = hud.playerAirborne;
  const tierLabel = isAir ? 'В ВОЗДУХЕ' : hud.playerLevel === 1 ? 'ВЕРХНИЙ ЯРУС' : 'НИЖНИЙ ЯРУС';
  const tierColor = isAir ? '#ffe23a' : hud.playerLevel === 1 ? '#3b74ff' : '#22eeff';

  return (
    <div
      className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${dim ? 'opacity-30' : 'opacity-100'}`}
      data-game-hud
      data-heading={hud.playerHeading.toFixed(3)}
      data-level={hud.playerLevel}
      data-altitude={hud.playerY.toFixed(2)}
    >
      {/* Верхняя левая панель */}
      <div className="absolute left-3 top-3 md:left-6 md:top-5">
        <div className="flex items-center gap-2 font-display text-[10px] tracking-[0.45em] text-cyan-300/70">
          <span>{hud.levelCode}</span>
          {hud.arenaName && <span className="text-cyan-200/50">· {hud.arenaName}</span>}
        </div>
        <div
          className="max-w-[170px] truncate font-head text-xs tracking-[0.12em] text-white md:max-w-none md:text-lg md:tracking-[0.2em]"
          style={{ textShadow: `0 0 ${10 + kp * 8}px ${pc}` }}
        >
          {hud.levelName}
        </div>

        {/* Счёт */}
        <div className="mt-2 flex items-center gap-3">
          <div
            className="font-display text-2xl font-bold tracking-[0.12em] text-white md:text-3xl"
            style={{ textShadow: `0 0 ${12 + kp * 14}px ${pc}` }}
          >
            {hud.score.toString().padStart(7, '0')}
          </div>
        </div>
        {touch && <div className="mt-1 font-display text-xs tracking-[0.18em] text-cyan-100/80">{fmt(hud.time)}</div>}

        {/* Индикатор яруса: подпись + вертикальная шкала высоты */}
        {hud.mode !== 'race' && <div className="mt-2 flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span
              className="inline-flex w-fit items-center gap-1.5 border px-2 py-0.5 font-display text-[9px] font-bold tracking-[0.25em]"
              style={{
                borderColor: tierColor,
                color: tierColor,
                boxShadow: `0 0 12px ${tierColor}`,
                backgroundColor: 'rgba(0,10,20,0.65)',
              }}
            >
              {isAir ? '▲' : hud.playerLevel === 1 ? '▲' : '▼'} {tierLabel}
            </span>
            <div className="flex items-center gap-2 font-display text-[9px] tracking-[0.2em] text-cyan-200/70">
              <span>ВЫСОТА</span>
              <span className="text-white">{hud.playerY.toFixed(1)}</span>
              <span className="text-cyan-200/50">/ {LEVEL_HEIGHT.toFixed(1)} м</span>
            </div>
          </div>
          <TierGauge y={hud.playerY} air={isAir} color={pc} compact={touch} />
        </div>}

        {/* Подсказка направления на пандус (только для арен с эстакадой) */}
        {hud.mode !== 'race' && hud.rampHint && <RampCompass hint={hud.rampHint} heading={hud.playerHeading} onDeck={hud.playerLevel === 1} />}

        {/* Жизни / Раунды */}
        <div className="mt-1.5 flex items-center gap-2 text-[9px] tracking-[0.24em] text-cyan-100/60">
          {hud.mode === 'campaign' || hud.mode === 'multitier' ? (
            <>
              <span>ЖИЗНИ</span>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block h-2.5 w-2.5 rotate-45 border"
                  style={{
                    borderColor: pc,
                    background: i < hud.lives ? pc : 'transparent',
                    boxShadow: i < hud.lives ? `0 0 8px ${pc}` : 'none',
                  }}
                />
              ))}
            </>
          ) : hud.mode === 'dischunt' ? (
            <span className="font-head text-yellow-300">СОБРАНО ДИСКОВ: {hud.discsCollected} / 10</span>
          ) : hud.mode === 'survival' ? (
            <span className="font-head text-red-300">ВОЛНА ВЫЖИВАНИЯ: {hud.survivalWave}</span>
          ) : hud.mode === 'practice' ? (
            <span>СВОБОДНЫЙ ЗАЕЗД</span>
          ) : hud.mode === 'race' ? (
            <span>ЗАЕЗД · {hud.race?.laps ?? 3} КРУГА</span>
          ) : hud.mode === 'boss' ? (
            <span>ЦЕЛЬ: УНИЧТОЖИТЬ БРОНЮ</span>
          ) : (
            <span>МАТЧ ДО {hud.target} ПОБЕД</span>
          )}
        </div>

        {/* Активные бонусы (Shield, Phase, Multiplier, Jump) */}
        <div className="mt-2 flex flex-col gap-1">
          {pw.shield && (
            <div className="anim-fade-in flex items-center gap-2 rounded border border-emerald-400/80 bg-emerald-950/60 px-2.5 py-1 text-xs font-bold tracking-widest text-emerald-300 shadow-[0_0_14px_rgba(45,255,134,0.4)]">
              <span>ЩИТ СИСТЕМЫ АКТИВЕН</span>
            </div>
          )}
          {pw.phaseLeft > 0 && (
            <div className="anim-fade-in flex items-center gap-2 rounded border border-yellow-400/80 bg-yellow-950/60 px-2.5 py-1 text-xs font-bold tracking-widest text-yellow-300 shadow-[0_0_14px_rgba(255,226,58,0.4)]">
              <span>ФАЗОВЫЙ СДВИГ: {pw.phaseLeft.toFixed(1)}с</span>
            </div>
          )}
          {pw.multLeft > 0 && (
            <div className="anim-fade-in flex items-center gap-2 rounded border border-cyan-300/80 bg-cyan-950/60 px-2.5 py-1 text-xs font-bold tracking-widest text-cyan-200 shadow-[0_0_14px_rgba(34,238,255,0.4)]">
              <span>2× ОЧКИ: {pw.multLeft.toFixed(1)}с</span>
            </div>
          )}
          {pw.hasJump && (
            <div className="anim-fade-in flex items-center gap-2 rounded border border-orange-400/80 bg-orange-950/60 px-2.5 py-1 text-xs font-bold tracking-widest text-orange-300 shadow-[0_0_14px_rgba(255,165,28,0.4)]">
              <span>СУПЕР-ТРАМПЛИН ГОТОВ</span>
            </div>
          )}
        </div>

        {/* Патроны для неоновых выстрелов */}
        <div className="mt-2 flex items-center gap-2 border-t border-cyan-300/15 pt-2" data-ammo={pw.ammo}>
          <span className="font-display text-[9px] tracking-[0.28em] text-cyan-300/70">ПАТРОНЫ</span>
          <div className="flex gap-[3px]">
            {Array.from({ length: pw.ammoCap }, (_, i) => (
              <span
                key={i}
                className="block h-3.5 w-1.5"
                style={{
                  background: i < pw.ammo ? '#e8ffff' : 'rgba(120,220,255,0.14)',
                  boxShadow: i < pw.ammo ? '0 0 7px #22eeff' : 'none',
                  clipPath: 'polygon(50% 0,100% 30%,100% 100%,0 100%,0 30%)',
                }}
              />
            ))}
          </div>
          <span className="font-display text-[9px] text-cyan-100/70">
            {pw.ammo}/{pw.ammoCap}
          </span>
          {pw.ammo > 0 && <kbd className="ml-1 rounded border border-cyan-300/40 bg-cyan-300/10 px-1 font-display text-[8px] text-white/80">F</kbd>}
        </div>
      </div>

      {/* Центр сверху: Время раунда и пульс такта (в гонке его заменяет панель заезда) */}
      <div className={`absolute left-1/2 top-3 -translate-x-1/2 text-center md:top-5 ${touch || hud.mode === 'race' ? 'hidden' : ''}`}>
        <div
          className="font-display text-xl tracking-[0.2em] text-white/90 md:text-2xl"
          style={{ transform: `scale(${1.0 + kp * 0.04})` }}
        >
          {fmt(hud.time)}
        </div>
        <div className="mt-1 text-[10px] tracking-[0.35em] text-cyan-100/60">
          {hud.mode === 'race' ? 'УЧАСТНИКОВ' : 'ПРОГРАММ В СЕТИ'}: <span className="font-display text-cyan-100">{hud.alive}</span>/{hud.total}
        </div>
      </div>

      {hud.boss && <BossBar boss={hud.boss} playerColor={pc} />}
      {hud.race && <RacePanel race={hud.race} />}

      {/* Миникарта + Лента событий */}
      <div className="absolute right-3 top-3 flex flex-col items-end md:right-6 md:top-5">
        <canvas
          ref={canvasRef}
          width={360}
          height={360}
          className={touch ? 'h-[108px] w-[108px]' : 'h-[132px] w-[132px] md:h-[190px] md:w-[190px]'}
          style={{
            imageRendering: 'auto',
            boxShadow: `0 0 ${10 + bp * 10}px rgba(34,238,255,0.25)`,
          }}
        />
        <div className="mt-3 flex w-[260px] flex-col items-end gap-1">
          {feed.map((m) => (
            <div
              key={m.id}
              className="anim-feed border-r-2 bg-black/60 px-3 py-1 text-right text-xs tracking-[0.06em] text-white/90 backdrop-blur-sm"
              style={{ borderColor: m.color }}
            >
              {m.text}
            </div>
          ))}
        </div>
      </div>

      {/* Список программ слева снизу */}
      <div className={`absolute ${hud.mode === 'race' ? 'bottom-24' : 'bottom-4'} left-3 hidden space-y-1 md:left-6 md:block`}>
        {hud.bikes.map((b) => (
          <div
            key={b.id}
            className={`flex items-center gap-2 text-xs tracking-[0.12em] ${b.alive ? 'text-white/90' : 'text-white/30 line-through'}`}
          >
            <span
              className="inline-block h-3 w-1.5"
              style={{
                background: b.color,
                boxShadow: b.alive ? `0 0 8px ${b.color}` : 'none',
                opacity: b.alive ? 1 : 0.3,
              }}
            />
            <span className="w-28 truncate font-head">{b.name}</span>
            {b.level === 1 && (
              <span className="border border-cyan-400/50 bg-cyan-900/30 px-1 text-[8px] text-cyan-200 no-underline">
                2-ЯРУС
              </span>
            )}
            {b.shield && <span className="text-[9px] text-emerald-300 no-underline">ЩИТ</span>}
            {b.boss && <span className="border border-red-400/60 px-1 text-[9px] text-red-300 no-underline">БОСС</span>}
            {b.kills > 0 && <span className="font-display text-[10px] text-cyan-200/80">◆{b.kills}</span>}
          </div>
        ))}
      </div>

      {/* Спидометр и Турбо справа снизу (или сверху на тачскрине) */}
      {hud.playerAlive && touch && (
        <div className="absolute right-3 top-[130px] w-[108px] text-right">
          <div className="font-display text-2xl font-bold leading-none text-white neon-soft">{hud.speed}</div>
          <div className="mt-1 text-[8px] tracking-[0.25em] text-cyan-100/70">КМ/Ч</div>
          <div className="mt-3 flex justify-between text-[8px] tracking-[0.15em] text-cyan-100/70">
            <span>ТУРБО</span><span>{Math.round(hud.boost * 100)}%</span>
          </div>
          <div className="mt-1 h-1 w-full bg-cyan-300/20">
            <div className="h-full bg-cyan-300 shadow-[0_0_8px_#22eeff]" style={{ width: `${hud.boost * 100}%` }} />
          </div>
        </div>
      )}
      {hud.playerAlive && !touch && (
        <div className="absolute bottom-3 right-3 flex flex-col items-end md:bottom-5 md:right-6">
          <Gauge
            speed={hud.speed}
            speedN={hud.speedN}
            boosting={hud.boosting}
            braking={hud.braking}
            color={pc}
            beatPulse={bp}
          />
          <BoostBar
            boost={hud.boost}
            boosting={hud.boosting}
            grinding={hud.grinding}
            color={pc}
            beatPulse={bp}
          />
        </div>
      )}

      {/* Подсказки управления */}
      {!touch && (
        <div className="absolute bottom-3 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-center text-[10px] tracking-[0.22em] text-cyan-100/40 lg:block">
          A/D — ПЛАВНЫЙ ПОВОРОТ · SHIFT — ТУРБО · F — ВЫСТРЕЛ · C — КАМЕРА ({CAM_LABEL[hud.camera].toUpperCase()}) · ESC: ПАУЗА
        </div>
      )}

      {/* Баннеры */}
      <div className="absolute inset-x-0 top-[24%] flex flex-col items-center">
        {banners.map((m) => (
          <div key={m.id} className="anim-banner relative text-center">
            <div className="pointer-events-none absolute -inset-x-16 -inset-y-3 bg-gradient-to-r from-transparent via-black/55 to-transparent" />
            <div
              className="relative font-head text-2xl tracking-[0.22em] md:text-4xl"
              style={{
                color: m.color,
                textShadow: `0 0 16px ${m.color}, 0 0 32px ${m.color}`,
              }}
            >
              {m.text}
            </div>
            {m.sub && <div className="mt-2 text-xs tracking-[0.4em] text-white/80 md:text-sm">{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Всплывающие бонусы */}
      <div className="absolute inset-x-0 top-[56%] flex flex-col items-center gap-1">
        {popups.map((m) => (
          <div key={m.id} className="anim-popup text-center">
            <span
              className="font-head text-lg tracking-[0.25em] md:text-xl"
              style={{
                color: m.color,
                textShadow: `0 0 12px ${m.color}`,
              }}
            >
              {m.text}
            </span>
            {m.sub && <span className="ml-3 font-display text-sm text-white/90">{m.sub}</span>}
          </div>
        ))}
      </div>

      {/* Отсчёт старта */}
      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div key={countdown} className="anim-count text-center">
            <div
              className="font-display text-[120px] font-black leading-none text-white md:text-[180px]"
              style={{ textShadow: `0 0 30px ${pc}, 0 0 80px ${pc}` }}
            >
              {countdown > 0 ? countdown : ''}
            </div>
            {countdown === 0 && (
              <div
                className="font-head text-6xl tracking-[0.3em] md:text-8xl"
                style={{
                  color: pc,
                  textShadow: `0 0 30px ${pc}, 0 0 60px ${pc}`,
                }}
              >
                СТАРТ!
              </div>
            )}
          </div>
        </div>
      )}

      {camToast && (
        <div
          key={camToast}
          className="anim-fade-in absolute bottom-12 left-1/2 -translate-x-1/2 border border-cyan-300/40 bg-black/60 px-4 py-1.5 font-head text-xs tracking-[0.35em] text-cyan-100"
        >
          КАМЕРА: {camToast}
        </div>
      )}

      {!hud.playerAlive && (
        <div className="absolute inset-x-0 bottom-10 text-center font-head text-xs tracking-[0.5em] text-red-300/80 anim-blink">
          СИГНАЛ ПОТЕРЯН
        </div>
      )}
    </div>
  );
}
