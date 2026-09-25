import { NextResponse } from "next/server";

export async function GET() {
  const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";
  const protocol =
    partyHost.includes("localhost") || partyHost.includes("127.0.0.1") ? "http" : "https";

  try {
    const res = await fetch(`${protocol}://${partyHost}/parties/main/matchmaker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "GET_OR_CREATE_PUBLIC_ROOM" }),
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json({ roomCode: data.roomCode });
  } catch (err) {
    const fallback = "PUB" + Math.random().toString(36).substring(2, 6).toUpperCase();
    return NextResponse.json({ roomCode: fallback });
  }
}