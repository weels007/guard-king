// Same-origin proxy to the GenLayer Studio RPC. Browsers block direct
// calls (no CORS headers on the RPC); server-side forwarding has no such
// restriction. Transparent JSON-RPC passthrough.
const UPSTREAM = "https://studio.genlayer.com/api";

export async function POST(req: Request) {
  const body = await req.text();
  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET() {
  return Response.json({ ok: true, proxy: "guardking-rpc" });
}
