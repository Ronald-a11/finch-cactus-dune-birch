export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Status = "playing" | "win" | "draw";
export type Difficulty = "easy" | "fair" | "sharp";

export interface GameCore {
  board: Cell[];
  turn: Mark;
  status: Status;
  winner: Mark | null;
  line: number[] | null;
  last: number | null;
}

const LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function freshGame(): GameCore {
  return {
    board: Array.from({ length: 9 }, () => null),
    turn: "X",
    status: "playing",
    winner: null,
    line: null,
    last: null,
  };
}

export function judge(board: Cell[]): Pick<GameCore, "status" | "winner" | "line"> {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) {
      return { status: "win", winner: v, line: [a!, b!, c!] };
    }
  }
  if (board.every(Boolean)) return { status: "draw", winner: null, line: null };
  return { status: "playing", winner: null, line: null };
}

export function applyMove(game: GameCore, index: number): GameCore | null {
  if (game.status !== "playing") return null;
  if (!Number.isInteger(index) || index < 0 || index > 8) return null;
  if (game.board[index]) return null;
  const board = game.board.slice();
  board[index] = game.turn;
  const judged = judge(board);
  return {
    board,
    turn: judged.status === "playing" ? (game.turn === "X" ? "O" : "X") : game.turn,
    last: index,
    ...judged,
  };
}

export function legalMoves(game: GameCore): number[] {
  if (game.status !== "playing") return [];
  const moves: number[] = [];
  for (let i = 0; i < 9; i += 1) if (!game.board[i]) moves.push(i);
  return moves;
}

function minimax(board: Cell[], turn: Mark, depth: number): number {
  const judged = judge(board);
  if (judged.status === "win") {
    return judged.winner === "X" ? 10 - depth : depth - 10;
  }
  if (judged.status === "draw") return 0;
  let best = turn === "X" ? -Infinity : Infinity;
  for (let i = 0; i < 9; i += 1) {
    if (board[i]) continue;
    board[i] = turn;
    const score = minimax(board, turn === "X" ? "O" : "X", depth + 1);
    board[i] = null;
    best = turn === "X" ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

/** Perfect move for the side about to play. Null if the game is over. */
export function bestMove(game: GameCore): number | null {
  if (game.status !== "playing") return null;
  const maximizing = game.turn === "X";
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestIndex: number | null = null;
  for (let i = 0; i < 9; i += 1) {
    if (game.board[i]) continue;
    const board = game.board.slice();
    board[i] = game.turn;
    const score = minimax(board, game.turn === "X" ? "O" : "X", 1);
    const better = maximizing ? score > bestScore : score < bestScore;
    if (bestIndex === null || better) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function chooseMove(
  game: GameCore,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): number | null {
  const legal = legalMoves(game);
  if (legal.length === 0) return null;
  const winning = legal.find((index) => applyMove(game, index)?.status === "win");
  if (winning !== undefined && difficulty !== "easy") return winning;
  if (winning !== undefined && rng() < 0.55) return winning;
  const perfect = bestMove(game) ?? legal[0]!;
  if (difficulty === "sharp") return perfect;
  const chance = difficulty === "fair" ? 0.8 : 0.28;
  if (rng() < chance) return perfect;
  return legal[Math.floor(rng() * legal.length) % legal.length]!;
}
