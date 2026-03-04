import React, { useState, useCallback } from 'react';

const SIZE = 4;
const TOTAL = SIZE * SIZE;

type Cell = 'X' | 'O' | null;

// 4x4 winning lines: 4 rows, 4 cols, 2 diagonals
function getLines(): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < SIZE; r++) {
    lines.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  }
  for (let c = 0; c < SIZE; c++) {
    lines.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  }
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + i));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)));
  return lines;
}
const LINES = getLines();

function getWinner(board: Cell[]): 'X' | 'O' | 'draw' | null {
  for (const line of LINES) {
    const [a, b, c, d] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c] && board[c] === board[d])
      return board[a] as 'X' | 'O';
  }
  if (board.every(Boolean)) return 'draw';
  return null;
}

/** Computer plays randomly (bad on purpose) — no blocking or winning logic */
function getBadMove(board: Cell[]): number {
  const empty = board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  return empty[Math.floor(Math.random() * empty.length)];
}

type Props = { onWin: () => void; onCancel: () => void };

export default function TicTacToe({ onWin, onCancel }: Props) {
  const [board, setBoard] = useState<Cell[]>(Array(TOTAL).fill(null));
  const [humanIsX, setHumanIsX] = useState(true);
  const [started, setStarted] = useState(false);
  const winner = getWinner(board);

  const makeMove = useCallback(
    (index: number) => {
      if (board[index] || winner) return;
      const next = [...board];
      next[index] = humanIsX ? 'X' : 'O';
      setBoard(next);
      const w = getWinner(next);
      if (w === 'draw' || w) return;
      const aiMove = getBadMove(next);
      next[aiMove] = humanIsX ? 'O' : 'X';
      setBoard(next);
    },
    [board, winner, humanIsX]
  );

  if (!started) {
    return (
      <div className="minigame-ttt">
        <p className="minigame-goal">Win at tic-tac-toe to find the clue.</p>
        <div className="minigame-ttt-start">
          <button type="button" onClick={() => { setHumanIsX(true); setStarted(true); }}>
            Play as X (first)
          </button>
          <button type="button" onClick={() => { setHumanIsX(false); setStarted(true); }}>
            Play as O (second)
          </button>
        </div>
        <button type="button" className="minigame-cancel" onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="minigame-ttt">
      <p className="minigame-goal">Get four in a row!</p>
      <div className="minigame-ttt-board minigame-ttt-board-4x4">
        {board.map((cell, i) => (
          <button
            key={i}
            type="button"
            className="minigame-ttt-cell"
            onClick={() => makeMove(i)}
            disabled={!!cell || !!winner}
          >
            {cell ?? ''}
          </button>
        ))}
      </div>
      {winner && (
        <p className="minigame-result">
          {winner === 'draw' ? "It's a draw. Try again!" : winner === (humanIsX ? 'X' : 'O') ? 'You win! Clue found!' : 'Cat wins this round…'}
        </p>
      )}
      {winner === (humanIsX ? 'X' : 'O') && (
        <button type="button" className="minigame-done" onClick={onWin}>Continue</button>
      )}
      {(winner === 'draw' || (winner && winner !== (humanIsX ? 'X' : 'O'))) && (
        <button type="button" className="minigame-cancel" onClick={onCancel}>Close</button>
      )}
      {!winner && <button type="button" className="minigame-cancel" onClick={onCancel}>Cancel</button>}
    </div>
  );
}
