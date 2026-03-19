// src/components/Navbar.jsx
import { Zap, Settings, Github, Activity } from 'lucide-react'

export default function Navbar({ connected, sessionId, onNewSession }) {
  return (
    <nav
      className="flex items-center justify-between px-5 py-0 flex-shrink-0"
      style={{
        height: '48px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.15)' }}
        >
          <Zap size={15} style={{ color: 'var(--accent)' }} />
          <span className="font-bold text-sm tracking-tight">AutoNex</span>
        </div>
        <div
          className="font-mono text-[10px] px-2 py-0.5 rounded"
          style={{ background: 'var(--surface2)', color: 'var(--muted)' }}
        >
          v2.0
        </div>
      </div>

      {/* Center — session info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity size={12} style={{ color: connected ? 'var(--accent3)' : 'var(--muted)' }} />
          <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
            session:{' '}
            <span style={{ color: 'var(--text)' }}>{sessionId}</span>
          </span>
        </div>
        <div
          className="font-mono text-[10px] px-2 py-0.5 rounded-full"
          style={{
            background: connected ? 'rgba(106,255,176,0.1)' : 'rgba(255,77,109,0.1)',
            color: connected ? 'var(--accent3)' : '#ff4d6d',
            border: `1px solid ${connected ? 'rgba(106,255,176,0.2)' : 'rgba(255,77,109,0.2)'}`,
          }}
        >
          {connected ? '● WS Connected' : '○ Disconnected'}
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onNewSession}
          className="font-mono text-[11px] px-3 py-1.5 rounded-lg transition-all hover:scale-105"
          style={{
            background: 'var(--surface2)',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
        >
          New Session
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'var(--muted)' }}
        >
          <Github size={15} />
        </a>
        <button
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: 'var(--muted)' }}
        >
          <Settings size={15} />
        </button>
      </div>
    </nav>
  )
}