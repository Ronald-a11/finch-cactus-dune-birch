import { useCallback, useEffect, useRef, useState } from "react";
import { applyMove, freshGame } from "./rules";
import { OPPONENT_AWAY_MS, acceptToken, mintToken, readPublicRoom, type PublicRoom } from "./room-state";

export type NetState = PublicRoom;
export { OPPONENT_AWAY_MS };

interface MatchBody {
  accepted?: boolean;
  seatToken?: string | null;
  opponentIdleMs?: number | null;
  state?: unknown;
}

const POLL_MS = 320;

function loadSelfId(room: string): string {
  const make = () => `p${Math.random().toString(36).slice(2, 10)}`;
  if (typeof sessionStorage === "undefined") return make();
  const key = `farline-peer:${room}`;
  const existing = sessionStorage.getItem(key);
  if (existing && /^[A-Za-z0-9_-]{1,64}$/.test(existing)) return existing;
  const id = make();
  sessionStorage.setItem(key, id);
  return id;
}

function loadToken(room: string): string {
  if (typeof sessionStorage === "undefined") return mintToken();
  const key = `farline-token:${room}`;
  const existing = sessionStorage.getItem(key);
  const accepted = acceptToken(existing);
  if (accepted) return accepted;
  const token = mintToken();
  sessionStorage.setItem(key, token);
  return token;
}

function applyNet(state: NetState, index: number): NetState | null {
  const next = applyMove(state, index);
  if (!next) return null;
  return { ...state, ...next, seq: state.seq + 1 };
}

function resetNet(state: NetState): NetState {
  return { ...state, ...freshGame(), seq: state.seq + 1 };
}

export function useOnlineMatch(code: string, name: string) {
  const [selfId] = useState(() => loadSelfId(code));
  const tokenRef = useRef(loadToken(code));
  const [state, setState] = useState<NetState | null>(null);
  const [joined, setJoined] = useState(false);
  const [opponentIdleMs, setOpponentIdleMs] = useState<number | null>(null);
  const stateRef = useRef<NetState | null>(null);
  const serverRef = useRef<NetState | null>(null);
  const inflight = useRef<number | null>(null);

  const rememberToken = useCallback(
    (token: string | null | undefined) => {
      if (!token) return;
      tokenRef.current = token;
      sessionStorage.setItem(`farline-token:${code}`, token);
    },
    [code],
  );

  const adopt = useCallback((incoming: NetState, idle: number | null) => {
    setOpponentIdleMs(idle);
    setJoined(true);
    const pending = inflight.current;
    if (pending !== null && incoming.seq < pending) return;
    inflight.current = null;
    serverRef.current = incoming;
    stateRef.current = incoming;
    setState(incoming);
  }, []);

  const applyBody = useCallback(
    (body: MatchBody, force: boolean) => {
      const clean = readPublicRoom(body.state);
      if (!clean) return false;
      rememberToken(body.seatToken);
      const idle = typeof body.opponentIdleMs === "number" ? body.opponentIdleMs : null;
      if (force) {
        inflight.current = null;
        serverRef.current = clean;
        stateRef.current = clean;
        setOpponentIdleMs(idle);
        setJoined(true);
        setState(clean);
        return true;
      }
      adopt(clean, idle);
      return true;
    },
    [adopt, rememberToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let timer = 0;

    const poll = async () => {
      const params = new URLSearchParams({
        room: code,
        peer: selfId,
        name,
        token: tokenRef.current,
      });
      const headers: Record<string, string> = {};
      if (tokenRef.current) headers["x-seat-token"] = tokenRef.current;
      const res = await fetch(`/api/match?${params}`, {
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`match ${res.status}`);
      applyBody((await res.json()) as MatchBody, false);
    };

    const loop = async () => {
      while (!stopped) {
        const started = performance.now();
        try {
          await poll();
        } catch {
          if (stopped || controller.signal.aborted) return;
        }
        const hidden = typeof document !== "undefined" && document.hidden;
        const wait = Math.max(80, (hidden ? 1600 : POLL_MS) - (performance.now() - started));
        if (stopped) return;
        await new Promise<void>((resolve) => {
          timer = window.setTimeout(resolve, wait);
        });
      }
    };

    void loop();
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [applyBody, code, name, selfId]);

  const post = useCallback(
    async (body: Record<string, unknown>, optimistic: NetState) => {
      const seq = optimistic.seq;
      inflight.current = seq;
      stateRef.current = optimistic;
      setState(optimistic);
      const revertTimer = window.setTimeout(() => {
        if (inflight.current !== seq) return;
        inflight.current = null;
        if (!serverRef.current) return;
        stateRef.current = serverRef.current;
        setState(serverRef.current);
      }, 2500);
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-seat-token": tokenRef.current,
          },
          body: JSON.stringify({ ...body, token: tokenRef.current }),
        });
        const payload = (await res.json()) as MatchBody;
        if (!applyBody(payload, true)) throw new Error("bad state");
      } catch {
        if (inflight.current === seq) {
          inflight.current = null;
          if (serverRef.current) {
            stateRef.current = serverRef.current;
            setState(serverRef.current);
          }
        }
      } finally {
        window.clearTimeout(revertTimer);
      }
    },
    [applyBody],
  );

  const play = useCallback(
    (index: number) => {
      const current = stateRef.current;
      if (!current || current.status !== "playing" || inflight.current !== null) return;
      if (!current.seats.X || !current.seats.O) return;
      if (current.seats[current.turn] !== selfId) return;
      if (!tokenRef.current) return;
      const next = applyNet(current, index);
      if (!next) return;
      void post({ op: "move", room: code, peer: selfId, index, seq: current.seq }, next);
    },
    [code, post, selfId],
  );

  const rematch = useCallback(() => {
    const current = stateRef.current;
    if (!current || current.status === "playing" || inflight.current !== null) return;
    if (current.seats.X !== selfId && current.seats.O !== selfId) return;
    if (!tokenRef.current) return;
    void post({ op: "rematch", room: code, peer: selfId }, resetNet(current));
  }, [code, post, selfId]);

  return { selfId, joined, state, opponentIdleMs, play, rematch };
}
