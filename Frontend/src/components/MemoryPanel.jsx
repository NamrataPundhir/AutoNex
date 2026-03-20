// src/components/MemoryPanel.jsx
// Shows task history from the backend memory system.
// Each past task can be replayed with one click.
// Learned selector patterns shown per domain.

import { useState, useEffect } from 'react'
import { History, RotateCcw, CheckCircle2, XCircle, AlertCircle,
         Clock, Globe, ChevronDown, ChevronRight, Brain, Zap } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Two endpoints needed in main.py (add these) ───────────────────────
// @app.get("/api/memory/history")   → calls get_history(20)
// @app.get("/api/memory/context")   → calls get_all_context()

const STATUS_ICON = {
  success: <CheckCircle2 size={12} style={{ color: 'var(--accent3)' }} />,
  partial: <AlertCircle  size={12} style={{ color: 'var(--warn)' }} />,
  failed:  <XCircle      size={12} style={{ color: '#ff4d6d' }} />,
}

const STATUS_COLOR = {
  success: 'var(--accent3)',
  partial: 'var(--warn)',
  failed:  '#ff4d6d',
}

export default function MemoryPanel({ onReplay }) {
  const [history,    setHistory]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState(null)   // task id
  const [tab,        setTab]        = useState('history') // history | learned

  useEffect(() => { fetchHistory() }, [])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/memory/history`)
      const d = await r.json()
      setHistory(d.history || [])
    } catch {
      setHistory([])
    } finally {
      setLoading(false)
    }
  }

  const successCount = history.filter(h => h.status === 'success').length
  const domains = [...new Set(
    history.map(h => h.url ? new URL(h.url).hostname.replace('www.','') : null).filter(Boolean)
  )]

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        minWidth: 0,
        width: 300,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Brain size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
            Agent memory
          </span>
        </div>
        <button
          onClick={fetchHistory}
          className="p-1 rounded transition-colors hover:bg-white/5"
          style={{ color: 'var(--muted)' }}
          title="Refresh"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-3 px-4 py-3 gap-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {[
          { label: 'Total tasks', value: history.length },
          { label: 'Succeeded',   value: successCount },
          { label: 'Domains',     value: domains.length },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1 }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {['history', 'learned'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-xs font-medium transition-colors capitalize"
            style={{
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {t === 'history' ? (
              <><History size={11} className="inline mr-1" />History</>
            ) : (
              <><Zap size={11} className="inline mr-1" />Learned</>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── History tab ─────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="py-2">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}

            {!loading && history.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Brain size={24} style={{ color: 'var(--muted)', opacity: 0.4 }} />
                <p className="text-xs text-center font-mono" style={{ color: 'var(--muted)' }}>
                  No tasks yet.<br />Run something to build memory.
                </p>
              </div>
            )}

            {history.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                expanded={expanded === task.id}
                onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                onReplay={() => onReplay?.(task.prompt)}
              />
            ))}
          </div>
        )}

        {/* ── Learned tab ─────────────────────────────────────────── */}
        {tab === 'learned' && (
          <div className="py-3 px-4">
            <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
              Domains where the agent has learned reliable selectors:
            </p>
            {domains.length === 0 ? (
              <p className="text-xs font-mono" style={{ color: 'var(--muted)', opacity: 0.5 }}>
                Run tasks to start learning.
              </p>
            ) : (
              domains.map(domain => {
                const count = history.filter(
                  h => h.url && h.url.includes(domain) && h.status === 'success'
                ).length
                return (
                  <div
                    key={domain}
                    className="flex items-center gap-2 py-2.5"
                    style={{ borderBottom: '0.5px solid var(--border)' }}
                  >
                    <Globe size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <span className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text)' }}>
                      {domain}
                    </span>
                    <span
                      className="font-mono text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(0,200,255,0.1)', color: 'var(--accent)' }}
                    >
                      {count} run{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                )
              })
            )}

            <div
              className="mt-4 p-3 rounded-lg"
              style={{ background: 'rgba(0,200,255,0.04)', border: '1px solid rgba(0,200,255,0.12)' }}
            >
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                The agent automatically remembers which CSS selectors worked on each site.
                Future tasks on the same domain try proven selectors first — reducing failures.
              </p>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}


// ── Individual task row ───────────────────────────────────────────────
function TaskRow({ task, expanded, onToggle, onReplay }) {
  const date    = new Date(task.created_at)
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const domain  = task.url ? (() => { try { return new URL(task.url).hostname.replace('www.','') } catch { return '' } })() : ''

  return (
    <div style={{ borderBottom: '0.5px solid var(--border)' }}>
      {/* Summary row */}
      <div
        className="flex items-start gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-white/3 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-shrink-0 mt-0.5">
          {STATUS_ICON[task.status] || STATUS_ICON.partial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-snug truncate" style={{ color: 'var(--text)' }}>
            {task.prompt}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {domain && (
              <span className="font-mono text-[9px] truncate" style={{ color: 'var(--muted)' }}>
                {domain}
              </span>
            )}
            <span className="font-mono text-[9px]" style={{ color: 'var(--muted)' }}>
              {dateStr} {timeStr}
            </span>
            {task.duration_s > 0 && (
              <span className="font-mono text-[9px]" style={{ color: 'var(--muted)' }}>
                {task.duration_s}s
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Replay button */}
          <button
            onClick={e => { e.stopPropagation(); onReplay() }}
            title="Replay this task"
            className="p-1 rounded transition-all hover:scale-110"
            style={{
              background: 'rgba(0,200,255,0.1)',
              border: '1px solid rgba(0,200,255,0.2)',
            }}
          >
            <RotateCcw size={10} style={{ color: 'var(--accent)' }} />
          </button>
          {expanded
            ? <ChevronDown  size={11} style={{ color: 'var(--muted)' }} />
            : <ChevronRight size={11} style={{ color: 'var(--muted)' }} />
          }
        </div>
      </div>

      {/* Expanded steps preview */}
      {expanded && (
        <div
          className="px-4 pb-3"
          style={{ background: 'var(--surface2)' }}
        >
          <p className="font-mono text-[9px] py-2" style={{ color: 'var(--muted)' }}>
            Tap replay to re-run this exact task
          </p>
          <button
            onClick={onReplay}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            <RotateCcw size={11} />
            Replay "{task.prompt.slice(0, 30)}{task.prompt.length > 30 ? '…' : ''}"
          </button>
        </div>
      )}
    </div>
  )
}