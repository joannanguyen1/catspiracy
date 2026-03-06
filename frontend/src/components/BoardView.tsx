import React, { useState, useEffect, useRef } from "react";
import { CAT_IMAGES } from "../constants/cats";

type RectRoom = {
  name: string;
  color: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
};

const ROOM_LABELS: Record<string, string> = {
  "top-left":     "Cat Tower",
  "top-mid":      "Sunbeam Deck",
  "top-right":    "Dining Room",
  "left-mid":     "Kitchen",
  center:         "Fish Tank",
  "right-mid":    "Yarn Vault",
  "bottom-left":  "Litter Kingdom",
  "bottom-mid":   "Basement Box Fort",
  "bottom-right": "Nap Chamber",
};

const ROOM_COLORS: Record<string, string> = {
  "top-left":     "#ead9ff",
  "top-mid":      "#fef4c0",
  "top-right":    "#ffc8d8",
  "left-mid":     "#c8f5e2",
  center:         "#b8e4ff",
  "right-mid":    "#ffd8c8",
  "bottom-left":  "#c8f0cc",
  "bottom-mid":   "#ddd5ff",
  "bottom-right": "#fff8c0",
};

const WALL_STROKE: Record<string, string> = {
  "top-left":     "rgba(155,100,220,0.5)",
  "top-mid":      "rgba(190,148,22,0.5)",
  "top-right":    "rgba(210,80,130,0.5)",
  "left-mid":     "rgba(38,155,100,0.5)",
  center:         "rgba(38,128,210,0.5)",
  "right-mid":    "rgba(220,108,68,0.5)",
  "bottom-left":  "rgba(48,158,68,0.5)",
  "bottom-mid":   "rgba(110,88,212,0.5)",
  "bottom-right": "rgba(188,158,22,0.5)",
};

// ============================================================
// MODULE-LEVEL GRID CONSTANTS (needed in keyboard handlers)
// ============================================================
const GRID_SIZE = 28;
const CORNER_SIZE = 8;
const CENTER_ROOM_SIZE = 8;
const CENTER_START = Math.floor((GRID_SIZE - CENTER_ROOM_SIZE) / 2); // 10
const CENTER_END   = CENTER_START + CENTER_ROOM_SIZE - 1;             // 17
const EDGE_ROOM_SIZE = CORNER_SIZE;
const EDGE_START   = Math.floor((GRID_SIZE - EDGE_ROOM_SIZE) / 2);   // 10
const EDGE_END     = EDGE_START + EDGE_ROOM_SIZE - 1;                 // 17

const ROOMS: RectRoom[] = [
  { name: "center",       color: ROOM_COLORS["center"],       r1: CENTER_START,               c1: CENTER_START,               r2: CENTER_END,                 c2: CENTER_END              },
  { name: "top-left",     color: ROOM_COLORS["top-left"],     r1: 0,                          c1: 0,                          r2: CORNER_SIZE - 1,            c2: CORNER_SIZE - 1         },
  { name: "top-right",    color: ROOM_COLORS["top-right"],    r1: 0,                          c1: GRID_SIZE - CORNER_SIZE,    r2: CORNER_SIZE - 1,            c2: GRID_SIZE - 1           },
  { name: "bottom-left",  color: ROOM_COLORS["bottom-left"],  r1: GRID_SIZE - CORNER_SIZE,    c1: 0,                          r2: GRID_SIZE - 1,              c2: CORNER_SIZE - 1         },
  { name: "bottom-right", color: ROOM_COLORS["bottom-right"], r1: GRID_SIZE - CORNER_SIZE,    c1: GRID_SIZE - CORNER_SIZE,    r2: GRID_SIZE - 1,              c2: GRID_SIZE - 1           },
  { name: "top-mid",      color: ROOM_COLORS["top-mid"],      r1: 0,                          c1: EDGE_START,                 r2: EDGE_ROOM_SIZE - 1,         c2: EDGE_END                },
  { name: "bottom-mid",   color: ROOM_COLORS["bottom-mid"],   r1: GRID_SIZE - EDGE_ROOM_SIZE, c1: EDGE_START,                 r2: GRID_SIZE - 1,              c2: EDGE_END                },
  { name: "left-mid",     color: ROOM_COLORS["left-mid"],     r1: EDGE_START,                 c1: 0,                          r2: EDGE_END,                   c2: EDGE_ROOM_SIZE - 1      },
  { name: "right-mid",    color: ROOM_COLORS["right-mid"],    r1: EDGE_START,                 c1: GRID_SIZE - EDGE_ROOM_SIZE, r2: EDGE_END,                   c2: GRID_SIZE - 1           },
];

function getRoomAt(row: number, col: number): RectRoom | null {
  for (const room of ROOMS) {
    if (row >= room.r1 && row <= room.r2 && col >= room.c1 && col <= room.c2) return room;
  }
  return null;
}

function roomCenter(room: RectRoom): { row: number; col: number } {
  return {
    row: Math.floor((room.r1 + room.r2) / 2),
    col: Math.floor((room.c1 + room.c2) / 2),
  };
}

const FISH_TANK_ROOM = ROOMS.find((r) => r.name === "center") ?? ROOMS[0]!;
const AVATAR_START = roomCenter(FISH_TANK_ROOM);
const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
// Colors for other players' avatars
const PLAYER_COLORS = ["#2ecc71", "#e74c3c", "#3498db", "#f39c12", "#9b59b6"];

// Suspects spread across rooms — rowFrac/colFrac are 0–1 within the room bounds
const SUSPECT_ROOMS: Array<{ id: string; roomName: string; rowFrac: number; colFrac: number }> = [
  { id: "whiskers", roomName: "top-left",     rowFrac: 0.2,  colFrac: 0.75 }, // top-right corner
  { id: "shadow",   roomName: "top-mid",      rowFrac: 0.75, colFrac: 0.2  }, // bottom-left corner
  { id: "mittens",  roomName: "left-mid",     rowFrac: 0.25, colFrac: 0.65 }, // upper-right area
  { id: "tiger",    roomName: "right-mid",    rowFrac: 0.7,  colFrac: 0.3  }, // lower-left area
  { id: "luna",     roomName: "bottom-left",  rowFrac: 0.3,  colFrac: 0.7  }, // upper-right area
  { id: "oliver",   roomName: "bottom-right", rowFrac: 0.75, colFrac: 0.25 }, // lower-left corner
];

// ============================================================
// Room SVG decorations (unchanged)
// ============================================================
function RoomDecoration({ name }: { name: string }) {
  const s: React.CSSProperties = { width: "100%", height: "100%" };
  const ws = WALL_STROKE[name] ?? "rgba(150,120,180,0.45)";

  switch (name) {
    case "top-left": // Cat Tower
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <rect x="6" y="8" width="22" height="24" rx="3" fill="rgba(210,190,255,0.5)" stroke="rgba(155,100,220,0.4)" strokeWidth="1.5" />
          <line x1="17" y1="8" x2="17" y2="32" stroke="rgba(155,100,220,0.3)" strokeWidth="1" />
          <line x1="6" y1="20" x2="28" y2="20" stroke="rgba(155,100,220,0.3)" strokeWidth="1" />
          <rect x="37" y="76" width="26" height="8" rx="3" fill="rgba(175,130,240,0.55)" />
          <rect x="46" y="28" width="8" height="50" rx="3" fill="rgba(195,155,248,0.45)" />
          <rect x="30" y="22" width="40" height="8" rx="3" fill="rgba(175,130,240,0.55)" />
          <rect x="33" y="52" width="34" height="7" rx="3" fill="rgba(175,130,240,0.55)" />
          <ellipse cx="50" cy="18" rx="9" ry="6" fill="rgba(130,80,200,0.5)" />
          <circle cx="50" cy="12" r="6" fill="rgba(130,80,200,0.5)" />
          <polygon points="45,9 43,3 48,7" fill="rgba(130,80,200,0.5)" />
          <polygon points="55,9 57,3 52,7" fill="rgba(130,80,200,0.5)" />
          <circle cx="47" cy="12" r="1.5" fill="rgba(255,220,255,0.98)" />
          <circle cx="53" cy="12" r="1.5" fill="rgba(255,220,255,0.98)" />
          <line x1="74" y1="8" x2="74" y2="36" stroke="rgba(155,100,220,0.4)" strokeWidth="1.5" />
          <circle cx="74" cy="41" r="5" fill="rgba(255,160,200,0.65)" />
          <text x="70" y="91" fontSize="10" fill="rgba(200,140,240,0.45)">♡</text>
          <rect x="4" y="86" width="60" height="4" rx="1" fill="rgba(155,100,220,0.1)" />
        </svg>
      );

    case "top-mid": // Sunbeam Deck
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <rect x="10" y="7" width="80" height="40" rx="6" fill="rgba(255,245,170,0.55)" stroke="rgba(190,148,22,0.4)" strokeWidth="2" />
          <line x1="50" y1="7" x2="50" y2="47" stroke="rgba(190,148,22,0.28)" strokeWidth="1.5" />
          <line x1="10" y1="27" x2="90" y2="27" stroke="rgba(190,148,22,0.28)" strokeWidth="1.5" />
          <polygon points="20,47 8,84 32,84"  fill="rgba(255,220,60,0.2)" />
          <polygon points="50,47 36,90 64,90"  fill="rgba(255,220,60,0.25)" />
          <polygon points="80,47 68,84 92,84"  fill="rgba(255,220,60,0.2)" />
          <ellipse cx="50" cy="79" rx="22" ry="9" fill="rgba(230,160,60,0.55)" />
          <circle cx="69" cy="73" r="8" fill="rgba(230,160,60,0.55)" />
          <polygon points="65,67 63,60 69,64" fill="rgba(230,160,60,0.55)" />
          <polygon points="73,67 75,60 69,64" fill="rgba(230,160,60,0.55)" />
          <path d="M 65 72 Q 67 70 69 72" fill="none" stroke="rgba(140,80,10,0.65)" strokeWidth="1.5" />
          <path d="M 69 72 Q 71 70 73 72" fill="none" stroke="rgba(140,80,10,0.65)" strokeWidth="1.5" />
          <rect x="80" y="80" width="12" height="10" rx="2" fill="rgba(220,140,100,0.5)" />
          <circle cx="86" cy="77" r="5" fill="rgba(255,180,200,0.6)" />
          <circle cx="82" cy="79" r="3" fill="rgba(255,180,200,0.55)" />
          <circle cx="90" cy="79" r="3" fill="rgba(255,180,200,0.55)" />
          <ellipse cx="48" cy="88" rx="28" ry="6" fill="rgba(255,200,80,0.28)" stroke="rgba(190,148,22,0.28)" strokeWidth="1" />
        </svg>
      );

    case "top-right": // Dining Room
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <line x1="50" y1="4" x2="50" y2="14" stroke="rgba(220,160,180,0.6)" strokeWidth="2" />
          <ellipse cx="50" cy="18" rx="14" ry="5" fill="rgba(255,200,220,0.5)" stroke="rgba(210,140,170,0.5)" strokeWidth="1" />
          <circle cx="40" cy="18" r="2.5" fill="rgba(255,230,240,0.85)" />
          <circle cx="50" cy="13" r="2.5" fill="rgba(255,230,240,0.85)" />
          <circle cx="60" cy="18" r="2.5" fill="rgba(255,230,240,0.85)" />
          <circle cx="44" cy="23" r="2"   fill="rgba(255,230,240,0.85)" />
          <circle cx="56" cy="23" r="2"   fill="rgba(255,230,240,0.85)" />
          <ellipse cx="50" cy="59" rx="30" ry="22" fill="rgba(255,200,215,0.3)" stroke="rgba(210,80,130,0.45)" strokeWidth="2.5" />
          <line x1="50" y1="81" x2="50" y2="93" stroke="rgba(210,80,130,0.35)" strokeWidth="3" />
          <ellipse cx="38" cy="58" rx="8" ry="6" fill="rgba(255,220,228,0.65)" stroke="rgba(210,80,130,0.4)" strokeWidth="1" />
          <ellipse cx="38" cy="56" rx="5" ry="3.5" fill="rgba(255,160,180,0.6)" />
          <ellipse cx="62" cy="58" rx="8" ry="6" fill="rgba(200,230,255,0.65)" stroke="rgba(210,80,130,0.4)" strokeWidth="1" />
          <ellipse cx="62" cy="56" rx="5" ry="3.5" fill="rgba(160,210,255,0.5)" />
          <circle cx="50" cy="31" r="7" fill="rgba(255,200,215,0.4)" stroke="rgba(210,80,130,0.35)" strokeWidth="1.5" />
          <text x="47" y="34" fontSize="7" fill="rgba(210,80,130,0.55)">♡</text>
          <circle cx="50" cy="89" r="7" fill="rgba(255,200,215,0.4)" stroke="rgba(210,80,130,0.35)" strokeWidth="1.5" />
          <text x="47" y="92" fontSize="7" fill="rgba(210,80,130,0.55)">♡</text>
          <circle cx="16" cy="59" r="7" fill="rgba(255,200,215,0.4)" stroke="rgba(210,80,130,0.35)" strokeWidth="1.5" />
          <text x="13" y="62" fontSize="7" fill="rgba(210,80,130,0.55)">♡</text>
          <circle cx="84" cy="59" r="7" fill="rgba(255,200,215,0.4)" stroke="rgba(210,80,130,0.35)" strokeWidth="1.5" />
          <text x="81" y="62" fontSize="7" fill="rgba(210,80,130,0.55)">♡</text>
        </svg>
      );

    case "left-mid": // Kitchen
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <rect x="68" y="6" width="26" height="54" rx="3" fill="rgba(180,240,220,0.35)" stroke="rgba(38,155,100,0.45)" strokeWidth="1.5" />
          <line x1="68" y1="34" x2="94" y2="34" stroke="rgba(38,155,100,0.25)" strokeWidth="1" />
          <rect x="74" y="17" width="2" height="12" rx="1" fill="rgba(38,155,100,0.5)" />
          <rect x="74" y="39" width="2" height="12" rx="1" fill="rgba(38,155,100,0.5)" />
          <rect x="6" y="16" width="56" height="4" rx="1" fill="rgba(38,155,100,0.28)" />
          <rect x="10" y="7" width="9" height="9" rx="1" fill="rgba(255,160,160,0.7)" />
          <ellipse cx="14.5" cy="7" rx="4.5" ry="2" fill="rgba(255,140,140,0.6)" />
          <rect x="24" y="7" width="9" height="9" rx="1" fill="rgba(160,200,255,0.7)" />
          <ellipse cx="28.5" cy="7" rx="4.5" ry="2" fill="rgba(140,180,255,0.6)" />
          <rect x="38" y="7" width="9" height="9" rx="1" fill="rgba(255,220,140,0.7)" />
          <ellipse cx="42.5" cy="7" rx="4.5" ry="2" fill="rgba(255,200,120,0.6)" />
          <rect x="6" y="58" width="56" height="10" rx="2" fill="rgba(38,155,100,0.28)" stroke="rgba(38,155,100,0.4)" strokeWidth="1.5" />
          <rect x="10" y="47" width="10" height="11" rx="1" fill="rgba(255,160,160,0.7)" />
          <ellipse cx="15" cy="47" rx="5" ry="2" fill="rgba(255,140,140,0.6)" />
          <rect x="24" y="47" width="10" height="11" rx="1" fill="rgba(160,200,255,0.7)" />
          <ellipse cx="29" cy="47" rx="5" ry="2" fill="rgba(140,180,255,0.6)" />
          <rect x="38" y="47" width="10" height="11" rx="1" fill="rgba(255,220,140,0.7)" />
          <ellipse cx="43" cy="47" rx="5" ry="2" fill="rgba(255,200,120,0.6)" />
          <ellipse cx="58" cy="54" rx="8" ry="6" fill="rgba(180,228,255,0.5)" stroke="rgba(38,155,100,0.4)" strokeWidth="1" />
          <path d="M 54 53 Q 58 56 62 53" fill="none" stroke="rgba(255,140,100,0.65)" strokeWidth="1.5" />
          <rect x="6" y="68" width="26" height="26" rx="3" fill="rgba(180,240,220,0.25)" stroke="rgba(38,155,100,0.3)" strokeWidth="1" />
          <rect x="36" y="68" width="26" height="26" rx="3" fill="rgba(180,240,220,0.25)" stroke="rgba(38,155,100,0.3)" strokeWidth="1" />
          <line x1="14" y1="82" x2="22" y2="82" stroke="rgba(38,155,100,0.45)" strokeWidth="2" />
          <line x1="44" y1="82" x2="52" y2="82" stroke="rgba(38,155,100,0.45)" strokeWidth="2" />
          <circle cx="57" cy="68" r="4" fill="rgba(255,200,220,0.55)" />
          <circle cx="57" cy="64" r="2" fill="rgba(255,230,120,0.7)" />
        </svg>
      );

    case "center": // Fish Tank
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <rect x="18" y="80" width="10" height="16" rx="2" fill="rgba(100,180,240,0.35)" />
          <rect x="72" y="80" width="10" height="16" rx="2" fill="rgba(100,180,240,0.35)" />
          <rect x="10" y="74" width="80" height="8" rx="3" fill="rgba(100,180,240,0.38)" stroke="rgba(38,128,210,0.4)" strokeWidth="1.5" />
          <rect x="10" y="16" width="80" height="60" rx="6" fill="rgba(180,225,255,0.28)" stroke="rgba(38,128,210,0.5)" strokeWidth="2.5" />
          <rect x="10" y="11" width="80" height="7" rx="2" fill="rgba(100,180,240,0.35)" stroke="rgba(38,128,210,0.4)" strokeWidth="1.5" />
          <rect x="12" y="68" width="76" height="7" rx="2" fill="rgba(255,210,220,0.6)" />
          <circle cx="22" cy="70" r="2" fill="rgba(255,180,200,0.65)" />
          <circle cx="34" cy="70" r="2" fill="rgba(220,200,255,0.65)" />
          <circle cx="46" cy="70" r="2" fill="rgba(180,230,255,0.65)" />
          <circle cx="58" cy="70" r="2" fill="rgba(255,220,180,0.65)" />
          <circle cx="70" cy="70" r="2" fill="rgba(200,255,210,0.65)" />
          <circle cx="80" cy="70" r="2" fill="rgba(255,180,200,0.65)" />
          <path d="M 22 74 Q 17 62 22 50 Q 27 38 22 26" fill="none" stroke="rgba(140,220,180,0.65)" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 78 74 Q 83 63 78 53 Q 73 43 79 33" fill="none" stroke="rgba(140,220,180,0.58)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="28" cy="55" r="2.5" fill="none" stroke="rgba(180,220,255,0.75)" strokeWidth="1.2" />
          <circle cx="31" cy="44" r="1.8" fill="none" stroke="rgba(180,220,255,0.75)" strokeWidth="1.2" />
          <circle cx="72" cy="50" r="2"   fill="none" stroke="rgba(180,220,255,0.75)" strokeWidth="1.2" />
          <circle cx="74" cy="38" r="1.5" fill="none" stroke="rgba(180,220,255,0.75)" strokeWidth="1.2" />
          <ellipse cx="42" cy="46" rx="11" ry="6" fill="rgba(255,180,160,0.82)" />
          <polygon points="53,46 62,40 62,52" fill="rgba(255,180,160,0.82)" />
          <circle cx="36" cy="44" r="2" fill="rgba(80,40,40,0.6)" />
          <ellipse cx="62" cy="58" rx="10" ry="5.5" fill="rgba(200,180,255,0.82)" />
          <polygon points="52,58 43,53 43,63" fill="rgba(200,180,255,0.82)" />
          <circle cx="68" cy="57" r="1.8" fill="rgba(80,40,40,0.6)" />
          <ellipse cx="50" cy="30" rx="7" ry="4" fill="rgba(160,240,210,0.82)" />
          <polygon points="57,30 64,26 64,34" fill="rgba(160,240,210,0.82)" />
          <circle cx="45" cy="29" r="1.5" fill="rgba(80,40,40,0.6)" />
          <path d="M 12 22 Q 24 18 36 22 Q 48 26 60 22 Q 72 18 88 22" fill="none" stroke="rgba(200,235,255,0.55)" strokeWidth="1.5" />
        </svg>
      );

    case "right-mid": // Yarn Vault
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <rect x="6" y="6"  width="5" height="88" rx="1" fill="rgba(220,140,100,0.3)" />
          <rect x="89" y="6" width="5" height="88" rx="1" fill="rgba(220,140,100,0.3)" />
          <rect x="6" y="34" width="88" height="5" rx="1" fill="rgba(220,140,100,0.4)" />
          <rect x="6" y="62" width="88" height="5" rx="1" fill="rgba(220,140,100,0.4)" />
          <circle cx="22" cy="22" r="9" fill="rgba(255,160,180,0.75)" />
          <path d="M 14 22 Q 22 14 30 22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 22 14 Q 30 22 22 30" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <circle cx="40" cy="22" r="8"  fill="rgba(180,210,255,0.75)" />
          <path d="M 33 22 Q 40 15 47 22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 40 15 Q 47 22 40 29" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <circle cx="58" cy="22" r="9"  fill="rgba(180,255,220,0.75)" />
          <path d="M 50 22 Q 58 14 66 22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 58 14 Q 66 22 58 30" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <circle cx="76" cy="22" r="8"  fill="rgba(255,240,160,0.75)" />
          <path d="M 69 22 Q 76 15 83 22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 76 15 Q 83 22 76 29" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <circle cx="22" cy="50" r="8"  fill="rgba(220,180,255,0.75)" />
          <path d="M 15 50 Q 22 43 29 50" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 22 43 Q 29 50 22 57" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <circle cx="40" cy="50" r="9"  fill="rgba(255,200,160,0.75)" />
          <path d="M 32 50 Q 40 42 48 50" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 40 42 Q 48 50 40 58" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <circle cx="58" cy="50" r="8"  fill="rgba(160,235,240,0.75)" />
          <path d="M 51 50 Q 58 43 65 50" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 58 43 Q 65 50 58 57" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <circle cx="76" cy="50" r="9"  fill="rgba(255,160,180,0.75)" />
          <path d="M 68 50 Q 76 42 84 50" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 76 42 Q 84 50 76 58" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 14 78 Q 26 70 40 77 Q 54 84 68 73 Q 80 65 88 72" fill="none" stroke="rgba(255,160,180,0.52)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 14 88 Q 32 81 50 90 Q 66 86 84 80"                fill="none" stroke="rgba(180,210,255,0.45)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="20" cy="75" r="6" fill="rgba(180,255,220,0.7)" />
          <path d="M 15 75 Q 20 70 25 75" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 20 70 Q 25 75 20 80" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M 26 75 Q 44 69 62 78 Q 76 84 88 80" fill="none" stroke="rgba(180,255,220,0.5)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "bottom-left": // Litter Kingdom
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <polygon points="30,34 36,20 43,32 50,16 57,32 64,20 70,34" fill="rgba(255,230,130,0.68)" stroke="rgba(200,160,30,0.5)" strokeWidth="1.5" />
          <rect x="30" y="32" width="40" height="7" rx="1" fill="rgba(255,230,130,0.58)" />
          <circle cx="37" cy="35" r="2.5" fill="rgba(255,160,180,0.85)" />
          <circle cx="50" cy="35" r="2.5" fill="rgba(180,210,255,0.85)" />
          <circle cx="63" cy="35" r="2.5" fill="rgba(180,255,200,0.85)" />
          <rect x="10" y="39" width="58" height="44" rx="5" fill="rgba(200,230,200,0.5)" stroke="rgba(48,158,68,0.4)" strokeWidth="2" />
          <circle cx="20" cy="53" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="30" cy="57" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="42" cy="51" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="52" cy="56" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="24" cy="66" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="36" cy="69" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="48" cy="64" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="58" cy="68" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="20" cy="76" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="38" cy="78" r="2" fill="rgba(180,220,180,0.6)" />
          <circle cx="54" cy="74" r="2" fill="rgba(180,220,180,0.6)" />
          <rect x="72" y="54" width="16" height="9" rx="2" fill="rgba(48,158,68,0.35)" stroke="rgba(48,158,68,0.42)" strokeWidth="1" />
          <rect x="77" y="44" width="5" height="14" rx="2" fill="rgba(48,158,68,0.35)" />
          <ellipse cx="16" cy="90" rx="4" ry="3" fill="rgba(48,158,68,0.28)" />
          <circle cx="12" cy="86" r="2" fill="rgba(48,158,68,0.28)" />
          <circle cx="16" cy="85" r="2" fill="rgba(48,158,68,0.28)" />
          <circle cx="20" cy="86" r="2" fill="rgba(48,158,68,0.28)" />
          <ellipse cx="30" cy="94" rx="4" ry="3" fill="rgba(48,158,68,0.28)" />
          <circle cx="26" cy="90" r="2" fill="rgba(48,158,68,0.28)" />
          <circle cx="30" cy="89" r="2" fill="rgba(48,158,68,0.28)" />
          <circle cx="34" cy="90" r="2" fill="rgba(48,158,68,0.28)" />
          <rect x="80" y="16" width="12" height="22" rx="3" fill="rgba(200,240,210,0.5)" stroke="rgba(48,158,68,0.4)" strokeWidth="1" />
          <circle cx="86" cy="12" r="5" fill="rgba(255,200,220,0.6)" />
          <circle cx="86" cy="12" r="2" fill="rgba(255,240,150,0.8)" />
        </svg>
      );

    case "bottom-mid": // Basement Box Fort
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <rect x="6" y="70" width="38" height="24" rx="2" fill="rgba(230,220,255,0.55)" stroke="rgba(160,140,240,0.5)" strokeWidth="1.5" />
          <line x1="6" y1="82" x2="44" y2="82" stroke="rgba(160,140,240,0.32)" strokeWidth="1" />
          <line x1="25" y1="70" x2="25" y2="94" stroke="rgba(160,140,240,0.32)" strokeWidth="1" />
          <rect x="52" y="72" width="42" height="22" rx="2" fill="rgba(230,220,255,0.55)" stroke="rgba(160,140,240,0.5)" strokeWidth="1.5" />
          <line x1="52" y1="83" x2="94" y2="83" stroke="rgba(160,140,240,0.32)" strokeWidth="1" />
          <line x1="73" y1="72" x2="73" y2="94" stroke="rgba(160,140,240,0.32)" strokeWidth="1" />
          <rect x="10" y="44" width="34" height="28" rx="2" fill="rgba(220,210,255,0.55)" stroke="rgba(160,140,240,0.5)" strokeWidth="1.5" />
          <line x1="10" y1="58" x2="44" y2="58" stroke="rgba(160,140,240,0.32)" strokeWidth="1" />
          <line x1="27" y1="44" x2="27" y2="72" stroke="rgba(160,140,240,0.32)" strokeWidth="1" />
          <rect x="52" y="46" width="38" height="26" rx="2" fill="rgba(220,210,255,0.55)" stroke="rgba(160,140,240,0.5)" strokeWidth="1.5" />
          <line x1="52" y1="59" x2="90" y2="59" stroke="rgba(160,140,240,0.32)" strokeWidth="1" />
          <text x="57" y="58" fontSize="10" fill="rgba(255,160,200,0.7)">♡</text>
          <ellipse cx="44" cy="60" rx="5" ry="4" fill="rgba(130,100,220,0.52)" />
          <line x1="40" y1="57" x2="38" y2="54" stroke="rgba(130,100,220,0.42)" strokeWidth="1.5" />
          <line x1="44" y1="56" x2="44" y2="53" stroke="rgba(130,100,220,0.42)" strokeWidth="1.5" />
          <line x1="48" y1="57" x2="50" y2="54" stroke="rgba(130,100,220,0.42)" strokeWidth="1.5" />
          <rect x="20" y="14" width="60" height="32" rx="2" fill="rgba(210,200,255,0.55)" stroke="rgba(160,140,240,0.5)" strokeWidth="1.5" />
          <line x1="20" y1="30" x2="80" y2="30" stroke="rgba(160,140,240,0.28)" strokeWidth="1" />
          <line x1="50" y1="14" x2="50" y2="46" stroke="rgba(160,140,240,0.28)" strokeWidth="1" />
          <polygon points="20,14 50,14 50,8 20,8" fill="rgba(210,200,255,0.38)" stroke="rgba(160,140,240,0.42)" strokeWidth="1" />
          <polygon points="34,14 31,7 37,10" fill="rgba(110,80,200,0.62)" />
          <polygon points="43,14 40,7 46,10" fill="rgba(110,80,200,0.62)" />
          <circle cx="35" cy="16" r="2.5" fill="rgba(255,240,200,0.98)" />
          <circle cx="43" cy="16" r="2.5" fill="rgba(255,240,200,0.98)" />
        </svg>
      );

    case "bottom-right": // Nap Chamber
      return (
        <svg viewBox="0 0 100 100" style={s} preserveAspectRatio="xMidYMid meet">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke={ws} strokeWidth="5" />
          <rect x="72" y="22" width="22" height="26" rx="2" fill="rgba(255,240,180,0.38)" stroke="rgba(188,158,22,0.42)" strokeWidth="1.5" />
          <line x1="72" y1="35" x2="94" y2="35" stroke="rgba(188,158,22,0.28)" strokeWidth="1" />
          <line x1="79" y1="28" x2="79" y2="33" stroke="rgba(188,158,22,0.42)" strokeWidth="1.5" />
          <line x1="79" y1="39" x2="79" y2="44" stroke="rgba(188,158,22,0.42)" strokeWidth="1.5" />
          <rect x="79" y="14" width="6" height="10" rx="1" fill="rgba(200,160,80,0.42)" />
          <polygon points="75,14 93,14 90,8 78,8" fill="rgba(255,210,230,0.62)" stroke="rgba(220,160,180,0.45)" strokeWidth="1" />
          <ellipse cx="82" cy="14" rx="8" ry="2.5" fill="rgba(255,200,220,0.45)" />
          <ellipse cx="82" cy="20" rx="14" ry="6" fill="rgba(255,240,200,0.15)" />
          <rect x="6" y="28" width="62" height="64" rx="5" fill="rgba(255,245,200,0.22)" stroke="rgba(188,158,22,0.38)" strokeWidth="2" />
          <rect x="6" y="18" width="62" height="14" rx="5" fill="rgba(255,235,180,0.38)" stroke="rgba(178,138,15,0.42)" strokeWidth="2" />
          <circle cx="37" cy="25" r="5" fill="rgba(255,180,210,0.5)" />
          <circle cx="37" cy="25" r="2.5" fill="rgba(255,240,160,0.75)" />
          <rect x="10" y="32" width="26" height="22" rx="8" fill="rgba(255,240,240,0.82)" stroke="rgba(220,180,200,0.42)" strokeWidth="1.5" />
          <path d="M 14 40 Q 23 36 32 40" fill="none" stroke="rgba(220,180,200,0.32)" strokeWidth="1" />
          <rect x="10" y="52" width="56" height="36" rx="4" fill="rgba(255,210,230,0.48)" stroke="rgba(220,160,190,0.42)" strokeWidth="1.5" />
          <path d="M 10 62 Q 26 56 44 62 Q 62 68 66 60" fill="none" stroke="rgba(220,160,190,0.32)" strokeWidth="1" />
          <path d="M 10 72 Q 28 66 48 72 Q 60 76 66 70" fill="none" stroke="rgba(220,160,190,0.32)" strokeWidth="1" />
          <ellipse cx="50" cy="46" rx="14" ry="8" fill="rgba(200,170,240,0.58)" />
          <circle cx="62" cy="40" r="7" fill="rgba(200,170,240,0.58)" />
          <polygon points="58,35 56,28 62,32" fill="rgba(200,170,240,0.58)" />
          <polygon points="66,35 69,28 62,32" fill="rgba(200,170,240,0.58)" />
          <path d="M 58 39 Q 60 37 62 39" fill="none" stroke="rgba(120,80,180,0.7)" strokeWidth="1.5" />
          <path d="M 62 39 Q 64 37 66 39" fill="none" stroke="rgba(120,80,180,0.7)" strokeWidth="1.5" />
          <path d="M 36 50 Q 30 60 36 68 Q 42 76 36 82" fill="none" stroke="rgba(200,170,240,0.58)" strokeWidth="3" strokeLinecap="round" />
          <text x="74" y="44" fontSize="9"  fill="rgba(180,140,230,0.55)" fontWeight="bold">z</text>
          <text x="80" y="36" fontSize="11" fill="rgba(180,140,230,0.42)" fontWeight="bold">z</text>
          <text x="70" y="27" fontSize="13" fill="rgba(180,140,230,0.3)"  fontWeight="bold">z</text>
          <text x="26" y="20" fontSize="9" fill="rgba(255,160,200,0.5)">♡</text>
        </svg>
      );

    default:
      return null;
  }
}

const PLAYER_START_OFFSETS = [
  { row: 0, col: -1 }, 
  { row: 0, col:  1 },  
  { row: -1, col: 0 },  
  { row:  1, col: 0 },  
];

function getPlayerStart(playerIndex: number) {
  const offset = PLAYER_START_OFFSETS[playerIndex] ?? { row: 0, col: 0 };
  return { row: AVATAR_START.row + offset.row, col: AVATAR_START.col + offset.col };
}

type BoardViewProps = {
  clueRoomNames?: string[];
  isMyTurn?: boolean;
  roomsCollected?: string[];
  onRoomClick?: (roomName: string) => void;
  showAvatar?: boolean;
  mySocketId?: string;
  otherPlayers?: Record<string, { row: number; col: number }>;
  onMove?: (row: number, col: number) => void;
  myDetectiveImage?: string;
  otherPlayerImages?: Record<string, string>;
  myPlayerIndex?: number;
};

export default function BoardView({
  clueRoomNames = [],
  isMyTurn = false,
  roomsCollected = [],
  onRoomClick,
  showAvatar = false,
  mySocketId,
  otherPlayers = {},
  onMove,
  myDetectiveImage,
  otherPlayerImages = {},
  myPlayerIndex = 0,
}: BoardViewProps) {
  const playerStart = getPlayerStart(myPlayerIndex);
  const [avatarPos, setAvatarPos] = useState(playerStart);

  const avatarPosRef = useRef(playerStart);
  const onMoveRef = useRef(onMove);
  const onRoomClickRef = useRef(onRoomClick);
  const clueRoomNamesRef = useRef(clueRoomNames);
  const isMyTurnRef = useRef(isMyTurn);
  const roomsCollectedRef = useRef(roomsCollected);
  onMoveRef.current = onMove;
  onRoomClickRef.current = onRoomClick;
  clueRoomNamesRef.current = clueRoomNames;
  isMyTurnRef.current = isMyTurn;
  roomsCollectedRef.current = roomsCollected;

  useEffect(() => {
    if (!showAvatar) return;
    onMoveRef.current?.(playerStart.row, playerStart.col);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!ARROW_KEYS.includes(e.key)) return;
      if (!isMyTurnRef.current) return;
      e.preventDefault();

      const prev = avatarPosRef.current;
      const inRoom = getRoomAt(prev.row, prev.col);
      let tr = prev.row, tc = prev.col;

      if (inRoom) {
        if (e.key === "ArrowUp")    { tr = inRoom.r1 - 1; tc = prev.col; }
        if (e.key === "ArrowDown")  { tr = inRoom.r2 + 1; tc = prev.col; }
        if (e.key === "ArrowLeft")  { tr = prev.row; tc = inRoom.c1 - 1; }
        if (e.key === "ArrowRight") { tr = prev.row; tc = inRoom.c2 + 1; }
      } else {
        if (e.key === "ArrowUp")    tr = prev.row - 1;
        if (e.key === "ArrowDown")  tr = prev.row + 1;
        if (e.key === "ArrowLeft")  tc = prev.col - 1;
        if (e.key === "ArrowRight") tc = prev.col + 1;
      }

      if (tr < 0 || tr >= GRID_SIZE || tc < 0 || tc >= GRID_SIZE) return;

      const targetRoom = getRoomAt(tr, tc);
      const next = targetRoom ? roomCenter(targetRoom) : { row: tr, col: tc };

      avatarPosRef.current = next;
      setAvatarPos(next);
      onMoveRef.current?.(next.row, next.col);

      if (
        targetRoom &&
        isMyTurnRef.current &&
        clueRoomNamesRef.current.includes(targetRoom.name) &&
        !roomsCollectedRef.current.includes(targetRoom.name) &&
        onRoomClickRef.current
      ) {
        setTimeout(() => onRoomClickRef.current?.(targetRoom.name), 120);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAvatar]);

  const size = GRID_SIZE;
  const total = size * size;

  function roomCenterPercent(room: RectRoom) {
    const centerRow = (room.r1 + room.r2 + 1) / 2;
    const centerCol = (room.c1 + room.c2 + 1) / 2;
    return {
      top:  `${(centerRow / size) * 100}%`,
      left: `${(centerCol / size) * 100}%`,
    };
  }

  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    height: "100%",
    width: "auto",
    maxWidth: "100%",
    aspectRatio: "1 / 1",
    margin: "0 auto",
  };

  const avatarTilePct = (1.5 / GRID_SIZE) * 100;

  return (
    <>
      <div style={wrapperStyle}>
        <div
          style={{
            ...styles.grid,
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows:    `repeat(${size}, 1fr)`,
          }}
        >
          {/* Tiles */}
          {Array.from({ length: total }).map((_, i) => {
            const row  = Math.floor(i / size);
            const col  = i % size;
            const room = getRoomAt(row, col);
            const isRoom = room !== null;
            return (
              <div
                key={i}
                style={{
                  ...styles.cell,
                  background: isRoom
                    ? room!.color
                    : (row + col) % 2 === 0 ? "#fde4f0" : "#fff5f9",
                  border: isRoom ? "none" : "0.5px solid #f0c0d8",
                }}
              />
            );
          })}

          {/* Decoration layer */}
          <div style={styles.decorationLayer}>
            {ROOMS.map((room) => {
              const top    = (room.r1 / size) * 100;
              const left   = (room.c1 / size) * 100;
              const width  = ((room.c2 - room.c1 + 1) / size) * 100;
              const height = ((room.r2 - room.r1 + 1) / size) * 100;
              return (
                <div
                  key={`deco-${room.name}`}
                  style={{ position: "absolute", top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%`, overflow: "hidden", pointerEvents: "none" }}
                >
                  <RoomDecoration name={room.name} />
                </div>
              );
            })}
          </div>

          {/* Labels layer */}
          <div style={styles.labelsLayer}>
            {ROOMS.map((room) => {
              const label = ROOM_LABELS[room.name] ?? room.name;
              const pos   = roomCenterPercent(room);
              return (
                <div key={`label-${room.name}`} style={{ ...styles.labelPill, ...pos }}>
                  {label}
                </div>
              );
            })}
          </div>


          {/* Suspects layer — static images spread across rooms */}
          <div style={{ position: "absolute", inset: 0, zIndex: 15, pointerEvents: "none" }}>
            {SUSPECT_ROOMS.map(({ id, roomName, rowFrac, colFrac }) => {
              const room = ROOMS.find((r) => r.name === roomName);
              if (!room) return null;
              const img = CAT_IMAGES[id];
              if (!img) return null;
              const row = room.r1 + (room.r2 - room.r1) * rowFrac;
              const col = room.c1 + (room.c2 - room.c1) * colFrac;
              return (
                <img
                  key={id}
                  src={img}
                  alt={id}
                  style={{
                    position: "absolute",
                    top:  `${((row + 0.5) / size) * 100}%`,
                    left: `${((col + 0.5) / size) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width:  `${avatarTilePct}%`,
                    height: `${avatarTilePct}%`,
                    objectFit: "contain",
                    filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.45))",
                  }}
                />
              );
            })}
          </div>

          {/* Avatar layer */}
          {showAvatar && (
            <div style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none" }}>
              {/* Own avatar — raw cat image */}
              <div
                style={{
                  position: "absolute",
                  top:  `${((avatarPos.row + 0.5) / GRID_SIZE) * 100}%`,
                  left: `${((avatarPos.col + 0.5) / GRID_SIZE) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width:  `${avatarTilePct}%`,
                  height: `${avatarTilePct}%`,
                  transition: "top 0.1s ease, left 0.1s ease",
                }}
              >
                {myDetectiveImage ? (
                  <img
                    src={myDetectiveImage}
                    alt="your avatar"
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block",
                      filter: "drop-shadow(0 2px 5px rgba(170,51,106,0.9))",
                    }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "#AA336A", borderRadius: "50%" }} />
                )}
              </div>

              {/* Other players — raw cat image */}
              {Object.entries(otherPlayers)
                .filter(([id]) => id !== mySocketId)
                .map(([id, pos], idx) => {
                  const img = otherPlayerImages[id];
                  const color = PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? "#2ecc71";
                  return (
                    <div
                      key={id}
                      style={{
                        position: "absolute",
                        top:  `${((pos.row + 0.5) / GRID_SIZE) * 100}%`,
                        left: `${((pos.col + 0.5) / GRID_SIZE) * 100}%`,
                        transform: "translate(-50%, -50%)",
                        width:  `${avatarTilePct}%`,
                        height: `${avatarTilePct}%`,
                        transition: "top 0.15s ease, left 0.15s ease",
                      }}
                    >
                      {img ? (
                        <img
                          src={img}
                          alt="player avatar"
                          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block",
                            filter: `drop-shadow(0 2px 5px ${color})`,
                          }}
                        />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: color, borderRadius: "50%" }} />
                      )}
                    </div>
                  );
                })}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    width: "100%",
    height: "100%",
    display: "grid",
    border: "3px solid #d488a8",
    position: "relative",
  },
  cell: {},
  decorationLayer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 3,
  },
  labelsLayer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 10,
  },
  labelPill: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.94)",
    border: "1px solid #e0a8c0",
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
    color: "#7a3050",
  },
};
