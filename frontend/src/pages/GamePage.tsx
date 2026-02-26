import { useState, useEffect } from 'react';
import './GamePage.css';
import BoardView from '../components/BoardView';
import {
  getCatDisplayName,
  getCatAvatarColor,
  getCatInitial,
} from '../constants/cats';

const CAT_IDS = ['whiskers', 'shadow', 'mittens', 'tiger', 'luna', 'oliver'];
const CLUE_ROOMS = ['left-mid', 'center', 'top-right', 'bottom-left'];

const TOTAL_SECONDS = 5 * 60;

export default function GamePage() {
  const [roomsCollected, setRoomsCollected] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (gameOver) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setGameOver(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gameOver]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isLowTime = timeLeft <= 30;

  const handleRoomClick = (roomName: string) => {
    if (!roomsCollected.includes(roomName)) {
      setRoomsCollected((prev) => [...prev, roomName]);
    }
  };

  return (
    <div className="gp-root">
      {gameOver && (
        <div className="gp-gameover-overlay">
          <div className="gp-gameover-box">
            <h2>Time's Up!</h2>
            <p>The killer has vanished into the night.<br />Better luck next time, detective.</p>
            <button className="gp-gameover-btn" type="button" onClick={() => window.location.href = '/'}>
              Return to Lobby
            </button>
          </div>
        </div>
      )}
      <header className="gp-header">
        <span className="gp-header-title">CATSPIRACY</span>
        <div className="gp-header-right">
          <span className={`gp-timer${isLowTime ? ' low-time' : ''}`}>
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </div>
      </header>

      <main className="gp-main">

        <section className="gp-panel gp-suspects">
          <h3 className="gp-panel-title">Suspects</h3>
          <ul className="suspects-list">
            {CAT_IDS.map((id) => (
              <li key={id} className="suspect-row">
                <div
                  className="suspect-avatar"
                  style={{ background: getCatAvatarColor(id) }}
                >
                  {getCatInitial(id)}
                </div>
                <span className="suspect-name">{getCatDisplayName(id)}</span>
                <button type="button" className="suspect-accuse-btn">
                  Accuse
                </button>
              </li>
            ))}
          </ul>
          <p className="suspects-note">
            NOTE: Clicking a suspect initiates a "Vote" action. Incorrect votes reduce the timer by 1 minute.
          </p>
        </section>

        <section className="gp-panel gp-map">
          <div className="gp-map-header">
            <h3 className="gp-panel-title">House Map</h3>
            <span className="clues-badge">
              {roomsCollected.length} / 4 Clues Found
            </span>
          </div>
          <div className="gp-map-board">
            <BoardView
              clueRoomNames={CLUE_ROOMS}
              isMyTurn={true}
              roomsCollected={roomsCollected}
              onRoomClick={handleRoomClick}
            />
          </div>
          <p className="map-instruction">
            Click a location to use 1 Turn and search for clues.
          </p>
        </section>

        <div className="gp-right">
          <section className="gp-panel gp-objectives">
            <h3 className="gp-panel-title">Current Objective</h3>
            <ul>
              <li>Find 4 clues ({roomsCollected.length}/4)</li>
              <li>Identify the murderer before time runs out</li>
              <li>Avoid false accusations (−1 min penalty)</li>
            </ul>
          </section>

          <section className="gp-panel gp-log">
            <h3 className="gp-panel-title">Game Log</h3>
            <div className="log-text">Waiting for game to start…</div>
          </section>

          <div className="gp-status">
            <span className="gp-status-dot connected" />
            Connected · Game #——
          </div>
        </div>
      </main>
    </div>
  );
}
