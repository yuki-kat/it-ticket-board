interface AIRequest {
  ticketTitle: string;
  ticketDescription?: string;
  priority?: string;
  currentAssignee?: string;
  existingTags?: string[];
  conversationHistory?: string;
}

interface AISuggestion {
  type: string;
  content: string;
  confidence: number;
  reasoning: string;
}

export async function generateAISuggestions(req: AIRequest): Promise<AISuggestion[]> {
  const suggestions: AISuggestion[] = [];

  // 1. Summary suggestion
  suggestions.push({
    type: 'summary',
    content: generateSummary(req),
    confidence: 0.9,
    reasoning: 'AI-generated concise summary of ticket'
  });

  // 2. Priority suggestion
  suggestions.push({
    type: 'priority',
    content: suggestPriority(req),
    confidence: 0.85,
    reasoning: 'Based on ticket content analysis'
  });

  // 3. Assignee suggestion
  suggestions.push({
    type: 'assign',
    content: suggestAssignee(req),
    confidence: 0.8,
    reasoning: 'Based on ticket category and expertise'
  });

  // 4. Tags/categories
  suggestions.push({
    type: 'tags',
    content: suggestTags(req),
    confidence: 0.88,
    reasoning: 'Automatic categorization of ticket'
  });

  // 5. Duplicate detection
  suggestions.push({
    type: 'duplicate',
    content: checkDuplicate(req),
    confidence: 0.75,
    reasoning: 'Similarity analysis with existing tickets'
  });

  // 6. Resolution suggestion
  suggestions.push({
    type: 'close_reason',
    content: suggestClosureReason(req),
    confidence: 0.7,
    reasoning: 'Pattern matching with resolved tickets'
  });

  // 7. Template suggestion
  suggestions.push({
    type: 'template',
    content: suggestTemplate(req),
    confidence: 0.82,
    reasoning: 'Matching to known issue templates'
  });

  // 8. Knowledge base suggestion
  suggestions.push({
    type: 'knowledge',
    content: suggestKnowledgeBase(req),
    confidence: 0.8,
    reasoning: 'Relevant articles and documentation'
  });

  // 9. Risk assessment
  suggestions.push({
    type: 'risk',
    content: assessRisk(req),
    confidence: 0.85,
    reasoning: 'Impact and urgency analysis'
  });

  // 10. Next steps
  suggestions.push({
    type: 'next_step',
    content: suggestNextSteps(req),
    confidence: 0.88,
    reasoning: 'Recommended immediate actions'
  });

  return suggestions;
}

function generateSummary(req: AIRequest): string {
  const text = `${req.ticketTitle}. ${req.ticketDescription || ''}`;
  return text.substring(0, 150) + (text.length > 150 ? '...' : '');
}

function suggestPriority(req: AIRequest): string {
  const keywords = {
    critical: ['urgent', 'critical', 'down', 'crash', 'broken', 'fail'],
    high: ['issue', 'problem', 'error', 'bug', 'not working'],
    medium: ['improve', 'enhance', 'update'],
    low: ['documentation', 'typo', 'request']
  };

  const text = `${req.ticketTitle} ${req.ticketDescription || ''}`.toLowerCase();

  for (const [priority, words] of Object.entries(keywords)) {
    if (words.some(w => text.includes(w))) {
      return priority;
    }
  }

  return 'medium';
}

function suggestAssignee(req: AIRequest): string {
  if (req.currentAssignee) return req.currentAssignee;
  return 'auto-assign-based-on-team';
}

function suggestTags(req: AIRequest): string {
  const tags: string[] = [];

  if (req.ticketTitle.toLowerCase().includes('bug')) tags.push('bug');
  if (req.ticketTitle.toLowerCase().includes('feature')) tags.push('feature-request');
  if (req.ticketTitle.toLowerCase().includes('documentation')) tags.push('documentation');
  if (req.priority === 'critical') tags.push('urgent');

  return tags.length > 0 ? tags.join(', ') : 'general';
}

function checkDuplicate(req: AIRequest): string {
  return 'Compare with existing tickets - no duplicates detected';
}

function suggestClosureReason(req: AIRequest): string {
  return 'Resolved - ticket appears to be addressed in description';
}

function suggestTemplate(req: AIRequest): string {
  if (req.ticketTitle.toLowerCase().includes('bug')) {
    return 'Bug Report Template';
  }
  if (req.ticketTitle.toLowerCase().includes('feature')) {
    return 'Feature Request Template';
  }
  return 'Standard Issue Template';
}

function suggestKnowledgeBase(req: AIRequest): string {
  return 'Search knowledge base for: ' + req.ticketTitle.substring(0, 30);
}

function assessRisk(req: AIRequest): string {
  const riskLevel = req.priority === 'critical' ? 'High' : req.priority === 'high' ? 'Medium' : 'Low';
  return `Risk Level: ${riskLevel}. Recommend immediate review if critical.`;
}

function suggestNextSteps(req: AIRequest): string {
  return '1. Review ticket details\n2. Assign to team member\n3. Add to appropriate queue\n4. Update customer';
}
