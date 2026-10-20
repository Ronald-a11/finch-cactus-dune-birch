/**
 * Realtime room relay. The board lives in Postgres (PGLite in the preview) and
 * both players poll it, so a move shows up without a direct peer connection.
 * Seat tokens never leave the player who claimed the seat.
 */
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { cleanName, isCode } from "./codes";
import {
  freshRoom,
  opponentIdle,
  parseRoom,
  publicView,
  reduce,
  type PublicRoom,
  type ReduceInput,
  type RoomState,
} from "./room-state";

const peerSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{0,80}$/);
const moveSchema = z.object({
  op: z.literal("move"),
  room: z.string(),
  peer: peerSchema,
  index: z.number().int().min(0).max(8),
  seq: z.number().int().min(0).max(10_000),
  token: tokenSchema.optional(),
});
const rematchSchema = z.object({
  op: z.literal("rematch"),
  room: z.string(),
  peer: peerSchema,
  token: tokenSchema.optional(),
});
const postSchema = z.discriminatedUnion("op", [moveSchema, rematchSchema]);

export interface MatchResponse {
  accepted: boolean;
  seatToken: string | null;
  opponentIdleMs: number | null;
  state: PublicRoom;
}

const globalRef = globalThis as typeof globalThis & {
  __farlineSchemaPromise__?: Promise<void>;
};

function ensureSchema(sql: Sql): Promise<void> {
  globalRef.__farlineSchemaPromise__ ??= sql
    .query(
      `CREATE TABLE IF NOT EXISTS farline_rooms (
         room TEXT PRIMARY KEY,
         state JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    )
    .then(() => undefined)
    .catch((err) => {
      globalRef.__farlineSchemaPromise__ = undefined;
      throw err;
    });
  return globalRef.__farlineSchemaPromise__;
}

async function load(sql: Sql, room: string): Promise<RoomState | null> {
  const rows = await sql.query<{ state: unknown }>(`SELECT state FROM farline_rooms WHERE room = $1`, [room]);
  if (!rows[0]) return null;
  return parseRoom(rows[0].state);
}

function payload(state: RoomState, peer: string, seatToken: string | null, accepted: boolean): MatchResponse {
  return {
    accepted,
    seatToken,
    opponentIdleMs: opponentIdle(state, peer, Date.now()),
    state: publicView(state),
  };
}

async function sync(args: ReduceInput & { room: string }): Promise<MatchResponse> {
  const sql = await getSql();
  await ensureSchema(sql);
  if (Math.random() < 0.02) {
    try {
      await sql.query(`DELETE FROM farline_rooms WHERE updated_at < now() - interval '6 hours'`);
    } catch (error) {
      console.error("[match] prune failed", error);
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const now = Date.now();
    const existing = await load(sql, args.room);
    if (!existing) {
      const created = freshRoom(args.peer, args.name ?? "Guest", now, args.token);
      const inserted = await sql.query<{ room: string }>(
        `INSERT INTO farline_rooms (room, state)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (room) DO NOTHING
         RETURNING room`,
        [args.room, JSON.stringify(created)],
      );
      if (inserted.length === 0) continue;
      return payload(created, args.peer, created.tokens.X, !args.action);
    }

    const result = reduce(existing, { ...args, now });
    if (!result.write) return payload(existing, args.peer, result.seatToken, result.accepted);
    const updated = await sql.query<{ room: string }>(
      `UPDATE farline_rooms
       SET state = $1::jsonb, updated_at = now()
       WHERE room = $2 AND (state->>'rev')::int = $3
       RETURNING room`,
      [JSON.stringify(result.state), args.room, existing.rev],
    );
    if (updated.length === 0) continue;
    return payload(result.state, args.peer, result.seatToken, result.accepted);
  }
  throw new Error("room busy");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function tokenFrom(request: Request, fallback = ""): string {
  const header = request.headers.get("x-seat-token") ?? "";
  const parsed = tokenSchema.safeParse(header || fallback);
  return parsed.success ? parsed.data : "";
}

/** GET /api/match?room&peer&name — sit, heartbeat, and the latest board. */
export async function handleMatch(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const room = (url.searchParams.get("room") ?? "").toUpperCase();
      const peer = peerSchema.safeParse(url.searchParams.get("peer") ?? "");
      const queryToken = url.searchParams.get("token") ?? "";
      if (!isCode(room) || !peer.success) return json({ error: "invalid room" }, 400);
      const name = cleanName(url.searchParams.get("name") ?? "");
      return json(
        await sync({
          room,
          peer: peer.data,
          name,
          token: tokenFrom(request, queryToken),
          now: Date.now(),
        }),
      );
    }
    if (request.method === "POST") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      const parsed = postSchema.safeParse(body);
      if (!parsed.success) return json({ error: "invalid request" }, 400);
      const msg = parsed.data;
      const room = msg.room.toUpperCase();
      if (!isCode(room)) return json({ error: "invalid room" }, 400);
      const action =
        msg.op === "move"
          ? { type: "move" as const, index: msg.index, seq: msg.seq }
          : { type: "rematch" as const };
      return json(
        await sync({
          room,
          peer: msg.peer,
          name: null,
          token: tokenFrom(request, msg.token ?? ""),
          now: Date.now(),
          action,
        }),
      );
    }
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[match] failed", error);
    return json({ error: "match failed" }, 500);
  }
}
