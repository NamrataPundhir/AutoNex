// hooks/useAgentChat.js
// Fixed: React StrictMode safe, no premature close, auto-reconnect

import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

export function useAgentChat(sessionId = "chat-default") {
  const [messages,    setMessages]    = useState([]);
  const [isTyping,    setIsTyping]    = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [taskStatus,  setTaskStatus]  = useState(null);
  const [liveSteps,   setLiveSteps]   = useState([]);

  const wsRef           = useRef(null);
  const streamBufferRef = useRef("");
  const destroyedRef    = useRef(false);   // prevents reconnect after unmount
  const reconnectRef    = useRef(null);

  // ── Stable setter refs (survive re-renders safely) ────────────────
  const S = useRef({ setMessages, setIsTyping, setIsConnected, setTaskStatus, setLiveSteps });
  useEffect(() => {
    S.current = { setMessages, setIsTyping, setIsConnected, setTaskStatus, setLiveSteps };
  });

  // ── WebSocket connection ──────────────────────────────────────────
  useEffect(() => {
    destroyedRef.current = false;

    function connect() {
      if (destroyedRef.current) return;

      // Don't open a new socket if one is already open/connecting
      const existing = wsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN ||
                       existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const ws = new WebSocket(`${WS_URL}/ws/chat/${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyedRef.current) { ws.close(); return; }
        S.current.setIsConnected(true);
        clearTimeout(reconnectRef.current);
      };

      ws.onerror = () => {
        S.current.setIsConnected(false);
      };

      ws.onclose = (e) => {
        S.current.setIsConnected(false);
        // Don't reconnect if this close was triggered by our own cleanup
        if (destroyedRef.current) return;
        // Reconnect with backoff (1.5s)
        clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(connect, 1500);
      };

      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        handleEvent(data);
      };
    }

    // Small delay so React StrictMode's double-invoke doesn't race
    const initTimer = setTimeout(connect, 100);

    return () => {
      destroyedRef.current = true;
      clearTimeout(initTimer);
      clearTimeout(reconnectRef.current);
      const ws = wsRef.current;
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.onclose = null;   // prevent reconnect on intentional close
        ws.close();
      }
      wsRef.current = null;
      S.current.setIsConnected(false);
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event handler ────────────────────────────────────────────────
  function handleEvent(data) {
    const { setMessages, setIsTyping, setTaskStatus, setLiveSteps } = S.current;

    switch (data.type) {

      case "greeting":
        setMessages(prev => [...prev, {
          id: uid(), role: "assistant",
          content: data.full_text, timestamp: data.timestamp,
          streaming: false, msgType: "greeting",
        }]);
        break;

      case "typing":
        setIsTyping(true);
        streamBufferRef.current = "";
        setMessages(prev => [...prev, {
          id: uid(), role: "assistant",
          content: "", streaming: true, msgType: "text",
        }]);
        break;

      case "token":
        streamBufferRef.current += data.content;
        setMessages(prev => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === "assistant" && copy[i].streaming) {
              copy[i] = { ...copy[i], content: streamBufferRef.current };
              return copy;
            }
          }
          return copy;
        });
        break;

      case "done":
        setIsTyping(false);
        setMessages(prev => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === "assistant" && copy[i].streaming) {
              copy[i] = { ...copy[i], content: data.full_text,
                streaming: false, timestamp: data.timestamp };
              return copy;
            }
          }
          return copy;
        });
        streamBufferRef.current = "";
        break;

      case "task_launched":
        setTaskStatus("planning");
        setLiveSteps([]);
        setMessages(prev => [...prev, {
          id: uid(), role: "system", content: data.message,
          timestamp: data.timestamp, msgType: "task_launch",
          taskPrompt: data.prompt,
        }]);
        break;

      case "plan_ready":
        setTaskStatus("planning");
        setMessages(prev => [...prev, {
          id: uid(), role: "system", content: data.message,
          msgType: "plan", steps: data.steps,
        }]);
        break;

      case "browser_starting":
      case "browser_ready":
        setTaskStatus("running");
        break;

      case "step_start":
      case "step_complete":
      case "step_error":
        setLiveSteps(prev => {
          const idx = prev.findIndex(s => s.step_number === data.step_number);
          if (idx >= 0) {
            const copy = [...prev]; copy[idx] = data; return copy;
          }
          return [...prev, data];
        });
        break;

      case "task_complete":
        setTaskStatus("done");
        setMessages(prev => [...prev, {
          id: uid(), role: "system", content: data.message,
          msgType: "task_done", screenshot: data.screenshot,
          duration: data.duration_s,
        }]);
        setTimeout(() => S.current.setTaskStatus(null), 4000);
        break;

      case "error":
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: uid(), role: "system",
          content: `⚠️ ${data.message}`, msgType: "error",
        }]);
        break;

      default: break;
    }
  }

  // ── Send ──────────────────────────────────────────────────────────
  const sendMessage = useCallback((text) => {
    if (!text?.trim()) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[AXON] WebSocket not open, message dropped");
      return;
    }
    S.current.setMessages(prev => [...prev, {
      id: uid(), role: "user", content: text.trim(),
      timestamp: new Date().toISOString(),
      msgType: "text", streaming: false,
    }]);
    ws.send(JSON.stringify({ message: text.trim() }));
  }, []);

  // ── Clear ─────────────────────────────────────────────────────────
  const clearChat = useCallback(async () => {
    S.current.setMessages([]);
    S.current.setLiveSteps([]);
    S.current.setTaskStatus(null);
    streamBufferRef.current = "";
    try {
      const base = WS_URL.replace("ws://","http://").replace("wss://","https://");
      await fetch(`${base}/api/chat/history/${sessionId}`, { method: "DELETE" });
    } catch { /* best-effort */ }
  }, [sessionId]);

  return { messages, isTyping, isConnected, taskStatus, liveSteps, sendMessage, clearChat };
}

function uid() { return Date.now() + Math.random(); }