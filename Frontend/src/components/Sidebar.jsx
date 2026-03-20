// src/components/Sidebar.jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Square, RefreshCw, ChevronRight, Zap,
  CheckCircle2, XCircle, Loader2, Clock, Globe, AlertCircle,
  Mic, MicOff, Volume2, VolumeX
} from 'lucide-react'

const SUGGESTIONS = [
  'Search for the latest iPhone 16 price on Flipkart',
  'Open YouTube and play a lo-fi music video',
  'Find cheapest Dell laptop on Amazon India',
  'Search Python tutorials on DuckDuckGo',
]

// ─── Voice Hook ───────────────────────────────────────────────────────────────

function useVoiceSystem({ onTranscript, onFinalTranscript }) {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [supported, setSupported] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)

  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const micStreamRef = useRef(null)
  const animFrameRef = useRef(null)
  const silenceTimerRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      setSupported(true)
      const rec = new SpeechRecognition()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-IN'

      rec.onresult = (e) => {
        let interim = ''
        let final = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) final += t
          else interim += t
        }
        setInterimText(interim)
        if (interim) onTranscript?.(interim)

        if (final) {
          setInterimText('')
          onFinalTranscript?.(final.trim())
          // auto-stop after final result with short silence
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => stopListening(), 1200)
        }
      }

      rec.onerror = (e) => {
        if (e.error !== 'aborted') console.warn('SR error:', e.error)
        setIsListening(false)
        setInterimText('')
      }

      rec.onend = () => {
        setIsListening(false)
        setInterimText('')
      }

      recognitionRef.current = rec
    }

    return () => {
      stopListening()
      window.speechSynthesis?.cancel()
    }
  }, [])

  const startAudioMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      ctx.createMediaStreamSource(stream).connect(analyser)

      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setAudioLevel(Math.min(avg / 60, 1))
        animFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch { /* mic denied */ }
  }

  const stopAudioMeter = () => {
    cancelAnimationFrame(animFrameRef.current)
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close()
    setAudioLevel(0)
  }

  const startListening = useCallback(async () => {
    if (!recognitionRef.current || isListening) return
    window.speechSynthesis?.cancel()
    setIsListening(true)
    setInterimText('')
    try {
      recognitionRef.current.start()
      await startAudioMeter()
    } catch (e) {
      console.warn('Could not start recognition:', e)
      setIsListening(false)
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    clearTimeout(silenceTimerRef.current)
    try { recognitionRef.current?.stop() } catch { }
    stopAudioMeter()
    setIsListening(false)
    setInterimText('')
  }, [])

  const speak = useCallback((text) => {
    if (!voiceEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 1.05
    utter.pitch = 1
    utter.volume = 0.9

    // Pick a good voice
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex')
    )
    if (preferred) utter.voice = preferred

    utter.onstart = () => setIsSpeaking(true)
    utter.onend = () => setIsSpeaking(false)
    utter.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utter)
  }, [voiceEnabled])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  return {
    isListening, isSpeaking, voiceEnabled, setVoiceEnabled,
    supported, interimText, audioLevel,
    startListening, stopListening, speak, stopSpeaking
  }
}

// ─── Mic Button ───────────────────────────────────────────────────────────────

function MicButton({ isListening, audioLevel, onToggle, disabled }) {
  const rings = [0.3, 0.6, 1.0]

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={isListening ? 'Stop listening' : 'Voice input'}
      className="relative flex items-center justify-center rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        width: 30,
        height: 30,
        background: isListening
          ? 'rgba(255,77,109,0.15)'
          : 'var(--surface)',
        border: `1px solid ${isListening ? 'rgba(255,77,109,0.4)' : 'var(--border)'}`,
        flexShrink: 0,
      }}
    >
      {/* Pulse rings when listening */}
      {isListening && rings.map((scale, i) => (
        <span
          key={i}
          className="absolute inset-0 rounded-lg"
          style={{
            border: '1px solid rgba(255,77,109,0.4)',
            transform: `scale(${1 + audioLevel * scale * 0.8})`,
            opacity: 1 - audioLevel * scale * 0.7,
            transition: 'transform 0.08s ease, opacity 0.08s ease',
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
      {isListening
        ? <MicOff size={13} style={{ color: '#ff4d6d', position: 'relative', zIndex: 1 }} />
        : <Mic size={13} style={{ color: 'var(--muted)', position: 'relative', zIndex: 1 }} />
      }
    </button>
  )
}

// ─── Interim Transcript Banner ─────────────────────────────────────────────────

function InterimBanner({ text, audioLevel }) {
  if (!text) return null
  return (
    <div
      className="mx-3 mb-2 px-3 py-2 rounded-lg flex items-center gap-2"
      style={{
        background: 'rgba(255,77,109,0.06)',
        border: '1px solid rgba(255,77,109,0.2)',
        transition: 'all 0.15s',
      }}
    >
      {/* Live waveform bars */}
      <div className="flex items-end gap-[2px]" style={{ height: 14 }}>
        {[0.4, 0.7, 1.0, 0.7, 0.4].map((base, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: 2,
              height: Math.max(3, audioLevel * base * 14),
              background: '#ff4d6d',
              opacity: 0.7 + base * 0.3,
              transition: 'height 0.08s ease',
            }}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] italic truncate" style={{ color: 'rgba(255,77,109,0.85)' }}>
        {text}
      </span>
    </div>
  )
}

// ─── Step components (unchanged) ──────────────────────────────────────────────

function StepIcon({ status }) {
  if (status === 'running') return <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: 'var(--warn)' }} />
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
      <StepIcon status={step.status} />
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
          {step._original_selector && (
            <span className="font-mono text-[9px] px-1 rounded" style={{ background: 'rgba(106,255,176,0.1)', color: 'var(--accent3)' }}>
              live
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 leading-relaxed truncate" style={{ color: 'var(--text)' }}>
          {step.description || step.message || step.result || '...'}
        </p>
        {/* Natural language narration */}
        {step.narration && step.status !== 'running' && (
          <p className="text-[10px] mt-1 leading-relaxed italic"
            style={{ color: 'var(--muted)', borderLeft: '2px solid var(--border)', paddingLeft: 6 }}>
            {step.narration}
          </p>
        )}
        {step.status === 'running' && step.narration && (
          <p className="text-[10px] mt-1 italic" style={{ color: 'var(--warn)', opacity: 0.8 }}>
            {step.narration}
          </p>
        )}
        {step.error && (
          <p className="text-xs mt-0.5 text-red-400 font-mono truncate">{step.error}</p>
        )}
      </div>
    </div>
  )
}

// ─── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({
  connected, status, steps, planSteps,
  onSendPrompt, onStop, onClear, currentUrl
}) {
  const [prompt, setPrompt] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const stepsEndRef = useRef(null)
  const textareaRef = useRef(null)

  // ── Voice ──────────────────────────────────────────────────────────────────
  const {
    isListening, isSpeaking, voiceEnabled, setVoiceEnabled,
    supported: voiceSupported, interimText, audioLevel,
    startListening, stopListening, speak, stopSpeaking
  } = useVoiceSystem({
    onTranscript: (text) => {
      // Live-update textarea with interim text
      setPrompt(text)
    },
    onFinalTranscript: (text) => {
      setPrompt(text)
      setShowSuggestions(false)
      // Small delay so user sees what was captured, then auto-send
      setTimeout(() => {
        if (text.trim()) {
          onSendPrompt(text.trim())
          setPrompt('')
        }
      }, 600)
    },
  })

  // Speak step completions when voiceEnabled
  useEffect(() => {
    if (!voiceEnabled) return
    const last = steps[steps.length - 1]
    if (last?.status === 'success' && last?.result) {
      const msg = last.result.length > 120 ? last.result.slice(0, 120) + '…' : last.result
      speak(msg)
    }
  }, [steps.length])

  // Speak done / error summary
  useEffect(() => {
    if (!voiceEnabled) return
    if (status === 'done') speak('Task completed successfully.')
    if (status === 'error') speak('An error occurred. Please try again.')
  }, [status])

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

  const handleMicToggle = () => {
    if (isListening) stopListening()
    else startListening()
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
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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

        <div className="flex items-center gap-2">
          {/* Voice toggle */}
          {voiceSupported && (
            <button
              onClick={() => {
                if (isSpeaking) stopSpeaking()
                setVoiceEnabled(v => !v)
              }}
              title={voiceEnabled ? 'Disable voice feedback' : 'Enable voice feedback'}
              className="flex items-center justify-center w-6 h-6 rounded-md transition-all"
              style={{
                background: voiceEnabled ? 'rgba(0,200,255,0.1)' : 'transparent',
                border: `1px solid ${voiceEnabled ? 'rgba(0,200,255,0.25)' : 'var(--border)'}`,
              }}
            >
              {voiceEnabled
                ? <Volume2 size={11} style={{ color: 'var(--accent)' }} />
                : <VolumeX size={11} style={{ color: 'var(--muted)' }} />
              }
            </button>
          )}

          {/* Connection status */}
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
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
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

          {/* Speaking indicator */}
          {isSpeaking && (
            <div className="flex items-center gap-1 ml-1">
              <div className="flex items-end gap-[2px]" style={{ height: 10 }}>
                {[0.5, 1, 0.7].map((h, i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: 2,
                      height: h * 10,
                      background: 'var(--accent)',
                      animation: 'speakPulse 0.6s ease-in-out infinite alternate',
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
              <span className="font-mono text-[9px]" style={{ color: 'var(--accent)' }}>speaking</span>
            </div>
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

      {/* ── Steps log ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5" style={{ minHeight: 0 }}>
        {steps.length === 0 && showSuggestions && (
          <div className="px-4 py-4">
            {voiceSupported && (
              <div
                className="mb-4 px-3 py-2.5 rounded-lg flex items-center gap-3"
                style={{
                  background: 'rgba(0,200,255,0.04)',
                  border: '1px solid rgba(0,200,255,0.12)',
                }}
              >
                <Mic size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span className="text-[10px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Tap the mic icon to speak your command. AutoNex will listen and run it.
                </span>
              </div>
            )}
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

      {/* ── Interim transcript ─────────────────────────────────────────────── */}
      <InterimBanner text={interimText} audioLevel={audioLevel} />

      {/* ── Prompt input ───────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px' }}>
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            background: 'var(--surface2)',
            border: `1px solid ${isListening ? 'rgba(255,77,109,0.4)' : isActive ? 'rgba(0,200,255,0.3)' : 'var(--border)'}`,
            transition: 'border-color 0.2s',
            boxShadow: isListening ? '0 0 0 2px rgba(255,77,109,0.08)' : 'none',
          }}
        >
          <textarea
            ref={textareaRef}
            value={isListening && interimText ? interimText : prompt}
            onChange={e => { if (!isListening) setPrompt(e.target.value) }}
            onKeyDown={handleKey}
            placeholder={isListening ? 'Listening…' : 'Tell AutoNex what to do…'}
            disabled={isActive || !connected}
            rows={3}
            className="w-full resize-none text-sm px-3 pt-3 pb-10 outline-none font-sans"
            style={{
              background: 'transparent',
              color: isListening ? 'rgba(255,77,109,0.9)' : 'var(--text)',
              caretColor: isListening ? '#ff4d6d' : 'var(--accent)',
              fontStyle: isListening ? 'italic' : 'normal',
              transition: 'color 0.2s',
            }}
          />

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-2">
            <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              {isListening
                ? 'Listening… speak your command'
                : prompt.length > 0
                  ? `${prompt.length} chars · ⏎ to run`
                  : 'Shift+Enter for newline'
              }
            </span>

            <div className="flex items-center gap-1.5">
              {/* Mic button */}
              {voiceSupported && (
                <MicButton
                  isListening={isListening}
                  audioLevel={audioLevel}
                  onToggle={handleMicToggle}
                  disabled={isActive || !connected}
                />
              )}

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
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                <Send size={11} />
                Run
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Speaking pulse keyframe ─────────────────────────────────────────── */}
      <style>{`
        @keyframes speakPulse {
          from { transform: scaleY(0.4); opacity: 0.5; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
      `}</style>
    </aside>
  )
}