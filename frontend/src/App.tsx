import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import tralalerGif from './assets/Tralelo idling.gif';
import BoardView from './components/BoardView';
import CatIcon from './components/CatIcon';
import MinigameModal from './components/minigames/MinigameModal';
import { getCatDisplayName, getCatAvatarColor, getCatInitial, getCatImage, DETECTIVE_CHARACTERS, type DetectiveCharacter } from './constants/cats';

const socket = io(
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001'
);

type LobbyPlayer = { id: string; name: string };

type GameStartedPayload = {
  status: 'playing';
  players: { id: number; socketId: string; name: string }[];
  currentTurnSocketId: string;
  remainingSeconds: number;
  catIds: string[];
  cluesCollectedCount: number;
  roomsCollected?: string[];
  clueRoomNames?: string[];
};

type LostPayload = {
  reason?: string;
  voterName?: string;
  votedCatId?: string;
  murdererCatId?: string;
};

function App() {
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [gameJoined, setGameJoined] = useState(false);
  const [myGameCode, setMyGameCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [joinError, setJoinError] = useState('');
  const [startError, setStartError] = useState('');
  const [gameStatus, setGameStatus] = useState<'lobby' | 'intro' | 'playing' | 'lost' | 'won'>('lobby');
  const [selectedDetective, setSelectedDetective] = useState<DetectiveCharacter | null>(null);
  // socketId → detectiveId for all players currently on the intro screen
  const [detectiveSelections, setDetectiveSelections] = useState<Record<string, string>>({});
  const [gameState, setGameState] = useState<GameStartedPayload | null>(null);
  const [gameLog, setGameLog] = useState<string>('Waiting for game to start...');
  const [winPayload, setWinPayload] = useState<{ murdererCatId: string; voterName: string } | null>(null);
  const [lostPayload, setLostPayload] = useState<LostPayload | null>(null);
  const [minigameOpen, setMinigameOpen] = useState<{ roomName: string; gameIndex: number } | null>(null);
  const [otherPlayers, setOtherPlayers] = useState<Record<string, { row: number; col: number }>>({});
  const [eliminatedCatIds, setEliminatedCatIds] = useState<string[]>([]);

  const resetToLobby = () => {
    setGameJoined(false);
    setMyGameCode('');
    setIsHost(false);
    setPlayers([]);
    setGameStatus('lobby');
    setGameState(null);
    setGameLog('Waiting for game to start...');
    setWinPayload(null);
    setLostPayload(null);
    setStartError('');
    setJoinError('');
    setEliminatedCatIds([]);
    setOtherPlayers({});
    setSelectedDetective(null);
    setDetectiveSelections({});
  };

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    socket.on('lobby_update', (data: { players: LobbyPlayer[] }) => {
      setPlayers(data.players ?? []);
    });
    socket.on('game_created', (data: { gameCode: string; playerName: string }) => {
      setMyGameCode(data.gameCode);
      setGameJoined(true);
      setIsHost(true);
    });
    socket.on('join_success', (data: { gameCode: string; playerName: string }) => {
      setMyGameCode(data.gameCode);
      setGameJoined(true);
      setJoinError('');
    });
    socket.on('join_error', (data: { message: string }) => {
      setJoinError(data.message ?? 'Failed to join');
    });
    socket.on('game_started', (data: GameStartedPayload) => {
      setGameState({ ...data, roomsCollected: data.roomsCollected ?? [] });
      setEliminatedCatIds([]);
      setStartError('');
      setGameLog('🐾 Game started! Walk your avatar into rooms to find clues.\n');
      setGameStatus('intro');
    });
    socket.on('clue_found', (data: {
      roomName: string;
      clueText: string;
      cluesCollectedCount: number;
      currentTurnSocketId: string;
      roomsCollected: string[];
      logMessage: string;
      eliminatedCatId: string;
    }) => {
      setGameState((prev) =>
        prev
          ? {
              ...prev,
              cluesCollectedCount: data.cluesCollectedCount,
              currentTurnSocketId: data.currentTurnSocketId,
              roomsCollected: data.roomsCollected,
            }
          : null
      );
      if (data.eliminatedCatId) {
        setEliminatedCatIds((prev) =>
          prev.includes(data.eliminatedCatId) ? prev : [...prev, data.eliminatedCatId]
        );
      }
      setGameLog((log) => log + data.logMessage + '\n');
    });
    socket.on('clue_error', (data: { message: string }) => {
      setGameLog((log) => log + `(Error: ${data.message})\n`);
    });
    socket.on('start_error', (data: { message: string }) => {
      setStartError(data.message ?? 'Failed to start');
    });
    socket.on('timer_update', (data: { remainingSeconds: number }) => {
      setGameState((prev) =>
        prev ? { ...prev, remainingSeconds: data.remainingSeconds } : null
      );
    });
    socket.on('game_lost', (data: LostPayload) => {
      setGameStatus('lost');
      setLostPayload(data ?? {});
    });
    socket.on('game_won', (data: { murdererCatId: string; voterName: string }) => {
      setGameStatus('won');
      setWinPayload({ murdererCatId: data.murdererCatId, voterName: data.voterName });
    });
    socket.on('vote_error', (data: { message: string }) => {
      setGameLog((log) => log + `(Vote error: ${data.message})\n`);
    });
    socket.on('player_moved', (data: { socketId: string; row: number; col: number }) => {
      setOtherPlayers((prev) => ({
        ...prev,
        [data.socketId]: { row: data.row, col: data.col },
      }));
    });
    socket.on('player_left', (data: { id: string }) => {
      setOtherPlayers((prev) => {
        const next = { ...prev };
        delete next[data.id];
        return next;
      });
    });
    socket.on('detective_selections', (data: { selections: Record<string, string> }) => {
      setDetectiveSelections(data.selections ?? {});
    });
    return () => {
      socket.off('lobby_update');
      socket.off('game_created');
      socket.off('join_success');
      socket.off('join_error');
      socket.off('game_started');
      socket.off('start_error');
      socket.off('timer_update');
      socket.off('game_lost');
      socket.off('game_won');
      socket.off('vote_error');
      socket.off('clue_found');
      socket.off('clue_error');
      socket.off('player_moved');
      socket.off('player_left');
      socket.off('detective_selections');
    };
  }, []);

  const createGame = () => {
    if (playerName.trim()) {
      setJoinError('');
      socket.emit('create_game', { playerName: playerName.trim() });
    }
  };

  const joinGame = () => {
    if (playerName.trim() && gameCode.trim()) {
      setJoinError('');
      socket.emit('join_game', {
        gameCode: gameCode.trim().toUpperCase(),
        playerName: playerName.trim(),
      });
    }
  };

  const startGame = () => {
    setStartError('');
    socket.emit('start_game');
  };

  // ——— Pre-join: single lobby card (create or join) ———
  if (!gameJoined) {
    return (
      <div className="App lobby-screen">
        <div className="lobby-card">
          <div className="cat-icon-wrap">
            <CatIcon />
          </div>
          <h1 className="game-title">CATSPIRACY</h1>
          <p className="tagline">Who ate the fish?</p>

          <div className="field">
            <label className="field-label" htmlFor="detective-name">
              DETECTIVE NAME
            </label>
            <input
              id="detective-name"
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-create"
            onClick={createGame}
            disabled={!connected || !playerName.trim()}
          >
            <svg width="15" height="15" viewBox="0 0 512 512" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M312.069,53.445c-71.26-71.26-187.194-71.26-258.454,0c-71.261,71.26-71.261,187.206,0,258.466 c71.26,71.26,187.194,71.26,258.454,0S383.329,124.705,312.069,53.445z M286.694,286.536 c-57.351,57.34-150.353,57.34-207.704-0.011s-57.351-150.353,0-207.693c57.351-57.351,150.342-57.351,207.693,0 S344.045,229.174,286.694,286.536z"/>
              <path d="M101.911,112.531c-29.357,37.725-31.801,89.631-7.321,129.702c1.877,3.087,5.902,4.048,8.978,2.182 c3.065-1.888,4.037-5.903,2.16-8.978c-21.666-35.456-19.506-81.538,6.469-114.876c2.226-2.837,1.713-6.938-1.135-9.154 C108.227,109.193,104.125,109.695,101.911,112.531z"/>
              <path d="M498.544,447.722l-132.637-129.2c-7.255-7.07-18.84-6.982-26.008,0.174l-21.033,21.033 c-7.156,7.156-7.234,18.742-0.153,25.986l129.19,132.636c14.346,17.324,35.542,18.35,51.917,1.964 C516.216,483.951,515.857,462.068,498.544,447.722z"/>
            </svg>
            CREATE NEW CASE
          </button>

          <div className="lobby-divider">OR JOIN EXISTING</div>

          <div className="join-row">
            <div className="field">
              <label className="field-label" htmlFor="game-code">
                GAME CODE
              </label>
              <input
                id="game-code"
                type="text"
                placeholder="Code"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <button
              type="button"
              className="btn-join"
              onClick={joinGame}
              disabled={!connected || !playerName.trim() || !gameCode.trim()}
            >
              JOIN
            </button>
          </div>

          {joinError && <p className="lobby-error">{joinError}</p>}
        </div>
      </div>
    );
  }

  // ——— Waiting room (after join, before start) ———
  if (gameStatus === 'lobby') {
    return (
      <div className="App lobby-screen">
        <div className="waiting-room-card">
          <div className="cat-icon-wrap">
            <CatIcon />
          </div>
          <h1 className="game-title">CATSPIRACY</h1>
          <p className="tagline">Who ate the fish?</p>
          <p className="game-code-display">{myGameCode}</p>
          <p style={{ fontSize: '0.85rem', color: '#555', margin: '0 0 8px' }}>
            Players in this game ({players.length})
          </p>
          <ul className="players-list">
            {players.map((p) => (
              <li key={p.id}>
                {p.name} {isHost && p.id === socket.id ? '(you, host)' : ''}
              </li>
            ))}
          </ul>
          {isHost && (
            <button
              type="button"
              className="btn-start"
              onClick={startGame}
              disabled={players.length < 2}
            >
              Start game {players.length < 2 ? '(need 2+ players)' : ''}
            </button>
          )}
          {!isHost && (
            <p style={{ fontSize: '0.9rem', color: '#555' }}>
              Waiting for host to start…
            </p>
          )}
          {startError && <p className="lobby-error">{startError}</p>}
        </div>
      </div>
    );
  }

  // ——— Won ———
  if (gameStatus === 'won' && winPayload) {
    return (
      <div className="App won-screen">
        <div className="won-card">
          <h2>Case closed! 🎉</h2>
          <p>
            {winPayload.voterName} correctly identified{' '}
            <strong>{getCatDisplayName(winPayload.murdererCatId)}</strong> as the fish thief! 🐟🔍
          </p>
          <button type="button" className="btn-play-again" onClick={resetToLobby}>
            Play again
          </button>
        </div>
      </div>
    );
  }

  // ——— Lost ———
  if (gameStatus === 'lost') {
    const isWrongVote = lostPayload?.reason === 'wrong_vote';
    return (
      <div className="App lost-screen">
        <div className="lost-card">
          {isWrongVote ? (
            <>
              <h2>Wrong accusation! 💀</h2>
              <p>
                <strong>{lostPayload?.voterName}</strong> falsely accused{' '}
                <strong>{getCatDisplayName(lostPayload?.votedCatId ?? '')}</strong>.
              </p>
              {lostPayload?.murdererCatId && (
                <p style={{ marginTop: 8 }}>
                  The real culprit was{' '}
                  <strong>{getCatDisplayName(lostPayload.murdererCatId)}</strong>. 🐟
                </p>
              )}
            </>
          ) : (
            <>
              <h2>Time&apos;s up! ⏰</h2>
              <p>The detectives ran out of time.</p>
              {lostPayload?.murdererCatId && (
                <p style={{ marginTop: 8 }}>
                  The culprit was{' '}
                  <strong>{getCatDisplayName(lostPayload.murdererCatId)}</strong> all along… 🐟
                </p>
              )}
            </>
          )}
          <button type="button" className="btn-play-again" onClick={resetToLobby}>
            Play again
          </button>
        </div>
      </div>
    );
  }

  if (gameStatus === 'intro') {
    return (
      <div className="App lobby-screen">
        <div className="intro-card">
          <div className="intro-case-header">
            <span className="intro-case-label">CASE FILE #001</span>
            <h1 className="intro-case-title">The Disappearance of the Tralalero Tralala</h1>
          </div>

          <div className="intro-story">
            <p>
              A terrible crime has been committed at <strong>Whisker Manor</strong>. The prized
              Tralalero Tralala — prepared for the Annual Feast of Felines — has vanished without a
              trace overnight.
            </p>
            <p>
              Six suspicious cats were present at the manor last night. Each one claims
              innocence, yet the evidence tells a different story. As an elite detective of the
              Feline Bureau of Investigation, it falls to you to search every room, gather
              clues, and unmask the fish thief.
            </p>
            <p className="intro-warning">
              Be warned: a wrong accusation ends the investigation immediately. Choose wisely,
              detective — the clock is ticking and the culprit grows bolder by the minute.
            </p>
          </div>

          <div className="intro-tralala-wrap">
            <div
              className="intro-tralala-gif"
              role="img"
              aria-label="Tralalero Tralala"
              style={{ backgroundImage: `url(${tralalerGif})` }}
            />
            <span className="intro-tralala-caption">Tralalero Tralala — Still at Large</span>
          </div>

          <div className="intro-divider">CHOOSE YOUR DETECTIVE</div>

          <div className="intro-character-grid">
            {DETECTIVE_CHARACTERS.map((cat) => {
              const isMine = selectedDetective?.id === cat.id;
              const takenByOther = Object.entries(detectiveSelections).some(
                ([sid, did]) => did === cat.id && sid !== socket.id
              );
              return (
              <button
                key={cat.id}
                type="button"
                className={`intro-character-card${isMine ? ' selected' : ''}${takenByOther ? ' taken' : ''}`}
                disabled={takenByOther}
                onClick={() => {
                  setSelectedDetective(cat);
                  socket.emit('select_detective', { detectiveId: cat.id });
                }}
              >
                <div className="intro-character-img-wrap">
                  <img src={cat.image} alt={cat.name} className="intro-character-img" />
                  {(isMine || takenByOther) && (
                    <div className={`intro-paw-overlay${takenByOther ? ' intro-paw-overlay--taken' : ''}`}>
                      <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <path
                          fill="none"
                          stroke="#ffffff"
                          strokeMiterlimit={10}
                          strokeWidth={7}
                          d="M324.5,282.26c-11.49-19.8-36.22-33.5-64.9-33.5s-53.41,13.7-64.9,33.5c-20.53,9.58-33.5,23.62-33.5,39.28,0,28.87,44.05,52.27,98.4,52.27s98.4-23.4,98.4-52.27c0-15.66-12.97-29.7-33.5-39.28Z"
                        />
                        <ellipse
                          fill="none"
                          stroke="#ffffff"
                          strokeMiterlimit={10}
                          strokeWidth={7}
                          cx="295.77" cy="176.77" rx="38.75" ry="29.72"
                          transform="translate(55.53 423.78) rotate(-76.66)"
                        />
                        <ellipse
                          fill="none"
                          stroke="#ffffff"
                          strokeMiterlimit={10}
                          strokeWidth={7}
                          cx="212.93" cy="176.77" rx="29.72" ry="38.75"
                          transform="translate(-35.04 53.89) rotate(-13.34)"
                        />
                        <ellipse
                          fill="none"
                          stroke="#ffffff"
                          strokeMiterlimit={10}
                          strokeWidth={7}
                          cx="148.91" cy="240.32" rx="26.12" ry="34.05"
                          transform="translate(-100.21 106.65) rotate(-30)"
                        />
                        <ellipse
                          fill="none"
                          stroke="#ffffff"
                          strokeMiterlimit={10}
                          strokeWidth={7}
                          cx="363.09" cy="231.51" rx="34.05" ry="26.12"
                          transform="translate(-18.94 430.2) rotate(-60)"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <span className="intro-character-name">{cat.name}</span>
                <span className="intro-character-title">{cat.title}</span>
              </button>
            );})}
          </div>

          <button
            type="button"
            className="btn-begin"
            disabled={!selectedDetective}
            onClick={() => setGameStatus('playing')}
          >
            {selectedDetective
              ? `Begin Investigation as ${selectedDetective.name}`
              : 'Select a detective to begin'}
          </button>
        </div>
      </div>
    );
  }

  // ——— Playing: header + panels (suspects | map | objectives + log) ———
  if (gameStatus === 'playing' && gameState) {
    const isMyTurn = gameState.currentTurnSocketId === socket.id;
    const minutes = Math.floor(gameState.remainingSeconds / 60);
    const seconds = gameState.remainingSeconds % 60;

    // Map each socketId to its chosen detective's image for board avatars
    const otherPlayerImages: Record<string, string> = {};
    Object.entries(detectiveSelections).forEach(([sid, detectiveId]) => {
      const detective = DETECTIVE_CHARACTERS.find((d) => d.id === detectiveId);
      if (detective) otherPlayerImages[sid] = detective.image;
    });
    const myPlayerIndex = Math.max(0, gameState.players.findIndex((p) => p.socketId === socket.id));

    return (
      <div className="App game-screen">
        <header className="game-header">
          <span>CATSPIRACY</span>
          <div className="game-header-right">
            <span className={`game-timer${gameState.remainingSeconds <= 30 ? ' low-time' : ''}`}>
              {minutes}:{seconds.toString().padStart(2, '0')}
            </span>
          </div>
        </header>

        <main className="game-main">
          <section className="game-panel suspects">
            <h3>Suspects</h3>
            <div className="suspects-list">
              {gameState.catIds.map((id) => {
                const eliminated = eliminatedCatIds.includes(id);
                return (
                  <div
                    key={id}
                    className={`suspect-row${eliminated ? ' suspect-eliminated' : ''}`}
                  >
                    <div className={`avatar${eliminated ? ' avatar-eliminated' : ''}`}>
                      {eliminated ? (
                        <span className="avatar-check">✓</span>
                      ) : (
                        <img
                          src={getCatImage(id) ?? ''}
                          alt={getCatDisplayName(id)}
                          className="avatar-img"
                        />
                      )}
                    </div>
                    <span className="suspect-name">{getCatDisplayName(id)}</span>
                    {eliminated ? (
                      <span className="cleared-badge">CLEARED</span>
                    ) : (
                      <button
                        type="button"
                        className="accuse-btn"
                        onClick={() => socket.emit('vote_suspect', { catId: id })}
                        aria-label={`Accuse ${getCatDisplayName(id)}`}
                      >
                        Accuse
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="suspects-note">
              Accuse the fish thief. A wrong accusation ends the game immediately.
            </p>
          </section>

          <section className="game-panel map-panel">
            <div className="map-panel-header">
              <h3>House Map</h3>
              <span className="clues-badge">
                {gameState.cluesCollectedCount} / 4 Clues Found
              </span>
            </div>
            <div className="map-board">
              <BoardView
                clueRoomNames={gameState.clueRoomNames ?? []}
                isMyTurn={isMyTurn}
                roomsCollected={gameState.roomsCollected ?? []}
                onRoomClick={(roomName: string) => {
                  const clueRoomNames = gameState.clueRoomNames ?? [];
                  const gameIndex = clueRoomNames.indexOf(roomName);
                  setMinigameOpen({ roomName, gameIndex: gameIndex >= 0 ? gameIndex : 0 });
                }}
                showAvatar={true}
                mySocketId={socket.id ?? ''}
                otherPlayers={otherPlayers}
                onMove={(row, col) => socket.emit('move_player', { row, col })}
                myDetectiveImage={selectedDetective?.image}
                otherPlayerImages={otherPlayerImages}
                myPlayerIndex={myPlayerIndex}
              />
            </div>
            {minigameOpen && (
              <MinigameModal
                roomName={minigameOpen.roomName}
                roomLabel=""
                gameIndex={minigameOpen.gameIndex}
                onSuccess={() => {
                  socket.emit('collect_clue', { roomName: minigameOpen.roomName });
                  setMinigameOpen(null);
                }}
                onCancel={() => setMinigameOpen(null)}
              />
            )}
            <p className="map-instruction">
              Walk your avatar into a room to search it for clues.
            </p>
            <div>
              {isMyTurn ? (
                <span className="turn-badge my-turn">Your turn</span>
              ) : (
                <span className="turn-badge other-turn">
                  Waiting for another player&apos;s turn…
                </span>
              )}
            </div>
          </section>

          <div className="game-right">
            <section className="game-panel objectives">
              <h3>Current Objective</h3>
              <ul>
                <li>Find 4 clues ({gameState.cluesCollectedCount}/4) to eliminate suspects</li>
                <li>Identify the murderer before time runs out</li>
                <li>A wrong accusation ends the game immediately</li>
              </ul>
            </section>

            <section className="game-panel log-panel">
              <h3>Game Log</h3>
              <div className="log-content">{gameLog}</div>
            </section>

            <div className="game-status">
              <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
              {connected ? 'Connected' : 'Disconnected'} · Game #{myGameCode}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}

export default App;
