import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { unlockAudio } from "@/lib/game/sound";
import { MarkX } from "./marks";

export function Frame({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div
        className={wide ? "shell shell-wide" : "shell"}
      >
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-ink no-underline">
            <span className="block size-5">
              <MarkX still />
            </span>
            <span className="font-display text-2xl font-medium tracking-tight">Farline</span>
          </Link>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
