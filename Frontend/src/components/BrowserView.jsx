// src/components/BrowserView.jsx
import { useState } from 'react'
import { Monitor, Maximize2, RefreshCw, Globe, Lock, Loader2, ZoomIn, ZoomOut } from 'lucide-react'

export default function BrowserView({ screenshot, currentUrl, status }) {
  const [zoom, setZoom] = useState(1)

  const isLoading = status === 'running' || status === 'planning'

  return (
    <div
      className="flex flex-col flex-1 h-full"
      style={{ background: 'var(--bg)', minWidth: 0 }}
    >
      {/* Browser chrome bar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
        </div>

        {/* URL bar */}
        <div
          className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            maxWidth: '600px',
          }}
        >
          {currentUrl ? (
            <Lock size={11} style={{ color: 'var(--accent3)', flexShrink: 0 }} />
          ) : (
            <Globe size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          )}
          <span
            className="text-xs font-mono truncate flex-1"
            style={{ color: currentUrl ? 'var(--text)' : 'var(--muted)' }}
          >
            {currentUrl || 'Waiting for browser...'}
          </span>
          {isLoading && (
            <Loader2 size={11} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(1)))}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--muted)' }}
          >
            <ZoomOut size={14} />
          </button>
          <span className="font-mono text-[10px] w-9 text-center" style={{ color: 'var(--muted)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--muted)' }}
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--muted)' }}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div
        className="flex-1 overflow-auto relative"
        style={{ background: 'var(--bg)' }}
      >
        {/* Loading shimmer overlay */}
        {isLoading && !screenshot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10">
            <div className="relative">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <Monitor size={32} style={{ color: 'var(--accent)' }} />
              </div>
              <div
                className="absolute inset-0 rounded-2xl animate-ping"
                style={{ background: 'rgba(0,200,255,0.1)', animationDuration: '1.5s' }}
              />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {status === 'planning' ? 'Planning your task...' : 'Browser executing...'}
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                Screenshots will appear here
              </p>
            </div>
            {/* Loading dots */}
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    background: 'var(--accent)',
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: '1s',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !screenshot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <Monitor size={32} style={{ color: 'var(--muted)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                No screenshot yet
              </p>
              <p className="text-xs mt-1 font-mono" style={{ color: 'var(--muted)', opacity: 0.6 }}>
                Send a prompt to start the browser
              </p>
            </div>
          </div>
        )}

        {/* Screenshot */}
        {screenshot && (
          <div className="w-full h-full flex items-start justify-center p-4">
            <div
              className="relative rounded-xl overflow-hidden shadow-2xl"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                border: '1px solid var(--border)',
                transition: 'transform 0.2s ease',
              }}
            >
              {/* Live indicator */}
              {isLoading && (
                <div
                  className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: '#ff4d6d', animation: 'pulse 1s ease-in-out infinite' }}
                  />
                  <span className="font-mono text-[10px] text-white">LIVE</span>
                </div>
              )}
              <img
                src={`data:image/jpeg;base64,${screenshot}`}
                alt="Browser screenshot"
                className="block"
                style={{
                  maxWidth: '100%',
                  display: 'block',
                  minWidth: '640px',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status footer */}
      <div
        className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: status === 'done' ? 'var(--accent3)' :
                status === 'error' ? '#ff4d6d' :
                  isLoading ? 'var(--warn)' : 'var(--muted)',
              boxShadow: isLoading ? '0 0 6px var(--warn)' : 'none',
              animation: isLoading ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
          <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
            {status === 'planning' ? 'AI planning steps...' :
              status === 'running' ? 'Executing automation...' :
                status === 'done' ? 'Task complete' :
                  status === 'error' ? 'Error occurred' :
                    'Awaiting command'}
          </span>
        </div>
        {screenshot && (
          <span className="font-mono text-[10px] ml-auto" style={{ color: 'var(--muted)' }}>
            1280 × 800 · JPEG
          </span>
        )}
      </div>
    </div>
  )
}