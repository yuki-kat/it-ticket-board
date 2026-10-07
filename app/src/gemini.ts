// Gemini API wrapper for ticket board AI features

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent';

export interface GeminiRequest {
  text: string;
}

export interface GeminiResponse {
  text: string;
}

export class GeminiError extends Error {
  code: 'API_KEY_MISSING' | 'API_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'UNKNOWN';
  constructor(
    message: string,
    code: 'API_KEY_MISSING' | 'API_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'UNKNOWN' = 'UNKNOWN'
  ) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
  }
}

export function getApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key || key.startsWith('AQ.') || key.startsWith('AAQ.')) {
    throw new GeminiError(
      'Gemini API key not configured or invalid. AI features are disabled. Get a valid key from https://aistudio.google.com/app/apikey',
      'API_KEY_MISSING'
    );
  }
  return key;
}

export async function callGemini(prompt: string): Promise<string> {
  const apiKey = getApiKey();

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new GeminiError(
          'Rate limited by Gemini API. Try again in a moment.',
          'RATE_LIMIT'
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new GeminiError(
          'Invalid Gemini API key. Check your configuration.',
          'API_KEY_MISSING'
        );
      }
      const errorData = await response.json();
      throw new GeminiError(
        `Gemini API error: ${errorData.error?.message || response.statusText}`,
        'API_ERROR'
      );
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new GeminiError('No response from Gemini API', 'API_ERROR');
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }

    if (error instanceof TypeError) {
      throw new GeminiError(
        'Network error calling Gemini API. Check your connection.',
        'UNKNOWN'
      );
    }

    throw new GeminiError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      'UNKNOWN'
    );
  }
}

// Escape XML special characters to prevent prompt injection
const escapeXml = (str: string): string => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// Prompt templates for different features

export function buildTicketSummaryPrompt(title: string, description: string, workNotes: string): string {
  return `Analyze this support ticket and provide a brief summary.

<ticket_title>${escapeXml(title)}</ticket_title>

<ticket_description>
${escapeXml(description)}
</ticket_description>

<work_notes>
${escapeXml(workNotes) || '(No notes yet)'}
</work_notes>

Please provide:
1. **What's the issue?** (1-2 sentences)
2. **What's been tried?** (1-2 sentences, or "Nothing yet" if no notes)
3. **Suggested next step** (1-2 sentences)

Keep it concise and actionable.`;
}

export function buildDescriptionAssistPrompt(roughText: string): string {
  return `Polish this IT ticket description. Make it clear, concise, and professional.

<raw_description>
${escapeXml(roughText)}
</raw_description>

Provide:
1. A polished title (1 line)
2. A structured description with:
   - What's the problem?
   - When did it start?
   - What impact does it have?
   - Any error messages?
3. Suggested priority: P1 (urgent), P2 (high), or P3 (normal)

Format as plain text, easy to copy-paste.`;
}

export function buildWorkNotesSuggestionsPrompt(
  title: string,
  description: string,
  currentNotes: string
): string {
  return `This is an IT support ticket. Based on what's been done, suggest next steps.

<ticket_title>${escapeXml(title)}</ticket_title>

<ticket_description>
${escapeXml(description)}
</ticket_description>

<current_work_notes>
${escapeXml(currentNotes)}
</current_work_notes>

Suggest:
1. One keyword or search term that might help
2. The most likely next diagnostic or resolution step
3. Any escalation flags (e.g., SLA risk, user impact)

Keep suggestions brief and specific.`;
}

export function buildQueueAssistPrompt(title: string, description: string): string {
  return `Categorize this IT support ticket.

<ticket_title>${escapeXml(title)}</ticket_title>

<ticket_description>
${escapeXml(description)}
</ticket_description>

Suggest:
1. Most likely queue (Networking, Hardware, Software, Database, Other)
2. Confidence (high, medium, low)
3. Why you chose that queue (1 sentence)

Be decisive, even if uncertain.`;
}

export function buildPriorityAssistPrompt(
  title: string,
  description: string,
  queue: string
): string {
  return `Assess the priority of this IT support ticket.

<ticket_title>${escapeXml(title)}</ticket_title>

<ticket_description>
${escapeXml(description)}
</ticket_description>

<queue>${escapeXml(queue)}</queue>

Suggest:
1. Priority level: P1 (urgent, blocks work), P2 (important, affects daily work), P3 (can wait)
2. Reasoning (1 sentence)
3. Any immediate action required? (yes/no and why)

Be decisive.`;
}
