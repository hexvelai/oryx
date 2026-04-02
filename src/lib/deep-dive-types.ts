import type { UIMessage } from "ai";
import type { AIProvider } from "../types/ai";

export const DEEP_DIVE_PROVIDERS: AIProvider[] = [
  "nemotron",
  "dolphin",
  "qwen-coder",
  "glm-air",
  "trinity-mini",
  "qwen-plus",
  "step-flash",
  "gemini-3-flash",
  "gemini-2-flash",
];

export type DeepDiveRole = "owner" | "editor" | "commenter" | "viewer";

export type DeepDiveMessageMetadata = {
  createdAt?: number;
  provider?: AIProvider;
  model?: string;
  routingNote?: string;
  totalTokens?: number;
  done?: boolean;
  author?: {
    userId: string;
    name?: string;
    email?: string;
    image?: string;
  };
  replyTo?: {
    messageId: string;
    excerpt?: string;
  };
};

export type DeepDiveUIMessage = UIMessage<DeepDiveMessageMetadata>;

export interface VoteResult {
  provider: AIProvider;
  response: string;
  reasoning: string;
  votes: AIProvider[];
}

export interface TeamworkMessage {
  id: string;
  from: AIProvider;
  to: AIProvider | "all";
  content: string;
  timestamp: number;
}

export interface SharedUploadRecord {
  id: string;
  name: string;
  type: string;
  url: string;
  createdAt: number;
}

export type DeepDiveThreadType = "chat" | "vote" | "teamwork";

export interface DeepDiveThreadRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  type: DeepDiveThreadType;
  messages: DeepDiveUIMessage[];
  voteResults?: VoteResult[];
  teamworkMessages?: TeamworkMessage[];
}

export interface DeepDiveRecord {
  id: string;
  title: string;
  providers: AIProvider[];
  createdAt: number;
  updatedAt: number;
  myRole?: DeepDiveRole;
  threads: DeepDiveThreadRecord[];
  uploads: SharedUploadRecord[];
}

export interface DeepDiveMember {
  userId: string;
  name?: string;
  email?: string;
  image?: string;
  role: DeepDiveRole;
}

export interface HumanChatMessage {
  id: string;
  deepDiveId: string;
  author: {
    userId: string;
    name?: string;
    email?: string;
    image?: string;
  };
  text: string;
  replyTo?: {
    threadMessageId: string;
    excerpt?: string;
  };
  createdAt: number;
}

export interface CreateDeepDiveInput {
  title?: string;
  providers?: AIProvider[];
}

export interface CreateThreadInput {
  deepDiveId: string;
  title?: string;
  type?: DeepDiveThreadType;
  seedMessages?: DeepDiveUIMessage[];
}
