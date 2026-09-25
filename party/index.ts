import type * as Party from "partykit/server";
import OpenAI from "openai";

export type GamePhase = "LOBBY" | "QUESTION" | "DISCUSSION" | "VOTING" | "RESULTS";

export interface Player {
  id: string;
  name: string;
  avatar: string;
  agentName?: string;
  agentAvatar?: string;
  isAi: boolean;
  isSimulatedHuman?: boolean;
  score: number;
  answer?: string;
  votedFor?: string;
}

export interface ChatMessage {
  id: string;
  senderAgentName: string;
  senderAgentAvatar: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export interface ReactionEvent {
  targetId: string;
  reaction: string;
  senderAgentName: string;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Record<string, Player>;
  currentQuestion: string;
  timer: number;
  chat: ChatMessage[];
  lastReaction?: ReactionEvent;
}

const AGENT_IDENTITIES = [
  { name: "Agent Cobalt", avatar: "🔷" },
  { name: "Agent Neon", avatar: "⚡" },
  { name: "Agent Phantom", avatar: "👻" },
  { name: "Agent Cipher", avatar: "🗝️" },
  { name: "Agent Echo", avatar: "📡" },
  { name: "Agent Onyx", avatar: "🎱" },
  { name: "Agent Mirage", avatar: "🌪️" },
  { name: "Agent Pulse", avatar: "💓" },
];

export default class GameServer implements Party.Server {
  room: Party.Room;
  state: GameState;
  aiId: string = "ai-bot";
  timerInterval?: any;
  lobbyCountdownInterval?: any;

  constructor(room: Party.Room) {
    this.room = room;
    this.state = {
      roomCode: room.id,
      phase: "LOBBY",
      players: {},
      currentQuestion: "",
      timer: 0,
      chat: [],
    };
  }

  onConnect(conn: Party.Connection) {
    this.broadcastState();
  }

  onClose(conn: Party.Connection) {
    delete this.state.players[conn.id];
    const humanCount = Object.values(this.state.players).filter((p) => !p.isAi && !p.isSimulatedHuman).length;
    if (this.state.phase === "LOBBY" && humanCount < 2 && this.lobbyCountdownInterval) {
      clearInterval(this.lobbyCountdownInterval);
      this.lobbyCountdownInterval = null;
      this.state.timer = 0;
    }
    this.broadcastState();
  }

  async onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message);

    if (data.type === "JOIN_ROOM") {
      if (this.state.phase !== "LOBBY") {
        sender.send(
          JSON.stringify({
            type: "ROOM_IN_PROGRESS",
            message: "Match already in progress. Rerouting...",
          })
        );
        return;
      }

      this.state.players[sender.id] = {
        id: sender.id,
        name: data.name,
        avatar: data.avatar || "👤",
        isAi: false,
        score: 0,
      };
      this.broadcastState();

      const realHumans = Object.values(this.state.players).filter((p) => !p.isAi && !p.isSimulatedHuman).length;
      if (this.state.phase === "LOBBY" && realHumans >= 2 && !this.lobbyCountdownInterval) {
        this.startLobbyAutoCountdown();
      }
    }

    if (data.type === "LAUNCH_SOLO_SIMULATION") {
      await this.startGame(true);
    }

    if (data.type === "START_GAME") {
      if (this.lobbyCountdownInterval) {
        clearInterval(this.lobbyCountdownInterval);
        this.lobbyCountdownInterval = null;
      }
      await this.startGame(false);
    }

    if (data.type === "SUBMIT_ANSWER") {
      if (this.state.players[sender.id]) {
        this.state.players[sender.id].answer = data.answer;
        this.broadcastState();
        this.checkEarlyTransitionToDiscussion();
      }
    }

    if (data.type === "SEND_REACTION") {
      const senderPlayer = this.state.players[sender.id];
      if (!senderPlayer) return;

      this.state.lastReaction = {
        targetId: data.targetId,
        reaction: data.reaction,
        senderAgentName: senderPlayer.agentName || senderPlayer.name,
      };
      this.broadcastState();

      // If targeted player is the OpenAI Bot
      if (data.targetId === this.aiId && this.state.phase === "DISCUSSION") {
        this.handleAiReactionDefense(senderPlayer.agentName || "Agent", data.reaction);
      }

      // If targeted player is a Simulated Human
      const targetSim = this.state.players[data.targetId];
      if (targetSim && targetSim.isSimulatedHuman && this.state.phase === "DISCUSSION") {
        this.handleSimulatedChatReply(targetSim.agentName || "Agent", targetSim);
      }
    }

    if (data.type === "SEND_CHAT") {
      const senderPlayer = this.state.players[sender.id];
      if (!senderPlayer) return;

      const msg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        senderId: sender.id,
        senderAgentName: senderPlayer.agentName || senderPlayer.name,
        senderAgentAvatar: senderPlayer.agentAvatar || senderPlayer.avatar,
        text: data.text,
        timestamp: Date.now(),
      };
      this.state.chat.push(msg);
      this.broadcastState();

      if (this.state.phase === "DISCUSSION") {
        // Real AI Bot chatter
        this.handleAiChatReply();

        // Check if any dummy bot was called out by name in chat
        const lowerText = data.text.toLowerCase();
        const sims = Object.values(this.state.players).filter((p) => p.isSimulatedHuman);

        for (const sim of sims) {
          const simName = (sim.agentName || "").toLowerCase().replace("agent ", "");
          if (simName.length > 0 && lowerText.includes(simName)) {
            this.handleSimulatedChatReply(sim.agentName || "Agent", sim);
            break;
          }
        }
      }
    }

    if (data.type === "SUBMIT_VOTE") {
      if (this.state.players[sender.id]) {
        this.state.players[sender.id].votedFor = data.targetId;
        this.broadcastState();

        const voters = Object.values(this.state.players).filter((p) => !p.isAi);
        const allVoted =
          voters.length > 0 &&
          voters.every((p) => typeof p.votedFor === "string" && p.votedFor.length > 0);

        if (allVoted && this.state.phase === "VOTING") {
          if (this.timerInterval) clearInterval(this.timerInterval);
          this.resolveResults();
        }
      }
    }
  }

  startLobbyAutoCountdown() {
    this.state.timer = 10;
    this.broadcastState();

    this.lobbyCountdownInterval = setInterval(() => {
      this.state.timer -= 1;
      this.broadcastState();

      if (this.state.timer <= 0) {
        clearInterval(this.lobbyCountdownInterval);
        this.lobbyCountdownInterval = null;
        if (this.state.phase === "LOBBY") {
          this.startGame(false);
        }
      }
    }, 1000);
  }

  checkEarlyTransitionToDiscussion() {
    const allAnswered = Object.values(this.state.players).every(
      (p) => typeof p.answer === "string" && p.answer.trim().length > 0
    );

    if (allAnswered && this.state.phase === "QUESTION") {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.startDiscussionPhase();
    }
  }

  async generateDynamicQuestion(): Promise<string> {
    const categories = [
      "daily pet peeves and annoying habits",
      "awkward social dilemmas",
      "food crimes and weird tastes",
      "unspoken public transit rules",
      "things people secretly do but deny",
      "bad excuses to cancel plans",
    ];
    const category = categories[Math.floor(Math.random() * categories.length)];

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return "What is an unspoken rule people constantly break?";

      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are hosting a social party game. Generate ONE punchy, funny prompt (under 8 words) about: ${category}. No movie trivia. Return ONLY prompt text without quotes.`,
          },
        ],
        max_tokens: 25,
        temperature: 0.95,
      });

      return response.choices[0].message.content?.trim() || "What is an unspoken rule people constantly break?";
    } catch {
      return "What is something completely legal that feels illegal to do?";
    }
  }

  async notifyMatchmakerLock() {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await fetch(`${appUrl}/api/matchmake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: this.room.id, isLocked: true }),
      });
    } catch {}
  }

  async startGame(isSoloSimulation: boolean = false) {
    const existingCount = Object.keys(this.state.players).filter((k) => k !== this.aiId).length;

    if (isSoloSimulation || existingCount < 3) {
      if (!this.state.players["sim-human-1"]) {
        this.state.players["sim-human-1"] = {
          id: "sim-human-1",
          name: "Dev_Tester",
          avatar: "🦊",
          isAi: false,
          isSimulatedHuman: true,
          score: 0,
        };
      }
      if (!this.state.players["sim-human-2"]) {
        this.state.players["sim-human-2"] = {
          id: "sim-human-2",
          name: "CasualGamer",
          avatar: "🎧",
          isAi: false,
          isSimulatedHuman: true,
          score: 0,
        };
      }
    }

    this.state.players[this.aiId] = {
      id: this.aiId,
      name: "OpenAI Bot",
      avatar: "🤖",
      isAi: true,
      score: this.state.players[this.aiId]?.score || 0,
      answer: "",
      votedFor: undefined,
    };

    const shuffledIdentities = [...AGENT_IDENTITIES].sort(() => Math.random() - 0.5);
    const playerKeys = Object.keys(this.state.players);
    playerKeys.forEach((key, index) => {
      const identity = shuffledIdentities[index % shuffledIdentities.length];
      this.state.players[key].agentName = identity.name;
      this.state.players[key].agentAvatar = identity.avatar;
      this.state.players[key].answer = "";
      this.state.players[key].votedFor = undefined;
    });

    this.state.currentQuestion = await this.generateDynamicQuestion();
    this.state.phase = "QUESTION";
    this.state.timer = 30;
    this.state.chat = [];
    this.state.lastReaction = undefined;
    this.broadcastState();

    this.notifyMatchmakerLock().catch(() => {});
    this.handleAiAnswer();
    this.handleSimulatedAnswers();
    this.startTimer(() => this.startDiscussionPhase());
  }

  startDiscussionPhase() {
    this.state.phase = "DISCUSSION";
    this.state.timer = 40;
    this.broadcastState();
    this.startTimer(() => this.startVotingPhase());
  }

  startVotingPhase() {
    this.state.phase = "VOTING";
    this.state.timer = 20;
    this.broadcastState();

    Object.values(this.state.players).forEach((p) => {
      if (p.isSimulatedHuman) {
        setTimeout(() => {
          const candidates = Object.values(this.state.players).filter((cand) => cand.id !== p.id);
          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          p.votedFor = picked?.id;
          this.broadcastState();
        }, Math.floor(Math.random() * 4000) + 2000);
      }
    });

    this.startTimer(() => this.resolveResults());
  }

  resolveResults() {
    this.state.phase = "RESULTS";

    for (const p of Object.values(this.state.players)) {
      if (!p.isAi && p.votedFor === this.aiId) {
        p.score += 100;
      }
      if (p.isAi) {
        const fooled = Object.values(this.state.players).filter(
          (other) => !other.isAi && other.votedFor !== this.aiId
        ).length;
        p.score += fooled * 50;
      }
    }

    this.broadcastState();
  }

  startTimer(onComplete: () => void) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.state.timer -= 1;
      if (this.state.timer <= 0) {
        clearInterval(this.timerInterval);
        onComplete();
      }
      this.broadcastState();
    }, 1000);
  }

  async handleSimulatedAnswers() {
    const sims = Object.values(this.state.players).filter((p) => p.isSimulatedHuman);
    if (!sims.length) return;

    for (const sim of sims) {
      setTimeout(() => {
        const simFallbacks = ["loud chewing", "fake apologies", "slow walkers", "texting and walking", "talking during films"];
        sim.answer = simFallbacks[Math.floor(Math.random() * simFallbacks.length)];
        this.broadcastState();
        this.checkEarlyTransitionToDiscussion();
      }, Math.floor(Math.random() * 2000) + 3000);
    }
  }

  handleSimulatedChatReply(accusedAgentName: string, simPlayer: Player) {
    const defenseLines = [
      "bro what im literally human",
      "not me lol check the other answers",
      "why u on me",
      "definitely not bot haha",
      "bruh look at my answer",
      "im right here chill",
      "nah you got the wrong one"
    ];

    const reply = defenseLines[Math.floor(Math.random() * defenseLines.length)];

    setTimeout(() => {
      if (this.state.phase === "DISCUSSION") {
        this.state.chat.push({
          id: Math.random().toString(36).substring(7),
          senderId: simPlayer.id,
          senderAgentName: simPlayer.agentName || "Agent",
          senderAgentAvatar: simPlayer.agentAvatar || "👤",
          text: reply,
          timestamp: Date.now(),
        });
        this.broadcastState();
      }
    }, Math.floor(Math.random() * 1500) + 1200);
  }

  async handleAiAnswer() {
    const aiPlayer = this.state.players[this.aiId];
    if (!aiPlayer) return;

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        aiPlayer.answer = "cold soup";
        this.broadcastState();
        this.checkEarlyTransitionToDiscussion();
        return;
      }

      const client = new OpenAI({ apiKey });
      const prompt = `You are playing a party game undercover as "${aiPlayer.agentName}".
Question: "${this.state.currentQuestion}"
Goal: Casual 1-3 word human reply.
Rules: 1 to 3 words only. Lowercase only. No periods or commas. Zero filler.`;

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 15,
        temperature: 0.9,
      });

      const delay = Math.floor(Math.random() * 2000) + 3000;
      setTimeout(() => {
        const raw = response.choices[0].message.content?.trim() || "idk";
        aiPlayer.answer = raw.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        this.broadcastState();
        this.checkEarlyTransitionToDiscussion();
      }, delay);
    } catch {
      aiPlayer.answer = "idk honestly";
      this.broadcastState();
      this.checkEarlyTransitionToDiscussion();
    }
  }

  async handleAiChatReply() {
    const aiPlayer = this.state.players[this.aiId];
    if (!aiPlayer) return;

    const lastMessage = this.state.chat[this.state.chat.length - 1];
    if (!lastMessage || lastMessage.senderId === this.aiId) return;

    const cleanMsg = lastMessage.text.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    const myName = (aiPlayer.agentName || "").toLowerCase().replace("agent ", "");
    const nameMentioned = myName.length > 0 && cleanMsg.includes(myName);

    const myAnswer = (aiPlayer.answer || "").toLowerCase().trim();
    const answerWords = myAnswer.split(/\s+/).filter((w) => w.length > 2);

    const answerReferenced = answerWords.some((word) => {
      if (cleanMsg.includes(word)) return true;
      return cleanMsg.split(/\s+/).some((token) => {
        if (Math.abs(token.length - word.length) > 1) return false;
        let diffs = 0;
        for (let i = 0; i < Math.min(token.length, word.length); i++) {
          if (token[i] !== word[i]) diffs++;
        }
        return diffs <= 2;
      });
    });

    const isAccused = nameMentioned || answerReferenced;
    if (!isAccused && Math.random() > 0.35) return;

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return;

      const recentChat = this.state.chat.slice(-4).map((c) => `${c.senderAgentName}: ${c.text}`).join("\n");
      const client = new OpenAI({ apiKey });

      const prompt = `You are undercover as "${aiPlayer.agentName}" in a party game chat.
Your submitted answer was: "${aiPlayer.answer}".
Recent chat:
${recentChat}

${isAccused ? "Someone is questioning your answer or calling you out!" : "Someone just spoke."}
Task: Write a defensive or deflective human reply.
Rules: 3 to 7 words maximum. All lowercase, zero punctuation, casual phrasing. Decipher typos naturally.`;

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
        temperature: 0.9,
      });

      const replyText = response.choices[0].message.content?.trim();
      if (!replyText) return;

      setTimeout(() => {
        if (this.state.phase === "DISCUSSION") {
          this.state.chat.push({
            id: Math.random().toString(36).substring(7),
            senderId: this.aiId,
            senderAgentName: aiPlayer.agentName || "Agent",
            senderAgentAvatar: aiPlayer.agentAvatar || "👤",
            text: replyText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ""),
            timestamp: Date.now(),
          });
          this.broadcastState();
        }
      }, 2400);
    } catch (e) {
      console.error(e);
    }
  }

  async handleAiReactionDefense(attackerName: string, reactionType: string) {
    const aiPlayer = this.state.players[this.aiId];
    if (!aiPlayer) return;

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return;

      const client = new OpenAI({ apiKey });
      const prompt = `You are undercover as "${aiPlayer.agentName}".
Player "${attackerName}" just put a "${reactionType}" reaction badge on your answer!
Task: Fire back with a funny, quick defensive remark in live chat.
Rules: 3 to 6 words maximum. Lowercase only, no punctuation.`;

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 15,
        temperature: 0.9,
      });

      const replyText = response.choices[0].message.content?.trim();
      if (!replyText) return;

      setTimeout(() => {
        if (this.state.phase === "DISCUSSION") {
          this.state.chat.push({
            id: Math.random().toString(36).substring(7),
            senderId: this.aiId,
            senderAgentName: aiPlayer.agentName || "Agent",
            senderAgentAvatar: aiPlayer.agentAvatar || "👤",
            text: replyText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ""),
            timestamp: Date.now(),
          });
          this.broadcastState();
        }
      }, 2000);
    } catch {}
  }

  broadcastState() {
    this.room.broadcast(JSON.stringify({ type: "SYNC", state: this.state }));
  }
}