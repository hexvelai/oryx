import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { AIProvider, AIMode, ChatMessage, AIPanel, TeamworkMessage, VoteResult } from "@/types/ai";

interface ChatState {
  mode: AIMode;
  setMode: (mode: AIMode) => void;
  panels: Record<AIProvider, AIPanel>;
  masterMessages: ChatMessage[];
  sharedContext: ChatMessage[];
  teamworkMessages: TeamworkMessage[];
  voteResults: VoteResult[];
  activeProviders: AIProvider[];
  currentSlide: number;
  setCurrentSlide: (i: number) => void;
  toggleProvider: (p: AIProvider) => void;
  sendMessage: (content: string, target: AIProvider | "master") => void;
  startTeamwork: (prompt: string) => void;
  startVoting: (prompt: string) => void;
}

const ChatContext = createContext<ChatState | null>(null);

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}

let msgId = 0;
const uid = () => `msg-${++msgId}-${Date.now()}`;

const MOCK_RESPONSES: Record<AIProvider, string[]> = {
  gpt: [
    "I've analyzed this from multiple angles. Here's my structured breakdown:\n\n**Key Points:**\n1. The core issue involves balancing efficiency with accuracy\n2. Consider implementing a phased approach\n3. Testing should be integrated at each stage\n\nLet me know if you'd like me to dive deeper into any of these areas.",
    "That's an interesting challenge. Based on my training data, I'd recommend a systematic approach using established design patterns. The key insight is that premature optimization often leads to more complex problems down the line.",
    "I can help with that. Here's a concise solution that prioritizes readability and maintainability. I've included error handling and edge cases that are commonly overlooked.",
  ],
  gemini: [
    "⚡ Quick analysis: I've processed this across multiple modalities and here's what stands out:\n\n• The pattern you're describing maps well to a transformer-based architecture\n• I'd suggest starting with a lightweight prototype\n• Real-time feedback loops will be crucial\n\nWant me to generate a visual diagram?",
    "Interesting! I can see several connections here that might not be immediately obvious. The underlying structure suggests a graph-based approach would be most efficient. Speed is my strength — let me iterate on this quickly.",
    "I've cross-referenced this with current research. The consensus points toward a hybrid solution that combines traditional methods with newer approaches. Here's what I'd propose...",
  ],
  claude: [
    "Let me think through this carefully. I want to make sure I'm considering the nuances here.\n\nThere's an important distinction between what's technically optimal and what's practically useful. In my assessment:\n\n- The strongest approach balances both considerations\n- We should acknowledge the uncertainty in some of these areas\n- I'd recommend being explicit about our assumptions\n\nI'm happy to explore any aspect of this in more detail.",
    "This is a nuanced question that deserves a thoughtful response. I notice there are some underlying assumptions worth examining. Let me break this down while being transparent about the trade-offs involved.",
    "I appreciate the complexity here. Rather than jumping to a solution, let me first ensure I understand the constraints correctly. The most important factor seems to be reliability — would you agree?",
  ],
};

const TEAMWORK_SCRIPTS: TeamworkMessage[][] = [
  [
    { id: "tw-1", from: "gpt", to: "all", content: "I'll start by outlining the core technical approach. We need a modular architecture that can scale.", timestamp: 0 },
    { id: "tw-2", from: "gemini", to: "gpt", content: "Agreed on modularity. I can add that from a speed perspective, we should prioritize async operations and lazy loading.", timestamp: 0 },
    { id: "tw-3", from: "claude", to: "all", content: "Both valid points. I'd add that we should consider the user experience implications — technical elegance means nothing if it's confusing to use.", timestamp: 0 },
    { id: "tw-4", from: "gpt", to: "claude", content: "Fair point. Let me revise: modular architecture WITH a simple API surface. That satisfies both our concerns.", timestamp: 0 },
    { id: "tw-5", from: "gemini", to: "all", content: "I can prototype this quickly. Here's my proposed synthesis: modular core, async by default, progressive disclosure in the UI.", timestamp: 0 },
    { id: "tw-6", from: "claude", to: "all", content: "That's a strong consensus. Let me draft the final recommendation incorporating everyone's input.", timestamp: 0 },
  ],
];

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AIMode>("master");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeProviders, setActiveProviders] = useState<AIProvider[]>(["gpt", "gemini", "claude"]);
  const [masterMessages, setMasterMessages] = useState<ChatMessage[]>([]);
  const [sharedContext, setSharedContext] = useState<ChatMessage[]>([]);
  const [teamworkMessages, setTeamworkMessages] = useState<TeamworkMessage[]>([]);
  const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
  const [panels, setPanels] = useState<Record<AIProvider, AIPanel>>({
    gpt: { provider: "gpt", messages: [], isActive: true, isTyping: false },
    gemini: { provider: "gemini", messages: [], isActive: true, isTyping: false },
    claude: { provider: "claude", messages: [], isActive: true, isTyping: false },
  });

  const responseIdx = useRef<Record<string, number>>({ gpt: 0, gemini: 0, claude: 0 });

  const getMockResponse = useCallback((provider: AIProvider) => {
    const responses = MOCK_RESPONSES[provider];
    const idx = responseIdx.current[provider] % responses.length;
    responseIdx.current[provider]++;
    return responses[idx];
  }, []);

  const simulateResponse = useCallback((provider: AIProvider, userMsg: ChatMessage) => {
    setPanels(prev => ({
      ...prev,
      [provider]: { ...prev[provider], isTyping: true },
    }));

    const delay = 800 + Math.random() * 1500;
    setTimeout(() => {
      const response: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: getMockResponse(provider),
        timestamp: Date.now(),
        provider,
      };
      setPanels(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          messages: [...prev[provider].messages, response],
          isTyping: false,
        },
      }));
      setSharedContext(prev => [...prev, response]);
    }, delay);
  }, [getMockResponse]);

  const toggleProvider = useCallback((p: AIProvider) => {
    setActiveProviders(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  }, []);

  const sendMessage = useCallback((content: string, target: AIProvider | "master") => {
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content,
      timestamp: Date.now(),
      isShared: true,
    };

    setSharedContext(prev => [...prev, userMsg]);

    if (target === "master") {
      setMasterMessages(prev => [...prev, userMsg]);

      // Master AI routes to best provider
      const routes: AIProvider[] = ["gpt", "gemini", "claude"];
      const chosen = routes[Math.floor(Math.random() * routes.length)];

      const routeMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `Routing to **${chosen.toUpperCase()}** — this query is best suited for ${chosen === "gpt" ? "structured reasoning" : chosen === "gemini" ? "fast multimodal analysis" : "nuanced understanding"}.`,
        timestamp: Date.now(),
        provider: "master",
      };

      setTimeout(() => {
        setMasterMessages(prev => [...prev, routeMsg]);
      }, 400);

      // Add user message to that panel and simulate response
      setPanels(prev => ({
        ...prev,
        [chosen]: {
          ...prev[chosen],
          messages: [...prev[chosen].messages, userMsg],
        },
      }));

      setTimeout(() => {
        simulateResponse(chosen, userMsg);
      }, 600);

      // After AI responds, add its response to master messages
      setTimeout(() => {
        const resp: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: getMockResponse(chosen),
          timestamp: Date.now(),
          provider: chosen,
        };
        setMasterMessages(prev => [...prev, resp]);
        setPanels(prev => ({
          ...prev,
          [chosen]: { ...prev[chosen], isTyping: false },
        }));
      }, 1800 + Math.random() * 1000);
    } else {
      setPanels(prev => ({
        ...prev,
        [target]: {
          ...prev[target],
          messages: [...prev[target].messages, userMsg],
        },
      }));
      simulateResponse(target, userMsg);
    }
  }, [simulateResponse, getMockResponse]);

  const startTeamwork = useCallback((prompt: string) => {
    setMode("teamwork");
    setTeamworkMessages([]);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      isShared: true,
    };
    setSharedContext(prev => [...prev, userMsg]);

    const script = TEAMWORK_SCRIPTS[0];
    script.forEach((msg, i) => {
      setTimeout(() => {
        setTeamworkMessages(prev => [
          ...prev,
          { ...msg, id: uid(), timestamp: Date.now() },
        ]);
      }, (i + 1) * 1800);
    });

    // Final synthesis message
    setTimeout(() => {
      const finalMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "**Team Consensus:** We recommend a modular, async-first architecture with progressive disclosure in the UI. This balances technical scalability (GPT), performance (Gemini), and usability (Claude). Each module should have a simple API surface to minimize cognitive load.",
        timestamp: Date.now(),
        provider: "master",
      };
      setMasterMessages(prev => [...prev, finalMsg]);
    }, script.length * 1800 + 1000);
  }, []);

  const startVoting = useCallback((prompt: string) => {
    setMode("voting");
    setVoteResults([]);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      isShared: true,
    };
    setSharedContext(prev => [...prev, userMsg]);

    setTimeout(() => {
      setVoteResults([
        {
          provider: "gpt",
          response: "Option A is optimal — it has the best time complexity and scales linearly with input size.",
          votes: ["gemini"],
          reasoning: "Strong technical analysis with clear metrics.",
        },
        {
          provider: "gemini",
          response: "Option B offers the best speed-to-quality ratio. It's 40% faster with marginal quality loss.",
          votes: ["gpt", "claude"],
          reasoning: "Practical trade-off analysis that considers real-world constraints.",
        },
        {
          provider: "claude",
          response: "Option C is safest — lower risk, well-documented pattern, easier to maintain long-term.",
          votes: [],
          reasoning: "Conservative but reliable approach.",
        },
      ]);
    }, 2000);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        mode, setMode, panels, masterMessages, sharedContext,
        teamworkMessages, voteResults, activeProviders,
        currentSlide, setCurrentSlide, toggleProvider,
        sendMessage, startTeamwork, startVoting,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
