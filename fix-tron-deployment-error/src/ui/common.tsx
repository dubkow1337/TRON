import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Logo({ size = 'lg' }: { size?: 'lg' | 'md' | 'sm' }) {
  const big = size === 'lg' ? 'text-6xl md:text-8xl' : size === 'md' ? 'text-5xl md:text-6xl' : 'text-3xl';
  const sub = size === 'lg' ? 'text-base md:text-xl' : size === 'md' ? 'text-sm md:text-base' : 'text-xs';
  return (
    <div className="select-none">
      <div className={`anim-logo font-display font-black leading-none tracking-[0.08em] ${big}`}>
        <span
          className="bg-gradient-to-b from-white via-cyan-200 to-cyan-500 bg-clip-text text-transparent"
          style={{ filter: 'drop-shadow(0 0 18px rgba(34,238,255,0.65)) drop-shadow(0 0 2px rgba(255,255,255,0.8))' }}
        >
          NEON GRID
        </span>
      </div>
      <div className={`mt-3 flex items-center gap-4 ${sub}`}>
        <div className="anim-line h-px flex-1 bg-gradient-to-r from-transparent to-cyan-300/80" />
        <span className="font-head tracking-[0.6em] text-cyan-200 neon-soft">НАСЛЕДИЕ</span>
        <div className="anim-line h-px flex-1 bg-gradient-to-l from-transparent to-cyan-300/80" />
      </div>
    </div>
  );
}

/** Боковой силуэт светоцикла для меню/гаража. */
export function CycleSilhouette({ color, className = '' }: { color: string; className?: string }) {
  return (
    <svg viewBox="-10 -30 290 160" className={className} style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 18px ${color})` }}>
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2129" />
          <stop offset="1" stopColor="#05070a" />
        </linearGradient>
      </defs>
      <ellipse cx="132" cy="118" rx="140" ry="5" fill={color} opacity="0.25" />
      <path
        d="M3 65 Q3 16 52 8 Q88 6 106 28 Q127 44 156 35 Q180 25 206 8 Q262 6 262 60 Q262 86 234 89 L32 89 Q3 87 3 65 Z"
        fill="url(#bodyGrad)"
        stroke={color}
        strokeWidth="1.2"
        strokeOpacity="0.6"
      />
      <path d="M11 65 Q22 36 52 26 Q90 25 106 40 Q132 52 162 44 Q190 34 206 28 Q246 30 252 63" fill="none" stroke={color} strokeWidth="2.6" />
      <path d="M36 82 L232 82" stroke={color} strokeWidth="1.6" />
      {/* пилот */}
      <path d="M82 13 Q112 2 142 3" stroke="#0b1016" strokeWidth="26" strokeLinecap="round" fill="none" />
      <path d="M80 2 Q110 -9 142 -10" stroke={color} strokeWidth="2" fill="none" />
      <ellipse cx="166" cy="-2" rx="20" ry="15" fill="#0b1016" />
      <path d="M150 -6 Q166 -18 184 -4" stroke={color} strokeWidth="2.2" fill="none" />
      {[56, 207].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="65" r="50" fill="#06090d" />
          <circle cx={cx} cy="65" r="43" fill="none" stroke={color} strokeWidth="3.4" />
          <circle cx={cx} cy="65" r="27" fill="none" stroke={color} strokeWidth="1.4" strokeOpacity="0.85" />
          <path d={`M${cx - 16} ${65} A16 16 0 0 1 ${cx + 8} ${51}`} stroke={color} strokeWidth="2.4" fill="none" />
        </g>
      ))}
      <rect x="-2" y="52" width="4" height="26" fill={color} />
      <rect x="262" y="58" width="4" height="10" fill={color} />
    </svg>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-[2rem] items-center justify-center border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 font-display text-xs text-cyan-100 shadow-[0_0_10px_rgba(34,238,255,0.25)]">
      {children}
    </span>
  );
}

/** Навигация по меню с клавиатуры: ↑/↓, Enter, Esc. */
export function useMenuNav(
  count: number,
  onSelect: (i: number) => void,
  onBack: (() => void) | null,
  active: boolean,
  onMove?: () => void,
) {
  const [idx, setIdx] = useState(0);
  const ref = useRef({ idx, count, onSelect, onBack, onMove });
  ref.current = { idx, count, onSelect, onBack, onMove };
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      const r = ref.current;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        setIdx((i) => (i + 1) % r.count);
        r.onMove?.();
        e.preventDefault();
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        setIdx((i) => (i - 1 + r.count) % r.count);
        r.onMove?.();
        e.preventDefault();
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        r.onSelect(r.idx);
        e.preventDefault();
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        if (r.onBack) {
          r.onBack();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active]);
  return [idx, setIdx] as const;
}

export function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-6">
      <div className="font-display text-[11px] tracking-[0.5em] text-cyan-300/70">{kicker}</div>
      <h2 className="mt-1 font-head text-3xl tracking-[0.2em] text-white neon-soft md:text-4xl">{title}</h2>
      <div className="mt-3 h-px w-full bg-gradient-to-r from-cyan-300/80 via-cyan-300/20 to-transparent" />
    </div>
  );
}
