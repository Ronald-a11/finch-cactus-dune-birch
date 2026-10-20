import { cleanName } from "./codes.ts";
import { applyMove, freshGame, judge, type Cell, type GameCore, type Mark } from "./rules.ts";

/** Empty seats are released so a fresh pair can sit. In-progress games keep both seats. */
export const EMPTY_SEAT_TTL_MS = 20_000;
/** Presence writes are coalesced; the UI treats anything older than this as away. */
export const SEEN_WRITE_MS = 2_000;
export const OPPONENT_AWAY_MS = 10_000;

export interface RoomState extends GameCore {
  seq: number;
  rev: number;
  seats: { X: string | null; O: string | null };
  names: { X: string; O: string };
  seen: { X: number; O: number };
  tokens: { X: string | null; O: string | null };
}

/** What the browser is allowed to see. Seat secrets stay on the server. */
export interface PublicRoom extends GameCore {
  seq: number;
  seats: { X: string | null; O: string | null };
  names: { X: string; O: string };
}

export type RoomAction =
  | { type: "move"; index: number; seq: number }
  | { type: "rematch" };

export interface ReduceInput {
  peer: string;
  name: string | null;
  token: string;
  now: number;
  action?: RoomAction;
}

export interface ReduceResult {
  state: RoomState;
  accepted: boolean;
  seatToken: string | null;
  write: boolean;
}

const PEER = /^[A-Za-z0-9_-]{1,64}$/;

export function mintToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** A token the client already stored, or null if it isn't safe to keep. */
export function acceptToken(token: string | null | undefined): string | null {
  if (!token || !/^[A-Za-z0-9_-]{16,80}$/.test(token)) return null;
  return token;
}

function clone(state: RoomState): RoomState {
  return {
    ...state,
    board: state.board.slice(),
    line: state.line ? [...state.line] : null,
    seats: { ...state.seats },
    names: { ...state.names },
    seen: { ...state.seen },
    tokens: { ...state.tokens },
  };
}

export function seatOf(state: Pick<RoomState, "seats">, peer: string): Mark | null {
  if (state.seats.X === peer) return "X";
  if (state.seats.O === peer) return "O";
  return null;
}

export function freshRoom(peer: string, name: string, now: number, token?: string | null): RoomState {
  return {
    ...freshGame(),
    seq: 1,
    rev: 1,
    seats: { X: peer, O: null },
    names: { X: cleanName(name), O: "" },
    seen: { X: now, O: 0 },
    tokens: { X: acceptToken(token) ?? mintToken(), O: null },
  };
}

function expireIdleSeats(state: RoomState, now: number): RoomState {
  if (state.board.some(Boolean) || state.status !== "playing") return state;
  let next = state;
  for (const mark of ["X", "O"] as const) {
    if (!next.seats[mark]) continue;
    if (now - next.seen[mark] < EMPTY_SEAT_TTL_MS) continue;
    next = {
      ...next,
      seats: { ...next.seats, [mark]: null },
      names: { ...next.names, [mark]: "" },
      seen: { ...next.seen, [mark]: 0 },
      tokens: { ...next.tokens, [mark]: null },
    };
  }
  return next;
}

function claimSeat(
  state: RoomState,
  peer: string,
  name: string,
  now: number,
  token: string,
): { state: RoomState; issued: boolean } {
  const open: Mark | null = !state.seats.X ? "X" : !state.seats.O ? "O" : null;
  if (!open) return { state, issued: false };
  const issuedToken = acceptToken(token) ?? mintToken();
  return {
    issued: true,
    state: {
      ...state,
      seats: { ...state.seats, [open]: peer },
      names: { ...state.names, [open]: name },
      seen: { ...state.seen, [open]: now },
      tokens: { ...state.tokens, [open]: issuedToken },
    },
  };
}

function sameCore(a: RoomState, b: RoomState): boolean {
  if (a.seq !== b.seq || a.turn !== b.turn || a.status !== b.status) return false;
  if (a.winner !== b.winner || a.last !== b.last) return false;
  if (a.board.some((cell, index) => cell !== b.board[index])) return false;
  if ((a.line ?? []).join() !== (b.line ?? []).join()) return false;
  if (a.seats.X !== b.seats.X || a.seats.O !== b.seats.O) return false;
  if (a.names.X !== b.names.X || a.names.O !== b.names.O) return false;
  if (a.tokens.X !== b.tokens.X || a.tokens.O !== b.tokens.O) return false;
  return true;
}

function finish(
  prev: RoomState,
  next: RoomState,
  peer: string,
  presented: string,
  accepted: boolean,
  issued: boolean,
): ReduceResult {
  const mine = seatOf(next, peer);
  const tokenOk = Boolean(mine && presented && next.tokens[mine] === presented);
  const seatToken = mine && (issued || tokenOk) ? next.tokens[mine] : null;
  if (sameCore(prev, next)) {
    const stale =
      Math.abs(next.seen.X - prev.seen.X) >= SEEN_WRITE_MS ||
      Math.abs(next.seen.O - prev.seen.O) >= SEEN_WRITE_MS;
    if (!stale) return { state: prev, accepted, seatToken, write: false };
  }
  return { state: { ...next, rev: prev.rev + 1 }, accepted, seatToken, write: true };
}

/**
 * One room step: presence, seat claim, and at most one move or rematch.
 * The caller retries this against a fresh read when the compare-and-swap misses.
 */
export function reduce(prev: RoomState, input: ReduceInput): ReduceResult {
  const name = input.name === null ? null : cleanName(input.name);
  let next = expireIdleSeats(clone(prev), input.now);
  let issued = false;
  const seated = seatOf(next, input.peer);

  if (seated) {
    const tokenOk = input.token !== "" && next.tokens[seated] === input.token;
    if (!tokenOk) {
      return finish(prev, next, input.peer, input.token, !input.action, false);
    }
    next = {
      ...next,
      names: name ? { ...next.names, [seated]: name } : next.names,
      seen: { ...next.seen, [seated]: input.now },
    };
  } else {
    const claimed = claimSeat(next, input.peer, name ?? "Guest", input.now, input.token);
    next = claimed.state;
    issued = claimed.issued;
  }

  if (input.action?.type === "move") {
    const mine = seatOf(next, input.peer);
    const tokenOk = Boolean(mine && input.token && next.tokens[mine] === input.token);
    const both = Boolean(next.seats.X && next.seats.O);
    const turnOk = Boolean(mine && next.seats[next.turn] === input.peer);
    if (!tokenOk || !both || !turnOk || input.action.seq !== next.seq) {
      return finish(prev, next, input.peer, input.token, false, issued);
    }
    const moved = applyMove(next, input.action.index);
    if (!moved) return finish(prev, next, input.peer, input.token, false, issued);
    next = { ...next, ...moved, seq: next.seq + 1 };
    return finish(prev, next, input.peer, input.token, true, issued);
  }

  if (input.action?.type === "rematch") {
    const mine = seatOf(next, input.peer);
    if (!mine || next.status === "playing") {
      return finish(prev, next, input.peer, input.token, false, issued);
    }
    next = { ...next, ...freshGame(), seq: next.seq + 1 };
    return finish(prev, next, input.peer, input.token, true, issued);
  }

  return finish(prev, next, input.peer, input.token, true, issued);
}

export function opponentIdle(state: Pick<RoomState, "seats" | "seen">, peer: string, now: number): number | null {
  const mine = seatOf(state, peer);
  if (!mine) return null;
  const other: Mark = mine === "X" ? "O" : "X";
  if (!state.seats[other]) return null;
  return Math.max(0, now - state.seen[other]);
}

export function publicView(state: RoomState): PublicRoom {
  return {
    board: state.board.slice(),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    line: state.line ? [...state.line] : null,
    last: state.last,
    seq: state.seq,
    seats: { ...state.seats },
    names: { X: state.names.X, O: state.names.O },
  };
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function readBoard(raw: unknown): Cell[] | null {
  if (!Array.isArray(raw) || raw.length !== 9) return null;
  const board: Cell[] = raw.map((cell) => (cell === "X" || cell === "O" ? cell : null));
  const xs = board.filter((cell) => cell === "X").length;
  const os = board.filter((cell) => cell === "O").length;
  if (xs < os || xs > os + 1) return null;
  return board;
}

function readSeats(raw: unknown): { X: string | null; O: string | null } | null {
  const seats = asRecord(raw);
  if (!seats) return null;
  const read = (value: unknown) => (typeof value === "string" && PEER.test(value) ? value : null);
  return { X: read(seats.X), O: read(seats.O) };
}

function readNames(raw: unknown): { X: string; O: string } {
  const names = asRecord(raw);
  const read = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return "";
    return cleanName(value);
  };
  return { X: read(names?.X), O: read(names?.O) };
}

function coreFromBoard(board: Cell[], seq: number, last: number | null, seats: PublicRoom["seats"], names: PublicRoom["names"]): PublicRoom {
  const judged = judge(board);
  const xs = board.filter((cell) => cell === "X").length;
  const os = board.filter((cell) => cell === "O").length;
  const side: Mark = xs === os ? "X" : "O";
  return {
    board,
    ...judged,
    turn: judged.status === "playing" ? side : xs === os ? "O" : "X",
    last,
    seq,
    seats,
    names,
  };
}

export function readPublicRoom(raw: unknown): PublicRoom | null {
  const source = asRecord(raw);
  if (!source) return null;
  const board = readBoard(source.board);
  const seats = readSeats(source.seats);
  if (!board || !seats) return null;
  const names = readNames(source.names);
  if (!seats.X) names.X = "";
  if (!seats.O) names.O = "";
  const seq = typeof source.seq === "number" && Number.isInteger(source.seq) && source.seq >= 0 ? source.seq : 0;
  const last =
    typeof source.last === "number" && source.last >= 0 && source.last <= 8 && board[source.last]
      ? source.last
      : null;
  return coreFromBoard(board, seq, last, seats, names);
}

export function parseRoom(raw: unknown): RoomState | null {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const source = asRecord(value);
  const pub = readPublicRoom(value);
  if (!source || !pub) return null;
  const rev = typeof source.rev === "number" && Number.isInteger(source.rev) ? source.rev : Number.NaN;
  if (!Number.isInteger(rev) || rev < 1) return null;
  const seenRaw = asRecord(source.seen);
  const tokensRaw = asRecord(source.tokens);
  if (!seenRaw || !tokensRaw) return null;
  const seenAt = (mark: Mark) =>
    typeof seenRaw[mark] === "number" && Number.isFinite(seenRaw[mark]) ? Math.max(0, seenRaw[mark]) : 0;
  const tokenAt = (mark: Mark) =>
    typeof tokensRaw[mark] === "string" && tokensRaw[mark].length >= 8 ? tokensRaw[mark] : null;
  if (pub.seats.X && !tokenAt("X")) return null;
  if (pub.seats.O && !tokenAt("O")) return null;
  return {
    ...pub,
    rev,
    seen: { X: seenAt("X"), O: seenAt("O") },
    tokens: { X: pub.seats.X ? tokenAt("X") : null, O: pub.seats.O ? tokenAt("O") : null },
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
