/**
 * Streaming chat hook — connects to SSE endpoint for real-time agent responses.
 */
import { useCallback, useRef, useState } from "react";
import { API_BASE } from "./client";

interface StreamCitation {
  evidence_id: string;
  source: string;
  excerpt: string;
  location?: string | null;
  source_type: string;
  source_url?: string | null;
  retrieved_at?: string | null;
}

interface StreamEvent {
  type: "session" | "token" | "tool_call" | "done" | "error" | "citations";
  data: Record<string, unknown>;
}

export interface UploadContext {
  dataset_id: string;
  filename: string;
  rows_loaded?: number;
  occupations_mapped?: number;
  skills_extracted?: number;
}

interface UseStreamChatOptions {
  pageContext?: string;
  internetSearch?: boolean;
  uploadContext?: UploadContext;
}

interface UseStreamChatReturn {
  streamMessage: (message: string, sessionId?: string) => Promise<void>;
  streamingText: string;
  isStreaming: boolean;
  sessionId: string | null;
  traceId: string | null;
  citations: StreamCitation[];
  error: string | null;
  cancel: () => void;
}

export function useStreamChat(options?: UseStreamChatOptions): UseStreamChatReturn {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [citations, setCitations] = useState<StreamCitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const streamMessage = useCallback(async (message: string, existingSessionId?: string) => {
    setStreamingText("");
    setIsStreaming(true);
    setCitations([]);
    setError(null);

    const controller = new AbortController();
    controllerRef.current = controller;

    const token = localStorage.getItem("auth_token");

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message,
          session_id: existingSessionId || sessionId,
          ...(options?.pageContext ? { page_context: options.pageContext } : {}),
          ...(options?.internetSearch ? { internet_search: true } : {}),
          ...(options?.uploadContext ? { upload_context: options.uploadContext } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
          window.location.href = "/login";
          return;
        }
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let currentEventType = "unknown";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              const eventType = currentEventType;
              currentEventType = "unknown";

              if (eventType === "session") {
                setSessionId(data.session_id);
                setTraceId(data.trace_id);
              } else if (eventType === "token") {
                fullText += data.content;
                setStreamingText(fullText);
              } else if (eventType === "done") {
                setStreamingText(data.message || fullText);
                setTraceId(data.trace_id);
              } else if (eventType === "citations") {
                const citationList = (data.citations || []) as StreamCitation[];
                setCitations(citationList);
              } else if (eventType === "error") {
                setError(data.message);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "Stream failed");
      }
    } finally {
      setIsStreaming(false);
      controllerRef.current = null;
    }
  }, [sessionId, options?.pageContext, options?.internetSearch, options?.uploadContext]);

  return {
    streamMessage,
    streamingText,
    isStreaming,
    sessionId,
    traceId,
    citations,
    error,
    cancel,
  };
}
