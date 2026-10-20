import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_SEAT_TTL_MS,
  freshRoom,
  parseRoom,
  readPublicRoom,
  reduce,
  type RoomState,
} from "./room-state.ts";

const now = 1_700_000_000_000;

function sit(host: RoomState, peer: string, name: string, at = now + 1_000) {
  return reduce(host, { peer, name, token: "", now: at });
}

test("the first player is cross and the second is nought", () => {
  const room = freshRoom("host", "Ash", now);
  assert.equal(room.seats.X, "host");
  assert.equal(room.seats.O, null);
  assert.ok(room.tokens.X && room.tokens.X.length >= 8);

  const joined = sit(room, "guest", "Reed");
  assert.equal(joined.write, true);
  assert.equal(joined.state.seats.O, "guest");
  assert.equal(joined.state.names.O, "Reed");
  assert.ok(joined.seatToken);

  const watching = reduce(joined.state, { peer: "third", name: "Kit", token: "", now: now + 2_000 });
  assert.equal(watching.state.seats.X, "host");
  assert.equal(watching.state.seats.O, "guest");
  assert.equal(watching.seatToken, null);
});

test("only the seated player can move, and only on their turn", () => {
  const room = freshRoom("host", "Ash", now);
  const joined = sit(room, "guest", "Reed");
  const tokenX = room.tokens.X!;
  const tokenO = joined.seatToken!;

  const alone = reduce(room, {
    peer: "host",
    name: "Ash",
    token: tokenX,
    now: now + 500,
    action: { type: "move", index: 0, seq: room.seq },
  });
  assert.equal(alone.accepted, false);
  assert.equal(alone.state.board[0], null);

  const wrongTurn = reduce(joined.state, {
    peer: "guest",
    name: "Reed",
    token: tokenO,
    now: now + 1_500,
    action: { type: "move", index: 0, seq: joined.state.seq },
  });
  assert.equal(wrongTurn.accepted, false);

  const forged = reduce(joined.state, {
    peer: "host",
    name: "Ash",
    token: "not-the-token",
    now: now + 1_500,
    action: { type: "move", index: 0, seq: joined.state.seq },
  });
  assert.equal(forged.accepted, false);
  assert.equal(forged.state.board[0], null);

  const staleSeq = reduce(joined.state, {
    peer: "host",
    name: "Ash",
    token: tokenX,
    now: now + 1_500,
    action: { type: "move", index: 0, seq: 99 },
  });
  assert.equal(staleSeq.accepted, false);

  const played = reduce(joined.state, {
    peer: "host",
    name: "Ash",
    token: tokenX,
    now: now + 1_500,
    action: { type: "move", index: 0, seq: joined.state.seq },
  });
  assert.equal(played.accepted, true);
  assert.equal(played.state.board[0], "X");
  assert.equal(played.state.turn, "O");
  assert.equal(played.state.seq, joined.state.seq + 1);

  const answer = reduce(played.state, {
    peer: "guest",
    name: "Reed",
    token: tokenO,
    now: now + 2_000,
    action: { type: "move", index: 4, seq: played.state.seq },
  });
  assert.equal(answer.accepted, true);
  assert.equal(answer.state.board[4], "O");
});

test("a win can be rematched without giving up the seats", () => {
  let state = sit(freshRoom("host", "Ash", now), "guest", "Reed").state;
  const tokenX = freshRoom("host", "Ash", now).tokens.X;
  // Rebuild from the seated room's own token, captured before moves.
  const hostToken = parseRoom(state)?.tokens.X;
  assert.ok(hostToken);
  assert.notEqual(hostToken, tokenX);

  const moves = [0, 3, 1, 4, 2];
  let seq = state.seq;
  for (let i = 0; i < moves.length; i += 1) {
    const peer = i % 2 === 0 ? "host" : "guest";
    const token = i % 2 === 0 ? hostToken! : state.tokens.O!;
    const step = reduce(state, {
      peer,
      name: peer === "host" ? "Ash" : "Reed",
      token,
      now: now + 3_000 + i,
      action: { type: "move", index: moves[i]!, seq },
    });
    assert.equal(step.accepted, true, `move ${i}`);
    state = step.state;
    seq = state.seq;
  }
  assert.equal(state.status, "win");
  assert.equal(state.winner, "X");

  const again = reduce(state, {
    peer: "guest",
    name: "Reed",
    token: state.tokens.O!,
    now: now + 9_000,
    action: { type: "rematch" },
  });
  assert.equal(again.accepted, true);
  assert.equal(again.state.status, "playing");
  assert.equal(again.state.board.every((cell) => cell === null), true);
  assert.equal(again.state.seats.X, "host");
  assert.equal(again.state.seats.O, "guest");
  assert.equal(again.state.names.X, "Ash");
});

test("an empty room frees a seat that went quiet", () => {
  const room = freshRoom("host", "Ash", now);
  const next = reduce(room, {
    peer: "guest",
    name: "Reed",
    token: "",
    now: now + EMPTY_SEAT_TTL_MS + 1,
  });
  assert.equal(next.state.seats.X, "guest");
  assert.equal(next.state.seats.O, null);
});

test("marks on the board keep a quiet seat", () => {
  const room = freshRoom("host", "Ash", now);
  const joined = sit(room, "guest", "Reed");
  const played = reduce(joined.state, {
    peer: "host",
    name: "Ash",
    token: room.tokens.X!,
    now: now + 1_500,
    action: { type: "move", index: 8, seq: joined.state.seq },
  });
  const later = reduce(played.state, {
    peer: "guest",
    name: "Reed",
    token: joined.seatToken!,
    now: now + EMPTY_SEAT_TTL_MS + 10_000,
  });
  assert.equal(later.state.seats.X, "host");
  assert.equal(later.state.board[8], "X");
});

test("public reads recompute the line and drop seat secrets", () => {
  const room = freshRoom("host", "Ash", now);
  const view = readPublicRoom({
    ...room,
    board: ["X", "X", "X", "O", "O", null, null, null, null],
    tokens: { X: "secret-token-value", O: null },
  });
  assert.ok(view);
  assert.equal(view!.status, "win");
  assert.deepEqual(view!.line, [0, 1, 2]);
  assert.equal("tokens" in view!, false);

  const stored = parseRoom(room);
  assert.equal(stored?.tokens.X, room.tokens.X);
  assert.equal(readPublicRoom({ board: ["O", "X"], seq: 1, seats: { X: "host", O: null } }), null);
});
