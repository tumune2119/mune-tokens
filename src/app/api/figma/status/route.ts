import { figmaStatus } from "@/lib/figma-auto/run";

/** Is Claude Code's Figma MCP server installed and signed in? (`?force=1` re-checks now.) */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("force") === "1";
  return Response.json(await figmaStatus(force));
}
