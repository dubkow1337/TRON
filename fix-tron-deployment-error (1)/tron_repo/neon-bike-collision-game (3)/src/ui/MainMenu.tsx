import { useEffect, useRef, useState } from 'react';
import { Logo } from './common';

export type MenuItem = 'campaign' | 'multitier' | 'survival' | 'dischunt' | 'practice' | 'race' | 'boss' | 'quick' | 'garage' | 'controls' | 'settings';
type Sound = (kind: 'move' | 'select' | 'back') => void;
type Section = 'home' | 'modes';

const homeItems = [
  { id: 'play', label: 'Играть', note: 'Выбрать режим' },
  { id: 'garage', label: 'Гараж', note: 'Цвет светоцикла' },
  { id: 'controls', label: 'Обучение', note: 'Управление и бонусы' },
  { id: 'settings', label: 'Настройки', note: 'Графика и звук' },
] as const;

const modes = [
  { id: 'campaign', label: 'Кампания', note: '6 секторов', detail: 'Пройди путь от новобранца до чемпиона Сетки.' },
  { id: 'quick', label: 'Быстрый бой', note: 'Свои правила', detail: 'Выбери арену, сложность и число соперников.' },
  { id: 'multitier', label: 'Два яруса', note: 'Эстакада и трамплины', detail: 'Поднимайся на верхний ярус и уходи от столкновений.' },
  { id: 'survival', label: 'Выживание', note: 'Волны программ', detail: 'Выдержи как можно больше волн соперников.' },
  { id: 'dischunt', label: 'Охота за дисками', note: 'Цель: 10 дисков', detail: 'Собирай диски и бонусы на обоих уровнях арены.' },
  { id: 'practice', label: 'Практика', note: 'Без соперников', detail: 'Освой управление и изучи арену без противников.' },
  { id: 'race', label: 'Гонка', note: 'Старт → финиш', detail: 'Полный пелотон, круги, препятствия и борьба за позицию.' },
  { id: 'boss', label: 'Джаггернаут', note: 'Бой с боссом', detail: 'Четырёхколёсный внедорожник, пять ядер брони и таран на скорости.' },
] as const;

export function MainMenu({ onSelect, best, color, sound }: { onSelect: (item: MenuItem) => void; best: number; color: string; sound: Sound }) {
  const [section, setSection] = useState<Section>('home');
  const [selected, setSelected] = useState(0);
  const current = useRef({ section, selected, onSelect, sound });
  current.current = { section, selected, onSelect, sound };
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const activate = (sectionToActivate: Section, index: number) => {
    if (sectionToActivate === 'home') {
      const item = homeItems[index];
      if (!item) return;
      sound('select');
      if (item.id === 'play') {
        setSection('modes');
        setSelected(0);
      } else {
        onSelect(item.id);
      }
      return;
    }
    const mode = modes[index];
    if (!mode) return;
    sound('select');
    onSelect(mode.id);
  };

  const goBack = () => {
    sound('back');
    setSection('home');
    setSelected(0);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const state = current.current;
      const count = state.section === 'home' ? homeItems.length : modes.length;
      if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        event.preventDefault();
        setSelected((value) => (value + 1) % count);
        state.sound('move');
      } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        event.preventDefault();
        setSelected((value) => (value - 1 + count) % count);
        state.sound('move');
      } else if ((event.code === 'Enter' || event.code === 'NumpadEnter') && !event.repeat) {
        event.preventDefault();
        if (state.section === 'home') {
          const item = homeItems[state.selected];
          state.sound('select');
          if (item.id === 'play') {
            setSection('modes');
            setSelected(0);
          } else state.onSelect(item.id);
        } else {
          state.sound('select');
          state.onSelect(modes[state.selected].id);
        }
      } else if (event.code === 'Escape' && state.section === 'modes') {
        event.preventDefault();
        state.sound('back');
        setSection('home');
        setSelected(0);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    buttons.current[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected, section]);

  const items = section === 'home' ? homeItems : modes;

  return (
    <div className="grid-menu anim-fade" data-menu-section={section}>
      <div className="grid-menu__shade" />
      <div className="grid-menu__content">
        <header className="grid-menu__brand">
          <div className="grid-menu__overline"><span /> СИСТЕМА АКТИВНА / LIGHT CYCLE</div>
          <Logo size="md" />
        </header>

        <div className="grid-menu__body" key={section}>
          {section === 'home' ? (
            <div className="grid-menu__intro">
              <span className="grid-menu__eyebrow">СВОЙ ПУТЬ В СЕТКЕ</span>
              <h1>Войди в Сетку</h1>
              <p>Оставь световой след. Останься последним.</p>
            </div>
          ) : (
            <div className="grid-menu__intro">
              <button type="button" className="grid-menu__back" onClick={goBack}>← ГЛАВНОЕ МЕНЮ</button>
              <span className="grid-menu__eyebrow">ВЫБЕРИ СВОЙ ПУТЬ</span>
              <h1>Режимы игры</h1>
              <p>{modes[selected].detail}</p>
            </div>
          )}

          <nav className="grid-menu__list" aria-label={section === 'home' ? 'Главное меню' : 'Режимы игры'}>
            {items.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => { buttons.current[index] = element; }}
                type="button"
                className={`grid-menu__item ${selected === index ? 'is-selected' : ''}`}
                onMouseEnter={() => setSelected(index)}
                onFocus={() => setSelected(index)}
                onClick={() => activate(section, index)}
              >
                <span className="grid-menu__number">{String(index + 1).padStart(2, '0')}</span>
                <span className="grid-menu__item-text">
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </span>
                <span className="grid-menu__arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </nav>
        </div>

        <footer className="grid-menu__footer">
          <div><span className="grid-menu__footer-label">РЕКОРД</span> <strong style={{ color }}>{best.toLocaleString('ru-RU')}</strong></div>
          <div className="grid-menu__keys">↑ ↓ ВЫБОР <span /> ENTER ПОДТВЕРДИТЬ{section === 'modes' ? '  /  ESC НАЗАД' : ''}</div>
        </footer>
      </div>
      <div className="grid-menu__edge" aria-hidden="true" />
    </div>
  );
}