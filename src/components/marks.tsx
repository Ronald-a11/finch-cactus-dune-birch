export function MarkX({ still = false }: { still?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="mark-x h-full w-full" aria-hidden="true">
      <path
        className={still ? "mark-stroke is-still" : "mark-stroke"}
        pathLength={1}
        d="M26 26 L74 74"
      />
      <path
        className={still ? "mark-stroke is-still" : "mark-stroke delay"}
        pathLength={1}
        d="M74 26 L26 74"
      />
    </svg>
  );
}

export function MarkO({ still = false }: { still?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="mark-o h-full w-full" aria-hidden="true">
      <circle
        className={still ? "mark-stroke is-still" : "mark-stroke"}
        pathLength={1}
        cx="50"
        cy="50"
        r="26"
      />
    </svg>
  );
}

export function Mark({ mark, still = false }: { mark: "X" | "O"; still?: boolean }) {
  return mark === "X" ? <MarkX still={still} /> : <MarkO still={still} />;
}
