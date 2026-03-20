// src/hooks/useWebSocket.js — Fixed: React StrictMode safe, no premature close

import { useEffect, useRef, useCallback, useState } from 'react'

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export function useWebSocket(sessionId) {
  const wsRef       = useRef(null)
  const destroyedRef = useRef(false)
  const reconnectRef = useRef(null)

  const [connected,   setConnected]   = useState(false)
  const [steps,       setSteps]       = useState([])
  const [screenshot,  setScreenshot]  = useState(null)
  const [status,      setStatus]      = useState('idle')
  const [currentUrl,  setCurrentUrl]  = useState('')
  const [planSteps,   setPlanSteps]   = useState([])

  // Stable ref so handleMessage never goes stale
  const stateRef = useRef({ setConnected, setSteps, setScreenshot,
                             setStatus, setCurrentUrl, setPlanSteps })
  useEffect(() => {
    stateRef.current = { setConnected, setSteps, setScreenshot,
                         setStatus, setCurrentUrl, setPlanSteps }
  })

  // ── Connect ───────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (destroyedRef.current) return

    // Don't open if already open or connecting
    const ws = wsRef.current
    if (ws && (ws.readyState === WebSocket.OPEN ||
               ws.readyState === WebSocket.CONNECTING)) return

    const newWs = new WebSocket(`${WS_BASE}/ws/${sessionId}`)
    wsRef.current = newWs

    newWs.onopen = () => {
      if (destroyedRef.current) { newWs.close(); return }
      stateRef.current.setConnected(true)
      stateRef.current.setStatus('idle')
      clearTimeout(reconnectRef.current)
    }

    newWs.onclose = () => {
      stateRef.current.setConnected(false)
      if (destroyedRef.current) return
      // Auto-reconnect after 1.5s
      clearTimeout(reconnectRef.current)
      reconnectRef.current = setTimeout(connect, 1500)
    }

    newWs.onerror = () => {
      stateRef.current.setConnected(false)
      stateRef.current.setStatus('error')
    }

    newWs.onmessage = (event) => {
      try   { handleMessage(JSON.parse(event.data)) }
      catch (e) { console.error('WS parse error', e) }
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Message handler ───────────────────────────────────────────────
  function handleMessage(data) {
    const { setConnected, setSteps, setScreenshot,
            setStatus, setCurrentUrl, setPlanSteps } = stateRef.current
    const { type } = data

    if (type === 'planning') {
      setStatus('planning')
      setSteps([])
      setScreenshot(null)
      setPlanSteps([])
    }

    if (type === 'plan_ready') {
      const plan = data.steps || []
      setPlanSteps(plan)
      setSteps(plan.map((s, i) => ({
        step_number: i + 1,
        action:      s.action,
        description: s.description || s.action,
        status:      'pending',
        result:      null,
        error:       null,
        screenshot:  null,
        isLog:       false,
      })))
      setStatus('running')
    }

    if (type === 'browser_starting' || type === 'browser_ready') {
      addLog({ type, message: data.message })
    }

    if (type === 'step_start') {
      setSteps(prev => prev.map(s =>
        s.step_number === data.step_number ? { ...s, status: 'running' } : s
      ))
    }

    if (type === 'step_complete') {
      setSteps(prev => prev.map(s =>
        s.step_number === data.step_number ? { ...s, ...data, status: 'success' } : s
      ))
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.current_url) setCurrentUrl(data.current_url)
    }

    if (type === 'step_error') {
      setSteps(prev => prev.map(s =>
        s.step_number === data.step_number ? { ...s, ...data, status: 'error' } : s
      ))
      if (data.screenshot) setScreenshot(data.screenshot)
    }

    if (type === 'task_complete') {
      setStatus('done')
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.current_url) setCurrentUrl(data.current_url)
    }

    if (type === 'error') {
      setStatus('error')
      addLog({ type: 'error', message: data.message })
    }
  }

  function addLog(entry) {
    stateRef.current.setSteps(prev => [...prev, {
      ...entry, step_number: Date.now(), isLog: true,
    }])
  }

  // ── Send prompt ───────────────────────────────────────────────────
  const sendPrompt = useCallback((prompt) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      setSteps([])
      setScreenshot(null)
      setPlanSteps([])
      setCurrentUrl('')
      setStatus('planning')
      ws.send(JSON.stringify({ prompt }))
    } else {
      console.warn('[AutoNex] WebSocket not open — prompt dropped')
    }
  }, [])

  const disconnect = useCallback(() => {
    destroyedRef.current = true
    clearTimeout(reconnectRef.current)
    const ws = wsRef.current
    if (ws) { ws.onclose = null; ws.close() }
    setConnected(false)
    setStatus('idle')
  }, [])

  // ── Mount / unmount ───────────────────────────────────────────────
  useEffect(() => {
    destroyedRef.current = false
    // Small delay — prevents React StrictMode double-invoke race
    const t = setTimeout(connect, 100)
    return () => {
      destroyedRef.current = true
      clearTimeout(t)
      clearTimeout(reconnectRef.current)
      const ws = wsRef.current
      if (ws) {
        ws.onclose = null   // suppress reconnect on intentional close
        ws.close()
      }
      wsRef.current = null
    }
  }, [connect])

  return {
    connected, status, steps, screenshot,
    currentUrl, planSteps, sendPrompt,
    connect, disconnect,
    clearSession: () => {
      setSteps([])
      setScreenshot(null)
      setPlanSteps([])
      setCurrentUrl('')
      setStatus('idle')
    }
  }
}