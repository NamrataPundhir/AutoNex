// src/components/Sidebar.jsx
import { useState, useRef, useEffect } from 'react'
import {
  Send, Square, RefreshCw, ChevronRight, Zap,
  CheckCircle2, XCircle, Loader2, Clock, Globe, AlertCircle
} from 'lucide-react'

const SUGGESTIONS = [
  'Search for the latest iPhone 16 price on Flipkart',
  'Open YouTube and play a lo-fi music video',
  'Find cheapest Dell laptop on Amazon India',
  'Search Python tutorials on DuckDuckGo',
]

function StepIcon({ status, action }) {
  if (status === 'running') return <Loader2 size={13} className="text-warn animate-spin flex-shrink-0" style={{ color: 'var(--warn)' }} />
  if (status === 'success') return <CheckCircle2 size={13} className="flex-shrink-0" style={{ color: 'var(--accent3)' }} />
  if (status === 'error') return <XCircle size={13} className="flex-shrink-0 text-red-400" />
  return <Clock size={13} className="flex-shrink-0" style={{ color: 'var(--muted)' }} />
}

function StepItem({ step, index }) {
  if (step.isLog) {
    return (
      <div className="flex items-start gap-2 px-3 py-1.5 opacity-60">
        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{step.message}</span>
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2 rounded-lg transition-all duration-200"
      style={{
        background: step.status === 'running' ? 'rgba(255,201,71,0.05)' :
          step.status === 'success' ? 'rgba(106,255,176,0.04)' :
            step.status === 'error' ? 'rgba(255,77,109,0.05)' : 'transparent',
        borderLeft: step.status === 'running' ? '2px solid var(--warn)' :
          step.status === 'success' ? '2px solid var(--accent3)' :
            step.status === 'error' ? '2px solid #ff4d6d' : '2px solid transparent',
        animationDelay: `${index * 0.05}s`,
      }}
    >
      <StepIcon status={step.status} action={step.action} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="font-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--surface2)', color: 'var(--accent)', letterSpacing: '0.5px' }}
          >
            {step.action || 'log'}
          </span>
          <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
            #{step.step_number}
          </span>
        </div>
        <p className="text-xs mt-0.5 leading-relaxed truncate" style={{ color: 'var(--text)' }}>
          {step.description || step.message || step.result || '...'}
        </p>
        {step.error && (
          <p className="text-xs mt-0.5 text-red-400 font-mono truncate">{step.error}</p>
        )}
      </div>
    </div>
  )
}

export default function Sidebar({
  connected, status, steps, planSteps,
  onSendPrompt, onStop, onClear, currentUrl
}) {
  const [prompt, setPrompt] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const stepsEndRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps])

  const handleSend = () => {
    if (!prompt.trim() || status === 'running' || status === 'planning') return
    setShowSuggestions(false)
    onSendPrompt(prompt.trim())
    setPrompt('')
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isActive = status === 'running' || status === 'planning'

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        width: '340px',
        minWidth: '300px',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.2)' }}
          >
            <Zap size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight">AutoNex</div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>browser agent</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: connected ? 'var(--accent3)' : '#ff4d6d',
              boxShadow: connected ? '0 0 6px var(--accent3)' : '0 0 6px #ff4d6d'
            }}
          />
          <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
            {connected ? 'connected' : 'offline'}
          </span>
        </div>
      </div>

      {/* Status bar */}
      {(status !== 'idle' || currentUrl) && (
        <div
          className="px-4 py-2 flex items-center gap-2"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}
        >
          <div
            className="font-mono text-[10px] px-2 py-0.5 rounded-full"
            style={{
              background: status === 'done' ? 'rgba(106,255,176,0.1)' :
                status === 'error' ? 'rgba(255,77,109,0.1)' : 'rgba(255,201,71,0.1)',
              color: status === 'done' ? 'var(--accent3)' :
                status === 'error' ? '#ff4d6d' : 'var(--warn)',
              border: `1px solid ${status === 'done' ? 'rgba(106,255,176,0.2)' :
                status === 'error' ? 'rgba(255,77,109,0.2)' : 'rgba(255,201,71,0.2)'}`,
            }}
          >
            {status === 'planning' && '⟳ planning'}
            {status === 'running' && '▶ running'}
            {status === 'done' && '✓ done'}
            {status === 'error' && '✗ error'}
            {status === 'idle' && '○ idle'}
          </div>
          {planSteps.length > 0 && (
            <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              {steps.filter(s => s.status === 'success').length}/{planSteps.length} steps
            </span>
          )}
          {currentUrl && (
            <div className="flex items-center gap-1 ml-auto max-w-[140px]">
              <Globe size={10} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <span className="font-mono text-[9px] truncate" style={{ color: 'var(--muted)' }}>
                {currentUrl.replace(/^https?:\/\//, '').split('/')[0]}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Steps log */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5" style={{ minHeight: 0 }}>
        {steps.length === 0 && showSuggestions && (
          <div className="px-4 py-4">
            <p className="text-xs mb-3 font-medium" style={{ color: 'var(--muted)' }}>Try a command:</p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setPrompt(s); setShowSuggestions(false); textareaRef.current?.focus() }}
                  className="w-full text-left text-xs px-3 py-2.5 rounded-lg transition-all duration-200 hover:scale-[1.01] group"
                  style={{
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,200,255,0.3)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <ChevronRight size={10} className="inline mr-1.5 group-hover:translate-x-0.5 transition-transform" style={{ color: 'var(--accent)' }} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {steps.map((step, i) => (
          <StepItem key={step.step_number || i} step={step} index={i} />
        ))}
        <div ref={stepsEndRef} />
      </div>

      {/* Prompt input */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px' }}>
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            background: 'var(--surface2)',
            border: `1px solid ${isActive ? 'rgba(0,200,255,0.3)' : 'var(--border)'}`,
            transition: 'border-color 0.2s',
          }}
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Tell AutoNex what to do..."
            disabled={isActive || !connected}
            rows={3}
            className="w-full resize-none text-sm px-3 pt-3 pb-10 outline-none font-sans"
            style={{
              background: 'transparent',
              color: 'var(--text)',
              caretColor: 'var(--accent)',
            }}
          />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-2">
            <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              {prompt.length > 0 ? `${prompt.length} chars · ⏎ to run` : 'Shift+Enter for newline'}
            </span>
            <div className="flex items-center gap-1.5">
              {isActive && (
                <button
                  onClick={onStop}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'rgba(255,77,109,0.15)', color: '#ff4d6d', border: '1px solid rgba(255,77,109,0.2)' }}
                >
                  <Square size={10} />
                  Stop
                </button>
              )}
              {!isActive && steps.length > 0 && (
                <button
                  onClick={onClear}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  <RefreshCw size={10} />
                  Clear
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!prompt.trim() || isActive || !connected}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--accent)',
                  color: '#000',
                }}
              >
                <Send size={11} />
                Run
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}