import { useState, useEffect } from 'react';
import * as api from '../api/client';

interface Ticket {
  id: string;
  team_id: string;
  queue_id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigned_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useTickets(teamId: string | null) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;

    const fetchTickets = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getTickets(teamId);
        setTickets(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tickets');
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [teamId]);

  const createTicket = async (queueId: string, title: string, description?: string, priority?: string) => {
    if (!teamId) throw new Error('Team ID required');
    const ticket = await api.createTicket(teamId, queueId, title, description, priority);
    setTickets([...tickets, ticket]);
    return ticket;
  };

  const updateTicket = async (ticketId: string, updates: Record<string, unknown>) => {
    const updated = await api.updateTicket(ticketId, updates);
    setTickets(tickets.map(t => t.id === ticketId ? updated : t));
    return updated;
  };

  return { tickets, loading, error, createTicket, updateTicket };
}

export function useTicketDetail(ticketId: string | null) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) return;

    const fetchTicket = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getTicket(ticketId);
        setTicket(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch ticket');
      } finally {
        setLoading(false);
      }
    };

    fetchTicket();
  }, [ticketId]);

  const update = async (updates: Record<string, unknown>) => {
    if (!ticketId) throw new Error('Ticket ID required');
    const updated = await api.updateTicket(ticketId, updates);
    setTicket(updated);
    return updated;
  };

  return { ticket, loading, error, update };
}
