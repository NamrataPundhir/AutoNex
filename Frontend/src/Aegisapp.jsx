import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Fonts ──────────────────────────────────────────────── */
if (!document.getElementById("ag-fonts")) {
  const l = document.createElement("link");
  l.id = "ag-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Syne:wght@600;700;800&display=swap";
  document.head.appendChild(l);
}

/* ─── Global CSS ─────────────────────────────────────────── */
if (!document.getElementById("ag-css")) {
  const s = document.createElement("style");
  s.id = "ag-css";
  s.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg0: #06080b;
      --bg1: #0d1219;
      --bg2: #111827;
      --bg3: #1a2535;
      --bg4: #243040;
      --bg5: #2f3f55;
      --tx0: #ffffff;
      --tx1: #d4e4f4;
      --tx2: #8faec8;
      --tx3: #4a6680;
      --ac:  #00d4ff;
      --gr:  #22e876;
      --rd:  #ff3b5c;
      --yw:  #ffd060;
      --or:  #ff7940;
      --fw:  'JetBrains Mono', monospace;
      --fd:  'Syne', sans-serif;
    }
    html, body, #root { height: 100%; overflow: hidden; background: var(--bg0); }
    body { font-family: var(--fw); color: var(--tx1); -webkit-font-smoothing: antialiased; }
    ::-webkit-scrollbar { width: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 3px; }

    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.25} }
    @keyframes slidein { from{opacity:0;transform:translateX(6px)} to{opacity:1;transform:none} }
    @keyframes fadein  { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
    @keyframes scan    { from{top:0} to{top:100%} }
    @keyframes barflow { from{background-position:0 0} to{background-position:200% 0} }
    @keyframes glow    { 0%,100%{box-shadow:0 0 10px rgba(0,212,255,.3)} 50%{box-shadow:0 0 22px rgba(0,212,255,.6)} }

    .slide { animation: slidein .18s ease both; }
    .fade  { animation: fadein  .2s  ease both; }
  `;
  document.head.appendChild(s);
}

/* ─── Constants ──────────────────────────────────────────── */
const WS_BASE    = "ws://localhost:8000/ws/";
const API_BASE   = "http://localhost:8000";
const SESSION_ID = "aegis_" + Math.random().toString(36).slice(2, 8);

const ACT_ICON = {
  open:"⊕", navigate:"⊕", type:"▤", click:"◎", press_key:"⌥",
  wait:"◷", scroll:"⇕", hover:"⊙", extract:"◈", screenshot:"▣",
  select:"▽", clear:"✕", focus:"◉", tab_open:"⊞", tab_switch:"⇄",
};

const QUICK = [
  { label:"Flipkart Laptops",   cmd:"Search gaming laptops on Flipkart, show top results" },
  { label:"YouTube Lofi",       cmd:"Open YouTube and play lofi hip hop music" },
  { label:"Amazon iPhone",      cmd:"Check iPhone 15 Pro price on Amazon India" },
  { label:"AI News",            cmd:"Search DuckDuckGo for latest AI news today" },
  { label:"Samsung Phones",     cmd:"Show Samsung phones under 20000 on Flipkart" },
  { label:"Wikipedia AI",       cmd:"Search Wikipedia for Artificial Intelligence" },
];

const STEP_STYLE = {
  planning:{ border:"rgba(255,208,96,.3)",  bg:"rgba(255,208,96,.07)", ic:"#ffd060" },
  running: { border:"rgba(0,212,255,.4)",   bg:"rgba(0,212,255,.08)",  ic:"#00d4ff" },
  success: { border:"rgba(34,232,118,.25)", bg:"rgba(34,232,118,.05)", ic:"#22e876" },
  error:   { border:"rgba(255,59,92,.35)",  bg:"rgba(255,59,92,.07)",  ic:"#ff3b5c" },
  done:    { border:"rgba(34,232,118,.5)",  bg:"rgba(34,232,118,.08)", ic:"#22e876" },
};

/* ─── SVG Icons ──────────────────────────────────────────── */
const Ico = {
  Bolt: ({ s=14, c="currentColor" }) => (
    <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
      <path d="M8 1.5 3.5 7.5h3.5L6 13l5.5-7H8L8 1.5Z" fill={c}/>
    </svg>
  ),
  Stop: ({ s=12 }) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none">
      <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/>
    </svg>
  ),
  Trash: ({ s=13 }) => (
    <svg width={s} height={s} viewBox="0 0 13 13" fill="none">
      <path d="M2 4h9M5 4V2.5h3V4M5.5 6v4M7.5 6v4M3 4l.75 7h5.5L10 4H3Z"
        stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  ),
  Globe: ({ s=11 }) => (
    <svg width={s} height={s} viewBox="0 0 11 11" fill="none">
      <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M5.5 1c-1.8 1.8-1.8 7.2 0 9M5.5 1c1.8 1.8 1.8 7.2 0 9M1 5.5h9" stroke="currentColor" strokeWidth="1"/>
    </svg>
  ),
  Copy: ({ s=11 }) => (
    <svg width={s} height={s} viewBox="0 0 11 11" fill="none">
      <rect x="3.5" y="1" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1"/>
      <rect x="1" y="2.5" width="6.5" height="7.5" rx="1" fill="var(--bg1)" stroke="currentColor" strokeWidth="1"/>
    </svg>
  ),
  Check: ({ s=11 }) => (
    <svg width={s} height={s} viewBox="0 0 11 11" fill="none">
      <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  ChevR: ({ s=10 }) => (
    <svg width={s} height={s} viewBox="0 0 10 10" fill="none">
      <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

/* ─── WebSocket Hook ─────────────────────────────────────── */
function useWebSocket(onMsg) {
  const wsRef = useRef(null);
  const [conn, setConn] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_BASE + SESSION_ID);
    wsRef.current = ws;
    ws.onopen    = () => setConn(true);
    ws.onclose   = () => { setConn(false); setTimeout(connect, 3000); };
    ws.onerror   = () => setConn(false);
    ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch {} };
  }, [onMsg]);

  useEffect(() => { connect(); return () => wsRef.current?.close(); }, [connect]);

  const send = useCallback((d) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(d));
  }, []);

  return { conn, send };
}

/* ─── App State Hook ─────────────────────────────────────── */
function useAppState() {
  const [shot,    setShot   ] = useState(null);
  const [url,     setUrl    ] = useState("about:blank");
  const [pct,     setPct    ] = useState(0);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [items,   setItems  ] = useState([]);
  const [plan,    setPlan   ] = useState([]);
  const [astep,   setAstep  ] = useState(null);
  const [stats,   setStats  ] = useState({ total:0, done:0, errors:0, t0:null });
  const [hist,    setHist   ] = useState([]);

  const totRef  = useRef(0);
  const doneRef = useRef(0);
  const mapRef  = useRef({});

  const add = useCallback((item) => {
    setItems(prev => {
      const next = [...prev, { _id: Date.now() + Math.random(), ...item }];
      if (item.num != null) mapRef.current[item.num] = next.length - 1;
      return next;
    });
  }, []);

  const patch = useCallback((num, p) => {
    setItems(prev => {
      const i = mapRef.current[num];
      if (i === undefined) return prev;
      const n = [...prev]; n[i] = { ...n[i], ...p }; return n;
    });
  }, []);

  const onMsg = useCallback((msg) => {
    switch (msg.type) {
      case "planning":
        setLoading(true); setLoadMsg("Planning…");
        setStats(s => ({ ...s, t0: Date.now() }));
        add({ st:"planning", ic:"◈", desc: msg.message || "Planning task…", meta:"" });
        break;
      case "plan_ready":
        totRef.current = (msg.steps||[]).length;
        doneRef.current = 0;
        setPlan(msg.steps||[]); setPct(0);
        setStats(s => ({ ...s, total:totRef.current, done:0, errors:0 }));
        add({ st:"planning", ic:"▣", desc: msg.message || `${totRef.current} steps planned`, meta:"" });
        break;
      case "browser_starting":
        setLoading(true); setLoadMsg("Launching browser…");
        add({ st:"running", ic:"⊕", desc: msg.message || "Launching browser…", meta:"" });
        break;
      case "browser_ready":
        setLoading(false);
        add({ st:"success", ic:"✓", desc:"Browser ready", meta:"" });
        break;
      case "step_start":
        setLoading(true); setLoadMsg(msg.description || msg.action);
        setAstep(msg.step_number);
        add({
          st:"running", ic: ACT_ICON[msg.action]||"◈",
          desc: msg.description || msg.action,
          meta: `${msg.action} · step ${msg.step_number}/${msg.total_steps}`,
          num: msg.step_number,
        });
        break;
      case "step_complete": {
        doneRef.current = msg.step_number;
        totRef.current  = Math.max(totRef.current, msg.total_steps||0);
        const p = totRef.current ? Math.round((doneRef.current / totRef.current) * 100) : 0;
        setPct(p);
        setStats(s => ({ ...s, done: doneRef.current }));
        if (msg.screenshot) setShot(msg.screenshot);
        if (msg.current_url) setUrl(msg.current_url);
        patch(msg.step_number, { st:"success", ic:"✓" });
        if (msg.step_number < totRef.current) setLoadMsg(`Step ${msg.step_number+1}/${totRef.current}`);
        break;
      }
      case "step_error":
        patch(msg.step_number, { st:"error", ic:"!" });
        if (msg.screenshot) setShot(msg.screenshot);
        setStats(s => ({ ...s, errors: s.errors+1 }));
        add({ st:"error", ic:"!", desc: msg.error||"Step failed", meta:`step ${msg.step_number}` });
        break;
      case "task_complete":
        setLoading(false); setRunning(false); setAstep(null);
        if (msg.screenshot) setShot(msg.screenshot);
        if (msg.current_url) setUrl(msg.current_url);
        setPct(100);
        add({ st:"done", ic:"✓", desc:"Task completed", meta: msg.current_url||"" });
        setHist(h => [
          { _id:Date.now(), url:msg.current_url, shot:msg.screenshot, ts:new Date().toLocaleTimeString() },
          ...h.slice(0,9),
        ]);
        break;
      case "error":
        setLoading(false); setRunning(false);
        add({ st:"error", ic:"!", desc: msg.message||"Error", meta:"" });
        break;
      default: break;
    }
  }, [add, patch]);

  const reset = useCallback(() => {
    setShot(null); setUrl("about:blank"); setPct(0);
    setItems([]); setPlan([]); setAstep(null);
    setLoading(false); setStats({ total:0, done:0, errors:0, t0:null });
    totRef.current = 0; doneRef.current = 0; mapRef.current = {};
  }, []);

  return { shot, url, pct, running, loading, loadMsg, items, plan, astep, stats, hist,
           setRunning, setLoading, onMsg, reset, add };
}

/* ─── Header ─────────────────────────────────────────────── */
function Header({ conn, running, stats, elapsed, onClear, onStop }) {
  return (
    <div style={{
      height:50, display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"0 20px", background:"var(--bg1)",
      borderBottom:"1px solid var(--bg3)", flexShrink:0, zIndex:20,
    }}>
      {/* Logo */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ fontFamily:"var(--fd)", fontWeight:800, fontSize:18, letterSpacing:"0.1em", color:"var(--tx0)" }}>
          <span style={{ color:"var(--ac)" }}>AE</span>GIS
        </div>
        <span style={{
          fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase",
          color:"var(--tx3)", background:"var(--bg2)",
          border:"1px solid var(--bg4)", borderRadius:3, padding:"2px 8px",
        }}>v2.0 · Browser AI</span>
      </div>

      {/* Runtime stats */}
      {running && (
        <div style={{ display:"flex", gap:20 }}>
          {[
            { l:"Steps",  v:`${stats.done}/${stats.total}`, c:"var(--ac)" },
            { l:"Errors", v:stats.errors,                   c:stats.errors?"var(--rd)":"var(--tx3)" },
            { l:"Time",   v:`${elapsed}s`,                  c:"var(--yw)" },
          ].map(s=>(
            <div key={s.l} style={{ textAlign:"center" }}>
              <div style={{ fontSize:8, textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--tx3)", marginBottom:2 }}>{s.l}</div>
              <div style={{ fontSize:13, fontWeight:700, color:s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Right controls */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <ConnPill conn={conn}/>
        <HBtn onClick={onClear} title="Clear"><Ico.Trash s={13}/></HBtn>
        <HBtn onClick={onStop} danger title="Kill session"><Ico.Stop s={12}/> Kill</HBtn>
      </div>
    </div>
  );
}

function ConnPill({ conn }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em" }}>
      <div style={{
        width:7, height:7, borderRadius:"50%",
        background:conn?"var(--gr)":"var(--bg4)",
        boxShadow:conn?"0 0 8px var(--gr)":"none",
        animation:conn?"pulse 2s infinite":"none",
      }}/>
      <span style={{ color:conn?"var(--gr)":"var(--tx3)" }}>{conn?"Live":"Offline"}</span>
    </div>
  );
}

function HBtn({ children, onClick, danger, title }) {
  const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        display:"flex", alignItems:"center", gap:5, background:"transparent",
        border:`1px solid ${hov?(danger?"var(--rd)":"var(--ac)"):"var(--bg4)"}`,
        color:hov?(danger?"var(--rd)":"var(--ac)"):"var(--tx2)",
        borderRadius:4, padding:"5px 11px",
        fontSize:10, fontFamily:"var(--fw)", textTransform:"uppercase", letterSpacing:"0.07em",
        cursor:"pointer", transition:"all .15s",
      }}>{children}</button>
  );
}

/* ─── Browser Panel ──────────────────────────────────────── */
function BrowserPanel({ shot, url, pct, loading, loadMsg }) {
  const [copied,setCopied]=useState(false);
  const copy=()=>{
    navigator.clipboard.writeText(url).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),1500); });
  };

  return (
    <div style={{ flex:"1 1 0", display:"flex", flexDirection:"column", minWidth:0, background:"var(--bg0)" }}>

      {/* Chrome bar */}
      <div style={{
        display:"flex", alignItems:"center", gap:12,
        padding:"8px 16px", background:"var(--bg1)",
        borderBottom:"1px solid var(--bg3)", flexShrink:0,
      }}>
        <div style={{ display:"flex", gap:6 }}>
          {["#ff5f57","#ffbd2e","#28c840"].map((c,i)=>(
            <div key={i} style={{ width:11, height:11, borderRadius:"50%", background:c, opacity:.9 }}/>
          ))}
        </div>
        <div style={{
          flex:1, display:"flex", alignItems:"center", gap:8,
          background:"rgba(0,0,0,.5)", border:"1px solid var(--bg4)",
          borderRadius:5, padding:"5px 12px", minWidth:0,
        }}>
          <span style={{ color:"var(--gr)", flexShrink:0 }}><Ico.Globe s={11}/></span>
          <span style={{
            flex:1, fontSize:11, color:"var(--tx2)",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          }}>{url}</span>
          <button onClick={copy} style={{
            background:"none", border:"none", cursor:"pointer", padding:0,
            color:copied?"var(--gr)":"var(--tx3)", display:"flex", transition:"color .2s",
          }}>
            {copied?<Ico.Check s={11}/>:<Ico.Copy s={11}/>}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:2, background:"var(--bg3)", flexShrink:0, overflow:"hidden" }}>
        <div style={{
          height:"100%", width:`${pct}%`,
          background:"linear-gradient(90deg,var(--ac),var(--gr),var(--ac))",
          backgroundSize:"200% 100%",
          animation:pct>0&&pct<100?"barflow 1.2s linear infinite":"none",
          transition:"width .4s ease",
        }}/>
      </div>

      {/* Viewport */}
      <div style={{
        flex:1, position:"relative", overflow:"hidden",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        {/* CRT lines */}
        <div style={{
          position:"absolute", inset:0, pointerEvents:"none", zIndex:2,
          backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.05) 2px,rgba(0,0,0,.05) 4px)",
        }}/>
        {/* Scan beam */}
        {loading && (
          <div style={{
            position:"absolute", left:0, right:0, height:2, zIndex:5,
            background:"linear-gradient(90deg,transparent,var(--ac),transparent)",
            opacity:.4, animation:"scan 1.8s linear infinite",
          }}/>
        )}

        {shot ? (
          <img src={`data:image/jpeg;base64,${shot}`} alt="view"
            style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", position:"relative", zIndex:1, animation:"fadein .3s ease" }}/>
        ) : (
          <IdleGrid/>
        )}

        {/* Loading overlay */}
        {loading && (
          <div style={{
            position:"absolute", inset:0, zIndex:10,
            background:"rgba(6,8,11,.82)",
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16,
            backdropFilter:"blur(6px)",
          }}>
            <div style={{
              width:34, height:34, borderRadius:"50%",
              border:"2px solid var(--bg4)", borderTopColor:"var(--ac)",
              animation:"spin .75s linear infinite",
            }}/>
            <div style={{ fontSize:11, color:"var(--ac)", textTransform:"uppercase", letterSpacing:"0.13em", animation:"pulse 1.2s infinite" }}>
              {loadMsg}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IdleGrid() {
  const cells = Array.from({length:56},(_,i)=>({
    lit:((Math.floor(i/8)+i%8)%3===0)||((i*7)%11===0),
    d:(i*43)%2200,
  }));
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:18, opacity:.22, userSelect:"none" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8,14px)", gap:7 }}>
        {cells.map((c,i)=>(
          <div key={i} style={{
            width:14, height:14, borderRadius:2,
            border:"1px solid var(--bg4)",
            background:c.lit?"var(--bg4)":"transparent",
            animation:c.lit?`pulse ${1.4+(i%7)*.12}s ${c.d}ms infinite`:"none",
          }}/>
        ))}
      </div>
      <div style={{ fontFamily:"var(--fd)", fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", color:"var(--tx3)" }}>
        Awaiting Command
      </div>
    </div>
  );
}

/* ─── Right Panel ────────────────────────────────────────── */
function RightPanel({ items, plan, astep, hist, prompt, setPrompt, onRun, onStop, running }) {
  const [tab, setTab] = useState("feed");
  const tabs = [
    { id:"feed",    label:"Feed",    n:items.length },
    { id:"plan",    label:"Plan",    n:plan.length  },
    { id:"history", label:"History", n:hist.length  },
  ];

  return (
    <div style={{
      width:370, flexShrink:0, display:"flex", flexDirection:"column",
      background:"var(--bg1)", borderLeft:"1px solid var(--bg3)",
    }}>
      {/* Session bar */}
      <div style={{
        display:"flex", alignItems:"center", gap:8,
        padding:"5px 16px", borderBottom:"1px solid var(--bg2)",
        fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--tx3)",
      }}>
        <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--bg4)" }}/>
        Session
        <span style={{ marginLeft:"auto", color:"var(--bg5)" }}>{SESSION_ID}</span>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid var(--bg3)", flexShrink:0 }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1, background:"none", border:"none",
            borderBottom:`2px solid ${tab===t.id?"var(--ac)":"transparent"}`,
            padding:"10px 0",
            fontSize:10, fontFamily:"var(--fw)", textTransform:"uppercase", letterSpacing:"0.1em",
            color:tab===t.id?"var(--ac)":"var(--tx2)",
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:5,
            transition:"color .15s, border-color .15s",
          }}>
            {t.label}
            {t.n>0&&(
              <span style={{
                background:tab===t.id?"var(--ac)":"var(--bg4)",
                color:tab===t.id?"#000":"var(--tx2)",
                borderRadius:20, fontSize:9, padding:"1px 6px", fontWeight:700,
              }}>{t.n}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {tab==="feed"    && <FeedTab items={items}/>}
        {tab==="plan"    && <PlanTab plan={plan} astep={astep}/>}
        {tab==="history" && <HistTab hist={hist}/>}
      </div>

      <div style={{ height:1, background:"var(--bg3)", flexShrink:0 }}/>
      <QuickBar onPick={setPrompt}/>
      <InputZone prompt={prompt} setPrompt={setPrompt} onRun={onRun} onStop={onStop} running={running}/>
    </div>
  );
}

/* ─── Feed Tab ───────────────────────────────────────────── */
function FeedTab({ items }) {
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current) ref.current.scrollTop=ref.current.scrollHeight; },[items]);

  return (
    <div ref={ref} style={{
      flex:1, overflowY:"auto", padding:12,
      display:"flex", flexDirection:"column", gap:5,
    }}>
      {items.length===0 ? (
        <div style={{
          margin:"auto", textAlign:"center",
          fontFamily:"var(--fd)", fontSize:11, letterSpacing:"0.1em",
          textTransform:"uppercase", color:"var(--tx3)", lineHeight:2.2,
        }}>
          No activity yet<br/>
          <span style={{ fontSize:9, opacity:.6 }}>Enter a command below</span>
        </div>
      ) : items.map(item=>{
        const s=STEP_STYLE[item.st]||STEP_STYLE.running;
        return (
          <div key={item._id} className="slide" style={{
            display:"flex", alignItems:"flex-start", gap:9,
            padding:"9px 11px", borderRadius:5,
            border:`1px solid ${s.border}`, background:s.bg,
          }}>
            <div style={{
              width:20, height:20, flexShrink:0, borderRadius:4,
              background:"rgba(255,255,255,.05)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:12, color:s.ic, marginTop:1,
            }}>{item.ic}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{
                fontSize:12, color:"var(--tx1)", lineHeight:1.45,
                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
              }}>{item.desc}</div>
              {item.meta&&(
                <div style={{ fontSize:9.5, color:"var(--tx3)", marginTop:3, textTransform:"uppercase", letterSpacing:"0.07em" }}>
                  {item.meta}
                </div>
              )}
            </div>
            {item.num&&(
              <span style={{ fontSize:9, color:"var(--bg5)", flexShrink:0, marginTop:2 }}>#{item.num}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Plan Tab ───────────────────────────────────────────── */
function PlanTab({ plan, astep }) {
  if(!plan.length) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ fontFamily:"var(--fd)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--tx3)" }}>
        No plan yet
      </span>
    </div>
  );
  return (
    <div style={{ flex:1, overflowY:"auto", padding:12 }}>
      <div style={{ fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--tx3)", marginBottom:10 }}>
        Execution Plan — {plan.length} steps
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {plan.map((step,i)=>{
          const n=i+1, done=astep!=null&&n<astep, act=astep===n;
          return (
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"8px 11px", borderRadius:5,
              border:`1px solid ${act?"var(--ac)":done?"rgba(34,232,118,.2)":"var(--bg3)"}`,
              background:act?"rgba(0,212,255,.06)":done?"rgba(34,232,118,.03)":"transparent",
              opacity:done?.65:1, transition:"all .2s",
            }}>
              <div style={{
                width:22, height:22, borderRadius:"50%", flexShrink:0,
                border:`1.5px solid ${act?"var(--ac)":done?"var(--gr)":"var(--bg4)"}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:9, fontWeight:700, color:act?"var(--ac)":done?"var(--gr)":"var(--tx3)",
                background:done?"rgba(34,232,118,.1)":"transparent",
              }}>
                {done?<Ico.Check s={10}/>:n}
              </div>
              <div style={{ fontSize:12, color:act?"var(--ac)":"var(--tx3)", flexShrink:0 }}>
                {ACT_ICON[step.action]||"◈"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{
                  fontSize:11.5, color:act?"var(--tx0)":"var(--tx1)",
                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                }}>{step.description||step.action}</div>
                <div style={{ fontSize:9, color:"var(--tx3)", marginTop:2, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  {step.action}{step.url?` · ${step.url.slice(0,28)}…`:""}
                  {step.selector?` · ${String(step.selector).slice(0,20)}`:""}
                </div>
              </div>
              {act&&<div style={{ width:6, height:6, borderRadius:"50%", background:"var(--ac)", animation:"pulse 1s infinite", flexShrink:0 }}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── History Tab ────────────────────────────────────────── */
function HistTab({ hist }) {
  const [prev,setPrev]=useState(null);
  if(!hist.length) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ fontFamily:"var(--fd)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--tx3)" }}>
        No history yet
      </span>
    </div>
  );
  return (
    <div style={{ flex:1, overflowY:"auto", padding:12 }}>
      {prev?(
        <div>
          <button onClick={()=>setPrev(null)} style={{
            background:"none", border:"none", cursor:"pointer",
            color:"var(--ac)", fontSize:10, fontFamily:"var(--fw)",
            textTransform:"uppercase", letterSpacing:"0.1em",
            display:"flex", alignItems:"center", gap:5, marginBottom:12,
          }}>← Back</button>
          <img src={`data:image/jpeg;base64,${prev.shot}`} alt="prev"
            style={{ width:"100%", borderRadius:5, border:"1px solid var(--bg4)" }}/>
          <div style={{ fontSize:10, color:"var(--tx2)", marginTop:8, wordBreak:"break-all" }}>{prev.url}</div>
          <div style={{ fontSize:9, color:"var(--tx3)", marginTop:4 }}>{prev.ts}</div>
        </div>
      ):(
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {hist.map(h=>(
            <div key={h._id} onClick={()=>h.shot&&setPrev(h)}
              style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"8px 10px", borderRadius:5,
                border:"1px solid var(--bg3)", background:"var(--bg2)",
                cursor:h.shot?"pointer":"default",
              }}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--bg5)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="var(--bg3)"}
            >
              {h.shot?(
                <img src={`data:image/jpeg;base64,${h.shot}`} alt="thumb"
                  style={{ width:48, height:32, objectFit:"cover", borderRadius:3, flexShrink:0, border:"1px solid var(--bg4)" }}/>
              ):(
                <div style={{ width:48, height:32, background:"var(--bg3)", borderRadius:3, flexShrink:0 }}/>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10.5, color:"var(--tx1)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {h.url||"Task completed"}
                </div>
                <div style={{ fontSize:9, color:"var(--tx3)", marginTop:3 }}>{h.ts}</div>
              </div>
              <Ico.ChevR s={10}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Quick Bar ──────────────────────────────────────────── */
function QuickBar({ onPick }) {
  return (
    <div style={{
      display:"flex", flexWrap:"wrap", gap:5,
      padding:"10px 14px 8px", borderTop:"1px solid var(--bg3)",
    }}>
      {QUICK.map(q=><Chip key={q.label} label={q.label} onClick={()=>onPick(q.cmd)}/>)}
    </div>
  );
}
function Chip({ label, onClick }) {
  const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:"none",
        border:`1px solid ${hov?"var(--or)":"var(--bg4)"}`,
        borderRadius:20, padding:"3px 10px",
        fontSize:9, fontFamily:"var(--fw)", textTransform:"uppercase", letterSpacing:"0.07em",
        color:hov?"var(--or)":"var(--tx2)", cursor:"pointer", transition:"all .15s", whiteSpace:"nowrap",
      }}>{label}</button>
  );
}

/* ─── Input Zone ─────────────────────────────────────────── */
function InputZone({ prompt, setPrompt, onRun, onStop, running }) {
  const [foc,setFoc]=useState(false);
  return (
    <div style={{ padding:"10px 14px 16px", display:"flex", flexDirection:"column", gap:9 }}>
      <div style={{
        display:"flex", alignItems:"center", gap:8,
        fontSize:9, textTransform:"uppercase", letterSpacing:"0.14em", color:"var(--tx3)",
      }}>
        Command
        <div style={{ flex:1, height:1, background:"var(--bg3)" }}/>
        <span style={{ opacity:.5, fontSize:8.5 }}>ctrl+enter to run</span>
      </div>
      <textarea
        value={prompt}
        onChange={e=>setPrompt(e.target.value)}
        onFocus={()=>setFoc(true)}
        onBlur={()=>setFoc(false)}
        onKeyDown={e=>{ if(e.ctrlKey&&e.key==="Enter") onRun(); }}
        placeholder="e.g. Search gaming laptops on Flipkart and show the top result…"
        style={{
          background:"var(--bg0)",
          border:`1px solid ${foc?"var(--ac)":"var(--bg4)"}`,
          borderRadius:5, color:"var(--tx1)",
          fontFamily:"var(--fw)", fontSize:12.5, lineHeight:1.65,
          padding:"11px 13px", resize:"none", outline:"none",
          width:"100%", height:90,
          transition:"border-color .2s",
          boxShadow:foc?"0 0 0 2px rgba(0,212,255,.08)":"none",
        }}
      />
      <div style={{ display:"flex", gap:7 }}>
        <RunBtn onClick={onRun} running={running}/>
        <StopBtn onClick={onStop}/>
      </div>
    </div>
  );
}

function RunBtn({ onClick, running }) {
  const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick} disabled={running}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        flex:1, border:"none", borderRadius:5,
        background:running?"var(--bg3)":hov?"#fff":"var(--ac)",
        color:running?"var(--tx3)":"#000",
        fontFamily:"var(--fd)", fontWeight:700, fontSize:12, letterSpacing:"0.1em", textTransform:"uppercase",
        cursor:running?"not-allowed":"pointer",
        padding:"11px 14px",
        display:"flex", alignItems:"center", justifyContent:"center", gap:7,
        transition:"all .15s",
        boxShadow:hov&&!running?"0 0 22px rgba(0,212,255,.35)":"none",
        transform:hov&&!running?"translateY(-1px)":"none",
        animation:hov&&!running?"glow 1.5s infinite":"none",
      }}>
      {running?(
        <>
          <div style={{ width:11, height:11, borderRadius:"50%", border:"2px solid var(--bg4)", borderTopColor:"var(--ac)", animation:"spin .7s linear infinite" }}/>
          Running…
        </>
      ):(
        <><Ico.Bolt s={13} c="#000"/> Execute</>
      )}
    </button>
  );
}

function StopBtn({ onClick }) {
  const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:hov?"rgba(255,59,92,.12)":"transparent",
        border:"1px solid var(--rd)", borderRadius:5,
        color:"var(--rd)", fontFamily:"var(--fw)", fontSize:11,
        cursor:"pointer", padding:"11px 14px",
        display:"flex", alignItems:"center", gap:6,
        textTransform:"uppercase", letterSpacing:"0.07em",
        transition:"all .15s",
      }}>
      <Ico.Stop s={11}/> Stop
    </button>
  );
}

/* ─── Root ───────────────────────────────────────────────── */
export default function Aegisapp() {
  const [prompt,  setPrompt ] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const st = useAppState();
  const { conn, send } = useWebSocket(st.onMsg);

  useEffect(()=>{
    if(!st.running) return;
    const id=setInterval(()=>setElapsed(e=>e+1),1000);
    return ()=>clearInterval(id);
  },[st.running]);

  const run = useCallback(()=>{
    if(!prompt.trim()) return;
    if(!conn){
      st.add({ st:"error", ic:"!", desc:"Not connected — start the FastAPI server first", meta:"" });
      return;
    }
    st.reset(); setElapsed(0);
    st.setRunning(true);
    send({ prompt });
  },[prompt,conn,st,send]);

  const stop = useCallback(()=>{
    fetch(`${API_BASE}/api/stop`,{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({session_id:SESSION_ID}),
    }).catch(()=>{});
    st.setLoading(false); st.setRunning(false);
    st.add({ st:"error", ic:"⏹", desc:"Session stopped by user", meta:"" });
  },[st]);

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"var(--bg0)" }}>
      <Header conn={conn} running={st.running} stats={st.stats} elapsed={elapsed} onClear={st.reset} onStop={stop}/>
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        <BrowserPanel shot={st.shot} url={st.url} pct={st.pct} loading={st.loading} loadMsg={st.loadMsg}/>
        <RightPanel
          items={st.items} plan={st.plan} astep={st.astep} hist={st.hist}
          prompt={prompt} setPrompt={setPrompt}
          onRun={run} onStop={stop} running={st.running}
        />
      </div>
    </div>
  );
}