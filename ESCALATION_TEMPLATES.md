# Escalation System Implementation Templates
## Ready-to-Use Templates and Configuration Examples

---

## Table of Contents

1. [JIRA Automation Rules (Copy-Paste Templates)](#jira-automation-rules)
2. [ServiceNow SLA Configuration Examples](#servicenow-sla-configuration)
3. [Escalation Matrix Templates](#escalation-matrix-templates)
4. [Notification Templates](#notification-templates)
5. [Runbook Examples](#runbook-examples)
6. [Metrics and Dashboards](#metrics-and-dashboards)

---

## JIRA Automation Rules

### Template 1: SLA-Based Time Escalation (P1)

**Trigger:** Schedule trigger (runs every 5 minutes)

```
Name: P1 Incident - Escalate at 75% SLA

When:
- Scheduled (every 5 minutes)

If:
- Project = "Service Desk"
- Priority = Critical
- Status = "In Progress"
- Issue Type = Incident
- Created < 15 minutes ago
- Custom field "SLA % Elapsed" >= 75
- Custom field "Escalation Status" != "Escalated to Tier 2"

Then:
- Transition issue → "Escalated to Tier 2"
- Set field Escalation Status = "Escalated to Tier 2"
- Set assignee to "Tier 2 Technical Team"
- Add comment: "Automated escalation at 75% SLA. Originally assigned to @{{ issue.assignee }}. Escalated to @Tier 2 Team - Critical incident requires immediate attention."
- Send notification to:
  - Tier 2 Technical Team (Slack + Email)
  - Tier 2 Manager (SMS + Email)
  - Service Desk Manager (Email)
- Add label "escalated_auto_p1"
- Log audit entry: "Automated escalation: P1 SLA 75% threshold"
```

### Template 2: Priority-Based Initial Routing

**Trigger:** Issue created

```
Name: Auto-Assign Based on Priority and Impact

When:
- Issue created
- Project = "Service Desk"
- Issue Type = Incident

If Priority = Critical AND Impact = High:
Then:
  - Set assignee to "L2 Technical Team Lead"
  - Set custom field "Starting Level" = "Tier 2"
  - Set custom field "Escalation Status" = "Direct to Tier 2"
  - Apply SLA profile "P1 - Critical"
  - Add watchers: [Service Desk Manager, Tier 2 Manager, Director of IT]
  - Send notification (Slack + SMS to team lead)
  - Add comment: "Critical priority incident - assigned directly to L2 team for immediate response"

If Priority = High AND (Impact = High OR Urgency = High):
Then:
  - Set assignee to "L1 Advanced Support"
  - Set custom field "Starting Level" = "Tier 1 Advanced"
  - Apply SLA profile "P2 - High"
  - Add watchers: [Service Desk Manager, Tier 2 Manager]
  - Send notification (Email + Slack)

If Priority = Medium:
Then:
  - Set assignee to "L1 Standard Support"
  - Set custom field "Starting Level" = "Tier 1"
  - Apply SLA profile "P3 - Medium"
  - Send notification (Email)

If Priority = Low:
Then:
  - Set assignee to "L1 Basic Support"
  - Apply SLA profile "P4 - Low"
  - No notification sent
```

### Template 3: Escalation on Extended Inactivity

**Trigger:** Issue updated

```
Name: Escalate if No Progress for 2 Hours

When:
- Issue updated

If:
- Status = "In Progress"
- Days since issue created < 1
- Hours since last comment >= 2
- Hours since last status change >= 2
- Priority = High OR Priority = Critical
- Custom field "Last Escalation" < 2 hours ago (is empty or older)

Then:
- Send comment: "@{{ issue.assignee }} - This ticket has been in progress for 2+ hours without update. Please provide status or we'll escalate. Respond within 15 minutes to avoid escalation."
- Send notification to assignee (Slack + Email): "Action Required: Ticket {{issue.key}} needs status update"
- Set custom field "Escalation Warning" = "Sent"
- If no response in 15 minutes:
  - Escalate to team lead
  - Set field "Last Escalation Timestamp" = Now
  - Send escalation notification
```

### Template 4: De-escalation Rule (Don't Always Go Up)

**Trigger:** Issue updated

```
Name: De-escalate if Complexity Decreases

When:
- Issue updated

If:
- Status = "In Progress"
- Custom field "Escalation Status" = "Escalated to Tier 2"
- Comment contains any of: [resolved, fixed, workaround found, not actually critical]
- OR: Resolution set = [Workaround, Non-Issue, Configuration Fix]

Then:
- Send comment: "Issue appears to have a resolution. De-escalating from Tier 2 back to Tier 1 for final implementation."
- Transition to "Ready to Resolve"
- Set assignee to "Tier 1 Support Team"
- Remove from escalated queue
- Set custom field "Escalation Status" = "De-escalated"
- Add label "de-escalated"
- Log audit: "De-escalation from Tier 2 - complexity reduced"
```

### Template 5: Escalation to Manager for Authority

**Trigger:** Issue updated (manual)

```
Name: Manual Manager Escalation (Authority Decision)

When:
- [Manual trigger - run via button]

If:
- Assignee clicks "Escalate to Manager" button
- Custom field "Escalation Reason" is populated (Select: Policy Exception, Budget Approval, Customer Dispute, etc.)

Then:
- Set status to "Manager Review"
- Set assignee to appropriate manager based on issue category
- Set custom field "Escalation Status" = "Pending Manager Decision"
- Create subtask: "Manager Review - [Reason]"
- Send notification to manager: "Urgent: {{issue.key}} requires manager decision - {{custom_field.escalation_reason}}"
- Set SLA to "Manager Review SLA" (4 hours)
- Add comment: "Escalated to management by @{{ issue.assignee }} for decision on: {{custom_field.escalation_reason}}"
- Tag: [manager_escalation]
```

---

## ServiceNow SLA Configuration

### Example: P1 Incident SLA with Multi-Level Escalation

```javascript
Table: Incident Management > SLA Definitions
Record Name: P1_Critical_Incident_SLA
Record Type: SLA
Applies To: Incident
Active: Yes

// Matching Conditions
Conditions for SLA match:
  - Priority = 1 (Critical)
  - State = 1 (New)

// Timeline Configuration
Response Target: 15 minutes
Resolution Target: 4 hours
Business Hours Only: No (24/7 clock)
Pause on Hold: Yes

// Escalation Rules
Escalation Point 1:
  - Percentage: 50% (7.5 minutes)
  - Target Type: Group
  - Target: IT Service Desk Manager
  - Actions on Escalation:
    * Notify: [IT Service Desk Manager, Tier 2 Team Lead]
    * Channels: Email, SMS
    * Set field "escalation_level" = 1
    * Create activity: "SLA approaching 50%"
  
Escalation Point 2:
  - Percentage: 75% (11.25 minutes)
  - Target Type: Group
  - Target: L2 Technical Team
  - Actions on Escalation:
    * Auto-assign to: Tier 2 Technical Team
    * Notify: [Tier 2 Manager, IT Director]
    * Channels: SMS, Phone, Email, Slack
    * Adjust: Priority = Increase by 1 (if possible)
    * Create: Change Request for tracking
    * Set field "escalation_level" = 2
    * Add comment: "Escalated to Tier 2 due to SLA at 75%"
  
Escalation Point 3:
  - Percentage: 100% (Breach)
  - Target Type: Individual + Group
  - Target: IT Director + VP of IT Operations
  - Actions on Escalation:
    * Notify: [IT Director, VP IT Operations, CISO if Security-related]
    * Channels: SMS, Phone, Email
    * Create: Major Incident record
    * Create: Post-Incident Review task
    * Set field "escalation_level" = 3
    * Add comment: "*** SLA BREACH - Critical escalation to executive level ***"
    * Trigger: Executive dashboard widget
    * Update: Communication log with broadcast status
```

### Example: Service Request SLA with Functional Escalation

```javascript
Table: Request > SLA Definitions
Record Name: Complex_SR_SLA
Record Type: SLA
Applies To: Service Request (sc_request)
Active: Yes

// Matching Conditions
Conditions:
  - Request Type = "Complex Configuration"
  - OR: Category = "New System Access"
  - OR: Custom field "Estimated Effort" = High

// Timeline Configuration
Target Time: 8 hours
Business Hours Only: Yes (9 AM - 5 PM only)
Pause on Hold: Yes

// Escalation Configuration
Escalation Point 1:
  - Time: 4 hours (50%)
  - Action: Auto-assign to Specialist Group
  - Notify: [Specialist Group Manager, Requester]
  - Set: Priority = High (if not already)

Escalation Point 2:
  - Time: 6 hours (75%)
  - Action: Notify Project Manager
  - Send: Update email to requester with ETA
  - Create: Follow-up task
```

---

## Escalation Matrix Templates

### Template 1: Incident Management Matrix (Full Detail)

```
╔════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                              INCIDENT ESCALATION MATRIX                                                     ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ P1 - CRITICAL                                                                                               │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Definition: System down, multiple users affected, revenue impact, security breach                          │
│ Starting Level: L2 Technical Team (direct assignment)                                                      │
│ Initial Response Time: 15 minutes                                                                          │
├──────────────────────────────────────────────────────────┬──────────────────────────────────────────────────┤
│ At 50% SLA (7-8 min elapsed)                            │ At 75% SLA (11-12 min elapsed)                   │
│ ├─ Action: Notify                                        │ ├─ Action: Escalate + Auto-assign                │
│ ├─ Target: Tier 2 Manager, Tier 3 Team Lead             │ ├─ Target: Tier 3 Lead                           │
│ ├─ Notification: SMS + Slack + Email                    │ ├─ Notification: SMS + Phone + Slack + Email     │
│ ├─ Content: Status check requested                      │ ├─ Content: Escalation to expert needed          │
│ └─ No action required yet                               │ └─ Requires immediate handoff                     │
├──────────────────────────────────────────────────────────┴──────────────────────────────────────────────────┤
│ At Breach (15+ min)                                                                                         │
│ ├─ Action: Executive Escalation                                                                             │
│ ├─ Notify: IT Director, VP Operations, CISO (if security)                                                 │
│ ├─ Notification: Phone call + SMS + Email                                                                 │
│ ├─ Create: Major Incident record                                                                           │
│ └─ Activate: War room / bridge call                                                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ P2 - HIGH                                                                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Definition: Significant service degradation, workaround exists, department impact                         │
│ Starting Level: L1 Advanced Support                                                                        │
│ Initial Response Time: 1 hour                                                                              │
├──────────────────────────────────────────────────────────┬──────────────────────────────────────────────────┤
│ At 50% SLA (30 min)                                     │ At 75% SLA (45 min)                              │
│ ├─ Action: Notify Team Lead                             │ ├─ Action: Escalate to Tier 2                    │
│ ├─ Target: Support Team Lead                            │ ├─ Target: L2 Technical Team                     │
│ ├─ Notification: Slack + Email                          │ ├─ Notification: Email + Slack                   │
│ ├─ Content: Check on progress / status                  │ ├─ Content: Escalation for technical expertise   │
│ └─ Optional escalation discussion                       │ └─ Auto-assign to Tier 2 group                   │
├──────────────────────────────────────────────────────────┴──────────────────────────────────────────────────┤
│ At Breach (1+ hour)                                                                                         │
│ ├─ Action: Manager Escalation                                                                               │
│ ├─ Notify: Service Desk Manager, L2 Manager                                                               │
│ ├─ Notification: Email + Slack                                                                            │
│ └─ Create: Escalation summary comment                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ P3 - MEDIUM                                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Definition: Service partially impacted, single user or small group, workaround available                   │
│ Starting Level: L1 Standard Support                                                                        │
│ Initial Response Time: 4 hours                                                                             │
├──────────────────────────────────────────────────────────┬──────────────────────────────────────────────────┤
│ At 50% SLA (2 hours)                                    │ At 75% SLA (3 hours)                             │
│ ├─ Action: Optional review                              │ ├─ Action: Consider escalation                   │
│ ├─ No automatic notification                            │ ├─ Target: Team Lead review                      │
│ ├─ Manual check by team lead                            │ ├─ Notification: No automatic                    │
│ └─ No escalation triggered automatically                │ └─ Manual decision to escalate                   │
├──────────────────────────────────────────────────────────┴──────────────────────────────────────────────────┤
│ At Breach (4+ hours)                                                                                        │
│ ├─ Action: Tracked for reporting, no escalation                                                             │
│ ├─ Review: Team Lead weekly review                                                                         │
│ ├─ Escalation: Only if pattern detected                                                                   │
│ └─ Follow-up: Include in team metrics                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ P4 - LOW                                                                                                    │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Definition: Informational, cosmetic, or nice-to-have requests                                              │
│ Starting Level: L1 Basic Support                                                                           │
│ Initial Response Time: 1 business day                                                                      │
├──────────────────────────────────────────────────────────┬──────────────────────────────────────────────────┤
│ At 50% SLA (12 hours)                                   │ At 75% SLA (18 hours)                            │
│ ├─ Action: None                                         │ ├─ Action: None                                  │
│ ├─ No escalation triggered                              │ ├─ No escalation triggered                       │
│ └─ Standard processing                                  │ └─ Standard processing                           │
├──────────────────────────────────────────────────────────┴──────────────────────────────────────────────────┤
│ At Breach (24+ hours)                                                                                       │
│ ├─ Action: Tracked for reporting                                                                            │
│ ├─ No escalation                                                                                            │
│ └─ Category: Backlog for future review                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Template 2: Change Management Escalation Matrix

```
╔════════════════════════════════════════════════════════════════════════╗
║              CHANGE MANAGEMENT ESCALATION MATRIX                        ║
╚════════════════════════════════════════════════════════════════════════╝

Change Type         Approval Authority        SLA         Escalation Trigger
──────────────────────────────────────────────────────────────────────────
STANDARD            Auto-approved            None        Not applicable
- Template-based    (Change Manager)         (tracking)  (tracked records)
- Low risk          - Fast-tracked

NORMAL              CAB + Manager             2 days      At 48 hours pending
- Requires review   approval required                     Escalate to director
- Moderate risk     - Peer review
- Testing done      - Testing evidence
                    - Approval workflow

HIGH                Director +                1 day       At 24 hours pending
- High risk         CAB approval             (urgent)    Escalate to VP
- Production        - Executive review
- Revenue impact    - Risk assessment
- Security change   - Customer notification

EMERGENCY           VP / CTO approval         4 hours     At 2 hours pending
- Production fix    - Director decides       (critical)  Escalate to SVP
- Outage recovery   - Proceed without        
- Security patch    - Formal CAB             
                    (post-incident review)
```

---

## Notification Templates

### Template 1: P1 Critical Escalation Notification

**Channel: SMS + Phone Call + Slack**

```
SMS:
"P1 CRITICAL: {{ticket.id}} - {{ticket.title}} escalated to you. {{ticket.impact}}. 
Acknowledge: [Link]. Time critical - ~10 min to respond."

Phone Call Script:
"Hi {{name}}, this is {{source}} calling about a critical incident. 
Incident {{ticket.id}}: {{title}}
Impact: {{impact}}
Current status: {{status}}
Assigned to: {{assignee}}
Please acknowledge receipt and let us know your ETA to engage. 
You should have received SMS with link. Questions?"

Slack (Direct Message to responder + Channel):
---
🚨 **CRITICAL INCIDENT ESCALATION** 🚨

**Ticket:** {{ticket.id}}
**Title:** {{title}}
**Assigned to you by:** {{escalated_by}}
**Reason:** {{escalation_reason}}

**Impact:**
- Business Impact: {{impact}}
- Users Affected: {{affected_users}}
- Systems Down: {{system_list}}

**Current Status:**
- Started: {{created_time}}
- Elapsed: {{elapsed_time}}
- Attempts: {{resolution_attempts}}

**SLA Status:**
- Target: 4 hours
- Time Remaining: {{sla_remaining}}
- Status: ⚠️ At {{sla_percentage}}% of SLA

[View Full Details]({{ticket_url}})
[Acknowledge Receipt]({{ack_url}})

Need help? Call {{escalation_manager}} at {{phone}}
---
```

### Template 2: P2 High Escalation Notification

**Channel: Email + Slack**

```
Email Subject:
"[P2-HIGH] {{ticket.id}} - Escalated to {{target_team}} - {{title}}"

Email Body:
---
Hi {{assignee}},

An incident has been escalated to your team:

**Ticket Details:**
- ID: {{ticket.id}}
- Title: {{title}}
- Priority: P2 - High
- Created: {{created_time}}
- Time Outstanding: {{elapsed_time}}

**Escalation Information:**
- Escalated from: {{previous_team}}
- Escalation Reason: {{escalation_reason}}
- Escalation Time: {{escalation_time}}

**Impact Summary:**
{{impact_description}}

**Previous Work Attempted:**
{{attempted_solutions}}

**Next Steps:**
1. Review ticket details at the link below
2. Acknowledge receipt (reply to this email or click link)
3. Begin technical investigation
4. Provide status update within 30 minutes

**SLA Status:**
- Current: {{sla_percentage}}% of SLA used
- Remaining: {{sla_remaining}}
- Target Resolution: {{resolution_target}}

[View Ticket]({{ticket_url}})
[Acknowledge Escalation]({{ack_url}})

Questions? Contact {{escalation_manager}}

---
{{ticket_history_snippet}}
---

Regards,
{{system_name}}
```

### Template 3: Escalation Summary Report (Manager)

**Channel: Email + Dashboard**

```
Email Subject:
"Daily Escalation Summary - {{date}}"

Email Body:
---
Hi {{manager_name}},

Here's your daily escalation summary:

**Summary Statistics:**
- Total Escalations: {{total_escalations}}
- P1 Critical: {{p1_count}} (Avg time: {{p1_avg_time}})
- P2 High: {{p2_count}} (Avg time: {{p2_avg_time}})
- P3 Medium: {{p3_count}} (Avg time: {{p3_avg_time}})

**SLA Breaches Today:**
- Count: {{breach_count}}
- Tickets: {{breach_list}}
- Impact: {{breach_impact}}

**Escalations Awaiting Your Action:**
{{pending_escalations_table}}

**Teams with High Escalation Rates:**
{{high_escalation_teams}}

**Recommendations:**
- {{recommendation_1}}
- {{recommendation_2}}

[Full Dashboard]({{dashboard_url}})
[Action Items]({{action_items_url}})

---
```

---

## Runbook Examples

### Runbook 1: P1 Incident Escalation (Agent)

```markdown
# P1 CRITICAL INCIDENT - ESCALATION RUNBOOK

## Situation
You are the primary responder for a P1 Critical incident.

## Decision Tree

### Question 1: Can you identify the root cause immediately?
YES → Work to resolve it yourself
  └─ Continue monitoring
  └─ Update ticket every 15 minutes
  └─ If it takes > 30 min, escalate anyway

NO → Proceed to Question 2

### Question 2: Do you have the skills to resolve this?
YES → Begin troubleshooting
  └─ Set status: "In Progress"
  └─ Document steps taken
  └─ Set 30-min target for escalation decision
  └─ If unresolved, escalate

NO → Escalate immediately

### Question 3: Can this be resolved within 15 minutes?
YES → Continue work
  └─ Alert manager at 10-min mark
  └─ Complete escalation preparation

NO → Escalate immediately
  └─ Go to Escalation Procedures

## Escalation Procedures

1. **Alert Your Manager IMMEDIATELY**
   - Direct message or phone call
   - Don't wait for system alerts
   - Provide: Ticket ID, impact, reason escalation needed

2. **Prepare Escalation Documentation**
   - What's been tried: [list all steps]
   - What succeeded/failed: [results]
   - What expertise needed: [specific skills]
   - System status: [current state]
   - Customer impact: [business loss estimate]

3. **In the Escalation Message, Include:**
   ```
   @Tier2Manager / Tier2Team:
   
   CRITICAL INCIDENT ESCALATION
   
   Ticket: {{ticket.id}}
   Title: {{title}}
   Started: {{created_time}} ({{elapsed}} mins ago)
   
   IMPACT:
   {{impact_summary}}
   
   WORK DONE:
   {{steps_taken}}
   
   BLOCKERS:
   {{what_we_need}}
   
   REQUIRED EXPERTISE:
   {{skills_needed}}
   
   TICKET: [Link to full details]
   
   Need immediate engagement.
   ```

4. **Transition the Ticket**
   - Status: "Escalated to Tier 2"
   - Assign to: "Tier 2 Technical Team"
   - Add watcher: Your manager
   - Do NOT close the ticket

5. **Provide Handoff**
   - Don't disappear - stay available for questions
   - Brief the Tier 2 person directly if possible
   - Provide your contact info
   - Be prepared to answer technical questions

## Escalation Check-In
- Set 5-minute reminder to check if Tier 2 has engaged
- If no response, notify your manager again
- Document all escalation attempts

---
```

### Runbook 2: P2 High Incident - Escalation Decision

```markdown
# P2 HIGH INCIDENT - ESCALATION DECISION RUNBOOK

## When to Escalate a P2

### AUTO-ESCALATE If Any:
- ✓ Requires database expertise (you don't have)
- ✓ Requires security/compliance knowledge
- ✓ Involves multiple systems (multi-tier issue)
- ✓ Unresolved after 30 minutes
- ✓ Blocks a critical business process
- ✓ Customer is demanding executive involvement
- ✓ Workaround not available
- ✓ Affects a SLA

### DO NOT ESCALATE If:
- ✗ Simple password reset
- ✗ Known issue with documented solution
- ✗ User training issue
- ✗ Works-as-designed (not a bug)
- ✗ Workaround exists and communicated
- ✗ Can be resolved within 30 minutes

## Escalation Process for P2

1. **Manager Notification (Email + Slack)**
   - Subject: "[P2] Escalation - {{ticket.id}}"
   - Include: Impact, reason, estimated expertise needed
   - Get acknowledgment within 30 minutes

2. **Prepare Technical Handoff Document**
   ```
   Ticket: {{ticket.id}}
   Issue: {{title}}
   Investigation: {{what_was_tried}}
   Finding: {{what_we_found}}
   Blocker: {{what_is_needed}}
   Next Steps: {{recommended_actions}}
   ```

3. **Assign to Appropriate L2 Team**
   - Database issues → Database Team
   - Network issues → Infrastructure Team
   - Application issues → Applications Team
   - Security issues → Security Team

4. **Send Escalation Update to Customer** (if external)
   ```
   "We're escalating your request to our [Team] specialists 
   who have expertise in this area. You can expect an update 
   within [time]. Thank you for your patience."
   ```

5. **Track Escalation Resolution**
   - Follow up at SLA 75% mark
   - If not progressing, escalate further
   - Document any delays

---
```

---

## Metrics and Dashboards

### Key Escalation Metrics

```
1. ESCALATION FREQUENCY
   - Escalations per day (trend)
   - Escalation rate by priority (% of total)
   - Escalations by team
   - Escalations by category
   
   Good Target: < 15% of all tickets escalated

2. TIME-TO-ESCALATION
   - Average time from creation to first escalation
   - Time at each escalation level
   - Time from escalation to resolution
   
   Target: P1 escalate < 12 min | P2 escalate < 45 min

3. ESCALATION SUCCESS RATE
   - % of escalations leading to resolution
   - % of escalations resolved at each tier
   - % requiring further escalation
   
   Good Target: >85% resolved at escalation target level

4. SLA COMPLIANCE
   - % P1s meeting response SLA
   - % P1s meeting resolution SLA
   - Escalation SLA breaches
   
   Target: >95% SLA compliance

5. ESCALATION CYCLE TIME
   - Avg days from escalation to closure
   - P1 Critical: < 1 day
   - P2 High: < 2 days
   - P3 Medium: < 5 days
   
6. TEAM PERFORMANCE
   - Escalation resolution rate by team
   - Avg time to resolve after escalation
   - Repeat escalations (same issue twice)
   - Team utilization during escalations
   
7. CUSTOMER IMPACT
   - Avg resolution time (escalated vs non-escalated)
   - Customer satisfaction (escalated tickets)
   - Revenue/downtime during escalations
```

### Dashboard Layout Example

```
╔════════════════════════════════════════════════════════════════════╗
║               ESCALATION MANAGEMENT DASHBOARD                       ║
║                      October 9, 2026                                ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  TODAY'S ESCALATIONS         WEEKLY TREND        SLA COMPLIANCE    ║
║  ┌──────────────────┐       ┌──────────────┐    ┌──────────────┐  ║
║  │ P1: 2           │       │ M  T  W  T  F│    │ P1: 98%  ✓   │  ║
║  │ P2: 5           │       │ ▁  ▂  ▃  ▂  ▂│    │ P2: 94%  ⚠   │  ║
║  │ P3: 8           │       │ Escalations  │    │ P3: 92%  ⚠   │  ║
║  │ Total: 15       │       └──────────────┘    │ P4: 87%  ✗   │  ║
║  │ Rate: 12.5%     │                          └──────────────┘  ║
║  └──────────────────┘                                             ║
║                                                                    ║
║  ESCALATION TIME ANALYSIS        TOP PERFORMERS                   ║
║  ┌────────────────────────┐      ┌──────────────────────┐         ║
║  │ Avg Time to Escalate:  │      │ Tier 2 Tech (94%)   │         ║
║  │ P1:     8 min (target) │      │ Database (92%)      │         ║
║  │ P2:    42 min (target) │      │ Infrastructure (89%)│         ║
║  │ P3: 2.5 hr  (target)   │      │ Apps (87%)          │         ║
║  │                        │      │ Security (83%)      │         ║
║  │ Escalation to          │      └──────────────────────┘         ║
║  │ Resolution: 4.2 hours  │                                       ║
║  └────────────────────────┘      NEEDS IMPROVEMENT                ║
║                                  ┌──────────────────────┐         ║
║  BREACH ANALYSIS                 │ L1 Support (68%)    │         ║
║  ┌────────────────────┐          │ Escalation Rate     │         ║
║  │ SLA Breaches: 2    │          │ (escalating too     │         ║
║  │ INC001234 (P2)    │          │  early or complex)  │         ║
║  │ INC001245 (P3)    │          └──────────────────────┘         ║
║  │                    │                                           ║
║  │ Breach Reason:     │          WAITING FOR ACTION               ║
║  │ - Expertise delay  │          ┌──────────────────────┐         ║
║  │ - Resource unavail │          │ P1 Escalations:     │         ║
║  │                    │          │ INC001256 - pending │         ║
║  └────────────────────┘          │ 15 min response     │         ║
║                                  │                     │         ║
║                                  │ P2 Escalations:     │         ║
║                                  │ INC001260 - pending │         ║
║                                  │ 45 min response     │         ║
║                                  └──────────────────────┘         ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║ [Drill Down] [Export] [Compare Previous Week] [Set Alerts]        ║
╚════════════════════════════════════════════════════════════════════╝
```

### Weekly Escalation Report Template

```
ESCALATION SUMMARY REPORT
Week of: October 7-11, 2026
Prepared for: IT Service Desk Management

EXECUTIVE SUMMARY
┌────────────────────────────────────────────────────────────────┐
│ Total Escalations: 67 (↑ 8% from last week)                   │
│ SLA Compliance: 93% (target: 95%)                              │
│ Avg Resolution Time: 4.5 hours (↓ 0.5 hr improvement)        │
│ Customer Satisfaction (escalated): 4.2/5.0                    │
└────────────────────────────────────────────────────────────────┘

ESCALATION BREAKDOWN
Priority | Count | % of Total | Avg Time | SLA Compliance
─────────┼───────┼────────────┼──────────┼──────────────
P1       │  2    │   3%       │  8 min   │  100%  ✓
P2       │  15   │  22%       │ 48 min   │  93%   ⚠
P3       │  34   │  51%       │  2.1 hr  │  90%   ⚠
P4       │  16   │  24%       │  5.2 hr  │  88%   ✗

TEAM PERFORMANCE
Team                    | Escalations | Resolution % | Avg Time
────────────────────────┼─────────────┼──────────────┼──────────
Tier 2 Technical        │     18      │    94%       │  2.5 hr
Database Team           │     12      │    92%       │  2.8 hr
Infrastructure Team     │     14      │    89%       │  3.1 hr
Applications Team       │     15      │    87%       │  3.5 hr
L1 Support (escalating) │     8       │    75%       │  4.2 hr

ESCALATION TRENDS
- Monday: 12 escalations (22%)
- Tuesday: 14 escalations (21%)
- Wednesday: 13 escalations (19%)
- Thursday: 15 escalations (22%)
- Friday: 13 escalations (19%)

Peak Hours: 9-11 AM (40% of daily escalations)

ISSUES & RESOLUTIONS
┌─────────────────────────────────────────────────────────────┐
│ Issue 1: P2 escalations missing SLA by avg 3 minutes      │
│ Root Cause: Tier 1 response delays                         │
│ Action: Review L1 staffing, implement queue management     │
│ Owner: Service Desk Manager                               │
│ Target: Complete by Oct 15                                │
│                                                             │
│ Issue 2: Applications team overtasked                      │
│ Root Cause: New features causing more issues              │
│ Action: Work with dev team on quality improvement        │
│ Owner: Applications Manager                              │
│ Target: Ongoing                                            │
│                                                             │
│ Issue 3: Friday escalations high                           │
│ Root Cause: End-of-week changes/issues                    │
│ Action: Implement end-of-week monitoring                  │
│ Owner: Change Manager                                     │
│ Target: Effective immediately                            │
└─────────────────────────────────────────────────────────────┘

RECOMMENDATIONS
1. Increase L1 Support staffing during 9-11 AM window
2. Implement daily escalation reviews (standups)
3. Provide advanced training to Applications Team
4. Review Applications Team workload/assignment
5. Monitor P3 escalations for trends

NEXT WEEK TARGET
- Total Escalations: < 65 (↓ 3%)
- SLA Compliance: ≥ 95%
- Avg Resolution: ≤ 4.0 hours
- Zero P1 breaches
```

---

## Using These Templates

1. **Customize to Your Organization**
   - Adjust team names
   - Modify SLA timings based on your actual capacity
   - Update notification preferences
   - Adjust escalation thresholds

2. **Test Thoroughly**
   - Test each automation rule with test tickets
   - Verify notifications reach correct people
   - Confirm SLA calculations are accurate
   - Test escalation chain handoffs

3. **Train Your Teams**
   - Review runbooks with frontline
   - Conduct escalation simulations
   - Show managers their dashboards
   - Walk through notification flows

4. **Monitor and Refine**
   - Track metrics for 2-4 weeks
   - Identify bottlenecks
   - Adjust thresholds if too aggressive
   - Improve based on feedback

---
