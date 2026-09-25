"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import usePartySocket from "partysocket/react";
import { GameState } from "../../../../party";
import { Clock, Send, ShieldAlert, Award, UserCheck, EyeOff, LogOut, Loader2, Bot, Play, Crosshair } from "lucide-react";

const playTone = (freq: number, type: OscillatorType, duration: number) => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
};

export default function GameRoom({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [inputAnswer, setInputAnswer] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [flashingReaction, setFlashingReaction] = useState<{ targetId: string; text: string } | null>(null);
  const [youAreTargeted, setYouAreTargeted] = useState(false);

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999",
    room: code,
    onMessage(event) {
      const msg = JSON.parse(event.data);

      if (msg.type === "SYNC") {
        const nextState: GameState = msg.state;

        if (gameState && gameState.phase !== nextState.phase) {
          if (nextState.phase === "RESULTS") playTone(300, "triangle", 0.6);
          else playTone(540, "sine", 0.15);
        }

        if (nextState.lastReaction) {
          const isTargeted = nextState.lastReaction.targetId === socket.id;

          if (isTargeted) {
            playTone(720, "sawtooth", 0.25);
            setYouAreTargeted(true);
            setTimeout(() => setYouAreTargeted(false), 2500);
          }

          setFlashingReaction({
            targetId: nextState.lastReaction.targetId,
            text: `${nextState.lastReaction.senderAgentName}: ${nextState.lastReaction.reaction}`,
          });
          setTimeout(() => setFlashingReaction(null), 2500);
        }

        setGameState(nextState);
      }

      if (msg.type === "ROOM_IN_PROGRESS") {
        fetch("/api/matchmake")
          .then((res) => res.json())
          .then((data) => router.push(`/game/${data.roomCode}`))
          .catch(() => router.push("/"));
      }
    },
  });

  useEffect(() => {
    const name = sessionStorage.getItem("player_name") || "Operative";
    const avatar = sessionStorage.getItem("player_avatar") || "👤";
    socket.send(JSON.stringify({ type: "JOIN_ROOM", name, avatar }));
  }, [socket]);

  useEffect(() => {
    if (gameState && gameState.timer <= 3 && gameState.timer > 0 && gameState.phase !== "LOBBY") {
      playTone(400, "sine", 0.08);
    }
  }, [gameState?.timer]);

  const handleStart = () => socket.send(JSON.stringify({ type: "START_GAME" }));
  const handleSoloSimulation = () => socket.send(JSON.stringify({ type: "LAUNCH_SOLO_SIMULATION" }));

  const handleLeaveRoom = () => {
    socket.close();
    router.push("/");
  };

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputAnswer.trim()) return;
    playTone(660, "sine", 0.1);
    socket.send(JSON.stringify({ type: "SUBMIT_ANSWER", answer: inputAnswer }));
    setInputAnswer("");
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    socket.send(JSON.stringify({ type: "SEND_CHAT", text: inputMessage }));
    setInputMessage("");
  };

  const handleVote = (targetId: string) => {
    playTone(520, "triangle", 0.12);
    socket.send(JSON.stringify({ type: "SUBMIT_VOTE", targetId }));
  };

  const handleSendReaction = (targetId: string, reaction: string) => {
    socket.send(JSON.stringify({ type: "SEND_REACTION", targetId, reaction }));
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="font-mono text-xs tracking-wider">Establishing uplink to room {code}...</span>
      </div>
    );
  }

  const currentPlayerId = socket.id;
  const self = gameState.players[currentPlayerId || ""];
  const playersList = Object.values(gameState.players);
  const humanPlayers = playersList.filter((p) => !p.isAi && !p.isSimulatedHuman);
  const isLobby = gameState.phase === "LOBBY";
  const isResults = gameState.phase === "RESULTS";
  const aiPlayer = playersList.find((p) => p.isAi);
  const aiWasCaught = playersList.filter((p) => !p.isAi).some((p) => p.votedFor === aiPlayer?.id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-3 sm:p-4">
      {/* Header */}
      <header className="w-full max-w-4xl flex justify-between items-center bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl mb-4 shadow-lg">
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block">Room Identifier</span>
          <h2 className="text-lg sm:text-xl font-mono font-black tracking-widest text-indigo-400">{code}</h2>
        </div>

        {self && !isLobby && (
          <div
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all ${
              youAreTargeted
                ? "bg-rose-950 border border-rose-500 animate-bounce ring-2 ring-rose-500/60"
                : "bg-indigo-950/60 border border-indigo-700/50"
            }`}
          >
            <EyeOff className={`w-4 h-4 ${youAreTargeted ? "text-rose-400" : "text-indigo-400"}`} />
            <div className="text-xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold">
                {youAreTargeted ? "⚠️ Accused by Operative!" : "Your Secret Cover"}
              </span>
              <span className="font-bold text-white text-xs sm:text-sm">
                {self.agentAvatar} {self.agentName}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 border border-slate-700 hover:border-rose-800 px-2.5 py-1.5 rounded-lg text-slate-400 font-semibold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-xs sm:text-sm font-bold ${
              gameState.timer <= 5 && gameState.phase !== "LOBBY"
                ? "bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse"
                : "bg-slate-800 border-slate-700 text-amber-400"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{gameState.timer}s</span>
          </div>

          <div className="text-right hidden sm:block">
            <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider block">Phase</span>
            <p className="text-xs font-bold text-indigo-300 uppercase">{gameState.phase}</p>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
        {/* Operatives Roster */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col gap-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>{isLobby ? "Lobby Operatives" : "Active Infiltrators"}</span>
            <span className="text-[10px] text-slate-500 font-mono">{playersList.length} Connected</span>
          </h3>

          <div className="flex flex-col gap-2">
            {playersList.map((p) => {
              const displayName = isLobby || isResults ? p.name : p.agentName;
              const displayAvatar = isLobby || isResults ? p.avatar : p.agentAvatar;
              const isYou = p.id === currentPlayerId;

              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                    isYou
                      ? "border-indigo-500/60 bg-indigo-500/10 shadow-sm"
                      : "border-slate-800 bg-slate-950/70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{displayAvatar}</span>
                    <div className="flex flex-col">
                      <span className="text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-1">
                        {displayName}
                        {isYou && <span className="text-[10px] text-indigo-400 font-mono">(You)</span>}
                        {p.isSimulatedHuman && isResults && (
                          <span className="text-[9px] text-slate-500 font-mono">[Bot Sim]</span>
                        )}
                      </span>
                      {isResults && (
                        <span className="text-[10px] text-slate-400">
                          Cover: {p.agentAvatar} {p.agentName} {p.isAi && "• 🤖 Impostor"}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Points only visible in Lobby and Results to prevent intel leaks */}
                  {(isLobby || isResults) && (
                    <span className="font-mono text-xs text-slate-400 font-bold">{p.score} pts</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Center Arena */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {/* LOBBY */}
          {gameState.phase === "LOBBY" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center flex-1 text-center">
              <UserCheck className="w-12 h-12 text-indigo-400 mb-3" />
              <h3 className="text-lg font-bold mb-1">Mission Staging Area</h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-6">
                Operatives receive undercover disguises. One undercover participant is an OpenAI infiltrator imitating
                human chatter.
              </p>

              {humanPlayers.length >= 2 && gameState.timer > 0 ? (
                <div className="w-full max-w-xs mb-4 p-3 bg-indigo-950/70 border border-indigo-500/50 rounded-xl">
                  <span className="text-xs font-bold text-indigo-300 block mb-1">Roster Threshold Reached (2+ Players)</span>
                  <p className="text-sm font-mono font-bold text-white animate-pulse">
                    Auto-launching in {gameState.timer}s...
                  </p>
                </div>
              ) : (
                <div className="mb-4 text-xs font-mono text-slate-500">
                  {humanPlayers.length < 2 ? "Waiting for operatives to queue up..." : "Ready for launch."}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 w-full max-w-sm">
                <button
                  onClick={handleStart}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-white" /> Launch Live Match
                </button>

                <button
                  onClick={handleSoloSimulation}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 text-indigo-300"
                >
                  <Bot className="w-3.5 h-3.5" /> Solo Simulation Mode
                </button>
              </div>
            </div>
          )}

          {/* QUESTION */}
          {gameState.phase === "QUESTION" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between flex-1">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Mission Prompt</span>
                <h2 className="text-lg sm:text-xl font-bold text-white mt-1 mb-4">{gameState.currentQuestion}</h2>

                {self?.answer && (
                  <div className="p-4 bg-slate-950 border border-emerald-500/40 rounded-xl text-sm text-emerald-300 flex items-center justify-between shadow-inner">
                    <div>
                      <span className="text-xs uppercase tracking-wider font-bold text-emerald-400 block mb-1">
                        ✓ Response Transmitted
                      </span>
                      <span className="text-slate-200 italic">"{self.answer}"</span>
                    </div>
                    <span className="text-xs text-slate-400 animate-pulse font-mono">
                      Waiting for remaining operatives...
                    </span>
                  </div>
                )}
              </div>

              {!self?.answer && (
                <form onSubmit={handleAnswerSubmit} className="flex gap-2 mt-4">
                  <input
                    type="text"
                    placeholder="Type an authentic 1-3 word answer..."
                    value={inputAnswer}
                    onChange={(e) => setInputAnswer(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button type="submit" className="px-4 py-2 bg-indigo-600 font-bold text-sm rounded-lg hover:bg-indigo-500">
                    Send
                  </button>
                </form>
              )}
            </div>
          )}

          {/* DISCUSSION */}
          {gameState.phase === "DISCUSSION" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col flex-1 min-h-[460px]">
              <div className="mb-3 pb-3 border-b border-slate-800">
                <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase block mb-2">
                  Intercepted Intel (Submitted Answers)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {playersList.map((p) => (
                    <div
                      key={p.id}
                      className="relative bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between"
                    >
                      {flashingReaction?.targetId === p.id && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg animate-bounce z-10 whitespace-nowrap">
                          {flashingReaction.text}
                        </div>
                      )}

                      <div>
                        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1 mb-1 truncate">
                          {p.agentAvatar} {p.agentName}
                        </span>
                        <span className="text-xs text-indigo-200 italic font-medium block truncate">
                          "{p.answer || "No response"}"
                        </span>
                      </div>

                      {p.id !== currentPlayerId && (
                        <div className="flex gap-1 mt-2 pt-2 border-t border-slate-900 justify-between">
                          {["🤨 Sus", "👀 Cap", "🤖 Bot"].map((reaction) => (
                            <button
                              key={reaction}
                              onClick={() => handleSendReaction(p.id, reaction)}
                              className="text-[9px] bg-slate-900 hover:bg-indigo-950 hover:text-indigo-300 border border-slate-800 px-1 py-0.5 rounded transition-all"
                            >
                              {reaction}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2">
                Live Interrogation Channel
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2 max-h-[190px]">
                {gameState.chat.map((c) => (
                  <div key={c.id} className="text-sm bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <span className="font-semibold text-indigo-400">
                      {c.senderAgentAvatar} {c.senderAgentName}:{" "}
                    </span>
                    <span className="text-slate-300">{c.text}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleChatSubmit} className="flex gap-2 mt-auto pt-3 border-t border-slate-800">
                <input
                  type="text"
                  placeholder="Interrogate or defend an answer..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <button type="submit" className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* VOTING */}
          {gameState.phase === "VOTING" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col flex-1">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-white">Identify the Artificial Impostor</h3>
              </div>

              {self?.votedFor && (
                <div className="mb-3 p-2 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
                  <span>✓ Vote locked in.</span>
                  <span className="font-mono animate-pulse text-slate-400">Waiting for other ballots...</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {playersList
                  .filter((p) => p.id !== currentPlayerId)
                  .map((target) => (
                    <button
                      key={target.id}
                      onClick={() => handleVote(target.id)}
                      className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                        self?.votedFor === target.id
                          ? "border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/40"
                          : "border-slate-800 bg-slate-950 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{target.agentAvatar}</span>
                        <span className="font-semibold text-slate-100">{target.agentName}</span>
                      </div>
                      <p className="text-xs text-slate-400 italic bg-slate-900 p-2 rounded border border-slate-800">
                        "{target.answer || "No response"}"
                      </p>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* RESULTS */}
          {gameState.phase === "RESULTS" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col flex-1">
              <div className="text-center mb-5">
                <Award className="w-10 h-10 text-amber-400 mx-auto mb-1" />
                <h3 className="text-xl font-black uppercase tracking-tight">Mission Dossier</h3>
                <p className="text-xs font-semibold text-slate-400">
                  {aiWasCaught ? (
                    <span className="text-emerald-400 font-bold">HUMAN VICTORY: Infiltrator Apprehended</span>
                  ) : (
                    <span className="text-rose-400 font-bold">AI DECEPTION VICTORY: Bot Evaded Capture</span>
                  )}
                </p>
              </div>

              <div className="p-3 bg-slate-950 border border-rose-500/40 rounded-xl mb-4 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block">
                  Identified AI Infiltrator
                </span>
                <p className="text-lg font-bold text-rose-300 mt-0.5">
                  {aiPlayer?.agentAvatar} {aiPlayer?.agentName}
                </p>
                <span className="text-xs text-slate-400 italic block mt-1">Submitted: "{aiPlayer?.answer}"</span>
              </div>

              <div className="mb-5 flex-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
                  Voting Audit Trail
                </span>
                <div className="space-y-1.5">
                  {playersList
                    .filter((p) => !p.isAi)
                    .map((voter) => {
                      const votedTarget = playersList.find((p) => p.id === voter.votedFor);
                      const isCorrect = voter.votedFor === aiPlayer?.id;

                      return (
                        <div
                          key={voter.id}
                          className="flex items-center justify-between text-xs bg-slate-950 px-3 py-2 rounded-lg border border-slate-800/80"
                        >
                          <span className="font-semibold text-slate-300">
                            {voter.name} ({voter.agentName})
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Crosshair className="w-3 h-3 text-slate-500" />
                            <span className="text-slate-400">voted for</span>
                            <span className={`font-bold ${isCorrect ? "text-emerald-400" : "text-slate-200"}`}>
                              {votedTarget ? `${votedTarget.agentAvatar} ${votedTarget.agentName}` : "Abstained"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <button
                onClick={handleStart}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-sm tracking-wide rounded-lg shadow-md transition-all uppercase"
              >
                Launch Next Round
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}