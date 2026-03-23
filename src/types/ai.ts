export type AIProvider = "gpt" | "gemini" | "claude";
export type AIMode = "split" | "slideshow" | "master" | "teamwork" | "voting";

export interface AIModel {
  id: AIProvider;
  name: string;
  fullName: string;
  color: string;
  description: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  provider?: AIProvider | "master";
  isShared?: boolean;
}

export interface AIPanel {
  provider: AIProvider;
  messages: ChatMessage[];
  isActive: boolean;
  isTyping: boolean;
}

export interface TeamworkMessage {
  id: string;
  from: AIProvider;
  to: AIProvider | "all";
  content: string;
  timestamp: number;
}

export interface VoteResult {
  provider: AIProvider;
  response: string;
  votes: AIProvider[];
  reasoning: string;
}

export const AI_MODELS: Record<AIProvider, AIModel> = {
  gpt: {
    id: "gpt",
    name: "GPT",
    fullName: "GPT-5",
    color: "ai-gpt",
    description: "Powerful reasoning and code generation",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    fullName: "Gemini 3 Flash",
    color: "ai-gemini",
    description: "Fast multimodal understanding",
  },
  claude: {
    id: "claude",
    name: "Claude",
    fullName: "Claude 4 Sonnet",
    color: "ai-claude",
    description: "Nuanced analysis and writing",
  },
};
