
import { API_BASE } from './base';

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function setAuthUser(user: unknown) {
  if (user) {
    try {
      localStorage.setItem('auth_user', JSON.stringify(user));
    } catch (e) {
      console.error('[setAuthUser] Failed to store:', e);
    }
  } else {
    localStorage.removeItem('auth_user');
  }
}

export function getAuthUser() {
  const user = localStorage.getItem('auth_user');
  if (user) return JSON.parse(user);

  // Fallback: if no stored user but we have a token, extract from JWT
  const token = localStorage.getItem('auth_token');
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        return { id: payload.user_id, email: payload.email, name: payload.email.split('@')[0] };
      }
    } catch (e) {
      console.error('Failed to extract user from token:', e);
    }
  }
  return null;
}

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function request(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>
  };

  const token = localStorage.getItem('auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API Error: ${response.status}`);
  }

  return response.json();
}

// Auth
export async function signup(email: string, password: string, name: string) {
  try {
    const result = await request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    setAuthToken(result.token);
    setAuthUser(result.user);
    return result;
  } catch (error) {
    console.error('Signup failed:', error);
    throw error;
  }
}

export async function login(email: string, password: string) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setAuthToken(result.token);
  setAuthUser(result.user);
  return result;
}

export function logout() {
  setAuthToken(null);
  setAuthUser(null);
}

// Tickets
export async function getTickets(teamId: string) {
  return request(`/teams/${teamId}/tickets`);
}

export async function getTicket(ticketId: string) {
  return request(`/tickets/${ticketId}`);
}

export async function createTicket(teamId: string, queueId: string, title: string, description?: string, priority?: string) {
  return request('/tickets', {
    method: 'POST',
    body: JSON.stringify({ team_id: teamId, queue_id: queueId, title, description, priority })
  });
}

export async function updateTicket(ticketId: string, updates: Record<string, unknown>) {
  return request(`/tickets/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

// Queues
export async function getQueues(teamId: string) {
  return request(`/teams/${teamId}/queues`);
}

export async function createQueue(teamId: string, name: string, description?: string) {
  return request('/queues', {
    method: 'POST',
    body: JSON.stringify({ team_id: teamId, name, description })
  });
}

export async function updateQueue(queueId: string, name: string, description?: string) {
  return request(`/queues/${queueId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, description })
  });
}

// Chat
export async function getChatMessages(ticketId: string) {
  return request(`/tickets/${ticketId}/chat`);
}

export async function postChatMessage(ticketId: string, content: string) {
  return request(`/tickets/${ticketId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

// AI Suggestions (powered by Gemini via backend proxy)
export async function getAISuggestions(_ticketId: string, ticket?: any) {
  try {
    const { generateTicketSuggestions } = await import('./gemini');
    const suggestions = await generateTicketSuggestions(
      ticket?.title || 'Ticket',
      ticket?.description || '',
      ticket?.priority || 'medium'
    );
    return { success: true, suggestions, source: 'gemini' };
  } catch (e) {
    console.warn('Gemini unavailable, using fallback suggestions:', e);
  }

  // Fallback: generate mock suggestions based on ticket content
  return {
    success: true,
    suggestions: 'Analyze the ticket details and check system logs. Consider rebooting affected systems if applicable. Document findings and escalate if needed.',
    source: 'fallback'
  };
}

export async function getCachedSuggestions(ticketId: string) {
  try {
    return request(`/tickets/${ticketId}/ai-suggestions`);
  } catch {
    return { success: true, suggestions: '', cached: true };
  }
}

// SLA
export async function getSLATemplates(teamId: string) {
  return request(`/teams/${teamId}/sla-templates`);
}

export async function createSLATemplate(teamId: string, name: string, priority: string, responseMins: number, resolutionHours: number) {
  return request('/sla-templates', {
    method: 'POST',
    body: JSON.stringify({
      team_id: teamId,
      name,
      priority,
      response_time_minutes: responseMins,
      resolution_time_hours: resolutionHours
    })
  });
}

// Email config
export async function getEmailConfig(teamId: string) {
  return request(`/teams/${teamId}/email-config`);
}

export async function updateEmailConfig(teamId: string, config: Record<string, unknown>) {
  return request(`/teams/${teamId}/email-config`, {
    method: 'PUT',
    body: JSON.stringify(config)
  });
}
