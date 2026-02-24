// Backend cat IDs; display names and avatar colors for UI
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
