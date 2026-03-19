// src/hooks/useWebSocket.js
import { useEffect, useRef, useCallback, useState } from 'react'

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export function useWebSocket(sessionId) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [steps, setSteps] = useState([])
  const [screenshot, setScreenshot] = useState(null)
  const [status, setStatus] = useState('idle') // idle | planning | running | done | error
  const [currentUrl, setCurrentUrl] = useState('')
  const [planSteps, setPlanSteps] = useState([])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_BASE}/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setStatus('idle')
    }

    ws.onclose = () => {
      setConnected(false)
    }

    ws.onerror = () => {
      setConnected(false)
      setStatus('error')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleMessage(data)
      } catch (e) {
        console.error('WS parse error', e)
      }
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

    if (type === 'plan_ready') {
      setPlanSteps(data.steps || [])
      setStatus('running')
    }

    if (type === 'browser_starting' || type === 'browser_ready') {
      addLog({ type, message: data.message })
    }

    if (type === 'step_start') {
      setSteps(prev => {
        const exists = prev.find(s => s.step_number === data.step_number)
        if (exists) return prev.map(s => s.step_number === data.step_number ? { ...s, status: 'running' } : s)
        return [...prev, { ...data, status: 'running' }]
      })
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
  }, [])

  const addLog = (entry) => {
    setSteps(prev => [...prev, { ...entry, step_number: Date.now(), isLog: true }])
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
    connected,
    status,
    steps,
    screenshot,
    currentUrl,
    planSteps,
    sendPrompt,
    connect,
    disconnect,
    clearSession: () => {
      setSteps([])
      setScreenshot(null)
      setPlanSteps([])
      setCurrentUrl('')
      setStatus('idle')
    }
  }
}