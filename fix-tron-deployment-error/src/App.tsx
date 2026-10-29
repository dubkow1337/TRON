import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from './game/Engine';
import { loadBest } from './game/Game';
import { NEON } from './game/config';
import {
  CAM_LABEL,
  DEFAULT_SETTINGS,
  type GameMessage,
  type HudState,
  type PhaseEvent,
  type QuickSettings,
  type ResultAction,
  type Settings,
} from './game/types';
import { BootScreen, ControlsPanel, Garage, MainMenu, QuickSetup, RaceSetup, SettingsPanel, type MenuItem } from './ui/Menus';
import { HUD } from './ui/HUD';
import { IntroOverlay, PauseMenu, ResultOverlay, TouchControls } from './ui/Overlays';

type Screen = 'boot' | 'menu' | 'quick' | 'race' | 'garage' | 'settings' | 'controls' | 'game';
type Snd = 'move' | 'select' | 'back';

const SETTINGS_KEY = 'neongrid.settings';
const QUICK_KEY = 'neongrid.quick';

function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
  } catch {
    /* ignore */
  }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return { ...DEFAULT_SETTINGS, quality: mobile ? 'medium' : 'high' };
}

function loadQuick(): QuickSettings {
  const def: QuickSettings = {
    enemies: 3,
    difficulty: 'normal',
    arena: 'medium',
    rounds: 3,
    cells: true,
    hasTiers: true,
    map: 'grid',
    boss: false,
  };
  try {
    const s = localStorage.getItem(QUICK_KEY);
    if (s) return { ...def, ...JSON.parse(s) };
  } catch {
    /* ignore */
  }
  return def;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>('boot');
  const [phase, setPhase] = useState<PhaseEvent>({ type: 'none' });
  const [hud, setHud] = useState<HudState | null>(null);
  const [banners, setBanners] = useState<GameMessage[]>([]);
  const [popups, setPopups] = useState<GameMessage[]>([]);
  const [feed, setFeed] = useState<GameMessage[]>([]);
  const [paused, setPaused] = useState(false);
  const [pauseView, setPauseView] = useState<'main' | 'settings' | 'controls'>('main');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [quick, setQuick] = useState<QuickSettings>(loadQuick);
  const [best, setBest] = useState(loadBest);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [camToast, setCamToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const touch = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stateRef = useRef({ screen, phase, paused });
  stateRef.current = { screen, phase, paused };
  const timers = useRef<number[]>([]);
  const toastTimer = useRef<number | null>(null);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    if (timers.current.length > 200) timers.current = timers.current.slice(-100);
  };

  // ── Инициализация движка ──
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let engine: Engine;
    try {
      engine = new Engine(
        el,
        {
          onHud: (h) => setHud(h),
          onPhase: (p) => {
            if (p.type === 'countdown') {
              setCountdown(p.value);
              if (p.value === 0) {
                setPhase({ type: 'playing' });
                later(() => setCountdown((c) => (c === 0 ? null : c)), 950);
              } else setPhase(p);
              return;
            }
            setCountdown(null);
            setPhase(p);
            if (p.type === 'intro' || p.type === 'none') {
              setBanners([]);
              setPopups([]);
              setFeed([]);
            }
          },
          onMessage: (m) => {
            if (m.kind === 'banner') {
              setBanners([m]);
              later(() => setBanners((b) => b.filter((x) => x.id !== m.id)), 2300);
            } else if (m.kind === 'popup') {
              setPopups((p) => [...p.slice(-3), m]);
              later(() => setPopups((p) => p.filter((x) => x.id !== m.id)), 1650);
            } else {
              setFeed((f) => [...f.slice(-4), m]);
              later(() => setFeed((f) => f.filter((x) => x.id !== m.id)), 5500);
            }
          },
          onPauseRequest: () => {
            const s = stateRef.current;
            if (s.screen !== 'game') return;
            if (s.phase.type === 'intro' || s.phase.type === 'result') return;
            setPaused((p) => !p);
            setPauseView('main');
          },
          onCameraChange: (m) => {
            setSettings((s) => ({ ...s, camera: m }));
            setCamToast(CAM_LABEL[m].toUpperCase());
            if (toastTimer.current) window.clearTimeout(toastTimer.current);
            toastTimer.current = window.setTimeout(() => setCamToast(null), 1400);
          },
        },
        settingsRef.current,
      );
    } catch (e) {
      console.error(e);
      setError('Не удалось инициализировать WebGL. Включите аппаратное ускорение в браузере.');
      return;
    }
    engineRef.current = engine;
    if (import.meta.env.DEV) {
      (window as unknown as { __engine?: Engine }).__engine = engine;
    }
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.applySettings(settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(QUICK_KEY, JSON.stringify(quick));
    } catch {
      /* ignore */
    }
  }, [quick]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  // Авто-пауза при сворачивании вкладки
  useEffect(() => {
    const h = () => {
      const s = stateRef.current;
      if (document.hidden && s.screen === 'game' && (s.phase.type === 'playing' || s.phase.type === 'countdown')) {
        setPaused(true);
        setPauseView('main');
      }
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  // Горячая клавиша прыжка (Space) в игре
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (stateRef.current.screen === 'game' && e.code === 'KeyE') {
        engineRef.current?.playerJump();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const sound = useCallback((k: Snd) => engineRef.current?.uiSound(k), []);
  const onMinimap = useCallback((c: HTMLCanvasElement | null) => engineRef.current?.setMinimapCanvas(c), []);

  const startBoot = useCallback(() => {
    engineRef.current?.initAudio();
    engineRef.current?.uiSound('select');
    setScreen('menu');
  }, []);

  const enterGame = () => {
    setPaused(false);
    setPauseView('main');
    setHud(null);
    setScreen('game');
  };

  const onMenu = (m: MenuItem) => {
    if (m === 'campaign') {
      enterGame();
      engineRef.current?.startCampaign();
    } else if (m === 'multitier') {
      enterGame();
      engineRef.current?.startMultiTier();
    } else if (m === 'survival') {
      enterGame();
      engineRef.current?.startSurvival();
    } else if (m === 'dischunt') {
      enterGame();
      engineRef.current?.startDiscHunt();
    } else if (m === 'practice') {
      enterGame();
      engineRef.current?.startPractice();
    } else if (m === 'race') {
      setScreen('race');
    } else if (m === 'boss') {
      enterGame();
      engineRef.current?.startBoss();
    } else {
      setScreen(m);
    }
  };

  const startQuick = () => {
    enterGame();
    engineRef.current?.startQuick(quick);
  };

  const startRace = () => {
    enterGame();
    engineRef.current?.startRace(quick);
  };

  const toMenu = () => {
    engineRef.current?.toMenu();
    setPaused(false);
    setPauseView('main');
    setHud(null);
    setPhase({ type: 'none' });
    setCountdown(null);
    setBanners([]);
    setPopups([]);
    setFeed([]);
    setBest(loadBest());
    setScreen('menu');
  };

  const onResult = (a: ResultAction) => {
    if (a === 'menu') toMenu();
    else engineRef.current?.resultAction(a);
  };

  const showHud = screen === 'game' && hud && phase.type !== 'intro' && phase.type !== 'none';

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black p-8 text-center">
          <div className="tron-panel max-w-lg p-8">
            <div className="font-head text-2xl tracking-[0.2em] text-red-300">ОШИБКА СИСТЕМЫ</div>
            <p className="mt-4 text-cyan-50/80">{error}</p>
          </div>
        </div>
      )}

      {screen === 'boot' && <BootScreen onStart={startBoot} />}
      {screen === 'menu' && (
        <MainMenu onSelect={onMenu} best={best} color={NEON[settings.playerColor].css} sound={sound} />
      )}
      {screen === 'quick' && (
        <QuickSetup
          value={quick}
          onChange={setQuick}
          onStart={startQuick}
          onBack={() => setScreen('menu')}
          sound={sound}
        />
      )}
      {screen === 'race' && (
        <RaceSetup value={quick} onChange={setQuick} onStart={startRace} onBack={() => setScreen('menu')} sound={sound} />
      )}
      {screen === 'garage' && (
        <Garage
          color={settings.playerColor}
          onPick={(c) => setSettings((s) => ({ ...s, playerColor: c }))}
          onBack={() => setScreen('menu')}
          sound={sound}
        />
      )}
      {screen === 'settings' && (
        <SettingsPanel value={settings} onChange={setSettings} onBack={() => setScreen('menu')} sound={sound} />
      )}
      {screen === 'controls' && <ControlsPanel onBack={() => setScreen('menu')} sound={sound} />}

      {screen === 'game' && (
        <>
          {showHud && hud && (
            <HUD
              hud={hud}
              banners={banners}
              popups={popups}
              feed={feed}
              countdown={countdown}
              camToast={camToast}
              onMinimap={onMinimap}
              dim={paused || phase.type === 'result'}
              touch={touch}
            />
          )}
          {phase.type === 'intro' && (
            <IntroOverlay
              p={phase}
              onStart={() => engineRef.current?.beginCountdown()}
              onExit={toMenu}
              sound={sound}
            />
          )}
          {phase.type === 'result' && <ResultOverlay p={phase} onAction={onResult} sound={sound} />}
          {touch && !paused && (phase.type === 'playing' || phase.type === 'countdown') && (
            <TouchControls
              onSteer={(d, pressed) => engineRef.current?.setTouchSteer(d, pressed)}
              onBoost={(v) => engineRef.current?.setTouchBoost(v)}
              onBrake={(v) => engineRef.current?.setTouchBrake(v)}
              onJump={() => engineRef.current?.playerJump()}
              onShoot={() => engineRef.current?.playerShoot()}
              onPause={() => {
                setPaused(true);
                setPauseView('main');
              }}
            />
          )}
          {paused && pauseView === 'main' && (
            <PauseMenu
              onResume={() => setPaused(false)}
              onSettings={() => setPauseView('settings')}
              onControls={() => setPauseView('controls')}
              onExit={toMenu}
              sound={sound}
            />
          )}
          {paused && pauseView === 'settings' && (
            <SettingsPanel
              value={settings}
              onChange={setSettings}
              onBack={() => setPauseView('main')}
              sound={sound}
            />
          )}
          {paused && pauseView === 'controls' && <ControlsPanel onBack={() => setPauseView('main')} sound={sound} />}
        </>
      )}
    </div>
  );
}
