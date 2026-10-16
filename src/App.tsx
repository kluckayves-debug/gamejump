import { useCallback, useEffect, useRef, useState } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameOverScreen, PauseScreen, StartScreen, WinScreen } from './components/Overlays';
import type { Phase, RunResult } from './game/constants';
import type { Engine } from './game/engine';
import { sfx } from './game/audio';
import { clearScores, loadMuted, loadScores, saveMuted, saveScore, type ScoreEntry } from './game/storage';

export default function App() {
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [result, setResult] = useState<RunResult | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [rank, setRank] = useState(-1);
  const [muted, setMuted] = useState(() => loadMuted());
  const [touch, setTouch] = useState(false);
  const [live, setLive] = useState({ score: 0, coins: 0, dist: 0 });
  const phaseRef = useRef<Phase>('menu');
  phaseRef.current = phase;

  // ------------------------------------------------------------- device --
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    sfx.muted = muted;
    saveMuted(muted);
  }, [muted]);

  // -------------------------------------------------------------- actions --
  const blur = () => (document.activeElement as HTMLElement | null)?.blur?.();

  const play = useCallback(() => {
    blur();
    sfx.resume();
    setResult(null);
    setHighlightId(null);
    setRank(-1);
    engineRef.current?.startRun();
  }, []);

  const toMenu = useCallback(() => {
    blur();
    sfx.ui();
    setResult(null);
    setHighlightId(null);
    setRank(-1);
    engineRef.current?.toMenu();
  }, []);

  const pause = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setLive({ score: Math.round(e.score), coins: e.coinsGot, dist: Math.round(e.dist) });
    e.pause();
  }, []);

  const resume = useCallback(() => {
    blur();
    engineRef.current?.resume();
  }, []);

  const record = useCallback((r: RunResult, won: boolean) => {
    setResult(r);
    if (r.score > 0) {
      const {
        list,
        id,
        rank: rk,
      } = saveScore({ score: r.score, coins: r.coins, distance: r.distance, won });
      setScores(list);
      setHighlightId(id);
      setRank(rk);
      if (rk === 0 && !won) window.setTimeout(() => sfx.best(), 220);
    } else {
      setScores(loadScores());
    }
  }, []);

  const handleGameOver = useCallback((r: RunResult) => record(r, false), [record]);
  const handleWin = useCallback((r: RunResult) => record(r, true), [record]);

  // ------------------------------------------------------------ keyboard --
  useEffect(() => {
    const nudgeKeys = new Set<string>();

    const down = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      const k = e.code;
      if (
        k === 'Space' ||
        k === 'ArrowUp' ||
        k === 'ArrowDown' ||
        k === 'ArrowLeft' ||
        k === 'ArrowRight'
      )
        e.preventDefault();
      const ph = phaseRef.current;

      switch (k) {
        case 'Space':
        case 'Enter':
        case 'KeyW':
        case 'ArrowUp':
        case 'KeyZ': {
          if (e.repeat) return;
          if (ph === 'menu' || ph === 'dead' || ph === 'won') {
            play();
            return;
          }
          if (ph === 'winning') return;
          if (ph === 'paused') {
            resume();
            return;
          }
          eng.pressJump();
          return;
        }
        case 'KeyS':
        case 'ArrowDown':
          eng.pressDive();
          return;
        case 'KeyA':
        case 'ArrowLeft':
          nudgeKeys.add(k);
          eng.setNudge(-1);
          return;
        case 'KeyD':
        case 'ArrowRight':
          nudgeKeys.add(k);
          eng.setNudge(1);
          return;
        case 'KeyP':
        case 'Escape':
          if (ph === 'playing') pause();
          else if (ph === 'paused') resume();
          return;
        case 'KeyR':
          if (ph !== 'menu') play();
          return;
        case 'KeyM':
          setMuted((m) => !m);
          return;
      }
    };

    const up = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      const k = e.code;
      if (k === 'Space' || k === 'KeyW' || k === 'ArrowUp' || k === 'KeyZ') eng.releaseJump();
      if (k === 'KeyA' || k === 'ArrowLeft' || k === 'KeyD' || k === 'ArrowRight') {
        nudgeKeys.delete(k);
        if (nudgeKeys.size === 0) eng.setNudge(0);
        else eng.setNudge(nudgeKeys.has('KeyD') || nudgeKeys.has('ArrowRight') ? 1 : -1);
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [play, pause, resume]);

  // auto-pause when the tab/window loses focus
  useEffect(() => {
    const onHide = () => {
      if (phaseRef.current === 'playing') pause();
    };
    window.addEventListener('blur', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('blur', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [pause]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#030a18]">
      <GameCanvas
        touch={touch}
        onReady={(e) => {
          engineRef.current = e;
        }}
        onPhase={(p) => {
          setPhase(p);
          const e = engineRef.current;
          if (p === 'paused' && e) setLive({ score: Math.round(e.score), coins: e.coinsGot, dist: Math.round(e.dist) });
        }}
        onGameOver={handleGameOver}
        onWin={handleWin}
        onStartRequest={play}
        onRestartRequest={play}
      />

      {phase === 'menu' && (
        <StartScreen
          scores={scores}
          onPlay={play}
          onClear={() => {
            clearScores();
            setScores([]);
            sfx.ui();
          }}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          touch={touch}
        />
      )}

      {phase === 'paused' && (
        <PauseScreen
          score={live.score}
          coins={live.coins}
          distance={live.dist}
          onResume={resume}
          onRestart={play}
          onMenu={toMenu}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
        />
      )}

      {phase === 'won' && result && (
        <WinScreen
          result={result}
          scores={scores}
          highlightId={highlightId}
          rank={rank}
          onRetry={play}
          onMenu={toMenu}
          touch={touch}
        />
      )}

      {phase === 'dead' && result && (
        <GameOverScreen
          result={result}
          scores={scores}
          highlightId={highlightId}
          rank={rank}
          onRetry={play}
          onMenu={toMenu}
          touch={touch}
        />
      )}
    </div>
  );
}
