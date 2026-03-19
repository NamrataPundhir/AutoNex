// src/App.jsx
import { useState, useCallback } from 'react'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import BrowserView from './components/BrowserView'
import { useWebSocket } from './hooks/useWebSocket'

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 9)
}

export default function App() {
  const [sessionId, setSessionId] = useState(() => generateSessionId())

  const {
    connected, status, steps, screenshot,
    currentUrl, planSteps, sendPrompt,
    connect, disconnect, clearSession,
  } = useWebSocket(sessionId)

  const handleStop = useCallback(async () => {
    try {
      await fetch('/api/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
    } catch (e) {
      console.error('Stop failed', e)
    }
  }, [sessionId])

  const handleNewSession = useCallback(() => {
    handleStop()
    clearSession()
    setSessionId(generateSessionId())
  }, [handleStop, clearSession])

  return (
    <div
      className="flex flex-col h-screen overflow-hidden grid-bg noise"
      style={{ background: 'var(--bg)' }}
    >
      <Navbar
        connected={connected}
        sessionId={sessionId}
        onNewSession={handleNewSession}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Prompt + Step log */}
        <Sidebar
          connected={connected}
          status={status}
          steps={steps}
          planSteps={planSteps}
          currentUrl={currentUrl}
          onSendPrompt={sendPrompt}
          onStop={handleStop}
          onClear={clearSession}
        />

        {/* RIGHT: Browser screenshot + URL bar */}
        <BrowserView
          screenshot={screenshot}
          currentUrl={currentUrl}
          status={status}
        />
      </div>
    </div>
  )
}