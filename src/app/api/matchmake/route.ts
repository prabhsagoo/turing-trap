import { NextResponse } from "next/server";

let currentPublicRoom: { roomCode: string; createdAt: number; isLocked: boolean } | null = null;

const generateCode = () => "PUB" + Math.random().toString(36).substring(2, 6).toUpperCase();

export async function GET() {
  const now = Date.now();

  if (!currentPublicRoom || currentPublicRoom.isLocked || now - currentPublicRoom.createdAt > 45000) {
    currentPublicRoom = {
      roomCode: generateCode(),
      createdAt: now,
      isLocked: false,
    };
  }

  return NextResponse.json({ roomCode: currentPublicRoom.roomCode });
}

export async function POST(req: Request) {
  try {
    const { roomCode, isLocked } = await req.json();
    if (currentPublicRoom && currentPublicRoom.roomCode === roomCode) {
      currentPublicRoom.isLocked = isLocked;
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false });
  }
}