import React from "react";

type RectRoom = {
  name: string;
  color: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
};

const ROOM_LABELS: Record<string, string> = {
  "top-left": "Cat Tower",
  "top-mid": "Sunbeam Deck",
  "top-right": "Dining Room",
  "left-mid": "Kitchen",
  center: "Fish Tank",
  "right-mid": "Yarn Vault",
  "bottom-left": "Litter Kingdom",
  "bottom-mid": "Basement Box Fort",
  "bottom-right": "Nap Chamber",
};

type BoardViewProps = {
  clueRoomNames?: string[];
  isMyTurn?: boolean;
  roomsCollected?: string[];
  onRoomClick?: (roomName: string) => void;
};

export default function BoardView({
  clueRoomNames = [],
  isMyTurn = false,
  roomsCollected = [],
  onRoomClick,
}: BoardViewProps) {
  const size = 28;
  const total = size * size;

  const cornerSize = 8;

  const centerRoomSize = 8;
  const centerStart = Math.floor((size - centerRoomSize) / 2);
  const centerEnd = centerStart + centerRoomSize - 1;

  const edgeRoomSize = cornerSize;
  const edgeStart = Math.floor((size - edgeRoomSize) / 2);
  const edgeEnd = edgeStart + edgeRoomSize - 1;

  const rooms: RectRoom[] = [
    { name: "center", color: "#bde0fe", r1: centerStart, c1: centerStart, r2: centerEnd, c2: centerEnd },

    { name: "top-left", color: "#d9c8ff", r1: 0, c1: 0, r2: cornerSize - 1, c2: cornerSize - 1 },
    { name: "top-right", color: "#ffd1dc", r1: 0, c1: size - cornerSize, r2: cornerSize - 1, c2: size - 1 },
    { name: "bottom-left", color: "#c8f7d4", r1: size - cornerSize, c1: 0, r2: size - 1, c2: cornerSize - 1 },
    { name: "bottom-right", color: "#fff3b0", r1: size - cornerSize, c1: size - cornerSize, r2: size - 1, c2: size - 1 },

    { name: "top-mid", color: "#ffe6a7", r1: 0, c1: edgeStart, r2: edgeRoomSize - 1, c2: edgeEnd },
    { name: "bottom-mid", color: "#cdb4db", r1: size - edgeRoomSize, c1: edgeStart, r2: size - 1, c2: edgeEnd },
    { name: "left-mid", color: "#b7e4c7", r1: edgeStart, c1: 0, r2: edgeEnd, c2: edgeRoomSize - 1 },
    { name: "right-mid", color: "#ffafcc", r1: edgeStart, c1: size - edgeRoomSize, r2: edgeEnd, c2: size - 1 },
  ];

  function getRoom(row: number, col: number): RectRoom | null {
    for (const room of rooms) {
      if (row >= room.r1 && row <= room.r2 && col >= room.c1 && col <= room.c2) {
        return room;
      }
    }
    return null;
  }

  function roomCenterPercent(room: RectRoom) {
    const centerRow = (room.r1 + room.r2 + 1) / 2;
    const centerCol = (room.c1 + room.c2 + 1) / 2;

    return {
      top: `${(centerRow / size) * 100}%`,
      left: `${(centerCol / size) * 100}%`,
    };
  }

  return (
    <div style={styles.wrapper}>
      <div
        style={{
          ...styles.grid,
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const row = Math.floor(i / size);
          const col = i % size;

          const room = getRoom(row, col);
          const isRoom = room !== null;

          return (
            <div
              key={i}
              style={{
                ...styles.cell,
                background: isRoom ? room!.color : "white",
                border: isRoom ? "none" : "1px solid black",
              }}
            />
          );
        })}

        <div style={styles.labelsLayer}>
          {rooms.map((room) => {
            const label = ROOM_LABELS[room.name] ?? room.name;
            const pos = roomCenterPercent(room);

            return (
              <div
                key={`label-${room.name}`}
                style={{
                  ...styles.labelPill,
                  ...pos,
                }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {onRoomClick && clueRoomNames.length > 0 && (
          <div style={styles.clickLayer}>
            {rooms
              .filter((room) => clueRoomNames.includes(room.name))
              .map((room) => {
                const collected = roomsCollected.includes(room.name);
                const canClick = isMyTurn && !collected;
                const top = (room.r1 / size) * 100;
                const left = (room.c1 / size) * 100;
                const width = ((room.c2 - room.c1 + 1) / size) * 100;
                const height = ((room.r2 - room.r1 + 1) / size) * 100;

                return (
                  <div
                    key={`click-${room.name}`}
                    role="button"
                    tabIndex={canClick ? 0 : -1}
                    aria-label={collected ? `Clue found in ${ROOM_LABELS[room.name] ?? room.name}` : `Search for clue in ${ROOM_LABELS[room.name] ?? room.name}`}
                    style={{
                      position: "absolute",
                      top: `${top}%`,
                      left: `${left}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                      cursor: canClick ? "pointer" : "default",
                      opacity: collected ? 0.4 : 1,
                      background: canClick ? "rgba(255,255,255,0.15)" : "transparent",
                      borderRadius: 4,
                    }}
                    onClick={() => canClick && onRoomClick(room.name)}
                    onKeyDown={(e) => canClick && (e.key === "Enter" || e.key === " ") && onRoomClick(room.name)}
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    width: "min(90vmin, 700px)",
    aspectRatio: "1 / 1",
    margin: "20px auto",
  },
  grid: {
    width: "100%",
    height: "100%",
    display: "grid",
    border: "2px solid black",
    position: "relative",
  },
  cell: {
  },

  labelsLayer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 10,
  },
  clickLayer: {
    position: "absolute",
    inset: 0,
    zIndex: 5,
  },
  labelPill: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid #333",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
    color: "#1a1a1a",
  },
};