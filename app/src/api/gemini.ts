/**
 * Gemini API Client
 * Proxies requests through backend endpoint for secure server-side API key handling
 */

const API_BASE = 'http://localhost:3001/api';

export interface GeminiConfig {
  configured: boolean;
}

export function setGeminiConfig(config: GeminiConfig) {
  // No longer needed - API key is server-side only
  if (config.configured) {
    localStorage.setItem('gemini_configured', 'true');
  }
}

export function getGeminiConfig(): GeminiConfig {
  const configured = localStorage.getItem('gemini_configured') === 'true';
  return { configured };
}

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface GeminiRequest {
  contents: GeminiMessage[];
  systemInstruction?: {
    parts: { text: string }[];
  };
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}


async function callGeminiAPI(request: GeminiRequest): Promise<string> {
  const response = await fetch(`${API_BASE}/ai/gemini`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Server Error: ${error.error || response.statusText}`);
  }

  const data = await response.json() as { text: string };
  if (!data.text) {
    throw new Error('No response from Gemini API');
  }
  return data.text;
}

/**
 * Generate AI suggestions for a ticket
 */
export async function generateTicketSuggestions(
  title: string,
  description: string,
  priority: string,
  queue?: string
): Promise<string> {
  const systemPrompt = `You are an IT support ticket analysis assistant. Analyze the provided ticket and provide:
1. Initial analysis of the issue
2. Potential root causes
3. Recommended troubleshooting steps
4. Estimated resolution time
Keep responses concise and actionable.`;

  const userMessage = `
Queue: ${queue || 'General'}
Priority: ${priority}
Title: ${title}
Description: ${description}

Please analyze this ticket and provide AI suggestions.`;

  return callGeminiAPI({
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });
}

/**
 * Generate chat response for ticket communication
 */
export async function generateChatResponse(
  _ticketTitle: string,
  userMessage: string,
  conversationContext: Array<{ role: string; content: string }>
): Promise<string> {
  const systemPrompt = `You are a helpful IT support assistant. Respond to user questions about their support ticket.
Be professional, concise, and provide clear solutions. Stay focused on the ticket context.`;

  const contents: GeminiMessage[] = [
    ...conversationContext.map((msg) => ({
      role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  return callGeminiAPI({
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 512,
    },
  });
}

/**
 * Generate asset health analysis
 */
export async function analyzeAssetHealth(
  assetName: string,
  assetType: string,
  health: string,
  issues: string[]
): Promise<string> {
  const systemPrompt = `You are an IT asset management consultant. Analyze the provided asset health information and provide:
1. Health assessment
2. Potential maintenance issues
3. Recommended actions
Keep recommendations practical and actionable.`;

  const userMessage = `
Asset: ${assetName}
Type: ${assetType}
Health Status: ${health}
Reported Issues: ${issues.join(', ') || 'None'}

Please analyze the health status and provide recommendations.`;

  return callGeminiAPI({
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 512,
    },
  });
}

/**
 * Categorize and summarize tickets
 */
export async function summarizeTickets(
  tickets: Array<{ title: string; description: string; priority: string }>
): Promise<string> {
  const systemPrompt = `You are an IT operations analyst. Summarize the provided tickets and identify:
1. Common patterns or themes
2. Priority distribution
3. Recommended focus areas
Keep the summary concise but comprehensive.`;

  const ticketList = tickets
    .map((t, i) => `${i + 1}. [${t.priority}] ${t.title}\n   ${t.description}`)
    .join('\n\n');

  const userMessage = `Please analyze these tickets:\n\n${ticketList}`;

  return callGeminiAPI({
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });
}

/**
 * Generate queue insights
 */
export async function generateQueueInsights(
  queueName: string,
  totalTickets: number,
  resolvedTickets: number,
  averageResolutionTime: number,
  pendingTickets: number
): Promise<string> {
  const systemPrompt = `You are an IT support metrics analyst. Analyze the provided queue metrics and provide:
1. Current performance assessment
2. Bottleneck identification
3. Actionable improvement recommendations
Keep insights data-driven and specific.`;

  const userMessage = `
Queue: ${queueName}
Total Tickets: ${totalTickets}
Resolved: ${resolvedTickets}
Pending: ${pendingTickets}
Avg Resolution Time: ${averageResolutionTime} minutes

Please analyze these queue metrics and provide insights.`;

  return callGeminiAPI({
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
    },
  });
}

/**
 * Generate SLA recommendations
 */
export async function generateSLARecommendations(
  queueName: string,
  averageFirstResponseTime: number,
  averageResolutionTime: number,
  historicalData: Array<{ priority: string; avgTime: number }>
): Promise<string> {
  const systemPrompt = `You are an IT service level agreement (SLA) consultant. Analyze the provided performance data and recommend:
1. Appropriate response time SLAs for each priority level
2. Resolution time targets
3. Buffer recommendations for variability
Base recommendations on industry best practices and the data provided.`;

  const historicalSummary = historicalData
    .map((d) => `${d.priority}: ${d.avgTime} minutes`)
    .join('\n');

  const userMessage = `
Queue: ${queueName}
Average First Response Time: ${averageFirstResponseTime} minutes
Average Resolution Time: ${averageResolutionTime} minutes

Historical Performance by Priority:
${historicalSummary}

Please recommend appropriate SLAs for this queue.`;

  return callGeminiAPI({
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 1024,
    },
  });
}
