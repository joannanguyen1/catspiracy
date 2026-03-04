import React from 'react';
import TicTacToe from './TicTacToe';
import Mini2048 from './Mini2048';
import MemoryMatch from './MemoryMatch';
import SimpleSequence from './SimpleSequence';

type Props = {
  roomName: string;
  roomLabel: string;
  gameIndex: number;
  onSuccess: () => void;
  onCancel: () => void;
};

const ROOM_LABELS: Record<string, string> = {
  'top-left': 'Cat Tower',
  'top-mid': 'Sunbeam Deck',
  'top-right': 'Dining Room',
  'left-mid': 'Kitchen',
  center: 'Fish Tank',
  'right-mid': 'Yarn Vault',
  'bottom-left': 'Litter Kingdom',
  'bottom-mid': 'Basement Box Fort',
  'bottom-right': 'Nap Chamber',
};

export default function MinigameModal({ roomName, roomLabel, gameIndex, onSuccess, onCancel }: Props) {
  const label = roomLabel || (ROOM_LABELS[roomName] ?? roomName);
  const GameComponent = [TicTacToe, Mini2048, MemoryMatch, SimpleSequence][gameIndex % 4] ?? TicTacToe;

  return (
    <div className="minigame-overlay" role="dialog" aria-modal="true" aria-labelledby="minigame-title">
      <div className="minigame-modal">
        <h3 id="minigame-title" className="minigame-title">Searching: {label}</h3>
        <GameComponent onWin={onSuccess} onCancel={onCancel} />
      </div>
    </div>
  );
}
