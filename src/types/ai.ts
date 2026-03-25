export type AIProvider = "gpt" | "gemini" | "claude";
export type AIMode = "split" | "slideshow" | "teamwork" | "voting" | "parallel";

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
  routingNote?: string;
  autoRouted?: boolean;
  reasoningTokens?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
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

export interface SharedUpload {
  id: string;
  name: string;
  type: string;
  url: string;
  createdAt: number;
}

export interface DeepDiveThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  type: "chat" | "vote" | "teamwork";
  messages: ChatMessage[];
  voteResults?: VoteResult[];
  teamworkMessages?: TeamworkMessage[];
}

export interface DeepDive {
  id: string;
  title: string;
  providers: AIProvider[];
  createdAt: number;
  updatedAt: number;
  threads: DeepDiveThread[];
  uploads: SharedUpload[];
}

export const AI_MODELS: Record<AIProvider, AIModel> = {
  gpt: {
    id: "gpt",
    name: "GPT",
    fullName: "openai/gpt-oss-20b:free",
    color: "ai-gpt",
    description: "OpenRouter — GPT OSS 20B (free)",
  },
  gemini: {
    id: "gemini",
    name: "Llama",
    fullName: "meta-llama/llama-3.3-70b-instruct:free",
    color: "ai-gemini",
    description: "OpenRouter — Llama 3.3 70B Instruct (free)",
  },
  claude: {
    id: "claude",
    name: "Nemotron",
    fullName: "nvidia/nemotron-3-super-120b-a12b:free",
    color: "ai-claude",
    description: "OpenRouter — Nemotron 3 Super 120B (free)",
  },
};
