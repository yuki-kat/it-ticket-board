import { useState, useCallback } from 'react'

export interface AssignmentGroup {
  id: string
  name: string
  description?: string
  group_type: 'support' | 'engineering' | 'management' | 'vendor'
  contact_type: 'email_group' | 'slack_channel' | 'pagerduty_schedule' | 'individual'
  contact_address: string
  contact_phone?: string
  timezone: string
  business_hours_start: number
  business_hours_end: number
  member_count: number
  on_call_count: number
}

export interface EscalationRule {
  id: string
  ticket_type: string
  priority: string
  escalation_tier: number
  assignment_group_id: string
  group_name: string
  escalation_method: string
  escalate_after_hours?: number
  escalate_on_sla_breach: boolean
  notify_channels: string
  is_final_escalation: boolean
}

export interface EscalationEvent {
  id: string
  ticket_id: string
  from_tier: number
  to_tier: number
  from_group_id?: string
  to_group_id: string
  to_group_name: string
  escalation_reason: string
  escalated_by?: string
  escalated_by_name?: string
  notification_sent: boolean
  notification_channels?: string
  notification_timestamp?: string
  sla_impact: string
  ticket_priority: string
  ticket_type: string
  created_at: string
}

export function useEscalation(teamId: string) {
  const [groups, setGroups] = useState<AssignmentGroup[]>([])
  const [rules, setRules] = useState<EscalationRule[]>([])
  const [events, setEvents] = useState<EscalationEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load assignment groups
  const loadGroups = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`/api/teams/${teamId}/assignment-groups`)
      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()
      setGroups(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(`Failed to load groups: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [teamId])

  // Load escalation rules
  const loadRules = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`/api/teams/${teamId}/escalation-rules`)
      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()
      setRules(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(`Failed to load rules: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [teamId])

  // Create assignment group
  const createGroup = useCallback(async (groupData: Omit<AssignmentGroup, 'id' | 'member_count' | 'on_call_count'>) => {
    try {
      setError('')
      const response = await fetch(`/api/teams/${teamId}/assignment-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupData),
      })
      if (!response.ok) throw new Error(await response.text())
      await loadGroups()
    } catch (err) {
      setError(`Failed to create group: ${err instanceof Error ? err.message : 'Unknown error'}`)
      throw err
    }
  }, [teamId, loadGroups])

  // Update assignment group
  const updateGroup = useCallback(async (id: string, groupData: Omit<AssignmentGroup, 'id' | 'member_count' | 'on_call_count'>) => {
    try {
      setError('')
      const response = await fetch(`/api/teams/${teamId}/assignment-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupData),
      })
      if (!response.ok) throw new Error(await response.text())
      await loadGroups()
    } catch (err) {
      setError(`Failed to update group: ${err instanceof Error ? err.message : 'Unknown error'}`)
      throw err
    }
  }, [teamId, loadGroups])

  // Delete assignment group
  const deleteGroup = useCallback(async (id: string) => {
    try {
      setError('')
      const response = await fetch(`/api/teams/${teamId}/assignment-groups/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await response.text())
      await loadGroups()
    } catch (err) {
      setError(`Failed to delete group: ${err instanceof Error ? err.message : 'Unknown error'}`)
      throw err
    }
  }, [teamId, loadGroups])

  // Create escalation rule
  const createRule = useCallback(async (ruleData: Omit<EscalationRule, 'id' | 'group_name'>) => {
    try {
      setError('')
      const response = await fetch(`/api/teams/${teamId}/escalation-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData),
      })
      if (!response.ok) throw new Error(await response.text())
      await loadRules()
    } catch (err) {
      setError(`Failed to create rule: ${err instanceof Error ? err.message : 'Unknown error'}`)
      throw err
    }
  }, [teamId, loadRules])

  // Update escalation rule
  const updateRule = useCallback(async (id: string, ruleData: Omit<EscalationRule, 'id' | 'group_name'>) => {
    try {
      setError('')
      const response = await fetch(`/api/teams/${teamId}/escalation-rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData),
      })
      if (!response.ok) throw new Error(await response.text())
      await loadRules()
    } catch (err) {
      setError(`Failed to update rule: ${err instanceof Error ? err.message : 'Unknown error'}`)
      throw err
    }
  }, [teamId, loadRules])

  // Delete escalation rule
  const deleteRule = useCallback(async (id: string) => {
    try {
      setError('')
      const response = await fetch(`/api/teams/${teamId}/escalation-rules/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await response.text())
      await loadRules()
    } catch (err) {
      setError(`Failed to delete rule: ${err instanceof Error ? err.message : 'Unknown error'}`)
      throw err
    }
  }, [teamId, loadRules])

  // Load escalation history for a ticket
  const loadTicketHistory = useCallback(async (ticketId: string) => {
    try {
      setError('')
      const response = await fetch(
        `/api/teams/${teamId}/tickets/${ticketId}/escalation-history`,
        { headers: { 'Content-Type': 'application/json' } }
      )
      if (response.status === 403) {
        setError('You do not have permission to view this escalation history.')
        return
      }
      if (!response.ok) {
        setError('Failed to load escalation history')
        return
      }
      const data = await response.json()
      setEvents(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [teamId])

  return {
    // State
    groups,
    rules,
    events,
    loading,
    error,
    setError,
    // Group operations
    loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    // Rule operations
    loadRules,
    createRule,
    updateRule,
    deleteRule,
    // History operations
    loadTicketHistory,
  }
}
