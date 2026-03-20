// src/hooks/useWebSocket.js
import { useEffect, useRef, useCallback, useState } from 'react'

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export function useWebSocket(sessionId) {
  const wsRef = useRef(null)
  const [connected, setConnected]   = useState(false)
  const [steps, setSteps]           = useState([])
  const [screenshot, setScreenshot] = useState(null)
  const [status, setStatus]         = useState('idle')
  const [currentUrl, setCurrentUrl] = useState('')
  const [planSteps, setPlanSteps]   = useState([])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_BASE}/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen  = () => { setConnected(true);  setStatus('idle') }
    ws.onclose = () =>   setConnected(false)
    ws.onerror = () => { setConnected(false); setStatus('error') }

    ws.onmessage = (event) => {
      try   { handleMessage(JSON.parse(event.data)) }
      catch (e) { console.error('WS parse error', e) }
    }
  }, [sessionId])

  const handleMessage = useCallback((data) => {
    const { type } = data

    if (type === 'planning') {
      setStatus('planning')
      setSteps([])
      setScreenshot(null)
      setPlanSteps([])
    }

    // ── THE FIX ────────────────────────────────────────────────────────────
    // Old code: set planSteps but left `steps` empty.
    // Result:   sidebar blank → browser already running → steps appear late.
    //
    // New code: immediately fill `steps` with every step as "pending"
    //           so the sidebar shows the full plan the moment it's ready,
    //           before any browser action starts.
    if (type === 'plan_ready') {
      const plan = data.steps || []
      setPlanSteps(plan)

      setSteps(plan.map((s, i) => ({
        step_number: i + 1,
        action:      s.action,
        description: s.description || s.action,
        status:      'pending',   // shown as dimmed clock icon until step_start
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

    // Flip the matching pending row to "running" (spinner) the instant it starts
    if (type === 'step_start') {
      setSteps(prev => prev.map(s =>
        s.step_number === data.step_number
          ? { ...s, status: 'running' }
          : s
      ))
    }

    // Flip to "success" and attach result + screenshot when done
    if (type === 'step_complete') {
      setSteps(prev => prev.map(s =>
        s.step_number === data.step_number
          ? { ...s, ...data, status: 'success' }
          : s
      ))
      if (data.screenshot) setScreenshot(data.screenshot)
      if (data.current_url) setCurrentUrl(data.current_url)
    }

    if (type === 'step_error') {
      setSteps(prev => prev.map(s =>
        s.step_number === data.step_number
          ? { ...s, ...data, status: 'error' }
          : s
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
  }, [])

  const addLog = (entry) => {
    setSteps(prev => [...prev, {
      ...entry,
      step_number: Date.now(),
      isLog: true,
    }])
  }

  const sendPrompt = useCallback((prompt) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setSteps([])
      setScreenshot(null)
      setPlanSteps([])
      setCurrentUrl('')
      setStatus('planning')
      wsRef.current.send(JSON.stringify({ prompt }))
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    setConnected(false)
    setStatus('idle')
  }, [])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
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