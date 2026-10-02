import { useState, useCallback, useEffect } from 'react';
import { API_BASE } from './api/base';
import { callGeminiWithPrompt } from './api/gemini';

export class GeminiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
  }
}

export class GeminiRateLimitError extends GeminiError {
  constructor(message = 'Rate limit exceeded. Please try again later.') {
    super(message, 'RATE_LIMIT');
    this.name = 'GeminiRateLimitError';
  }
}

export class GeminiSafetyFilterError extends GeminiError {
  constructor(message = 'Response blocked by safety filters.') {
    super(message, 'SAFETY_FILTER');
    this.name = 'GeminiSafetyFilterError';
  }
}

export class GeminiNetworkError extends GeminiError {
  constructor(message = 'Network error. Please check your connection.') {
    super(message, 'NETWORK');
    this.name = 'GeminiNetworkError';
  }
}

export interface UseGeminiState {
  loading: boolean;
  error: Error | null;
  result: string | null;
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

function useGeminiCall() {
  const [state, setState] = useState<UseGeminiState>({
    loading: false,
    error: null,
    result: null,
  });

  const call = useCallback(async (prompt: string) => {
    setState({ loading: true, error: null, result: null });
    try {
      const result = await callGeminiWithPrompt(prompt);
      setState({ loading: false, error: null, result });
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      let error: Error;

      if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
        error = new GeminiRateLimitError();
      } else if (errorMessage.includes('503') || errorMessage.includes('busy')) {
        error = new GeminiRateLimitError('Gemini is temporarily busy. Please try again in a moment.');
      } else if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
        error = new GeminiSafetyFilterError();
      } else if (errorMessage.includes('Network') || errorMessage.includes('fetch')) {
        error = new GeminiNetworkError();
      } else {
        error = new GeminiError(errorMessage);
      }

      setState({ loading: false, error, result: null });
      throw error;
    }
  }, []);

  return { ...state, call };
}

// Hook for ticket summary
export function useTicketSummary() {
  const gemini = useGeminiCall();

  const generate = useCallback(async (title: string, description: string, workNotes: string) => {
    const prompt = `Analyze this support ticket and provide a brief summary.

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
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, generate };
}

// Hook for description assistance
export function useDescriptionAssist() {
  const gemini = useGeminiCall();

  const polish = useCallback(async (roughText: string) => {
    const prompt = `Polish this IT ticket description. Make it clear, concise, and professional.

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
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, polish };
}

// Hook for work notes suggestions
export function useWorkNotesSuggestions() {
  const gemini = useGeminiCall();

  const suggest = useCallback(async (title: string, description: string, currentNotes: string) => {
    const prompt = `This is an IT support ticket. Based on what's been done, suggest next steps.

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
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, suggest };
}

// Hook for queue assistance
export function useQueueAssist() {
  const gemini = useGeminiCall();

  const suggest = useCallback(async (title: string, description: string) => {
    const prompt = `Categorize this IT support ticket.

<ticket_title>${escapeXml(title)}</ticket_title>

<ticket_description>
${escapeXml(description)}
</ticket_description>

Suggest:
1. Most likely queue (Networking, Hardware, Software, Database, Other)
2. Confidence (high, medium, low)
3. Why you chose that queue (1 sentence)

Be decisive, even if uncertain.`;
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, suggest };
}

// Hook for priority assistance
export function usePriorityAssist() {
  const gemini = useGeminiCall();

  const suggest = useCallback(async (title: string, description: string, queue: string) => {
    const prompt = `Assess the priority of this IT support ticket.

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
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, suggest };
}

// Check if Gemini API is available (requires server-side GEMINI_API_KEY configuration)
export function useGeminiAvailable() {
  const [state, setState] = useState<'loading' | 'available' | 'unavailable'>(() => {
    try {
      const cached = localStorage.getItem('gemini-available');
      return cached ? (JSON.parse(cached) ? 'available' : 'unavailable') : 'loading';
    } catch {
      return 'loading';
    }
  });

  useEffect(() => {
    if (state === 'loading') {
      let mounted = true;
      const checkAvailability = async () => {
        try {
          const response = await fetch(`${API_BASE}/check-gemini`);
          if (!mounted) return;
          if (response.ok) {
            const data = await response.json() as { available: boolean };
            setState(data.available ? 'available' : 'unavailable');
            localStorage.setItem('gemini-available', JSON.stringify(data.available));
          } else {
            setState('unavailable');
          }
        } catch {
          if (mounted) setState('unavailable');
        }
      };
      checkAvailability();
      return () => { mounted = false; };
    }
  }, [state]);

  return state === 'available';
}
