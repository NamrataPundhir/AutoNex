// components/ChatAgent.jsx — AutoNex AXON Voice Agent
// • Hold mic button → speak → AXON hears you
// • AXON streams response + speaks it back (browser TTS)
// • Live waveform bars while listening, glow while speaking

import { useState, useRef, useEffect, useCallback } from "react";
import { useAgentChat } from "../hooks/useAgentChat";

// ── Inject CSS once ──────────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

@keyframes axon-fadeup   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes axon-bounce   { 0%,80%,100%{transform:scaleY(0.4)} 40%{transform:scaleY(1)} }
@keyframes axon-pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.95)} }
@keyframes axon-spin     { to{transform:rotate(360deg)} }
@keyframes axon-glow     { 0%,100%{box-shadow:0 0 12px rgba(0,229,160,.25)} 50%{box-shadow:0 0 28px rgba(0,229,160,.6)} }
@keyframes axon-speaking { 0%,100%{box-shadow:0 0 10px rgba(0,144,255,.3)} 50%{box-shadow:0 0 26px rgba(0,144,255,.8)} }

.axon-msg        { animation: axon-fadeup .22s ease-out both; }
.axon-clear:hover{ background:#161b24!important; color:#e8edf5!important; }
.axon-quick:hover{ background:#161b24!important; color:#00e5a0!important; border-color:rgba(0,229,160,.3)!important; }
.axon-ta:focus   { border-color:rgba(0,229,160,.35)!important; box-shadow:0 0 0 3px rgba(0,229,160,.08)!important; }
.axon-mic:hover  { background:rgba(0,229,160,.14)!important; border-color:rgba(0,229,160,.5)!important; }
.axon-send:hover:not(:disabled){ opacity:.85; transform:translateY(-1px); }
`;

function injectCSS() {
  if (document.getElementById("axon-css")) return;
  const s = document.createElement("style");
  s.id = "axon-css";
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

// ── Strip markdown bold/code/tags for TTS ───────────────────────────
function stripMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g,       "$1")
    .replace(/\[TRIGGER_TASK:[^\]]+\]/gi, "")
    .replace(/[#*_~`]/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

// ── Render bold + code in chat bubbles ───────────────────────────────
function renderText(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g,
      "<strong style='color:#e8edf5;font-weight:600'>$1</strong>")
    .replace(/`(.+?)`/g,
      "<code style='background:#1e2633;padding:1px 6px;border-radius:4px;font-family:DM Mono,monospace;font-size:12px'>$1</code>")
    .replace(/\n/g, "<br>");
}

const QUICK = [
  "What tasks have I run?",
  "Search Flipkart for earphones",
  "Open YouTube and play lofi music",
  "What was my last task?",
  "Show my task history",
];

// ════════════════════════════════════════════════════════════════════
export default function ChatAgent({ sessionId = "main", style = {} }) {
  const {
    messages, isTyping, isConnected,
    taskStatus, liveSteps,
    sendMessage, clearChat,
  } = useAgentChat(sessionId);

  const [input,      setInput]      = useState("");
  const [micState,   setMicState]   = useState("idle");   // idle | listening | processing
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOn,    setVoiceOn]    = useState(true);
  const [transcript, setTranscript] = useState("");
  const [volBars,    setVolBars]    = useState(Array(8).fill(3));

  const bottomRef    = useRef(null);
  const taRef        = useRef(null);
  const recognRef    = useRef(null);
  const synthRef     = useRef(window.speechSynthesis);
  const volTimerRef  = useRef(null);
  const audioCtxRef  = useRef(null);
  const analyserRef  = useRef(null);
  const micStreamRef = useRef(null);
  const transcriptRef = useRef("");   // stable ref for onend callback

  useEffect(() => { injectCSS(); }, []);

  // Keep transcriptRef in sync
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, transcript]);

  // Stop TTS when user sends a message
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "user") stopSpeaking();
  }, [messages]);

  // Auto-speak completed assistant messages
  useEffect(() => {
    if (!voiceOn) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && !last.streaming && last.content) {
      speak(last.content);
    }
  }, [messages, voiceOn]);

  // ── TTS ──────────────────────────────────────────────────────────
  const speak = useCallback((text) => {
    const synth = synthRef.current;
    if (!synth) return;
    synth.cancel();
    const clean = stripMd(text);
    if (!clean) return;

    const utt   = new SpeechSynthesisUtterance(clean);
    utt.rate    = 1.05;
    utt.pitch   = 1.0;
    utt.volume  = 1.0;

    const voices = synth.getVoices();
    const voice  = voices.find(v =>
      v.lang.startsWith("en") && (
        v.name.includes("Google") || v.name.includes("Natural") ||
        v.name.includes("Samantha") || v.name.includes("Daniel")
      )
    ) || voices.find(v => v.lang.startsWith("en"));
    if (voice) utt.voice = voice;

    utt.onstart = () => setIsSpeaking(true);
    utt.onend   = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    synth.speak(utt);
  }, []);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  // ── Volume analyser (waveform bars) ─────────────────────────────
  const startAnalyser = useCallback(async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx      = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);

      volTimerRef.current = setInterval(() => {
        analyser.getByteFrequencyData(data);
        setVolBars(Array.from({ length: 8 }, (_, i) => {
          const v = data[Math.floor(i * data.length / 8)] || 0;
          return Math.max(3, Math.round((v / 255) * 28));
        }));
      }, 60);
    } catch {
      // No mic permission → fake animated bars
      volTimerRef.current = setInterval(() => {
        setVolBars(Array.from({ length: 8 }, () => Math.floor(Math.random() * 24) + 3));
      }, 120);
    }
  }, []);

  const stopAnalyser = useCallback(() => {
    clearInterval(volTimerRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    // Guard against double-close
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    micStreamRef.current = null;
    setVolBars(Array(8).fill(3));
  }, []);

  // ── Speech recognition — tries 3 locales, falls back to type mode ─
  const LANG_ATTEMPTS = ["en-US", "en-GB", ""];   // "" = browser default (offline-capable on some builds)
  const langAttemptRef = useRef(0);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setTranscript("⌨️ Voice unavailable — please type below");
      setTimeout(() => setTranscript(""), 3000);
      return;
    }

    stopSpeaking();
    langAttemptRef.current = 0;
    _tryListen(SR, 0);

    function _tryListen(SR, attempt) {
      const lang  = LANG_ATTEMPTS[attempt] ?? "";
      const recog = new SR();
      recog.continuous      = false;
      recog.interimResults  = true;
      recog.maxAlternatives = 1;
      if (lang) recog.lang  = lang;
      recognRef.current     = recog;

      recog.onstart = () => {
        setMicState("listening");
        setTranscript("");
        startAnalyser();
      };

      recog.onresult = (e) => {
        let interim = "", final = "";
        for (const r of e.results) {
          if (r.isFinal) final   += r[0].transcript;
          else           interim += r[0].transcript;
        }
        const t = final || interim;
        setTranscript(t);
        transcriptRef.current = t;
      };

      recog.onend = () => {
        stopAnalyser();
        setMicState("processing");
        setTimeout(() => {
          setMicState("idle");
          const text = transcriptRef.current;
          setTranscript("");
          transcriptRef.current = "";
          if (text?.trim()) sendMessage(text.trim());
        }, 350);
      };

      recog.onerror = (e) => {
        stopAnalyser();
        setTranscript("");

        if (e.error === "network") {
          const next = attempt + 1;
          if (next < LANG_ATTEMPTS.length) {
            // Try next locale
            setMicState("idle");
            setTimeout(() => _tryListen(SR, next), 300);
            return;
          }
          // All locales exhausted — show type-fallback UI
          setMicState("idle");
          setTranscript("❌ Voice unavailable on this network. Please type your message.");
          setTimeout(() => setTranscript(""), 5000);
          return;
        }

        if (e.error === "not-allowed") {
          setTranscript("🚫 Mic blocked — allow access in Chrome → Settings → Privacy → Microphone");
          setTimeout(() => setTranscript(""), 5000);
        } else if (e.error === "no-speech") {
          // Silently ignore — user just didn't speak
        } else if (e.error !== "aborted") {
          console.warn("[AXON] Speech error:", e.error);
        }
        setMicState("idle");
      };

      try { recog.start(); }
      catch (err) {
        console.warn("[AXON] recog.start() failed:", err);
        setMicState("idle");
      }
    }
  }, [stopSpeaking, startAnalyser, stopAnalyser, sendMessage]);

  const stopListening = useCallback(() => {
    recognRef.current?.stop();
  }, []);

  // ── Text send ────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isTyping) {
        sendMessage(input.trim());
        setInput("");
      }
    }
  };

  // ── Mic button style by state ────────────────────────────────────
  const micStyle = {
    idle: {
      bg: "rgba(0,229,160,.07)", border: "1px solid rgba(0,229,160,.25)",
      shadow: "none", color: "#00e5a0", icon: "🎤", title: "Hold to speak",
    },
    listening: {
      bg: "radial-gradient(circle,rgba(255,59,59,.18),rgba(255,59,59,.04))",
      border: "1.5px solid rgba(255,59,59,.7)",
      shadow: "0 0 0 6px rgba(255,59,59,.1)",
      color: "#ff3b3b", icon: "🔴", title: "Release to send",
    },
    processing: {
      bg: "rgba(255,179,71,.08)", border: "1.5px solid rgba(255,179,71,.4)",
      shadow: "none", color: "#ffb347", icon: "⏳", title: "Processing…",
    },
  }[micState];

  const taskLabel = { planning:"🧠 Planning…", running:"🌐 Browser running…", done:"✅ Done" }[taskStatus];

  // ── Message renderer ─────────────────────────────────────────────
  function renderMsg(msg) {
    const { id, role, content, msgType, streaming, steps, screenshot, duration, timestamp } = msg;

    if (role === "system") {
      return (
        <div key={id} className="axon-msg"
          style={{ display:"flex", justifyContent:"center", margin:"4px 0" }}>
          <div style={{
            background:"#0d1117", border:"1px solid #1e2633", borderRadius:"10px",
            padding:"7px 14px", fontSize:"11.5px", color:"#5a6478",
            maxWidth:"88%", textAlign:"center",
          }}>
            {msgType === "task_done" && screenshot ? (
              <div>
                <div style={{ marginBottom:"6px" }}>{content}</div>
                <img src={`data:image/jpeg;base64,${screenshot}`} alt="result"
                  style={{ borderRadius:"8px", maxWidth:"100%",
                    border:"1px solid #1e2633", display:"block" }} />
                {duration && <div style={{ fontSize:"10px", color:"#3a4455", marginTop:"4px" }}>
                  Completed in {duration}s</div>}
              </div>
            ) : msgType === "plan" && steps ? (
              <div>
                <div style={{ marginBottom:"5px", color:"#8898b0" }}>{content}</div>
                {steps.slice(0,6).map((s,i) => (
                  <div key={i} style={{ fontSize:"11px", color:"#3a4455", textAlign:"left", padding:"1px 0" }}>
                    {i+1}. {s.description || s.action}
                  </div>
                ))}
                {steps.length > 6 &&
                  <div style={{ fontSize:"10px", color:"#2a3344" }}>+{steps.length-6} more</div>}
              </div>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: renderText(content) }} />
            )}
          </div>
        </div>
      );
    }

    const isUser = role === "user";
    return (
      <div key={id} className="axon-msg" style={{
        display:"flex", justifyContent: isUser ? "flex-end" : "flex-start",
        alignItems:"flex-end", gap:"8px", margin:"2px 0",
      }}>
        {!isUser && (
          <div style={{
            width:"28px", height:"28px", borderRadius:"9px", flexShrink:0,
            background: isSpeaking && !streaming
              ? "linear-gradient(135deg,#0090ff,#00c8ff)"
              : "linear-gradient(135deg,#00e5a0,#0090ff)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px",
            animation: isSpeaking && !streaming ? "axon-speaking 1.5s infinite" : "none",
            transition:"all .3s",
          }}>🤖</div>
        )}

        <div>
          <div style={{
            maxWidth:"76vw", padding:"9px 13px",
            borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background:   isUser ? "linear-gradient(135deg,#0a2040,#0d2d58)" : "#0d1a10",
            border:       isUser ? "1px solid rgba(0,144,255,.2)" : "1px solid rgba(0,229,160,.15)",
            fontSize:"13.5px", lineHeight:"1.6", color:"#e8edf5", wordBreak:"break-word",
          }}>
            {streaming && content === "" ? (
              <div style={{ display:"flex", gap:"5px", alignItems:"center", padding:"2px 0" }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width:"6px", height:"6px", borderRadius:"50%", background:"#00e5a0",
                    animation:`axon-bounce 1.2s ${i*.2}s infinite`,
                  }} />
                ))}
              </div>
            ) : (
              <>
                <span dangerouslySetInnerHTML={{ __html: renderText(content) }} />
                {streaming && (
                  <span style={{
                    display:"inline-block", width:"2px", height:"14px",
                    background:"#00e5a0", marginLeft:"2px",
                    verticalAlign:"text-bottom", animation:"axon-pulse .7s infinite",
                  }} />
                )}
              </>
            )}
          </div>
          {timestamp && !streaming && (
            <div style={{
              fontSize:"10px", color:"#2a3344", marginTop:"3px",
              textAlign: isUser ? "right" : "left", padding:"0 2px",
            }}>
              {new Date(timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
            </div>
          )}
        </div>

        {isUser && (
          <div style={{
            width:"28px", height:"28px", borderRadius:"9px", flexShrink:0,
            background:"linear-gradient(135deg,#1a2a4a,#0a2040)",
            border:"1px solid rgba(0,144,255,.2)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px",
          }}>👤</div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{
      display:"flex", flexDirection:"column", height:"100%", width:"100%",
      background:"#0a0c10", fontFamily:"'DM Sans',sans-serif", color:"#e8edf5",
      overflow:"hidden", ...style,
    }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"11px 16px", background:"#10141a", borderBottom:"1px solid #1e2633",
        flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <div style={{
            width:"36px", height:"36px", borderRadius:"11px", flexShrink:0,
            background: isSpeaking
              ? "linear-gradient(135deg,#0090ff,#00c8ff)"
              : "linear-gradient(135deg,#00e5a0,#0090ff)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:"17px",
            animation: isSpeaking ? "axon-speaking 1.5s infinite" : "axon-glow 3s infinite",
            transition:"background .4s",
          }}>🤖</div>
          <div>
            <div style={{
              fontSize:"14px", fontWeight:600, letterSpacing:".02em",
              display:"flex", alignItems:"center", gap:"7px",
            }}>
              AXON
              <span style={{
                width:"7px", height:"7px", borderRadius:"50%",
                background: isConnected ? "#00e5a0" : "#ff4f7b",
                boxShadow:  isConnected ? "0 0 6px #00e5a0" : "none",
                display:"inline-block",
              }} />
              {isSpeaking && (
                <span style={{ fontSize:"10px", color:"#0090ff", fontWeight:400,
                  letterSpacing:".05em", animation:"axon-pulse 1s infinite" }}>
                  SPEAKING
                </span>
              )}
              {micState === "listening" && (
                <span style={{ fontSize:"10px", color:"#ff3b3b", fontWeight:400,
                  letterSpacing:".05em", animation:"axon-pulse .7s infinite" }}>
                  LISTENING
                </span>
              )}
            </div>
            <div style={{ fontSize:"11px", color:"#5a6478", marginTop:"1px" }}>
              AutoNex Voice Agent
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap:"6px" }}>
          <button onClick={() => { setVoiceOn(v => !v); if(isSpeaking) stopSpeaking(); }}
            title={voiceOn ? "Mute AXON" : "Unmute AXON"}
            style={{
              background:   voiceOn ? "rgba(0,229,160,.1)" : "rgba(255,79,123,.08)",
              border:       `1px solid ${voiceOn?"rgba(0,229,160,.25)":"rgba(255,79,123,.2)"}`,
              borderRadius: "8px", padding:"5px 10px", fontSize:"12px",
              color: voiceOn ? "#00e5a0" : "#ff4f7b",
              cursor:"pointer", transition:"all .15s",
            }}>
            {voiceOn ? "🔊 Voice On" : "🔇 Muted"}
          </button>
          <button className="axon-clear" onClick={clearChat} style={{
            background:"transparent", border:"1px solid #1e2633", borderRadius:"8px",
            padding:"5px 10px", fontSize:"11px", color:"#5a6478",
            cursor:"pointer", transition:"all .15s",
          }}>Clear</button>
        </div>
      </div>

      {/* ── Task status bar ──────────────────────────────────────── */}
      {taskStatus && (
        <div style={{
          display:"flex", alignItems:"center", gap:"8px",
          padding:"6px 16px", borderBottom:"1px solid #1e2633", flexShrink:0,
          background: taskStatus==="running"?"rgba(0,144,255,.06)"
                    : taskStatus==="done"   ?"rgba(0,229,160,.06)"
                    : "rgba(255,179,71,.06)",
        }}>
          <div style={{
            width:"6px", height:"6px", borderRadius:"50%",
            background: taskStatus==="running"?"#0090ff":taskStatus==="done"?"#00e5a0":"#ffb347",
            animation:  taskStatus==="running"?"axon-pulse 1s infinite":"none",
          }} />
          <span style={{ fontSize:"12px", color:"#8898b0" }}>{taskLabel}</span>
          {liveSteps.length > 0 && (
            <span style={{ fontSize:"11px", color:"#3a4455" }}>
              {liveSteps.filter(s=>s.status==="success").length}/{liveSteps.length} steps
            </span>
          )}
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────── */}
      <div style={{
        flex:1, overflowY:"auto", padding:"14px 14px 6px",
        display:"flex", flexDirection:"column", gap:"4px",
      }}>
        {messages.length === 0 && !isTyping && (
          <div style={{ textAlign:"center", marginTop:"50px" }}>
            <div style={{ fontSize:"42px", marginBottom:"14px",
              animation:"axon-glow 3s infinite", display:"inline-block" }}>🤖</div>
            <div style={{ color:"#5a6478", fontWeight:500, fontSize:"14px" }}>
              AXON is ready
            </div>
            <div style={{ color:"#3a4455", fontSize:"12px", marginTop:"6px" }}>
              Hold 🎤 and speak, or type below
            </div>
          </div>
        )}

        {messages.map(renderMsg)}

        {/* Live transcript bubble */}
        {micState === "listening" && transcript && (
          <div className="axon-msg"
            style={{ display:"flex", justifyContent:"flex-end" }}>
            <div style={{
              maxWidth:"76vw", padding:"9px 13px",
              borderRadius:"14px 14px 4px 14px",
              background:"linear-gradient(135deg,#1a1a2e,#0d1030)",
              border:"1px solid rgba(255,59,59,.3)",
              fontSize:"13.5px", color:"#aab0c0", fontStyle:"italic",
            }}>
              {transcript}
              <span style={{ color:"#ff3b3b", marginLeft:"4px",
                animation:"axon-pulse .6s infinite" }}>●</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick prompts ────────────────────────────────────────── */}
      {messages.length < 3 && (
        <div style={{ padding:"8px 14px 4px", display:"flex",
          gap:"6px", flexWrap:"wrap", flexShrink:0 }}>
          {QUICK.map((q,i) => (
            <button key={i} className="axon-quick"
              onClick={() => { setInput(q); taRef.current?.focus(); }}
              style={{
                background:"#10141a", border:"1px solid #1e2633", color:"#8898b0",
                borderRadius:"20px", padding:"5px 12px", fontSize:"11.5px",
                cursor:"pointer", transition:"all .15s", whiteSpace:"nowrap",
              }}>{q}</button>
          ))}
        </div>
      )}

      {/* ── Input area ──────────────────────────────────────────── */}
      <div style={{
        padding:"10px 14px 12px", borderTop:"1px solid #1e2633",
        background:"#10141a", flexShrink:0,
      }}>

        {/* Waveform while listening */}
        {micState === "listening" && (
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            gap:"3px", marginBottom:"10px", height:"34px",
          }}>
            {volBars.map((h,i) => (
              <div key={i} style={{
                width:"3px", height:`${h}px`, borderRadius:"2px",
                background:`hsl(${150+i*10},100%,${55+i*2}%)`,
                transition:"height .06s ease",
                boxShadow:`0 0 4px hsl(${150+i*10},90%,55%)`,
              }} />
            ))}
            <span style={{ marginLeft:"10px", fontSize:"12px", color:"#ff3b3b",
              animation:"axon-pulse .8s infinite" }}>Listening…</span>
          </div>
        )}

        {/* Processing state */}
        {micState === "processing" && (
          <div style={{ textAlign:"center", marginBottom:"8px",
            fontSize:"12px", color:"#ffb347" }}>
            <span style={{ animation:"axon-spin .8s linear infinite",
              display:"inline-block", marginRight:"6px" }}>⏳</span>
            Processing your voice…
          </div>
        )}

        <div style={{ display:"flex", gap:"8px", alignItems:"flex-end" }}>

          {/* 🎤 Mic — hold to speak */}
          <button
            className={micState === "idle" ? "axon-mic" : ""}
            onMouseDown={() => startListening()}
            onMouseUp={stopListening}
            onTouchStart={e => { e.preventDefault(); startListening(); }}
            onTouchEnd={e   => { e.preventDefault(); stopListening(); }}
            title={micStyle.title}
            style={{
              width:"42px", height:"42px", borderRadius:"13px", flexShrink:0,
              background: micStyle.bg,
              border:     micStyle.border,
              boxShadow:  micStyle.shadow,
              color:      micStyle.color,
              fontSize:"18px",
              cursor: micState === "processing" ? "wait" : "pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"all .2s", userSelect:"none", WebkitUserSelect:"none",
            }}
          >{micStyle.icon}</button>

          {/* Text input */}
          <textarea ref={taRef} className="axon-ta"
            value={input}
            placeholder="Type or hold 🎤 to speak…"
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            onInput={e => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px";
            }}
            style={{
              flex:1, background:"#161b24", border:"1px solid #1e2633",
              borderRadius:"12px", color:"#e8edf5", fontSize:"13.5px",
              padding:"10px 13px", resize:"none", outline:"none",
              fontFamily:"'DM Sans',sans-serif", lineHeight:"1.5",
              minHeight:"42px", maxHeight:"110px",
              transition:"border-color .2s, box-shadow .2s",
            }}
          />

          {/* Send */}
          <button className="axon-send"
            onClick={() => {
              if (!input.trim() || isTyping) return;
              sendMessage(input.trim());
              setInput("");
            }}
            disabled={!input.trim() || isTyping}
            style={{
              width:"42px", height:"42px", borderRadius:"13px", flexShrink:0,
              background: !input.trim() || isTyping
                ? "#1e2633"
                : "linear-gradient(135deg,#00e5a0,#0090ff)",
              border:"none",
              cursor: !input.trim() || isTyping ? "not-allowed" : "pointer",
              fontSize:"17px", color:"#fff",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"all .2s",
              boxShadow: !input.trim()||isTyping ? "none" : "0 0 14px rgba(0,229,160,.25)",
            }}
          >➤</button>
        </div>

        <div style={{ fontSize:"10px", color:"#2a3344", marginTop:"7px",
          textAlign:"center", letterSpacing:".03em" }}>
          {micState === "idle"
            ? "Hold 🎤 to speak  ·  Enter to send  ·  Shift+Enter for newline"
            : micState === "listening"
            ? "Release 🎤 when done speaking"
            : "Processing…"}
        </div>
      </div>
    </div>
  );
}