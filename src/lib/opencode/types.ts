/**
 * OpenCode server API types (v1 surface used by the dashboard).
 * Source of truth: the OpenAPI document served by `opencode serve` at /doc.
 */

export type Role = "user" | "assistant";

export interface TextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: { start: number; end?: number };
}

export interface ReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text: string;
  time?: { start: number; end?: number };
}

export type ToolStateStatus = "pending" | "running" | "completed" | "error";

export interface ToolState {
  status: ToolStateStatus;
  input?: unknown;
  output?: unknown;
  title?: string;
  metadata?: unknown;
  error?: string;
}

export interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;
  state: ToolState;
  metadata?: unknown;
}

export interface StepStartPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-start";
  snapshot?: string;
}

export interface StepFinishPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-finish";
  reason?: string;
  snapshot?: string;
  cost?: number;
  tokens?: {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
}

export interface SnapshotPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "snapshot";
  snapshot: string;
}

export interface PatchPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "patch";
  hash: string;
  files: string[];
}

export interface AgentPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "agent";
  name: string;
  source?: { value: string; start: number; end: number };
}

export interface RetryPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "retry";
  attempt: number;
  error?: { name?: string; data?: { message?: string } };
  time?: { created: number };
}

export interface CompactionPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "compaction";
  auto: boolean;
  overflow?: boolean;
  tail_start_id?: string;
}

export interface FilePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
}

export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | RetryPart
  | CompactionPart
  | FilePart;

export interface MessageError {
  name: string;
  data?: {
    message?: string;
    isRetryable?: boolean;
    metadata?: { url?: string };
  };
}

export interface MessageInfo {
  id: string;
  sessionID: string;
  role: Role;
  time: { created: number; completed?: number };
  error?: MessageError | null;
  parentID?: string;
  modelID?: string;
  providerID?: string;
  agent?: string;
  mode?: string;
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  path?: { cwd?: string; root?: string };
  summary?: unknown;
}

export interface Message {
  info: MessageInfo;
  parts: Part[];
}

export interface Session {
  id: string;
  slug?: string;
  title?: string;
  directory?: string;
  path?: string;
  projectID?: string;
  version?: string;
  parentID?: string;
  time?: { created?: number; updated?: number };
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
}

export interface ModelInfo {
  providerID: string;
  modelID: string;
  name: string;
  providerName: string;
  free: boolean;
  reasoning?: boolean;
  toolcall?: boolean;
  attachment?: boolean;
  contextLimit?: number;
  outputLimit?: number;
  isDefault?: boolean;
}

export interface ModelsResponse {
  models: ModelInfo[];
  connected: string[];
  total: number;
  error?: string;
}

export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata?: Record<string, unknown>;
  always?: string[];
  tool?: { messageID: string; callID: string };
}

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
}

export interface PermissionsResponse {
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
}

export interface ServerStatus {
  connected: boolean;
  version: string | null;
  project: string | null;
  worktree: string | null;
  vcs: string | null;
  sessions: number;
  authRequired: boolean;
  hasAuth: boolean;
  baseUrl: string;
  checkedAt: string;
  error?: string;
}

export interface OpenCodeEvent {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface ModelRef {
  providerID: string;
  modelID: string;
}
