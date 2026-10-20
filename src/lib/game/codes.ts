const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isCode(value: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(value);
}

export const CALLSIGNS = [
  "Lark",
  "Pebble",
  "Juniper",
  "Moss",
  "Quill",
  "Harbor",
  "Cinder",
  "Wren",
  "Maple",
  "Flint",
] as const;

export function randomCallsign(): string {
  return CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)] ?? "Lark";
}

export function cleanName(raw: string): string {
  const trimmed = raw
    .replace(/[^A-Za-z0-9 .'-]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 18);
  return trimmed || "Guest";
}
