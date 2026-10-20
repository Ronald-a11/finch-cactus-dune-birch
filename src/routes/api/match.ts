import { createFileRoute } from "@tanstack/react-router";
import { handleMatch } from "@/lib/game/match.server";

const handle = ({ request }: { request: Request }) => handleMatch(request);

export const Route = createFileRoute("/api/match")({
  server: { handlers: { GET: handle, POST: handle } },
});
