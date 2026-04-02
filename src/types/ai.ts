export type AIProvider =
  | "nemotron"
  | "dolphin"
  | "qwen-coder"
  | "glm-air"
  | "trinity-mini"
  | "qwen-plus"
  | "step-flash"
  | "gemini-3-flash"
  | "gemini-2-flash";
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
  nemotron: {
    id: "nemotron",
    name: "Nemotron",
    fullName: "nvidia/nemotron-3-super-120b-a12b:free",
    color: "ai-nemotron",
    description: "OpenRouter — Nemotron 3 Super 120B (free)",
  },
  dolphin: {
    id: "dolphin",
    name: "Dolphin",
    fullName: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    color: "ai-dolphin",
    description: "OpenRouter — Dolphin Mistral 24B Venice Edition (free)",
  },
  "qwen-coder": {
    id: "qwen-coder",
    name: "Qwen Coder",
    fullName: "qwen/qwen3-coder:free",
    color: "ai-qwen-coder",
    description: "OpenRouter — Qwen 3 Coder (free)",
  },
  "glm-air": {
    id: "glm-air",
    name: "GLM Air",
    fullName: "z-ai/glm-4.5-air:free",
    color: "ai-glm-air",
    description: "OpenRouter — GLM 4.5 Air (free)",
  },
  "trinity-mini": {
    id: "trinity-mini",
    name: "Trinity Mini",
    fullName: "arcee-ai/trinity-mini:free",
    color: "ai-trinity-mini",
    description: "OpenRouter — Trinity Mini (free)",
  },
  "qwen-plus": {
    id: "qwen-plus",
    name: "Qwen Plus",
    fullName: "qwen/qwen3.6-plus-preview:free",
    color: "ai-qwen-plus",
    description: "OpenRouter — Qwen 3.6 Plus Preview (free)",
  },
  "step-flash": {
    id: "step-flash",
    name: "Step Flash",
    fullName: "stepfun/step-3.5-flash:free",
    color: "ai-step-flash",
    description: "OpenRouter — Step 3.5 Flash (free, fast)",
  },
  "gemini-3-flash": {
    id: "gemini-3-flash",
    name: "Gemini Flash",
    fullName: "gemini-3-flash-preview",
    color: "ai-gemini-flash",
    description: "Gemini API — Gemini 3 Flash Preview",
  },
  "gemini-2-flash": {
    id: "gemini-2-flash",
    name: "Gemini 2 Flash",
    fullName: "gemini-2.0-flash",
    color: "ai-gemini-2-flash",
    description: "Gemini API — Gemini 2.0 Flash",
  },
};
