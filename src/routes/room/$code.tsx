import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "@/components/board";
import { Frame } from "@/components/frame";
import { cleanName, isCode, randomCallsign } from "@/lib/game/codes";
import { playDraw, playPlace, playWin, unlockAudio } from "@/lib/game/sound";
import { useOnlineMatch, OPPONENT_AWAY_MS, type NetState } from "@/lib/game/use-online-match";
import { Scoreline } from "../local";

export const Route = createFileRoute("/room/$code")({
  ssr: false,
  component: RoomPage,
});

function RoomPage() {
  const { code: raw } = Route.useParams();
  const code = raw.toUpperCase();
  const [name, setName] = useState<string | null>(() => localStorage.getItem("farline-name"));
  const [draft, setDraft] = useState(() => localStorage.getItem("farline-name") || randomCallsign());

  if (!isCode(code)) {
    return (
      <Frame>
        <div className="flex flex-1 flex-col items-start justify-center gap-4 py-16">
          <h1 className="font-display text-4xl font-medium leading-none">That code doesn't fit.</h1>
          <p className="text-muted">Room codes are 5 characters, without O, 0, I, or 1.</p>
          <Link to="/" className="btn btn-primary no-underline">
            Back to the lobby
          </Link>
        </div>
      </Frame>
    );
  }

  if (!name) {
    return (
      <Frame>
        <form
          className="flex flex-1 flex-col justify-center gap-4 py-16"
          onSubmit={(event) => {
            event.preventDefault();
            const next = cleanName(draft);
            localStorage.setItem("farline-name", next);
            setName(next);
          }}
        >
          <p className="text-sm text-muted">Room {code}</p>
          <h1 className="font-display text-4xl font-medium leading-none">What should they call you?</h1>
          <label className="text-sm font-medium" htmlFor="callsign">
            Call sign
          </label>
          <input
            id="callsign"
            className="code-input name-input"
            maxLength={18}
            value={draft}
            autoComplete="nickname"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Take a seat
          </button>
          <p className="text-sm text-muted">Only the other player sees this, and only while the room is open.</p>
        </form>
      </Frame>
    );
  }

  return <OnlineTable key={`${code}:${name}`} code={code} name={name} />;
}

function OnlineTable({ code, name }: { code: string; name: string }) {
  const match = useOnlineMatch(code, name);
  const [copied, setCopied] = useState(false);
  const [canShare] = useState(() => typeof navigator.share === "function");
  const [score, setScore] = useState({ you: 0, them: 0, draw: 0 });
  const counted = useRef<number | null>(null);
  const lastBoard = useRef<string>("");

  const myMark = !match.state
    ? null
    : match.state.seats.X === match.selfId
      ? "X"
      : match.state.seats.O === match.selfId
        ? "O"
        : null;
  const opponentSeated = Boolean(
    myMark === "X" ? match.state?.seats.O : myMark === "O" ? match.state?.seats.X : false,
  );
  const live =
    opponentSeated && match.opponentIdleMs !== null && match.opponentIdleMs < OPPONENT_AWAY_MS;

  useEffect(() => {
    const state = match.state;
    if (!state) return;
    const fingerprint = state.board.join("");
    if (fingerprint !== lastBoard.current && state.last !== null && lastBoard.current !== "") {
      const placed = state.board[state.last];
      if (placed) playPlace(placed);
    }
    lastBoard.current = fingerprint;
    if (state.status === "playing") {
      counted.current = null;
      return;
    }
    if (counted.current === state.seq) return;
    counted.current = state.seq;
    if (state.status === "win" && state.winner) {
      if (state.seats[state.winner] === match.selfId) {
        setScore((current) => ({ ...current, you: current.you + 1 }));
      } else if (myMark) {
        setScore((current) => ({ ...current, them: current.them + 1 }));
      }
      playWin();
    } else if (state.status === "draw") {
      setScore((current) => ({ ...current, draw: current.draw + 1 }));
      playDraw();
    }
  }, [match.state, match.selfId, myMark]);

  const status = useMemo(
    () => describe(match.joined, match.state, match.selfId, live, match.opponentIdleMs),
    [match.joined, match.state, match.selfId, live, match.opponentIdleMs],
  );

  const locked =
    !match.state ||
    match.state.status !== "playing" ||
    !myMark ||
    !opponentSeated ||
    match.state.seats[match.state.turn] !== match.selfId;

  async function share() {
    const url = shareUrl(code);
    const text = `Play Farline with me — room ${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Farline", text, url });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const themName = myMark === "X" ? match.state?.names.O : myMark === "O" ? match.state?.names.X : "Opponent";
  const note = !myMark
    ? "Watching"
    : !opponentSeated
      ? `You are ${myMark === "X" ? "cross" : "nought"}`
      : live
        ? "Live"
        : "Away";

  return (
    <Frame>
      <div className="flex flex-1 flex-col py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">Room</p>
            <p className="room-code font-display font-medium leading-none">{code}</p>
          </div>
          <button type="button" className="btn btn-primary shrink-0" onClick={() => void share()}>
            {copied ? "Copied" : canShare ? "Share" : "Copy link"}
          </button>
        </div>
        <Scoreline
          left={`${name} · ${score.you}`}
          right={`${themName || "Opponent"} · ${score.them}`}
          note={note}
        />
        <p className="sr-only" aria-live="polite">
          {status}
        </p>
        <p className="mb-4 text-center font-display text-2xl font-medium leading-tight">{status}</p>
        <Board
          board={match.state?.board ?? Array.from({ length: 9 }, () => null)}
          line={match.state?.line ?? null}
          last={match.state?.last ?? null}
          locked={locked}
          shake={match.state?.status === "win"}
          onPlay={(index) => {
            unlockAudio();
            match.play(index);
          }}
        />
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={match.rematch}
            disabled={!match.state || match.state.status === "playing" || !myMark}
          >
            Rematch
          </button>
          <Link to="/local" className="btn btn-ghost no-underline">
            Same table
          </Link>
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          Share the link with your friend and leave this page open. Their mark shows up here as soon as they play.
        </p>
      </div>
    </Frame>
  );
}

function shareUrl(code: string): string {
  const parts = window.location.pathname.split("/");
  parts[parts.length - 1] = code;
  return `${window.location.origin}${parts.join("/")}${window.location.search}`;
}

function describe(
  joined: boolean,
  state: NetState | null,
  selfId: string,
  live: boolean,
  opponentIdleMs: number | null,
): string {
  if (!joined) return "Opening the room…";
  if (!state) return "Dealing the marks…";
  const myMark = state.seats.X === selfId ? "X" : state.seats.O === selfId ? "O" : null;
  const watching = Boolean(state.seats.X && state.seats.O && !myMark);
  if (state.status === "win" && state.winner) {
    if (state.seats[state.winner] === selfId) return "You take the line";
    return `${state.names[state.winner] || "They"} take the line`;
  }
  if (state.status === "draw") return "Drawn. The board is full.";
  if (watching) return "This table is full. You're watching.";
  if (!myMark || !state.seats.X || !state.seats.O) {
    return "Send the link. The room stays open while you wait.";
  }
  const theirName = myMark === "X" ? state.names.O : state.names.X;
  if (!live && opponentIdleMs !== null && opponentIdleMs >= OPPONENT_AWAY_MS) {
    if (state.seats[state.turn] === selfId) return "Your move. They may have stepped away.";
    return `${theirName || "They"} stepped away. The seat is still theirs.`;
  }
  if (state.seats[state.turn] === selfId) return "Your move";
  return `${theirName || "They"} to play`;
}
