"""
main.py — Project Aegis FastAPI Backend — Production
"""

import sys
import asyncio
from typing import Dict, Any



if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from websocket_manager import manager
from planner import plan_task, fallback_plan
from browser_agent import BrowserAgent

load_dotenv()

app = FastAPI(title="Project Aegis", version="2.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

active_sessions: Dict[str, BrowserAgent] = {}


class CommandRequest(BaseModel):
    prompt: str
    session_id: str

class StopRequest(BaseModel):
    session_id: str


@app.get("/")
async def root():
    return {"service": "Project Aegis", "version": "2.0.0", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy", "sessions": len(active_sessions)}

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
        try: await active_sessions[sid].stop()
        except Exception: pass
        del active_sessions[sid]
        return {"status": "stopped"}
    return {"status": "not_found"}

@app.get("/api/sessions")
async def sessions():
    return {"sessions": list(active_sessions.keys()), "count": len(active_sessions)}


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    try:
        while True:
            data   = await websocket.receive_json()
            prompt = data.get("prompt", "").strip()

            if not prompt:
                await manager.send_step(session_id, {"type":"error","message":"Empty prompt"})
                continue

            # Kill existing session
            if session_id in active_sessions:
                try: await active_sessions[session_id].stop()
                except Exception: pass
                del active_sessions[session_id]

            agent = BrowserAgent(session_id=session_id, headless=True)
            active_sessions[session_id] = agent

            await manager.send_step(session_id, {
                "type": "planning", "message": f"🧠 Planning: {prompt}"
            })

            # Plan
            try:
                steps = await plan_task(prompt)
                await manager.send_step(session_id, {
                    "type": "plan_ready", "steps": steps,
                    "message": f"📋 Plan ready — {len(steps)} steps"
                })
            except Exception as e:
                steps = fallback_plan(prompt)
                await manager.send_step(session_id, {
                    "type": "plan_ready", "steps": steps,
                    "message": f"📋 Fallback plan — {len(steps)} steps",
                    "note": str(e)
                })

            # Launch browser
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
                if session_id in active_sessions:
                    del active_sessions[session_id]
                continue

            async def on_step(update: Dict[str, Any]):
                await manager.send_step(session_id, update)

            # Execute
            try:
                await agent.execute_steps(steps, on_step)
            except Exception as e:
                await manager.send_step(session_id, {
                    "type": "error", "message": f"❌ Execution error: {e}"
                })
            finally:
                print("✅ Task completed — browser kept open for demo")

    except WebSocketDisconnect:
        manager.disconnect(session_id)
        if session_id in active_sessions:
            try: await active_sessions[session_id].stop()
            except Exception: pass
            del active_sessions[session_id]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, loop="asyncio", reload=False)