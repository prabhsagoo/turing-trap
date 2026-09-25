"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Users, Key, Zap, Shield, Loader2 } from "lucide-react";

const AVATARS = ["👾", "🚀", "🍕", "⚡", "🌵", "🎧", "🦊", "🐯"];

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [roomCode, setRoomCode] = useState("");
  const [isJoiningQueue, setIsJoiningQueue] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const savePlayerProfile = () => {
    sessionStorage.setItem("player_name", name.trim() || "Operative");
    sessionStorage.setItem("player_avatar", selectedAvatar);
  };

  const handleQuickPlay = async () => {
    setIsJoiningQueue(true);
    setErrorMsg("");
    savePlayerProfile();

    try {
      const res = await fetch("/api/matchmake");
      const data = await res.json();
      if (data.roomCode) {
        router.push(`/game/${data.roomCode}`);
      } else {
        setErrorMsg("Could not find open mission queue. Please retry.");
      }
    } catch (err) {
      setErrorMsg("Could not reach matchmaking queue. Try creating a private room.");
    } finally {
      setIsJoiningQueue(false);
    }
  };

  const handleCreateRoom = () => {
    savePlayerProfile();
    const newCode = "TRAP" + Math.random().toString(36).substring(2, 6).toUpperCase();
    router.push(`/game/${newCode}`);
  };

  const handleJoinCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    savePlayerProfile();
    router.push(`/game/${roomCode.trim().toUpperCase()}`);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-white">TURING TRAP</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            A high-stakes social deduction challenge powered by OpenAI. Spot the infiltrator before you are deceived.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-xs text-rose-300 font-semibold text-center">
            {errorMsg}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Operative Nickname
            </label>
            <input
              type="text"
              placeholder="e.g. Maverick"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
              Choose Callsign Avatar
            </label>
            <div className="grid grid-cols-4 gap-2">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedAvatar(emoji)}
                  className={`text-2xl p-2.5 rounded-xl border transition-all ${
                    selectedAvatar === emoji
                      ? "border-indigo-500 bg-indigo-500/20 shadow-md ring-2 ring-indigo-500/30"
                      : "border-slate-800 bg-slate-950 hover:bg-slate-800"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleQuickPlay}
            disabled={isJoiningQueue}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-wider disabled:opacity-50"
          >
            {isJoiningQueue ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Infiltrating Queue...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" /> Quick Play (Match With Anyone)
              </>
            )}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-4 text-[10px] font-bold tracking-widest uppercase text-slate-500">
              Or Private Session
            </span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreateRoom}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5" /> Create Room
            </button>

            <form onSubmit={handleJoinCode} className="flex-1 flex gap-1">
              <input
                type="text"
                placeholder="CODE"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 text-center font-mono text-xs uppercase text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white flex items-center justify-center"
              >
                <Users className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}