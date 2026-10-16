import { useEffect, useRef } from 'react';
import { Engine } from '../game/engine';
import type { Phase, RunResult } from '../game/constants';

interface Props {
  onReady: (engine: Engine) => void;
  onPhase: (p: Phase) => void;
  onGameOver: (r: RunResult) => void;
  onWin: (r: RunResult) => void;
  onStartRequest: () => void;
  onRestartRequest: () => void;
  touch: boolean;
}

export default function GameCanvas({
  onReady,
  onPhase,
  onGameOver,
  onWin,
  onStartRequest,
  onRestartRequest,
  touch,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const cbs = useRef({ onReady, onPhase, onGameOver, onWin, onStartRequest, onRestartRequest });
  cbs.current = { onReady, onPhase, onGameOver, onWin, onStartRequest, onRestartRequest };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const engine = new Engine(canvas, {
      onPhase: (p) => cbs.current.onPhase(p),
      onGameOver: (r) => cbs.current.onGameOver(r),
      onWin: (r) => cbs.current.onWin(r),
    });
    engineRef.current = engine;
    cbs.current.onReady(engine);
    engine.touch = window.matchMedia('(pointer: coarse)').matches;

    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(wrap);
    const onWinResize = () => engine.resize();
    window.addEventListener('resize', onWinResize);
    window.addEventListener('orientationchange', onWinResize);

    // ---------------------------------------------------------- pointers --
    const active = new Map<number, { y: number; dived: boolean }>();

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const phase = engine.phase;
      if (phase === 'menu') {
        cbs.current.onStartRequest();
        return;
      }
      if (phase === 'dead' || phase === 'won') {
        cbs.current.onRestartRequest();
        return;
      }
      if (phase !== 'playing') return;
      if (engine.hitPauseButton(x, y)) {
        engine.pause();
        return;
      }
      active.set(e.pointerId, { y, dived: false });
      engine.pressJump();
    };
    const onMove = (e: PointerEvent) => {
      const a = active.get(e.pointerId);
      if (!a || a.dived) return;
      const rect = canvas.getBoundingClientRect();
      const dy = e.clientY - rect.top - a.y;
      if (dy > 34) {
        a.dived = true;
        engine.pressDive();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!active.has(e.pointerId)) return;
      active.delete(e.pointerId);
      engine.releaseJump();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    const stopCtx = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', stopCtx);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
      window.removeEventListener('orientationchange', onWinResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('contextmenu', stopCtx);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) engineRef.current.touch = touch;
  }, [touch]);

  const nudge = (n: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    engineRef.current?.setNudge(n);
  };
  const endNudge = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    engineRef.current?.setNudge(0);
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" />
      {touch && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex gap-3">
            <button
              aria-label="Slow down"
              className="touch-btn"
              onPointerDown={nudge(-1)}
              onPointerUp={endNudge}
              onPointerLeave={endNudge}
              onPointerCancel={endNudge}
            >
              ◀
            </button>
            <button
              aria-label="Speed up"
              className="touch-btn"
              onPointerDown={nudge(1)}
              onPointerUp={endNudge}
              onPointerLeave={endNudge}
              onPointerCancel={endNudge}
            >
              ▶
            </button>
          </div>
          <button
            aria-label="Dive"
            className="touch-btn pointer-events-auto !h-16 !w-16 text-xl"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              engineRef.current?.pressDive();
            }}
          >
            ⤓
          </button>
        </div>
      )}
    </div>
  );
}
