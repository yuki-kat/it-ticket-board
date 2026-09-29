export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'admin' | 'member';
  created_at: string;
}

export interface Queue {
  id: string;
  team_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  team_id: string;
  queue_id: string;
  title: string;
  description?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkNote {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SLATemplate {
  id: string;
  team_id: string;
  name: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  response_time_minutes: number;
  resolution_time_hours: number;
  created_at: string;
  updated_at: string;
}

export interface EmailConfig {
  id: string;
  team_id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  from_email: string;
  from_name?: string;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailNotification {
  id: string;
  team_id: string;
  ticket_id?: string;
  recipient_email: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed';
  error_message?: string;
  created_at: string;
  sent_at?: string;
}

export interface JWTPayload {
  user_id: string;
  email: string;
  iat: number;
  exp: number;
}
