import {
  Session,
  Customer,
  Employee,
  Profile,
  Message,
  Call,
  Notification,
} from "@/types/database";

// Customer fixtures
export const mockCustomer: Customer = {
  id: "customer-1",
  name: "John Doe",
  email: "john.doe@example.com",
  phone: "+1234567890",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockCustomers: Customer[] = [
  mockCustomer,
  {
    id: "customer-2",
    name: "Jane Smith",
    email: "jane.smith@example.com",
    phone: "+1234567891",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Profile fixtures
export const mockProfile: Profile = {
  user_id: "user-1",
  email: "agent@example.com",
  first_name: "Agent",
  last_name: "One",
  phone: "+1234567892",
  department: "Support",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockProfiles: Profile[] = [
  mockProfile,
  {
    user_id: "user-2",
    email: "agent2@example.com",
    first_name: "Agent",
    last_name: "Two",
    phone: "+1234567893",
    department: "Sales",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Employee fixtures
export const mockEmployee: Employee = {
  id: "employee-1",
  profile_id: "profile-1",
  employee_code: "EMP001",
  department: "Support",
  shift_start: "09:00:00",
  shift_end: "17:00:00",
  assigned_channels: ["whatsapp", "messenger"],
  is_active: true,
  performance_score: 0.85,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockEmployees: Employee[] = [
  mockEmployee,
  {
    id: "employee-2",
    profile_id: "profile-2",
    employee_code: "EMP002",
    department: "Sales",
    shift_start: "10:00:00",
    shift_end: "18:00:00",
    assigned_channels: ["sms", "voice"],
    is_active: true,
    performance_score: 0.75,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Session fixtures
export const mockSession: Session = {
  id: "session-1",
  customer_id: "customer-1",
  employee_id: "employee-1",
  channel: "whatsapp",
  status: "active",
  started_at: new Date().toISOString(),
  ended_at: null,
  duration_seconds: 300,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockSessions: Session[] = [
  mockSession,
  {
    id: "session-2",
    customer_id: "customer-2",
    employee_id: "employee-2",
    channel: "messenger",
    status: "active",
    started_at: new Date(Date.now() - 60000).toISOString(),
    ended_at: null,
    duration_seconds: 60,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "session-3",
    customer_id: "customer-1",
    employee_id: null,
    channel: "voice",
    status: "on-hold",
    started_at: new Date(Date.now() - 120000).toISOString(),
    ended_at: null,
    duration_seconds: 120,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Message fixtures
export const mockMessage: Message = {
  id: "message-1",
  session_id: "session-1",
  direction: "inbound",
  content: "Hello, I need help",
  channel: "whatsapp",
  media_url: null,
  media_type: null,
  external_message_id: null,
  sent_at: new Date().toISOString(),
  delivered_at: null,
  read_at: null,
  created_at: new Date().toISOString(),
};

export const mockMessages: Message[] = [
  mockMessage,
  {
    id: "message-2",
    session_id: "session-1",
    direction: "outbound",
    content: "How can I help you?",
    channel: "whatsapp",
    media_url: null,
    media_type: null,
    external_message_id: null,
    sent_at: new Date().toISOString(),
    delivered_at: null,
    read_at: null,
    created_at: new Date().toISOString(),
  },
];

// Call fixtures
export const mockCall: Call = {
  id: "call-1",
  session_id: "session-1",
  customer_id: "customer-1",
  employee_id: "employee-1",
  direction: "inbound",
  phone_number: "+1234567890",
  duration_seconds: 300,
  status: "completed",
  recording_url: null,
  started_at: new Date().toISOString(),
  ended_at: new Date(Date.now() + 300000).toISOString(),
  created_at: new Date().toISOString(),
};

export const mockCalls: Call[] = [
  mockCall,
  {
    id: "call-2",
    session_id: "session-2",
    customer_id: "customer-2",
    employee_id: "employee-2",
    direction: "outbound",
    phone_number: "+1234567891",
    duration_seconds: 180,
    status: "completed",
    recording_url: null,
    started_at: new Date().toISOString(),
    ended_at: new Date(Date.now() + 180000).toISOString(),
    created_at: new Date().toISOString(),
  },
];

// Notification fixtures
export const mockNotification: Notification = {
  id: "notification-1",
  user_id: "user-1",
  title: "New Message",
  message: "You have a new message from John Doe",
  type: "message",
  is_read: false,
  action_url: "/sessions/session-1",
  created_at: new Date().toISOString(),
};

export const mockNotifications: Notification[] = [
  mockNotification,
  {
    id: "notification-2",
    user_id: "user-1",
    title: "Call Assigned",
    message: "You have been assigned a new call",
    type: "call",
    is_read: false,
    action_url: "/sessions/session-2",
    created_at: new Date().toISOString(),
  },
];

// Analytics fixtures
export const mockAnalyticsDaily = {
  date: new Date().toISOString().split("T")[0],
  channel: "whatsapp" as const,
  total_messages: 100,
  total_calls: 10,
  avg_response_time_seconds: 30,
  total_sessions: 50,
};

export const mockAnalyticsData = [
  mockAnalyticsDaily,
  {
    date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
    channel: "messenger" as const,
    total_messages: 80,
    total_calls: 8,
    avg_response_time_seconds: 25,
    total_sessions: 40,
  },
];

// Dashboard stats fixture
export const mockDashboardStats = {
  totalMessages: 1000,
  totalCalls: 100,
  activeSessions: 5,
  totalEmployees: 10,
  avgResponseTime: 30,
  totalCustomers: 500,
};
