import React, { useState, useCallback } from 'react';

const EMOJIS = ['🐟', '🐱', '🐾', '🥛', '🧶', '🪴'];
const PAIRS = 4;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Card = { id: number; emoji: string; pairId: number };

function buildCards(): Card[] {
  const emojis = shuffle([...EMOJIS]).slice(0, PAIRS);
  const cards: Card[] = [];
  emojis.forEach((emoji, pairId) => {
    cards.push({ id: cards.length, emoji, pairId });
    cards.push({ id: cards.length, emoji, pairId });
  });
  return shuffle(cards);
}

type Props = { onWin: () => void; onCancel: () => void };

export default function MemoryMatch({ onWin, onCancel }: Props) {
  const [cards] = useState<Card[]>(() => buildCards());
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [lastTwo, setLastTwo] = useState<number[]>([]);

  const allMatched = matched.size === cards.length;

  const flip = useCallback(
    (id: number) => {
      if (flipped.has(id) || matched.has(id) || lastTwo.length >= 2) return;
      const nextFlipped = new Set(flipped);
      nextFlipped.add(id);
      setFlipped(nextFlipped);
      const two = [...lastTwo, id];
      setLastTwo(two);
      if (two.length === 2) {
        const [a, b] = two;
        const cardA = cards.find((c) => c.id === a);
        const cardB = cards.find((c) => c.id === b);
        if (cardA && cardB && cardA.pairId === cardB.pairId) {
          setMatched((m) => new Set([...m, a, b]));
        }
        setTimeout(() => {
          setFlipped((f) => {
            const n = new Set(f);
            two.forEach((i) => n.delete(i));
            return n;
          });
          setLastTwo([]);
        }, 600);
      }
    },
    [cards, flipped, matched, lastTwo]
  );

  if (allMatched) {
    return (
      <div className="minigame-memory">
        <p className="minigame-result">All pairs matched! Clue found!</p>
        <button type="button" className="minigame-done" onClick={onWin}>Continue</button>
      </div>
    );
  }

  return (
    <div className="minigame-memory">
      <p className="minigame-goal">Match all pairs to find the clue.</p>
      <div className="minigame-memory-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="minigame-memory-card"
            onClick={() => flip(card.id)}
            disabled={flipped.has(card.id) || matched.has(card.id)}
          >
            {flipped.has(card.id) || matched.has(card.id) ? card.emoji : '?'}
          </button>
        ))}
      </div>
      <button type="button" className="minigame-cancel" onClick={onCancel}>Cancel</button>
    </div>
  );
}
