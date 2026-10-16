import { GOAL_M, type RunResult } from '../game/constants';
import type { ScoreEntry } from '../game/storage';
import { BlockButton, HeroArt, KeyCap, Logo, Panel, ScoreTable, Stat } from './ui';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto overscroll-contain bg-[#030a18]/70 p-4 backdrop-blur-[2px]">
      <div className="my-auto w-full max-w-md">{children}</div>
    </div>
  );
}

function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={muted ? 'Unmute' : 'Mute'}
      className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-lg text-white transition active:translate-y-[2px]"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export function StartScreen({
  scores,
  onPlay,
  onClear,
  muted,
  onToggleMute,
  touch,
}: {
  scores: ScoreEntry[];
  onPlay: () => void;
  onClear: () => void;
  muted: boolean;
  onToggleMute: () => void;
  touch: boolean;
}) {
  return (
    <Shell>
      <Panel>
        <div className="flex flex-col items-center gap-4">
          <HeroArt className="h-28 w-full sm:h-36" />
          <Logo />

          <BlockButton tone="green" onClick={onPlay} className="w-full !py-4 !text-2xl shine">
            ▶ Play
          </BlockButton>

          <div className="w-full rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.25em] text-[#8ec9ff]">
              Controls
            </p>
            {touch ? (
              <ul className="space-y-1.5 text-sm font-bold text-white/85">
                <li className="flex items-center justify-between gap-2">
                  <span>Tap screen</span>
                  <span className="text-[#ffe14a]">Jump · tap again = double</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Swipe down / ⤓</span>
                  <span className="text-[#ffe14a]">Ground slam</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>◀ ▶ buttons</span>
                  <span className="text-[#ffe14a]">Brake / sprint</span>
                </li>
              </ul>
            ) : (
              <ul className="space-y-1.5 text-sm font-bold text-white/85">
                <li className="flex items-center justify-between gap-2">
                  <span className="flex gap-1">
                    <KeyCap>Space</KeyCap> <KeyCap>W</KeyCap> <KeyCap>↑</KeyCap>
                  </span>
                  <span className="text-[#ffe14a]">Jump · ×2 = double jump</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex gap-1">
                    <KeyCap>S</KeyCap> <KeyCap>↓</KeyCap>
                  </span>
                  <span className="text-[#ffe14a]">Ground slam</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex gap-1">
                    <KeyCap>A</KeyCap> <KeyCap>D</KeyCap>
                  </span>
                  <span className="text-[#ffe14a]">Brake / sprint</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex gap-1">
                    <KeyCap>P</KeyCap> <KeyCap>Esc</KeyCap>
                  </span>
                  <span className="text-[#ffe14a]">Pause</span>
                </li>
              </ul>
            )}
          </div>

          <div className="w-full">
            <div className="mb-2 flex items-center justify-center gap-2">
              <p className="text-center text-[10px] font-black uppercase tracking-[0.25em] text-[#8ec9ff]">
                Local Leaderboard
              </p>
              {scores.length > 0 && (
                <button
                  onClick={onClear}
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white/35 transition hover:text-[#ff7b7b]"
                >
                  clear
                </button>
              )}
            </div>
            <ScoreTable scores={scores} />
          </div>

          <div className="flex w-full items-center justify-between gap-3">
            <SoundToggle muted={muted} onToggle={onToggleMute} />
            <p className="text-right text-[11px] font-bold text-white/40">
              Grab Robux · dodge saws · reach {GOAL_M} m to win
            </p>
          </div>
        </div>
      </Panel>
    </Shell>
  );
}

export function PauseScreen({
  score,
  coins,
  distance,
  onResume,
  onRestart,
  onMenu,
  muted,
  onToggleMute,
}: {
  score: number;
  coins: number;
  distance: number;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <Shell>
      <Panel className="max-w-sm">
        <div className="flex flex-col items-center gap-4">
          <Logo compact />
          <h2 className="text-3xl font-black uppercase tracking-widest text-white">Paused</h2>
          <div className="grid w-full grid-cols-3 gap-2">
            <Stat label="Score" value={score.toLocaleString()} />
            <Stat label="Robux" value={String(coins)} tone="text-[#ffe14a]" />
            <Stat label="Distance" value={`${distance}m`} tone="text-[#8ec9ff]" />
          </div>
          <BlockButton tone="green" onClick={onResume} className="w-full !py-4 !text-xl">
            Resume
          </BlockButton>
          <div className="flex w-full gap-2">
            <BlockButton tone="blue" onClick={onRestart} className="flex-1">
              Restart
            </BlockButton>
            <BlockButton tone="ghost" onClick={onMenu} className="flex-1">
              Menu
            </BlockButton>
            <SoundToggle muted={muted} onToggle={onToggleMute} />
          </div>
        </div>
      </Panel>
    </Shell>
  );
}

export function WinScreen({
  result,
  scores,
  highlightId,
  rank,
  onRetry,
  onMenu,
  touch,
}: {
  result: RunResult;
  scores: ScoreEntry[];
  highlightId: string | null;
  rank: number;
  onRetry: () => void;
  onMenu: () => void;
  touch: boolean;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto overscroll-contain p-4">
      <div className="my-auto w-full max-w-md">
        <div className="pop-in w-full rounded-3xl border-2 border-[#ffe14a]/50 bg-[#0c182f]/90 p-5 shadow-[0_0_60px_rgba(255,225,74,0.25),0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <div className="flex flex-col items-center gap-4">
            <HeroArt className="h-28 w-full sm:h-32" mood="cheer" />

            <div className="text-center">
              <div className="mb-1 text-[11px] font-black uppercase tracking-[0.4em] text-[#8ef0ff]">
                Finish line reached
              </div>
              <h2
                className="text-4xl font-black uppercase tracking-tight drop-shadow-[0_4px_0_rgba(3,10,25,0.8)] sm:text-5xl"
                style={{
                  backgroundImage:
                    'linear-gradient(90deg,#FF4D4D,#FF9F3D,#FFE14A,#4BE36B,#4FB9FF,#B36BFF)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                You Win!
              </h2>
            </div>

            <div className="w-full rounded-2xl border border-[#ffe14a]/30 bg-black/30 px-4 py-3 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8ec9ff]">
                Final Score
              </div>
              <div className="text-5xl font-black leading-none text-white">
                {result.score.toLocaleString()}
              </div>
              {rank === 0 && (
                <div className="mt-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#ffe14a]">
                  ★ New Best ★
                </div>
              )}
            </div>

            <div className="grid w-full grid-cols-3 gap-2">
              <Stat label="Robux" value={String(result.coins)} tone="text-[#ffe14a]" />
              <Stat label="Distance" value={`${result.distance}m`} tone="text-[#8ec9ff]" />
              <Stat label="Best Combo" value={`x${result.bestCombo}`} tone="text-[#8ef0ff]" />
            </div>

            <BlockButton tone="green" onClick={onRetry} className="w-full !py-4 !text-2xl shine">
              ↻ Run Again
            </BlockButton>
            <p className="-mt-2 text-[11px] font-bold uppercase tracking-widest text-white/40">
              {touch ? 'Tap the screen to play again' : 'Space / R to play again'}
            </p>

            <div className="w-full">
              <p className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.25em] text-[#8ec9ff]">
                Local Leaderboard
              </p>
              <ScoreTable scores={scores} highlightId={highlightId} />
            </div>

            <BlockButton tone="ghost" onClick={onMenu} className="w-full">
              Main Menu
            </BlockButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GameOverScreen({
  result,
  scores,
  highlightId,
  rank,
  onRetry,
  onMenu,
  touch,
}: {
  result: RunResult;
  scores: ScoreEntry[];
  highlightId: string | null;
  rank: number;
  onRetry: () => void;
  onMenu: () => void;
  touch: boolean;
}) {
  const isBest = rank === 0;
  return (
    <Shell>
      <Panel>
        <div className="flex flex-col items-center gap-4">
          {isBest ? (
            <div className="pop-in rounded-full bg-gradient-to-r from-[#ffe14a] to-[#ff9f3d] px-5 py-1.5 text-sm font-black uppercase tracking-[0.2em] text-[#2a1600] shadow-[0_5px_0_#a06500]">
              ★ New Best Score ★
            </div>
          ) : rank >= 0 ? (
            <div className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-[#8ec9ff]">
              Leaderboard #{rank + 1}
            </div>
          ) : null}

          <HeroArt className="h-24 w-full sm:h-28" mood="dizzy" />

          <h2 className="-mt-2 text-center text-4xl font-black uppercase tracking-tight text-[#ff7b7b] drop-shadow-[0_4px_0_rgba(3,10,25,0.7)]">
            Wipeout!
          </h2>

          <div className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8ec9ff]">Score</div>
            <div className="text-5xl font-black leading-none text-white">
              {result.score.toLocaleString()}
            </div>
          </div>

          <div className="grid w-full grid-cols-3 gap-2">
            <Stat label="Robux" value={String(result.coins)} tone="text-[#ffe14a]" />
            <Stat label="Distance" value={`${result.distance}m`} tone="text-[#8ec9ff]" />
            <Stat label="Best Combo" value={`x${result.bestCombo}`} tone="text-[#8ef0ff]" />
          </div>

          <BlockButton tone="green" onClick={onRetry} className="w-full !py-4 !text-2xl shine">
            ↻ Retry
          </BlockButton>
          <p className="-mt-2 text-[11px] font-bold uppercase tracking-widest text-white/40">
            {touch ? 'Tap the screen to restart' : 'Space / R to restart'}
          </p>

          <div className="w-full">
            <p className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.25em] text-[#8ec9ff]">
              Local Leaderboard
            </p>
            <ScoreTable scores={scores} highlightId={highlightId} />
          </div>

          <BlockButton tone="ghost" onClick={onMenu} className="w-full">
            Main Menu
          </BlockButton>
        </div>
      </Panel>
    </Shell>
  );
}
