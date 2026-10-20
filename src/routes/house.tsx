import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Board } from "@/components/board";
import { Frame } from "@/components/frame";
import { Scoreline } from "./local";
import {
  applyMove,
  chooseMove,
  freshGame,
  type Difficulty,
  type GameCore,
} from "@/lib/game/rules";
import { playDraw, playPlace, playWin, unlockAudio } from "@/lib/game/sound";

export const Route = createFileRoute("/house")({ component: HouseMatch });

const LEVELS: { id: Difficulty; label: string; hint: string }[] = [
  { id: "easy", label: "Easy", hint: "Misses on purpose" },
  { id: "fair", label: "Fair", hint: "Mostly exact" },
  { id: "sharp", label: "Sharp", hint: "Never loses" },
];

function HouseMatch() {
  const [level, setLevel] = useState<Difficulty>("fair");
  const [game, setGame] = useState<GameCore>(() => freshGame());
  const [history, setHistory] = useState<GameCore[]>([]);
  const [thinking, setThinking] = useState(false);
  const [score, setScore] = useState({ you: 0, house: 0, draw: 0 });
  const counted = useRef(false);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    if (game.status === "playing") {
      counted.current = false;
      return;
    }
    if (counted.current) return;
    counted.current = true;
    if (game.status === "win") {
      if (game.winner === "X") setScore((current) => ({ ...current, you: current.you + 1 }));
      else setScore((current) => ({ ...current, house: current.house + 1 }));
      playWin();
    } else {
      setScore((current) => ({ ...current, draw: current.draw + 1 }));
      playDraw();
    }
  }, [game]);

  useEffect(() => {
    if (game.status !== "playing" || game.turn !== "O") return;
    const timer = window.setTimeout(() => {
      const current = gameRef.current;
      if (current.status !== "playing" || current.turn !== "O") return;
      const index = chooseMove(current, level);
      if (index === null) return;
      const next = applyMove(current, index);
      if (!next) return;
      playPlace("O");
      setHistory((stack) => [...stack, current]);
      setGame(next);
      setThinking(false);
    }, 460);
    setThinking(true);
    return () => window.clearTimeout(timer);
  }, [game, level]);

  function play(index: number) {
    if (thinking || game.turn !== "X" || game.status !== "playing") return;
    unlockAudio();
    const next = applyMove(game, index);
    if (!next) return;
    playPlace("X");
    setHistory((stack) => [...stack, game]);
    setGame(next);
  }

  function undo() {
    const human = [...history].reverse().find((snapshot) => snapshot.turn === "X");
    if (!human) return;
    const index = history.lastIndexOf(human);
    setHistory(history.slice(0, index));
    setGame(human);
    setThinking(false);
  }

  function rematch() {
    setHistory([]);
    setThinking(false);
    setGame(freshGame());
  }

  const status =
    game.status === "win"
      ? game.winner === "X"
        ? "You take the line"
        : "The house takes the line"
      : game.status === "draw"
        ? "Drawn. Neither of you blinked."
        : thinking
          ? "The house is deciding"
          : "Your move";

  return (
    <Frame>
      <div className="flex flex-1 flex-col py-6">
        <p className="text-sm text-muted">The house</p>
        <h1 className="mt-1 font-display text-4xl font-medium leading-none">You are cross.</h1>
        <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
          {LEVELS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={level === item.id}
              className={level === item.id ? "btn btn-primary btn-wide" : "btn btn-ghost btn-wide"}
              onClick={() => {
                setLevel(item.id);
                rematch();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-sm text-muted">
          {LEVELS.find((item) => item.id === level)?.hint}. Changing level starts a fresh board.
        </p>
        <Scoreline
          left={`You ${score.you}`}
          right={`House ${score.house}`}
          note={score.draw ? `${score.draw} drawn` : "You start"}
        />
        <p className="sr-only" aria-live="polite">
          {status}
        </p>
        <p className="mb-4 text-center font-display text-2xl font-medium">{status}</p>
        <Board
          board={game.board}
          line={game.line}
          last={game.last}
          locked={thinking || game.turn !== "X" || game.status !== "playing"}
          shake={game.status === "win"}
          onPlay={play}
        />
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={undo} disabled={!history.some((item) => item.turn === "X")}>
            Undo
          </button>
          <button type="button" className="btn btn-ghost" onClick={rematch}>
            Rematch
          </button>
        </div>
      </div>
    </Frame>
  );
}
