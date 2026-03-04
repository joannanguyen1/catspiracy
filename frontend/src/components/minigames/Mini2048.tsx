import React, { useState, useCallback, useEffect } from 'react';

const TARGET = 256;
const GRID_SIZE = 4;

function spawnTile(grid: number[][]): number[][] {
  const empty: [number, number][] = [];
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === 0) empty.push([r, c]);
    })
  );
  if (empty.length === 0) return grid;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = grid.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function initGrid(): number[][] {
  let g = Array(GRID_SIZE)
    .fill(null)
    .map(() => Array(GRID_SIZE).fill(0));
  g = spawnTile(g);
  g = spawnTile(g);
  return g;
}

function moveLeft(grid: number[][]): { grid: number[][]; changed: boolean } {
  let changed = false;
  const next = grid.map((row) => {
    const filtered = row.filter((v) => v > 0);
    const merged: number[] = [];
    for (let i = 0; i < filtered.length; i++) {
      if (i < filtered.length - 1 && filtered[i] === filtered[i + 1]) {
        merged.push(filtered[i] * 2);
        i++;
        changed = true;
      } else merged.push(filtered[i]);
    }
    while (merged.length < GRID_SIZE) merged.push(0);
    if (merged.some((v, j) => v !== row[j])) changed = true;
    return merged;
  });
  return { grid: next, changed };
}

function rotate90(grid: number[][]): number[][] {
  const n = grid.length;
  const out = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) out[c][n - 1 - r] = grid[r][c];
  return out;
}

function move(grid: number[][], dir: 'left' | 'right' | 'up' | 'down'): { grid: number[][]; changed: boolean } {
  let g = grid.map((r) => [...r]);
  if (dir === 'right') g = g.map((r) => [...r].reverse());
  if (dir === 'up') g = rotate90(rotate90(rotate90(g)));   // 90 CCW so "up" becomes "left"
  if (dir === 'down') g = rotate90(g);                      // 90 CW so "down" becomes "left"
  const { grid: after, changed } = moveLeft(g);
  let result = after;
  if (dir === 'right') result = result.map((r) => [...r].reverse());
  if (dir === 'up') result = rotate90(result);              // unrotate
  if (dir === 'down') result = rotate90(rotate90(rotate90(result)));
  return { grid: result, changed };
}

function maxTile(grid: number[][]): number {
  return Math.max(0, ...grid.flat());
}

type Props = { onWin: () => void; onCancel: () => void };

export default function Mini2048({ onWin, onCancel }: Props) {
  const [grid, setGrid] = useState<number[][]>(() => initGrid());
  const max = maxTile(grid);
  const won = max >= TARGET;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (won) return;
      const key = e.key;
      let dir: 'left' | 'right' | 'up' | 'down' | null = null;
      if (key === 'ArrowLeft') dir = 'left';
      if (key === 'ArrowRight') dir = 'right';
      if (key === 'ArrowUp') dir = 'up';
      if (key === 'ArrowDown') dir = 'down';
      if (!dir) return;
      e.preventDefault();
      const { grid: next, changed } = move(grid, dir);
      if (!changed) return;
      setGrid(spawnTile(next));
    },
    [grid, won]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (won) {
    return (
      <div className="minigame-2048">
        <p className="minigame-result">You reached {TARGET}! Clue found!</p>
        <button type="button" className="minigame-done" onClick={onWin}>Continue</button>
      </div>
    );
  }

  return (
    <div className="minigame-2048">
      <p className="minigame-goal">Reach {TARGET} to find the clue. Use arrow keys.</p>
      <div className="minigame-2048-grid">
        {grid.flat().map((v, i) => (
          <div key={i} className="minigame-2048-cell" data-value={v || ''}>
            {v || ''}
          </div>
        ))}
      </div>
      <p className="minigame-2048-max">Current max: {max}</p>
      <button type="button" className="minigame-cancel" onClick={onCancel}>Cancel</button>
    </div>
  );
}
