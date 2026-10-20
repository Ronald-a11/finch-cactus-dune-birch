import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Board } from "@/components/board";
import { Frame } from "@/components/frame";
import { applyMove, freshGame, type GameCore, type Mark } from "@/lib/game/rules";
import { playDraw, playPlace, playWin, unlockAudio } from "@/lib/game/sound";

export const Route = createFileRoute("/local")({ component: LocalMatch });

const NAMES: Record<Mark, string> = { X: "Cross", O: "Nought" };

function LocalMatch() {
  const [game, setGame] = useState<GameCore>(() => freshGame());
  const [history, setHistory] = useState<GameCore[]>([]);
  const [cover, setCover] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [score, setScore] = useState({ X: 0, O: 0, draw: 0 });
  const counted = useRef(false);
  const prevTurn = useRef<Mark>("X");

  useEffect(() => {
    if (game.status === "playing") {
      counted.current = false;
      return;
    }
    if (counted.current) return;
    counted.current = true;
    if (game.status === "win" && game.winner) {
      const winner = game.winner;
      setScore((current) => ({ ...current, [winner]: current[winner] + 1 }));
      playWin();
    } else if (game.status === "draw") {
      setScore((current) => ({ ...current, draw: current.draw + 1 }));
      playDraw();
    }
  }, [game]);

  useEffect(() => {
    if (!cover) {
      setHidden(false);
      prevTurn.current = game.turn;
      return;
    }
    if (game.status === "playing" && game.turn !== prevTurn.current && game.last !== null) {
      setHidden(true);
    }
    prevTurn.current = game.turn;
  }, [cover, game]);

  function play(index: number) {
    if (hidden) return;
    unlockAudio();
    const next = applyMove(game, index);
    if (!next) return;
    playPlace(game.turn);
    setHistory((stack) => [...stack, game]);
    setGame(next);
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((stack) => stack.slice(0, -1));
    setGame(previous);
    setHidden(false);
  }

  function rematch() {
    setHistory([]);
    setHidden(false);
    setGame(freshGame());
  }

  const status =
    game.status === "win"
      ? `${NAMES[game.winner ?? "X"]} takes the line`
      : game.status === "draw"
        ? "Drawn. The board is full."
        : hidden
          ? `Hand it to ${NAMES[game.turn]}`
          : `${NAMES[game.turn]} to play`;

  return (
    <Frame>
      <div className="flex flex-1 flex-col py-6">
        <p className="text-sm text-muted">Same table</p>
        <h1 className="mt-1 font-display text-4xl font-medium leading-none">Pass the phone.</h1>
        <Scoreline
          left={`${NAMES.X} ${score.X}`}
          right={`${NAMES.O} ${score.O}`}
          note={score.draw ? `${score.draw} draw${score.draw === 1 ? "" : "s"}` : "X starts"}
        />
        <p className="sr-only" aria-live="polite">
          {status}
        </p>
        <p className="mb-4 text-center font-display text-2xl font-medium">{status}</p>
        <div className="relative">
          <Board
            board={game.board}
            line={game.line}
            last={hidden ? null : game.last}
            locked={hidden || game.status !== "playing"}
            shake={game.status === "win"}
            onPlay={play}
          />
          {hidden ? (
            <div className="cover">
              <p className="font-display text-3xl font-medium">{NAMES[game.turn]}</p>
              <p className="text-sm text-muted">The last mark is hidden.</p>
              <button type="button" className="btn btn-primary" onClick={() => setHidden(false)}>
                I'm {NAMES[game.turn]}
              </button>
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={undo} disabled={history.length === 0}>
            Undo
          </button>
          <button type="button" className="btn btn-ghost" onClick={rematch} disabled={history.length === 0 && game.status === "playing"}>
            Rematch
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={cover}
            onClick={() => setCover((value) => !value)}
          >
            {cover ? "Cover on" : "Cover off"}
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          Keys 1–9 fill the board from the top left. Cover hides the grid between turns.
        </p>
      </div>
    </Frame>
  );
}

export function Scoreline({ left, right, note }: { left: string; right: string; note: string }) {
  return (
    <div className="my-5 flex items-center justify-between gap-3 text-sm tabular-nums text-muted">
      <span className="min-w-0 truncate">{left}</span>
      <span className="shrink-0">{note}</span>
      <span className="min-w-0 truncate text-right">{right}</span>
    </div>
  );
}
