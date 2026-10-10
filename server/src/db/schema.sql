-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_system_admin BOOLEAN DEFAULT FALSE,
  is_compliance_officer BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- admin, member
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, user_id)
);

-- Queues
CREATE TABLE IF NOT EXISTS queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  queue_id UUID NOT NULL REFERENCES queues(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  ticket_type VARCHAR(50), -- incident, service_request, change, problem
  status VARCHAR(50) DEFAULT 'open', -- open, in_progress, resolved, closed
  priority VARCHAR(50) DEFAULT 'medium', -- low, medium, high, critical
  assigned_to UUID REFERENCES users(id),
  assigned_group_id UUID, -- assignment group, not individual (foreign key added below, after assignment_groups exists)
  created_by UUID NOT NULL REFERENCES users(id),
  sla_template_id UUID, -- foreign key added below, after sla_templates exists
  first_response_at TIMESTAMP,
  sla_breached BOOLEAN DEFAULT FALSE,
  sla_breached_at TIMESTAMP,
  current_escalation_tier INT DEFAULT 1,
  current_assignment_group_id UUID, -- foreign key added below
  escalated_to_tier_2_at TIMESTAMP,
  escalated_to_tier_3_at TIMESTAMP,
  last_escalation_check TIMESTAMP, -- last time we checked if auto-escalation is needed
  escalation_locked BOOLEAN DEFAULT FALSE, -- prevent further escalation if true
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns if they don't exist (for existing databases)
DO $$ BEGIN
  BEGIN
    ALTER TABLE tickets ADD COLUMN sla_breached BOOLEAN DEFAULT FALSE;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE tickets ADD COLUMN sla_breached_at TIMESTAMP;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE tickets ADD COLUMN current_escalation_tier INT DEFAULT 1;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE tickets ADD COLUMN current_assignment_group_id UUID;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE tickets ADD COLUMN last_escalation_check TIMESTAMP;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE tickets ADD COLUMN escalation_locked BOOLEAN DEFAULT FALSE;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE tickets ADD COLUMN sla_paused BOOLEAN DEFAULT FALSE;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE tickets ADD COLUMN sla_paused_at TIMESTAMP;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE tickets ADD COLUMN sla_paused_total_ms BIGINT DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
END $$;

-- Work notes
CREATE TABLE IF NOT EXISTS work_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SLA templates
CREATE TABLE IF NOT EXISTS sla_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  priority VARCHAR(50) NOT NULL, -- low, medium, high, critical
  response_time_minutes INT NOT NULL, -- time to first response
  resolution_time_hours INT NOT NULL, -- time to resolution
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, name, priority)
);

-- Email configuration
CREATE TABLE IF NOT EXISTS email_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port INT NOT NULL,
  smtp_user VARCHAR(255) NOT NULL,
  smtp_password VARCHAR(255) NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email notifications log
CREATE TABLE IF NOT EXISTS email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'user', -- user, ai, system
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI suggestions cache
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  suggestion_type VARCHAR(50) NOT NULL, -- summary, priority, assign, tags, duplicate, close_reason, template, knowledge, risk, next_step
  content TEXT NOT NULL,
  confidence DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Escalation events
CREATE TABLE IF NOT EXISTS escalation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_tier INT NOT NULL,
  to_tier INT NOT NULL,
  trigger_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assignment groups (teams of people, not individuals) - JIRA/ServiceNow pattern
CREATE TABLE IF NOT EXISTS assignment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL, -- "Service Desk", "Desktop Engineers", "Network Team"
  description TEXT,
  group_type VARCHAR(50) NOT NULL, -- support, engineering, management, vendor
  contact_type VARCHAR(50) NOT NULL, -- email_group, slack_channel, pagerduty_schedule, individual
  contact_address VARCHAR(255) NOT NULL, -- email, Slack channel, PagerDuty schedule ID
  contact_phone VARCHAR(20), -- for urgent escalations
  timezone VARCHAR(50), -- Asia/Tokyo, Europe/Berlin, US/Pacific
  business_hours_start INT DEFAULT 9, -- 9 AM
  business_hours_end INT DEFAULT 18, -- 6 PM
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, name)
);

-- Assignment group members (who is in each group)
CREATE TABLE IF NOT EXISTS assignment_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_on_call BOOLEAN DEFAULT FALSE,
  on_call_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, user_id)
);

-- Escalation matrix (ticket_type × priority × tier → assignment_group)
CREATE TABLE IF NOT EXISTS escalation_matrix_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ticket_type VARCHAR(50) NOT NULL, -- incident, service_request, change, problem
  priority VARCHAR(50) NOT NULL, -- critical, high, medium, low (or 1-4)
  escalation_tier INT NOT NULL, -- 1, 2, 3 (first contact, specialist, expert)
  assignment_group_id UUID NOT NULL REFERENCES assignment_groups(id),
  escalation_method VARCHAR(50) NOT NULL, -- automatic, manual, both
  escalate_after_hours INT, -- minutes before escalation (null = no auto-escalate)
  escalate_on_sla_breach BOOLEAN DEFAULT TRUE,
  notify_channels VARCHAR(255), -- comma-separated: email,slack,sms,phone
  is_final_escalation BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, ticket_type, priority, escalation_tier)
);

-- Time thresholds for automatic escalation per SLA tier
CREATE TABLE IF NOT EXISTS escalation_time_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ticket_type VARCHAR(50) NOT NULL,
  priority VARCHAR(50) NOT NULL,
  tier_1_minutes INT, -- escalate from tier 1 to tier 2 after X minutes
  tier_2_minutes INT, -- escalate from tier 2 to tier 3 after X minutes
  tier_3_minutes INT, -- escalate from tier 3 to management after X minutes
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, ticket_type, priority)
);

-- Custom escalation matrices (uploaded by organizations - reference documents)
CREATE TABLE IF NOT EXISTS escalation_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL, -- image/png, image/jpeg, application/pdf, etc.
  file_size INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SLA matrices (uploaded by organizations - reference documents)
CREATE TABLE IF NOT EXISTS sla_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL, -- image/png, image/jpeg, application/pdf, etc.
  file_size INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matrix files are stored in the database (file_data): the hosting plan's local disk is wiped when the
-- service sleeps. file_path remains only for rows uploaded before this change.
ALTER TABLE escalation_matrices ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE escalation_matrices ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE sla_matrices ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE sla_matrices ALTER COLUMN file_path DROP NOT NULL;

-- Escalation history and audit trail
CREATE TABLE IF NOT EXISTS escalation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id),
  from_tier INT NOT NULL,
  to_tier INT NOT NULL,
  from_group_id UUID REFERENCES assignment_groups(id),
  to_group_id UUID REFERENCES assignment_groups(id),
  escalation_reason VARCHAR(255) NOT NULL, -- time_based, sla_breach, manual, priority_change
  escalated_by UUID REFERENCES users(id), -- null if automatic
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_channels VARCHAR(255), -- which channels received notification
  notification_timestamp TIMESTAMP,
  sla_impact VARCHAR(50), -- at_risk, breached, within_sla
  ticket_priority VARCHAR(50),
  ticket_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Escalation channels (for legacy simple routing)
CREATE TABLE IF NOT EXISTS escalation_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tier INT NOT NULL, -- 1, 2, 3, etc.
  channel_type VARCHAR(50) NOT NULL, -- email, slack, teams, pagerduty, custom
  channel_identifier VARCHAR(255) NOT NULL, -- email address, Slack channel ID, etc.
  user_id UUID REFERENCES users(id), -- if routing to a person
  team_member_id UUID REFERENCES users(id), -- if escalating to specific user
  description VARCHAR(255), -- "Manager on call", "Senior Engineer", etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, tier, channel_type, channel_identifier)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_queues_team_id ON queues(team_id);
CREATE INDEX IF NOT EXISTS idx_tickets_team_id ON tickets(team_id);
CREATE INDEX IF NOT EXISTS idx_tickets_queue_id ON tickets(queue_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_breached ON tickets(sla_breached);
CREATE INDEX IF NOT EXISTS idx_tickets_escalation_tier ON tickets(current_escalation_tier);
CREATE INDEX IF NOT EXISTS idx_work_notes_ticket_id ON work_notes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sla_templates_team_id ON sla_templates(team_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_team_id ON email_notifications(team_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_ticket_id ON email_notifications(ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalation_events_ticket_id ON escalation_events(ticket_id);
-- Assignment group indexes
CREATE INDEX IF NOT EXISTS idx_assignment_groups_team_id ON assignment_groups(team_id);
CREATE INDEX IF NOT EXISTS idx_assignment_groups_contact_type ON assignment_groups(team_id, contact_type);
CREATE INDEX IF NOT EXISTS idx_assignment_group_members_group_id ON assignment_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_assignment_group_members_user_id ON assignment_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_group_members_on_call ON assignment_group_members(is_on_call, on_call_until);

-- Escalation matrix indexes
CREATE INDEX IF NOT EXISTS idx_escalation_matrix_rules_lookup ON escalation_matrix_rules(team_id, ticket_type, priority, escalation_tier);
CREATE INDEX IF NOT EXISTS idx_escalation_matrix_rules_group_id ON escalation_matrix_rules(assignment_group_id);

-- Time thresholds indexes
CREATE INDEX IF NOT EXISTS idx_escalation_time_thresholds_lookup ON escalation_time_thresholds(team_id, ticket_type, priority);

-- Escalation history indexes
CREATE INDEX IF NOT EXISTS idx_escalation_history_ticket_id ON escalation_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_team_id ON escalation_history(team_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_timestamp ON escalation_history(created_at);
CREATE INDEX IF NOT EXISTS idx_escalation_history_sla_impact ON escalation_history(sla_impact);

-- Legacy channel indexes
CREATE INDEX IF NOT EXISTS idx_escalation_matrices_team_id ON escalation_matrices(team_id);
CREATE INDEX IF NOT EXISTS idx_sla_matrices_team_id ON sla_matrices(team_id);
CREATE INDEX IF NOT EXISTS idx_escalation_channels_team_id ON escalation_channels(team_id);
CREATE INDEX IF NOT EXISTS idx_escalation_channels_tier ON escalation_channels(team_id, tier);

-- tickets is created before the tables these columns point to, so their foreign keys are added here.
-- Each is added only when missing, so existing databases (which already have them) are unchanged.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='tickets' AND constraint_name='tickets_current_assignment_group_id_fkey'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_current_assignment_group_id_fkey
      FOREIGN KEY (current_assignment_group_id) REFERENCES assignment_groups(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='tickets' AND constraint_name='tickets_assigned_group_id_fkey'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_assigned_group_id_fkey
      FOREIGN KEY (assigned_group_id) REFERENCES assignment_groups(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='tickets' AND constraint_name='tickets_sla_template_id_fkey'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_sla_template_id_fkey
      FOREIGN KEY (sla_template_id) REFERENCES sla_templates(id);
  END IF;
END $$;
