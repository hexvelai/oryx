import type { UIMessage } from "ai";
import type { AIProvider } from "../types/ai";

export const DEEP_DIVE_PROVIDERS: AIProvider[] = ["gpt", "gemini", "claude"];

export type DeepDiveMessageMetadata = {
  createdAt?: number;
  provider?: AIProvider;
  model?: string;
  routingNote?: string;
  totalTokens?: number;
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
  threads: DeepDiveThreadRecord[];
  uploads: SharedUploadRecord[];
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
