import type { ReactNode } from 'react';
import type { ScoreEntry } from '../game/storage';
import { HERO_DATA_URL } from '../assets/hero';

/**
 * The 3D character artwork, used untouched. All personality comes from
 * CSS transforms (bob, tilt, scale) so the image itself is never altered.
 */
export function HeroArt({
  className = '',
  mood = 'happy',
}: {
  className?: string;
  mood?: 'happy' | 'dizzy' | 'cheer';
}) {
  return (
    <div className={`relative flex items-end justify-center ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[130%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 blur-2xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255,225,74,0.45) 0%, rgba(79,185,255,0.3) 45%, transparent 72%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-4 w-[38%] -translate-x-1/2 rounded-[50%] bg-black/50 blur-[7px]"
      />
      <img
        src={HERO_DATA_URL}
        alt="Blox Rush hero character"
        draggable={false}
        className={`relative h-full w-auto select-none object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.45)] ${
          mood === 'dizzy' ? 'hero-dizzy' : mood === 'cheer' ? 'hero-cheer' : 'hero-bob'
        }`}
      />
    </div>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="logo-cube grid place-items-center rounded-xl bg-gradient-to-br from-[#4fb9ff] to-[#0a79e0] shadow-[0_6px_0_#064a8c]"
        style={{ width: compact ? 38 : 54, height: compact ? 38 : 54 }}
      >
        <div
          className="rounded-[4px] bg-white"
          style={{ width: compact ? 13 : 19, height: compact ? 13 : 19 }}
        />
      </div>
      <div className="text-left leading-none">
        <h1
          className="font-black tracking-tight text-white drop-shadow-[0_4px_0_rgba(3,10,25,0.75)]"
          style={{ fontSize: compact ? 26 : 44, letterSpacing: '-0.02em' }}
        >
          BLOX <span className="text-[#ffe14a]">RUSH</span>
        </h1>
        {!compact && (
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.35em] text-[#8ec9ff]">
            Run · Jump · Collect
          </p>
        )}
      </div>
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`pop-in w-full rounded-3xl border-2 border-white/10 bg-[#0c182f]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  );
}

type BtnTone = 'green' | 'blue' | 'ghost' | 'red';
const tones: Record<BtnTone, string> = {
  green: 'bg-gradient-to-b from-[#45e27e] to-[#17b457] text-[#042a15] shadow-[0_6px_0_#0c7c3a]',
  blue: 'bg-gradient-to-b from-[#4fb9ff] to-[#0a86e8] text-white shadow-[0_6px_0_#065da8]',
  red: 'bg-gradient-to-b from-[#ff7b7b] to-[#e03b3b] text-white shadow-[0_6px_0_#9c1f1f]',
  ghost: 'bg-white/10 text-white shadow-[0_6px_0_rgba(255,255,255,0.08)] border border-white/15',
};

export function BlockButton({
  children,
  onClick,
  tone = 'blue',
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: BtnTone;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      className={`select-none rounded-2xl px-5 py-3 text-base font-black uppercase tracking-wide transition-all duration-75 active:translate-y-[5px] active:shadow-none ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
      <div className={`text-xl font-black leading-tight ${tone}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8ec9ff]/80">{label}</div>
    </div>
  );
}

const medal = ['#FFD53D', '#D7E3F0', '#E0924A'];

export function ScoreTable({
  scores,
  highlightId,
  max = 7,
}: {
  scores: ScoreEntry[];
  highlightId?: string | null;
  max?: number;
}) {
  if (!scores.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-center text-sm font-bold text-white/50">
        No runs yet — set the first record!
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {scores.slice(0, max).map((s, i) => {
        const hot = s.id === highlightId;
        return (
          <li
            key={s.id}
            className={`row-in flex items-center gap-3 rounded-xl px-3 py-2 ${
              hot ? 'bg-[#ffe14a]/20 ring-2 ring-[#ffe14a]' : 'bg-white/5'
            }`}
            style={{ animationDelay: `${i * 45}ms` }}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-black text-[#07152b]"
              style={{ background: medal[i] ?? 'rgba(255,255,255,0.25)', color: i < 3 ? '#07152b' : '#fff' }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-base font-black text-white">
              {s.score.toLocaleString()}
              {s.won && <span title="Finished the run"> 🏆</span>}
            </span>
            <span className="shrink-0 text-xs font-bold text-[#ffe14a]">◆ {s.coins}</span>
            <span className="shrink-0 text-xs font-bold text-[#8ec9ff]">{s.distance}m</span>
          </li>
        );
      })}
    </ol>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid min-w-[26px] place-items-center rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] font-black text-white shadow-[0_2px_0_rgba(255,255,255,0.12)]">
      {children}
    </kbd>
  );
}
