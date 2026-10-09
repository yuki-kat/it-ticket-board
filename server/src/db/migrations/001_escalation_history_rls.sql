-- Migration: Add Row-Level Security (RLS) to escalation_history table
-- Purpose: Enforce access control so only authorized users can view escalation audit logs
-- Compliance: GDPR, SOX, HIPAA audit log access control

-- Enable RLS on escalation_history table
ALTER TABLE escalation_history ENABLE ROW LEVEL SECURITY;

-- Policy 1: Team admins can view all escalations for their team
CREATE POLICY escalation_history_admin_access ON escalation_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = escalation_history.team_id
        AND tm.user_id = current_user_id()
        AND tm.role = 'admin'
    )
  );

-- Policy 2: Compliance officers can view all escalations across all teams
CREATE POLICY escalation_history_compliance_access ON escalation_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = current_user_id()
        AND u.is_compliance_officer = TRUE
    )
  );

-- Policy 3: Users can view escalations for tickets they created
CREATE POLICY escalation_history_creator_access ON escalation_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = escalation_history.ticket_id
        AND t.created_by = current_user_id()
    )
  );

-- Policy 4: Users who escalated can view their own escalations
CREATE POLICY escalation_history_escalator_access ON escalation_history
  FOR SELECT
  USING (escalated_by = current_user_id());

-- Disable access for INSERT/UPDATE/DELETE to enforce append-only immutability
CREATE POLICY escalation_history_immutable_insert ON escalation_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = escalation_history.team_id
        AND tm.user_id = current_user_id()
        AND tm.role = 'admin'
    )
  );

CREATE POLICY escalation_history_no_update ON escalation_history
  FOR UPDATE
  USING (FALSE);

CREATE POLICY escalation_history_no_delete ON escalation_history
  FOR DELETE
  USING (FALSE);

-- Add is_compliance_officer column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_compliance_officer BOOLEAN DEFAULT FALSE;

-- Add index for faster RLS lookups
CREATE INDEX IF NOT EXISTS idx_team_members_admin ON team_members(team_id, user_id, role)
  WHERE role = 'admin';
CREATE INDEX IF NOT EXISTS idx_users_compliance ON users(id)
  WHERE is_compliance_officer = TRUE;
