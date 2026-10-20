import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Board } from "@/components/board";
import { Frame } from "@/components/frame";
import { isCode, makeCode } from "@/lib/game/codes";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);

  function openRoom() {
    const next = makeCode();
    void navigate({ to: "/room/$code", params: { code: next } });
  }

  function join(event: React.FormEvent) {
    event.preventDefault();
    const next = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!isCode(next)) {
      setCodeError(true);
      return;
    }
    void navigate({ to: "/room/$code", params: { code: next } });
  }

  return (
    <Frame wide>
      <div className="mt-10 grid flex-1 items-center gap-10 lg:mt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <section>
          <p className="text-sm font-medium tracking-wide text-muted">A shared board</p>
          <h1 className="mt-3 max-w-xl font-display text-5xl font-medium leading-none text-ink sm:text-7xl">
            Three in a row, from anywhere.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Open a room and send the link. Their move shows up on your board as they play it. No account.
          </p>
          <ol className="play-steps">
            <li>
              <span>1</span>
              <span>Open a room on your phone.</span>
            </li>
            <li>
              <span>2</span>
              <span>Tap Share and send them the link, or read them the code.</span>
            </li>
            <li>
              <span>3</span>
              <span>They take a seat. You are cross. Play when it says your move.</span>
            </li>
          </ol>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" className="btn btn-primary" onClick={openRoom}>
              Open a room
            </button>
            <p className="text-sm text-muted">The link is the invite.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-ink/10 bg-card px-5 py-6 sm:px-7">
          <div className="mb-5 flex justify-center" aria-hidden="true">
            <div className="w-44">
              <Board
                interactive={false}
                board={["X", null, "O", null, "X", null, "O", null, null]}
                line={null}
                last={4}
              />
            </div>
          </div>
          <form onSubmit={join} className="flex flex-col gap-3">
            <label htmlFor="room-code" className="text-sm font-medium text-ink">
              Have a code?
            </label>
            <input
              id="room-code"
              className="code-input"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={5}
              placeholder="K7MQP"
              value={code}
              aria-invalid={codeError}
              aria-describedby={codeError ? "code-error" : undefined}
              onChange={(event) => {
                setCodeError(false);
                setCode(event.target.value.toUpperCase());
              }}
            />
            {codeError ? (
              <p id="code-error" className="text-sm font-medium text-ink">
                Codes are 5 letters or numbers. Skip O, 0, I, and 1.
              </p>
            ) : (
              <p className="text-sm text-muted">Ask them for the five characters under the board.</p>
            )}
            <button type="submit" className="btn btn-ghost btn-wide">
              Join room
            </button>
          </form>
        </section>
      </div>

      <section className="mt-8 grid gap-3 pb-8 sm:grid-cols-2">
        <Link to="/local" className="mode-card">
          <span className="font-display text-2xl font-medium">Same table</span>
          <span className="text-sm text-muted">Pass one phone back and forth.</span>
        </Link>
        <Link to="/house" className="mode-card">
          <span className="font-display text-2xl font-medium">The house</span>
          <span className="text-sm text-muted">A quiet opponent that never misses on sharp.</span>
        </Link>
      </section>
    </Frame>
  );
}
