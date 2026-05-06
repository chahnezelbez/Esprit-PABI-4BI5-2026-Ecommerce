export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  loading?: boolean;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}