// Frontend/src/App.jsx — AutoNex v3 · Browser Agent + Women Safety + Memory

import { useState, useCallback } from 'react'
import Navbar      from './components/Navbar'
import Sidebar     from './components/Sidebar'
import BrowserView from './components/BrowserView'
import MemoryPanel from './components/MemoryPanel'        // ← NEW
import { useWebSocket } from './hooks/useWebSocket'

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 9)
}

const TABS = [
  { id: 'browser', label: 'Browser Agent', icon: '⬡' },
  { id: 'memory',  label: 'Memory',        icon: '🧠' }, // ← NEW
]

export default function App() {
  const [sessionId, setSessionId] = useState(() => generateSessionId())
  const [activeTab, setActiveTab] = useState('browser')
  const [fading,    setFading]    = useState(false)

  const {
    connected, status, steps, screenshot,
    currentUrl, planSteps, sendPrompt, clearSession,
  } = useWebSocket(sessionId)

  const handleStop = useCallback(async () => {
    try {
      await fetch('/api/stop', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: sessionId }),
      })
    } catch (e) { console.error('Stop failed', e) }
  }, [sessionId])

  const handleNewSession = useCallback(() => {
    handleStop()
    clearSession()
    setSessionId(generateSessionId())
  }, [handleStop, clearSession])

  const switchTab = (id) => {
    if (id === activeTab) return
    setFading(true)
    setTimeout(() => { setActiveTab(id); setFading(false) }, 110)
  }

  // ── Replay a past task: switch to browser tab then send the prompt ──
  const handleReplay = useCallback((prompt) => {
    switchTab('browser')
    // Small delay so tab switch animation completes first
    setTimeout(() => sendPrompt(prompt), 150)
  }, [sendPrompt])

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg, #0a0a0f)', fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <style>{CSS}</style>

      <Navbar connected={connected} sessionId={sessionId} onNewSession={handleNewSession} />

      {/* Tab Bar */}
      <div style={{ position: 'relative', background: 'var(--color-background-primary)', padding: '0 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(tab => {
            const active   = activeTab === tab.id
            const isSafety = tab.id === 'safety'
            const isMemory = tab.id === 'memory'
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={[
                  'an-tab',
                  active   ? 'an-tab-active'  : '',
                  isSafety ? 'an-tab-safety'  : '',
                  isMemory ? 'an-tab-memory'  : '',
                ].join(' ')}
              >
                <span className={[
                  'an-tab-icon',
                  active   ? 'an-tab-icon-active'  : '',
                  isSafety ? 'an-tab-icon-safety'  : '',
                  isMemory ? 'an-tab-icon-memory'  : '',
                ].join(' ')}>
                  {tab.icon}
                </span>
                {tab.label}
                {active && (
                  <span className={[
                    'an-tab-dot',
                    isSafety ? 'an-tab-dot-safety' : '',
                    isMemory ? 'an-tab-dot-memory' : '',
                  ].join(' ')} />
                )}
              </button>
            )
          })}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
      </div>

      {/* Content */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.11s ease' }}
      >

        {/* ── Browser Agent ──────────────────────────────────────── */}
        {activeTab === 'browser' && (
          <>
            <Sidebar
              connected={connected} status={status}
              steps={steps}        planSteps={planSteps}
              currentUrl={currentUrl}
              onSendPrompt={sendPrompt}
              onStop={handleStop}
              onClear={clearSession}
            />
            <BrowserView
              screenshot={screenshot}
              currentUrl={currentUrl}
              status={status}
            />
          </>
        )}

        {/* ── Women Safety ────────────────────────────────────────── */}
        {activeTab === 'safety' && (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-background-primary)' }}>
            <WomenSafety />
          </div>
        )}

        {/* ── Memory Panel ────────────────────────────────────────── */}
        {activeTab === 'memory' && (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-background-primary)' }}>
            <MemoryPanel onReplay={handleReplay} />
          </div>
        )}

      </div>
    </div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box}
body,input,textarea,select,button{font-family:'DM Sans',system-ui,sans-serif!important;-webkit-font-smoothing:antialiased}
:root{--accent:#6366f1;--accent-dim:rgba(99,102,241,0.12);--accent-glow:rgba(99,102,241,0.30);--g:#10b981;--a:#f59e0b;--r:#ef4444}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--color-border-secondary);border-radius:4px}

.an-tab{position:relative;display:flex;align-items:center;gap:7px;padding:10px 18px 11px;font-size:13px;font-weight:400;cursor:pointer;border:none;background:transparent;color:var(--color-text-secondary);border-bottom:1.5px solid transparent;border-radius:6px 6px 0 0;transition:color 0.15s,background 0.15s;letter-spacing:0.01em;z-index:1}
.an-tab:hover{color:var(--color-text-primary);background:var(--color-background-secondary)}
.an-tab-active{font-weight:500;color:var(--color-text-primary)!important;border-bottom:1.5px solid var(--accent)!important;background:linear-gradient(to bottom,transparent,var(--accent-dim))!important}
.an-tab-icon{font-size:13px;color:var(--color-text-tertiary);transition:color 0.15s;line-height:1}
.an-tab-icon-active{color:var(--accent)!important}
.an-tab-dot{position:absolute;top:9px;right:10px;width:4px;height:4px;border-radius:50%;background:var(--accent);box-shadow:0 0 6px var(--accent)}

/* Women Safety tab — red accent */
.an-tab-safety:hover{background:rgba(239,68,68,.06)}
.an-tab-safety.an-tab-active{border-bottom-color:#ef4444!important;background:linear-gradient(to bottom,transparent,rgba(239,68,68,.08))!important}
.an-tab-icon-safety{color:#ef4444!important}
.an-tab-dot-safety{background:#ef4444!important;box-shadow:0 0 6px rgba(239,68,68,.6)!important}

/* Memory tab — purple accent */
.an-tab-memory:hover{background:rgba(139,92,246,.06)}
.an-tab-memory.an-tab-active{border-bottom-color:#8b5cf6!important;background:linear-gradient(to bottom,transparent,rgba(139,92,246,.08))!important}
.an-tab-icon-memory{color:#8b5cf6!important}
.an-tab-dot-memory{background:#8b5cf6!important;box-shadow:0 0 6px rgba(139,92,246,.6)!important}

@keyframes raSpin{to{transform:rotate(360deg)}}
@keyframes raFadeIn{from{opacity:0}to{opacity:1}}
@keyframes raUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes raPulse{0%,100%{opacity:1}50%{opacity:.45}}

.ra-root{max-width:880px;margin:0 auto;padding:28px 28px 56px;animation:raFadeIn .2s ease}
.ra-section-label{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--color-text-tertiary);margin-bottom:10px}
.ra-prompt-wrap{background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-radius:14px;padding:18px 20px;transition:border-color .15s}
.ra-prompt-wrap:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
.ra-input{width:100%;padding:12px 14px;font-size:14px;font-family:'DM Sans',sans-serif;border:0.5px solid var(--color-border-secondary);border-radius:10px;background:var(--color-background-primary);color:var(--color-text-primary);outline:none;transition:border-color .15s;letter-spacing:.01em}
.ra-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
.ra-input::placeholder{color:var(--color-text-tertiary)}
.ra-btn{display:inline-flex;align-items:center;gap:7px;padding:11px 22px;font-size:13px;font-weight:500;font-family:'DM Sans',sans-serif;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;transition:opacity .15s,transform .1s,box-shadow .15s;white-space:nowrap;letter-spacing:.02em;box-shadow:0 2px 14px var(--accent-glow)}
.ra-btn:hover:not(:disabled){opacity:.9;transform:translateY(-1px);box-shadow:0 4px 20px var(--accent-glow)}
.ra-btn:active{transform:scale(.97)}
.ra-btn:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}
.ra-ghost{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-size:12px;font-weight:500;font-family:'DM Sans',sans-serif;background:transparent;color:var(--color-text-secondary);border:0.5px solid var(--color-border-secondary);border-radius:8px;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.ra-ghost:hover{background:var(--color-background-secondary);color:var(--color-text-primary);border-color:var(--color-border-primary)}
.ra-confirm-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;font-size:13px;font-weight:500;font-family:'DM Sans',sans-serif;background:var(--color-background-secondary);color:var(--color-text-primary);border:0.5px solid var(--color-border-secondary);border-radius:9px;cursor:pointer;transition:background .15s}
.ra-confirm-btn:hover{background:var(--color-background-primary)}
.ra-price-card{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:14px;padding:18px;cursor:pointer;transition:border-color .15s,transform .12s,box-shadow .15s;position:relative;overflow:hidden}
.ra-price-card:hover{transform:translateY(-2px);border-color:var(--color-border-secondary);box-shadow:0 6px 24px rgba(0,0,0,.12)}
.ra-price-card.sel{border:1.5px solid var(--accent)!important;box-shadow:0 0 0 3px var(--accent-glow),0 6px 24px rgba(0,0,0,.12)}
.ra-stat{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:10px;padding:14px 16px;transition:border-color .15s}
.ra-stat:hover{border-color:var(--color-border-secondary)}
.ra-ai-box{background:linear-gradient(135deg,rgba(99,102,241,.07),rgba(99,102,241,.02));border:0.5px solid rgba(99,102,241,.25);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--color-text-secondary);line-height:1.65;font-style:italic;margin-top:10px}
.ra-decision{border-radius:14px;padding:18px 20px;border:0.5px solid var(--color-border-tertiary);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;transition:border-color .2s}
.ra-decision.book{background:linear-gradient(135deg,rgba(16,185,129,.08),rgba(16,185,129,.02));border-color:rgba(16,185,129,.3)!important}
.ra-decision.wait{background:linear-gradient(135deg,rgba(245,158,11,.08),rgba(245,158,11,.02));border-color:rgba(245,158,11,.3)!important}
.ra-log-wrap{background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:12px 16px;max-height:168px;overflow-y:auto}
.ra-log-row{display:flex;align-items:flex-start;gap:8px;font-size:11.5px;font-family:'DM Mono',monospace;color:var(--color-text-secondary);padding:3px 0;border-bottom:0.5px solid var(--color-border-tertiary)}
.ra-log-row:last-child{border-bottom:none}
.ra-pill{display:inline-flex;align-items:center;padding:3px 10px;font-size:11px;font-weight:500;border-radius:99px;letter-spacing:.03em}
.ra-modal-ov{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.68);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;animation:raFadeIn .15s ease}
.ra-modal{background:var(--color-background-primary);border:0.5px solid var(--color-border-secondary);border-radius:18px;padding:28px;width:390px;max-width:94vw;animation:raUp .18s ease}
.ra-surge-strip{background:linear-gradient(90deg,rgba(239,68,68,.1),rgba(239,68,68,.04));border:0.5px solid rgba(239,68,68,.3);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--color-text-danger)}
.ra-route-pill{display:inline-flex;align-items:center;gap:6px;background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-radius:99px;padding:5px 14px;font-size:12px;color:var(--color-text-secondary);margin-top:4px;font-family:'DM Mono',monospace}
.spin{animation:raSpin .7s linear infinite}
.pulse{animation:raPulse 1.4s ease-in-out infinite}
`