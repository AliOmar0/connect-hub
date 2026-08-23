// Database types matching Supabase schema
export type AppRole = "admin" | "supervisor" | "manager" | "agent" | "viewer";
export type ChannelType = "whatsapp" | "messenger" | "sms" | "voice" | "email";
export type SessionStatus =
  | "active"
  | "waiting"
  | "completed"
  | "escalated"
  | "auto_closed"
  | "missed";
export type MessageDirection = "inbound" | "outbound";

export interface Profile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  department: string | null;
  status: string;
  languages: string[];
  skills: string[];
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface Employee {
  id: string;
  profile_id: string | null;
  employee_code: string | null;
  department: string | null;
  shift_start: string | null;
  shift_end: string | null;
  assigned_channels: ChannelType[];
  is_active: boolean;
  performance_score: number;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface Customer {
  id: string;
  external_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  channel_identifier: string | null;
  preferred_channel: ChannelType | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  customer_id: string | null;
  employee_id: string | null;
  channel: ChannelType;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  wait_time_seconds: number | null;
  duration_seconds: number | null;
  satisfaction_score: number | null;
  escalated_to: string | null;
  resolution_notes: string | null;
  main_type_id: string | null;
  /** Voice only: the ElevenLabs conversation id. NULL on every other channel. */
  external_conversation_id: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  employee?: Employee;
  main_type?: SessionMainType;
}

export interface Message {
  id: string;
  session_id: string | null;
  direction: MessageDirection;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  channel: ChannelType;
  external_message_id: string | null;
  classification: string | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Call {
  id: string;
  session_id: string | null;
  customer_id: string | null;
  employee_id: string | null;
  direction: MessageDirection;
  phone_number: string | null;
  duration_seconds: number | null;
  status: string;
  recording_url: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  customer?: Customer;
  employee?: Employee;
}

export interface ApiConfiguration {
  id: string;
  channel: ChannelType;
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  webhook_url: string | null;
  phone_number_id: string | null;
  business_account_id: string | null;
  access_token_encrypted: string | null;
  is_active: boolean;
  last_verified_at: string | null;
  config_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

export interface AnalyticsDaily {
  id: string;
  date: string;
  channel: ChannelType | null;
  total_sessions: number;
  total_messages: number;
  total_calls: number;
  avg_response_time_seconds: number | null;
  avg_satisfaction_score: number | null;
  escalation_count: number;
  created_at: string;
}

export interface SessionMainType {
  id: string;
  name: string;
  parent_category: string | null;
  description: string | null;
  /** Detailed, structured knowledge injected into the AI's system prompt
   * when a session is classified under this type, and indexed into the RAG
   * vector store (source='session_type') via the Knowledge Base page. */
  ai_prompt?: string | null;
  created_at: string;
}

export interface ChatShortcut {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}
