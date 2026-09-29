const API_BASE = 'http://localhost:3001/api';

let authToken: string | null = localStorage.getItem('auth_token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function setAuthUser(user: unknown) {
  if (user) {
    localStorage.setItem('auth_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('auth_user');
  }
}

export function getAuthUser() {
  const user = localStorage.getItem('auth_user');
  return user ? JSON.parse(user) : null;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
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
  const result = await request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name })
  });
  setAuthToken(result.token);
  setAuthUser(result.user);
  return result;
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

// AI Suggestions
export async function getAISuggestions(ticketId: string) {
  return request(`/tickets/${ticketId}/ai-suggestions`, {
    method: 'POST'
  });
}

export async function getCachedSuggestions(ticketId: string) {
  return request(`/tickets/${ticketId}/ai-suggestions`);
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
