import cat01 from '../assets/cat01.png';
import cat02 from '../assets/cat02.png';
import cat03 from '../assets/cat03.png';
import cat04 from '../assets/cat04.png';
import cat05 from '../assets/cat05.png';
import cat06 from '../assets/cat06.png';
import cat07 from '../assets/cat07.png';
import cat08 from '../assets/cat08.png';
import cat09 from '../assets/cat09.png';
import cat10 from '../assets/cat10.png';
import cat11 from '../assets/cat11.png';
import cat12 from '../assets/cat12.png';

export const CAT_DISPLAY_NAMES: Record<string, string> = {
  whiskers: "Mr. Whiskers",
  shadow: "Shadow",
  mittens: "Mittens",
  tiger: "Garfield",
  luna: "Luna",
  oliver: "Duchess",
};

export const CAT_AVATAR_COLORS: Record<string, string> = {
  whiskers: "#ea580c",
  shadow: "#2563eb",
  mittens: "#1f2937",
  tiger: "#eab308",
  luna: "#7c3aed",
  oliver: "#db2777",
};

export function getCatDisplayName(id: string): string {
  return CAT_DISPLAY_NAMES[id] ?? id;
}

export function getCatAvatarColor(id: string): string {
  return CAT_AVATAR_COLORS[id] ?? "#6b7280";
}

export function getCatInitial(id: string): string {
  const name = getCatDisplayName(id);
  return name.charAt(0).toUpperCase();
}

export const CAT_IMAGES: Record<string, string> = {
  whiskers: cat02,
  shadow:   cat01,
  mittens:  cat05,
  tiger:    cat06,
  luna:     cat11,
  oliver:   cat12,
};

export function getCatImage(id: string): string | undefined {
  return CAT_IMAGES[id];
}

export type DetectiveCharacter = {
  id: string;
  name: string;
  title: string;
  image: string;
};

export const DETECTIVE_CHARACTERS: DetectiveCharacter[] = [
  { id: 'detective_paws',   name: 'Detective Paws',      title: 'The Cunning Sleuth',   image: cat03 },
  { id: 'agent_fluff',      name: 'Agent Fluffington',   title: 'The Undercover Spy',   image: cat04 },
  { id: 'inspector_meowls', name: 'Inspector Meowls',    title: 'The Veteran Investigator', image: cat07 },
  { id: 'sergeant_claws',   name: 'Sergeant Claws',      title: 'The Fearless Officer', image: cat08 },
  { id: 'detective_biscuit',name: 'Detective Biscuit',   title: 'The Brilliant Analyst',image: cat09 },
  { id: 'officer_patches',  name: 'Officer Patches',     title: 'The Master of Disguise', image: cat10 },
];
