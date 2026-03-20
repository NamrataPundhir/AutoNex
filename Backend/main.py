"""
main.py — AutoNex FastAPI Backend — Complete with AI Chat Agent
"""

import sys
import asyncio
from typing import Dict, Any
from datetime import datetime

# ── WINDOWS FIX ───────────────────────────────────────────────────────
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from websocket_manager import manager
from planner           import plan_task, fallback_plan
from browser_agent     import BrowserAgent
from memory            import get_history, get_task_steps, get_all_context, set_context

# ── Import chat agent (make sure agent_chat.py is in Backend/) ────────
from agent_chat import (
    stream_chat_response,
    get_session_history,
    append_to_session,
    clear_session,
    get_all_sessions,
    classify_message,
)

load_dotenv()

app = FastAPI(title="AutoNex", version="4.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_sessions: Dict[str, BrowserAgent] = {}


# ── Pydantic models ───────────────────────────────────────────────────
class CommandRequest(BaseModel):
    prompt: str
    session_id: str

class StopRequest(BaseModel):
    session_id: str

class ContextRequest(BaseModel):
    key: str
    value: str


# ══════════════════════════════════════════════════════════════════════
# HEALTH
# ══════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    return {"service": "AutoNex", "version": "4.0.0", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy", "sessions": len(active_sessions)}


# ══════════════════════════════════════════════════════════════════════
# BROWSER AGENT REST
# ══════════════════════════════════════════════════════════════════════

@app.post("/api/plan")
async def plan_only(req: CommandRequest):
    try:
        steps = await plan_task(req.prompt)
        return {"status": "success", "steps": steps}
    except Exception as e:
        return {"status": "fallback", "steps": fallback_plan(req.prompt), "error": str(e)}

@app.post("/api/stop")
async def stop_session(req: StopRequest):
    sid = req.session_id
    if sid in active_sessions:
        try:
            await active_sessions[sid].stop()
        except Exception:
            pass
        del active_sessions[sid]
        return {"status": "stopped"}
    return {"status": "not_found"}

@app.get("/api/sessions")
async def sessions():
    return {"sessions": list(active_sessions.keys()), "count": len(active_sessions)}


# ══════════════════════════════════════════════════════════════════════
# MEMORY REST
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/memory/history")
async def memory_history(limit: int = 20):
    return {"history": get_history(limit)}

@app.get("/api/memory/task/{task_id}")
async def memory_task_steps(task_id: int):
    return {"steps": get_task_steps(task_id)}

@app.get("/api/memory/context")
async def memory_context():
    return {"context": get_all_context()}

@app.post("/api/memory/context")
async def set_memory_context(req: ContextRequest):
    set_context(req.key, req.value)
    return {"saved": True}


# ══════════════════════════════════════════════════════════════════════
# CHAT REST
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/chat/history/{session_id}")
async def chat_history(session_id: str):
    return {"session_id": session_id, "messages": get_session_history(session_id)}

@app.delete("/api/chat/history/{session_id}")
async def chat_clear(session_id: str):
    clear_session(session_id)
    return {"cleared": True}

@app.get("/api/chat/sessions")
async def chat_sessions():
    return {"sessions": get_all_sessions()}


# ══════════════════════════════════════════════════════════════════════
# BROWSER AGENT WEBSOCKET  →  /ws/{session_id}
# ══════════════════════════════════════════════════════════════════════

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    try:
        while True:
            data   = await websocket.receive_json()
            prompt = data.get("prompt", "").strip()

            if not prompt:
                await manager.send_step(session_id, {"type": "error", "message": "Empty prompt"})
                continue

            # Stop any existing session
            if session_id in active_sessions:
                try:
                    await active_sessions[session_id].stop()
                except Exception:
                    pass
                del active_sessions[session_id]

            agent = BrowserAgent(session_id=session_id, headless=False)
            active_sessions[session_id] = agent

            await manager.send_step(session_id, {
                "type": "planning", "message": f"🧠 Planning: {prompt}"
            })

            try:
                steps = await plan_task(prompt)
                await manager.send_step(session_id, {
                    "type": "plan_ready", "steps": steps,
                    "message": f"📋 Plan ready — {len(steps)} steps",
                })
            except Exception as e:
                steps = fallback_plan(prompt)
                await manager.send_step(session_id, {
                    "type": "plan_ready", "steps": steps,
                    "message": f"📋 Fallback plan — {len(steps)} steps",
                    "note": str(e),
                })

            await manager.send_step(session_id, {
                "type": "browser_starting", "message": "🌐 Launching browser..."
            })
            try:
                await asyncio.wait_for(agent.start(), timeout=25)
                await manager.send_step(session_id, {
                    "type": "browser_ready", "message": "✅ Browser ready"
                })
            except Exception as e:
                await manager.send_step(session_id, {
                    "type": "error", "message": f"❌ Browser failed: {e}"
                })
                active_sessions.pop(session_id, None)
                continue

            async def on_step(update: Dict[str, Any]):
                await manager.send_step(session_id, update)

            try:
                await agent.execute_steps(steps, on_step, prompt=prompt)
            except Exception as e:
                await manager.send_step(session_id, {
                    "type": "error", "message": f"❌ Execution error: {e}"
                })
            finally:
                print("✅ Task completed — browser kept open for demo")

    except WebSocketDisconnect:
        manager.disconnect(session_id)
        if session_id in active_sessions:
            try:
                await active_sessions[session_id].stop()
            except Exception:
                pass
            active_sessions.pop(session_id, None)


# ══════════════════════════════════════════════════════════════════════
# CHAT AGENT WEBSOCKET  →  /ws/chat/{session_id}
# ══════════════════════════════════════════════════════════════════════

@app.websocket("/ws/chat/{session_id}")
async def chat_websocket(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)

    # Send greeting on connect
    greeting = (
        "Hey! I'm **AXON**, your AutoNex AI assistant. "
        "I can answer questions, recall your past automation sessions, "
        "or kick off new browser tasks — just tell me what you need! 🚀"
    )
    await manager.send_step(session_id, {
        "type":      "greeting",
        "full_text": greeting,
        "timestamp": datetime.now().isoformat(),
    })

    try:
        while True:
            data         = await websocket.receive_json()
            user_message = data.get("message", "").strip()

            if not user_message:
                await manager.send_step(session_id, {
                    "type": "error", "message": "Empty message"
                })
                continue

            # Store user message
            append_to_session(session_id, "user", user_message)

            # Signal thinking
            await manager.send_step(session_id, {"type": "typing"})

            # Stream AI response
            full_response = ""
            task_to_run   = None

            async for event in stream_chat_response(
                user_message=user_message,
                conversation_history=get_session_history(session_id)[:-1],
                session_id=session_id,
            ):
                if event["type"] == "token":
                    await manager.send_step(session_id, event)

                elif event["type"] == "done":
                    full_response = event["full_text"]
                    await manager.send_step(session_id, {
                        **event,
                        "timestamp": datetime.now().isoformat(),
                    })

                elif event["type"] == "trigger_task":
                    task_to_run = event["prompt"]

                elif event["type"] == "error":
                    await manager.send_step(session_id, event)

            # Store assistant reply
            if full_response:
                append_to_session(session_id, "assistant", full_response)

            # Fire automation task in background if requested
            if task_to_run:
                await manager.send_step(session_id, {
                    "type":      "task_launched",
                    "prompt":    task_to_run,
                    "message":   f"🌐 Launching: \"{task_to_run}\"",
                    "timestamp": datetime.now().isoformat(),
                })
                asyncio.create_task(
                    _run_automation_task(task_to_run, session_id)
                )

    except WebSocketDisconnect:
        manager.disconnect(session_id)


async def _run_automation_task(prompt: str, chat_session_id: str):
    """Runs browser automation and streams updates back through the chat socket."""
    auto_sid = f"auto_{chat_session_id}"
    agent    = BrowserAgent(session_id=auto_sid, headless=False)
    active_sessions[auto_sid] = agent

    try:
        try:
            steps = await plan_task(prompt)
        except Exception:
            steps = fallback_plan(prompt)

        await manager.send_step(chat_session_id, {
            "type":    "plan_ready",
            "steps":   steps,
            "message": f"📋 {len(steps)}-step plan ready",
        })

        await asyncio.wait_for(agent.start(), timeout=25)
        await manager.send_step(chat_session_id, {
            "type": "browser_ready", "message": "✅ Browser open"
        })

        async def on_step(update: Dict[str, Any]):
            await manager.send_step(chat_session_id, update)

        await agent.execute_steps(steps, on_step, prompt=prompt)

    except Exception as e:
        await manager.send_step(chat_session_id, {
            "type": "error", "message": f"Automation error: {str(e)[:200]}"
        })
    finally:
        active_sessions.pop(auto_sid, None)


# ══════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, loop="asyncio", reload=False)