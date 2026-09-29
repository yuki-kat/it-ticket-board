import { useState, useCallback } from 'react';
import { callGemini, GeminiError, buildTicketSummaryPrompt, buildDescriptionAssistPrompt, buildWorkNotesSuggestionsPrompt, buildQueueAssistPrompt, buildPriorityAssistPrompt } from './gemini';

export interface UseGeminiState {
  loading: boolean;
  error: GeminiError | null;
  result: string | null;
}

function useGeminiCall() {
  const [state, setState] = useState<UseGeminiState>({
    loading: false,
    error: null,
    result: null,
  });

  const call = useCallback(async (prompt: string) => {
    setState({ loading: true, error: null, result: null });
    try {
      const result = await callGemini(prompt);
      setState({ loading: false, error: null, result });
      return result;
    } catch (err) {
      const error = err instanceof GeminiError ? err : new GeminiError(String(err));
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
    const prompt = buildTicketSummaryPrompt(title, description, workNotes);
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, generate };
}

// Hook for description assistance
export function useDescriptionAssist() {
  const gemini = useGeminiCall();

  const polish = useCallback(async (roughText: string) => {
    const prompt = buildDescriptionAssistPrompt(roughText);
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, polish };
}

// Hook for work notes suggestions
export function useWorkNotesSuggestions() {
  const gemini = useGeminiCall();

  const suggest = useCallback(async (title: string, description: string, currentNotes: string) => {
    const prompt = buildWorkNotesSuggestionsPrompt(title, description, currentNotes);
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, suggest };
}

// Hook for queue assistance
export function useQueueAssist() {
  const gemini = useGeminiCall();

  const suggest = useCallback(async (title: string, description: string) => {
    const prompt = buildQueueAssistPrompt(title, description);
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, suggest };
}

// Hook for priority assistance
export function usePriorityAssist() {
  const gemini = useGeminiCall();

  const suggest = useCallback(async (title: string, description: string, queue: string) => {
    const prompt = buildPriorityAssistPrompt(title, description, queue);
    return gemini.call(prompt);
  }, [gemini]);

  return { ...gemini, suggest };
}

// Utility to check if Gemini API is available
export function useGeminiAvailable() {
  const [available, setAvailable] = useState(() => {
    try {
      const key = import.meta.env.VITE_GEMINI_API_KEY;
      return !!key;
    } catch {
      return false;
    }
  });

  return available;
}
