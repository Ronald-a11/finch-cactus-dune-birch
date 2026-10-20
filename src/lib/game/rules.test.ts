import assert from "node:assert/strict";
import test from "node:test";
import { applyMove, bestMove, freshGame, type Cell, type GameCore } from "./rules.ts";

function board(cells: string): GameCore {
  const parsed = cells
    .replace(/\s/g, "")
    .split("")
    .map((c) => (c === "X" || c === "O" ? c : null)) as Cell[];
  assert.equal(parsed.length, 9);
  const xs = parsed.filter((c) => c === "X").length;
  const os = parsed.filter((c) => c === "O").length;
  return { ...freshGame(), board: parsed, turn: xs === os ? "X" : "O" };
}

test("X wins a row and further moves are refused", () => {
  const game = applyMove(board("XX.OO...."), 2)!;
  assert.equal(game.status, "win");
  assert.equal(game.winner, "X");
  assert.deepEqual(game.line, [0, 1, 2]);
  assert.equal(applyMove(game, 5), null);
});

test("O wins a column", () => {
  const game = applyMove(board("XXO..OX.."), 8)!;
  assert.equal(game.status, "win");
  assert.equal(game.winner, "O");
  assert.deepEqual(game.line, [2, 5, 8]);
});

test("a full board without three in a row is a draw", () => {
  const game = applyMove(board("XOXXOOOX."), 8)!;
  assert.equal(game.status, "draw");
  assert.equal(game.winner, null);
});

test("occupied squares are illegal", () => {
  assert.equal(applyMove(board("X........"), 0), null);
});

test("perfect play from an empty board draws", () => {
  let game = freshGame();
  let guard = 0;
  while (game.status === "playing" && guard < 12) {
    const index = bestMove(game);
    assert.notEqual(index, null);
    game = applyMove(game, index!)!;
    guard += 1;
  }
  assert.equal(game.status, "draw");
});

test("perfect play takes a win and blocks a threat", () => {
  assert.equal(bestMove(board("XX.OO....")), 2);
  const threat = board("XX.O.....");
  assert.equal(threat.turn, "O");
  assert.equal(bestMove(threat), 2);
});
