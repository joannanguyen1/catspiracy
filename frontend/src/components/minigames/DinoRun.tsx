import React, { useCallback, useEffect, useRef, useState } from 'react';

const TARGET_SCORE = 100;
const GAME_WIDTH = 360;
const GAME_HEIGHT = 200;
const GROUND_Y = GAME_HEIGHT - 32;
const DINO_WIDTH = 32;
const DINO_HEIGHT = 36;
const DINO_X = 48;
const JUMP_VELOCITY = -14;
const GRAVITY = 0.8;
const OBSTACLE_WIDTH = 24;
const OBSTACLE_HEIGHT = 32;
const OBSTACLE_GAP_MIN = 500;
const OBSTACLE_GAP_MAX = 700;
const OBSTACLE_SPEED = 4;
const SCORE_SPEED = 100;

type Props = {
  targetScore?: number;
  runnerImage?: string;
  onWin: () => void;
  onCancel: () => void;
};

export default function DinoRun({ targetScore = TARGET_SCORE, runnerImage, onWin, onCancel }: Props) {
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [started, setStarted] = useState(false);
  const [dinoY, setDinoY] = useState(GROUND_Y - DINO_HEIGHT);
  const [obstacles, setObstacles] = useState<{ id: number; x: number }[]>([]);

  const dinoYRef = useRef(GROUND_Y - DINO_HEIGHT);
  const dinoVyRef = useRef(0);
  const nextObstacleId = useRef(0);
  const lastSpawn = useRef(0);
  const nextGap = useRef(OBSTACLE_GAP_MIN + Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN));
  const scoreInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafId = useRef<number>(0);
  const gameOverRef = useRef(false);
  const wonRef = useRef(false);

  gameOverRef.current = gameOver;
  wonRef.current = won;
  dinoYRef.current = dinoY;

  const reset = useCallback(() => {
    setScore(0);
    setGameOver(false);
    setWon(false);
    setDinoY(GROUND_Y - DINO_HEIGHT);
    setObstacles([]);
    dinoYRef.current = GROUND_Y - DINO_HEIGHT;
    dinoVyRef.current = 0;
    nextObstacleId.current = 0;
    lastSpawn.current = 0;
    nextGap.current = OBSTACLE_GAP_MIN + Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN);
    setStarted(true);
  }, []);

  const jump = useCallback(() => {
    if (dinoYRef.current >= GROUND_Y - DINO_HEIGHT - 2) {
      dinoVyRef.current = JUMP_VELOCITY;
    }
  }, []);

  useEffect(() => {
    if (!started || gameOver || won) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [started, gameOver, won, jump]);

  useEffect(() => {
    if (!started || gameOver || won) return;
    scoreInterval.current = setInterval(() => {
      setScore((s) => {
        const next = s + 1;
        if (next >= targetScore) setWon(true);
        return next;
      });
    }, SCORE_SPEED);
    return () => {
      if (scoreInterval.current) clearInterval(scoreInterval.current);
    };
  }, [started, gameOver, won, targetScore]);

  useEffect(() => {
    if (!started || gameOver || won) return;

    let last = performance.now();
    const tick = (now: number) => {
      if (gameOverRef.current || wonRef.current) return;
      const dt = Math.min((now - last) / 16, 4);
      last = now;

      dinoVyRef.current += GRAVITY * dt;
      let y = dinoYRef.current + dinoVyRef.current * dt;
      if (y > GROUND_Y - DINO_HEIGHT) {
        y = GROUND_Y - DINO_HEIGHT;
        dinoVyRef.current = 0;
      }
      dinoYRef.current = y;
      setDinoY(y);

      setObstacles((obs) => {
        const next = obs
          .map((o) => ({ ...o, x: o.x - OBSTACLE_SPEED * dt }))
          .filter((o) => o.x > -OBSTACLE_WIDTH);
        lastSpawn.current += dt * 16;
        if (lastSpawn.current > nextGap.current) {
          lastSpawn.current = 0;
          nextGap.current = OBSTACLE_GAP_MIN + Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN);
          next.push({ id: nextObstacleId.current++, x: GAME_WIDTH });
        }
        return next;
      });

      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [started, gameOver, won]);

  useEffect(() => {
    if (!started || gameOver || won) return;
    const dinoLeft = DINO_X + 8;
    const dinoRight = DINO_X + DINO_WIDTH - 8;
    const dinoTop = dinoY + 6;
    const dinoBottom = dinoY + DINO_HEIGHT - 6;
    for (const o of obstacles) {
      const oLeft = o.x + 4;
      const oRight = o.x + OBSTACLE_WIDTH - 4;
      const oTop = GROUND_Y - OBSTACLE_HEIGHT + 6;
      const oBottom = GROUND_Y - 6;
      if (dinoRight > oLeft && dinoLeft < oRight && dinoBottom > oTop && dinoTop < oBottom) {
        setGameOver(true);
        if (scoreInterval.current) clearInterval(scoreInterval.current);
        break;
      }
    }
  }, [started, gameOver, won, dinoY, obstacles]);

  const handleJump = useCallback(() => {
    if (started && !gameOver && !won) jump();
  }, [started, gameOver, won, jump]);

  if (won) {
    return (
      <div className="minigame-dino-wrap">
        <div className="minigame-dino-result minigame-dino-won">
          <p className="minigame-result">You caught the murderer! 🐱‍👤</p>
          <p className="minigame-goal">Score: {score}. The suspect cannot escape!</p>
          <button type="button" className="minigame-done" onClick={onWin}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="minigame-dino-wrap">
        <p className="minigame-goal">Reach a score of {targetScore} to catch the murderer. Jump with Space or tap the game.</p>
        <button type="button" className="minigame-done" style={{ marginRight: 8 }} onClick={reset}>
          Start chase
        </button>
        <button type="button" className="minigame-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="minigame-dino-wrap">
        <div className="minigame-dino-result">
          <p className="minigame-result" style={{ color: '#dc2626' }}>You tripped! Score: {score}</p>
          <p className="minigame-goal">Reach {targetScore} to catch the murderer.</p>
          <button type="button" className="minigame-done" style={{ marginRight: 8 }} onClick={reset}>
            Try again
          </button>
          <button type="button" className="minigame-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="minigame-dino-wrap">
      <p className="minigame-goal">Score: {score} / {targetScore} — Space or tap to jump</p>
      <div
        className="minigame-dino-game"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
        onClick={handleJump}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.code === 'Space' && (e.preventDefault(), handleJump())}
        aria-label="Jump"
      >
        <div className="minigame-dino-ground" style={{ top: GROUND_Y }} />
        <div
          className="minigame-dino-runner"
          style={{
            left: DINO_X,
            top: dinoY,
            width: DINO_WIDTH,
            height: DINO_HEIGHT,
          }}
        >
          {runnerImage ? (
            <img src={runnerImage} alt="" className="minigame-dino-runner-img" />
          ) : (
            <span className="minigame-dino-runner-emoji" aria-hidden>🐱</span>
          )}
        </div>
        {obstacles.map((o) => (
          <div
            key={o.id}
            className="minigame-dino-obstacle"
            style={{
              left: o.x,
              top: GROUND_Y - OBSTACLE_HEIGHT,
              width: OBSTACLE_WIDTH,
              height: OBSTACLE_HEIGHT,
            }}
            aria-hidden
          >
            <svg className="minigame-dino-cactus" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="12" cy="18" rx="5" ry="12" fill="#166534" stroke="#14532d" strokeWidth="1" />
              <ellipse cx="6" cy="14" rx="3" ry="6" fill="#166534" stroke="#14532d" strokeWidth="0.8" />
              <ellipse cx="18" cy="16" rx="2.5" ry="5" fill="#166534" stroke="#14532d" strokeWidth="0.8" />
              <path d="M8 30 L16 30 L15 32 L9 32 Z" fill="#78350f" stroke="#92400e" strokeWidth="0.5" />
            </svg>
          </div>
        ))}
      </div>
      <button type="button" className="minigame-cancel" style={{ marginTop: 8 }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
