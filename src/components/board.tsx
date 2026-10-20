import { useEffect, useState } from "react";
import type { Cell } from "@/lib/game/rules";
import { Mark } from "./marks";

const COLS = ["left", "center", "right"] as const;
const ROWS = ["top", "middle", "bottom"] as const;

function cellLabel(index: number, value: Cell): string {
  const where = `${ROWS[Math.floor(index / 3)]} ${COLS[index % 3]}`;
  if (!value) return `Empty ${where} square`;
  return `${value === "X" ? "Cross" : "Nought"} on ${where}`;
}

function endpoints(line: number[]): { x1: number; y1: number; x2: number; y2: number } {
  const at = (index: number) => ({
    x: (index % 3) * (100 / 3) + 100 / 6,
    y: Math.floor(index / 3) * (100 / 3) + 100 / 6,
  });
  const a = at(line[0] ?? 0);
  const b = at(line[2] ?? 0);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function Board({
  board,
  line,
  last,
  onPlay,
  locked = false,
  shake = false,
  interactive = true,
}: {
  board: Cell[];
  line: number[] | null;
  last: number | null;
  onPlay?: (index: number) => void;
  locked?: boolean;
  shake?: boolean;
  interactive?: boolean;
}) {
  const [burstKey, setBurstKey] = useState(0);
  useEffect(() => {
    if (line) setBurstKey((key) => key + 1);
  }, [line]);

  const win = line ? endpoints(line) : null;

  return (
    <div className={shake ? "board-wrap board-shake" : "board-wrap"}>
      <div
        className="grid-board"
        role={interactive ? "grid" : undefined}
        aria-label="Tic-tac-toe board"
        onKeyDown={(event) => {
          if (!interactive || locked || !onPlay) return;
          if (event.target instanceof HTMLElement && event.target.tagName === "INPUT") return;
          const digit = Number(event.key);
          if (digit >= 1 && digit <= 9) {
            event.preventDefault();
            onPlay(digit - 1);
          }
        }}
      >
        {board.map((value, index) => {
          const open = interactive && !locked && !value;
          const className = [
            "cell",
            open ? "is-open" : "",
            last === index ? "is-last" : "",
            line?.includes(index) ? "is-win" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const content = value ? <Mark mark={value} still={!interactive} /> : null;
          if (!interactive) {
            return (
              <div key={index} className={className} aria-hidden="true">
                {content}
              </div>
            );
          }
          return (
            <button
              key={index}
              type="button"
              className={className}
              disabled={!open}
              aria-label={cellLabel(index, value)}
              onClick={() => onPlay?.(index)}
            >
              {content}
            </button>
          );
        })}
      </div>
      {win ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
          <line className="win-line" pathLength={1} x1={win.x1} y1={win.y1} x2={win.x2} y2={win.y2} />
        </svg>
      ) : null}
      {line ? (
        <div className="burst" key={burstKey} aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} style={{ ["--i" as string]: String(index) }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
