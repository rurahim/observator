/**
 * Enhanced streaming chat hook with thinking traces.
 * Captures tool_call events, token streaming, and builds a trace timeline.
 */
import { useCallback, useRef, useState } from "react";
import { API_BASE } from "./client";

export interface TraceStep {
  id: string;
  type: "thinking" | "tool_call" | "tool_result" | "token" | "done" | "error";
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  content?: string;
  timestamp: number;
  duration?: number;
}

export interface StreamCitation {
  evidence_id: string;
  source: string;
  excerpt: string;
  source_type: string;
  source_url?: string | null;
}

export interface DashboardPatch {
  action: string;
  target: string;
  value: string;
  description: string;
}

interface Options {
  pageContext?: string;
  internetSearch?: boolean;
  selfKnowledge?: boolean;
}

export function useStreamChatWithTraces(options?: Options) {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [citations, setCitations] = useState<StreamCitation[]>([]);
  const [traces, setTraces] = useState<TraceStep[]>([]);
  const [dashboardPatches, setDashboardPatches] = useState<DashboardPatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const traceIdCounter = useRef(0);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearTraces = useCallback(() => setTraces([]), []);

  const streamMessage = useCallback(async (message: string, existingSessionId?: string) => {
    setStreamingText("");
    setIsStreaming(true);
    setCitations([]);
    setError(null);
    setTraces([]);
    setDashboardPatches([]);
    traceIdCounter.current = 0;

    const controller = new AbortController();
    controllerRef.current = controller;
    const token = localStorage.getItem("auth_token");
    const startTime = Date.now();

    // Add initial "thinking" trace
    const thinkingStep: TraceStep = {
      id: `t-${traceIdCounter.current++}`,
      type: "thinking",
      content: "Planning approach...",
      timestamp: Date.now(),
    };
    setTraces([thinkingStep]);

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
          ...(options?.selfKnowledge ? { self_knowledge: true } : {}),
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
      let lastToolCallTime = Date.now();

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
                // Update thinking step
                setTraces(prev => prev.map(t =>
                  t.type === "thinking" ? { ...t, content: "Agent connected, analyzing query..." } : t
                ));
              } else if (eventType === "tool_call_delta") {
                // Accumulate streaming tool call args by index/id
                const idx = (data as any).index ?? 0;
                const tcId = (data as any).id || `idx-${idx}`;
                const name = (data as any).name || '';
                const argsDelta = (data as any).args_delta || '';

                setTraces(prev => {
                  // Find existing trace by tool_call id
                  const existing = prev.find(t => t.type === 'tool_call' && (t as any)._tcId === tcId);
                  if (existing) {
                    // Append to args delta string
                    const accumulated = ((existing as any)._argsRaw || '') + argsDelta;
                    let parsedArgs = (existing as any).args || {};
                    try { if (accumulated) parsedArgs = JSON.parse(accumulated); } catch {}
                    return prev.map(t => t === existing
                      ? { ...t, tool: t.tool || name, args: parsedArgs, _tcId: tcId, _argsRaw: accumulated } as any
                      : t
                    );
                  } else {
                    // First chunk for this tool call
                    let parsedArgs: any = {};
                    try { if (argsDelta) parsedArgs = JSON.parse(argsDelta); } catch {}
                    const now = Date.now();
                    const step: any = {
                      id: `t-${traceIdCounter.current++}`,
                      type: "tool_call",
                      tool: name,
                      args: parsedArgs,
                      _tcId: tcId,
                      _argsRaw: argsDelta,
                      timestamp: now,
                    };
                    return [
                      ...prev.map(t => t.type === "thinking" ? { ...t, content: "Planning complete", duration: now - t.timestamp } : t),
                      step,
                    ];
                  }
                });
              } else if (eventType === "tool_call") {
                // Fallback: complete tool_call event (non-streaming)
                const now = Date.now();
                const step: TraceStep = {
                  id: `t-${traceIdCounter.current++}`,
                  type: "tool_call",
                  tool: data.name || data.tool,
                  args: data.args || data.arguments,
                  timestamp: now,
                };
                lastToolCallTime = now;
                setTraces(prev => [
                  ...prev.map(t => t.type === "thinking" ? { ...t, content: "Planning complete", duration: now - t.timestamp } : t),
                  step,
                ]);
              } else if (eventType === "token") {
                fullText += data.content;
                setStreamingText(fullText);
                // On first token, mark tool calls as done
                if (fullText.length === (data.content || "").length) {
                  const now = Date.now();
                  setTraces(prev => prev.map(t =>
                    t.type === "tool_call" && !t.duration
                      ? { ...t, duration: now - t.timestamp, result: "completed" }
                      : t
                  ));
                }
              } else if (eventType === "done") {
                setStreamingText(data.message || fullText);
                setTraceId(data.trace_id);
                const doneStep: TraceStep = {
                  id: `t-${traceIdCounter.current++}`,
                  type: "done",
                  content: "Response complete",
                  timestamp: Date.now(),
                  duration: Date.now() - startTime,
                };
                setTraces(prev => [...prev, doneStep]);
              } else if (eventType === "citations") {
                setCitations((data.citations || []) as StreamCitation[]);
              } else if (eventType === "dashboard_patch") {
                setDashboardPatches(prev => [...prev, data as unknown as DashboardPatch]);
                setTraces(prev => [...prev, {
                  id: `t-${traceIdCounter.current++}`,
                  type: "tool_call",
                  tool: "modify_dashboard",
                  content: (data as any).description || `${(data as any).action} on ${(data as any).target}`,
                  timestamp: Date.now(),
                  duration: 0,
                }]);
              } else if (eventType === "error") {
                setError(data.message);
                setTraces(prev => [...prev, {
                  id: `t-${traceIdCounter.current++}`,
                  type: "error",
                  content: data.message,
                  timestamp: Date.now(),
                }]);
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
  }, [sessionId, options?.pageContext, options?.internetSearch, options?.selfKnowledge]);

  return {
    streamMessage,
    streamingText,
    isStreaming,
    sessionId,
    traceId,
    citations,
    traces,
    dashboardPatches,
    error,
    cancel,
    clearTraces,
  };
}
