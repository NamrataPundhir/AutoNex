"""
main.py — AutoNex v4.0
Browser automation + Women Safety System
"""

import sys, asyncio, math, httpx, os

if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from typing import Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from datetime import datetime

from websocket_manager import manager
from planner import plan_task, fallback_plan
from browser_agent import BrowserAgent
from safety_routes import router as safety_router       # ← NEW

load_dotenv()

app = FastAPI(title="AutoNex API", version="4.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
app.include_router(safety_router)                       # ← NEW

active_sessions: Dict[str, BrowserAgent] = {}


# ── Keepalive ─────────────────────────────────────────────────────────
async def _keepalive(session_id: str, interval: int = 6):
    try:
        elapsed = 0
        while True:
            await asyncio.sleep(interval)
            elapsed += interval
            await manager.send_step(session_id, {
                "type": "heartbeat",
                "message": f"Still working... ({elapsed}s)",
                "phase": "scraping",
            })
    except asyncio.CancelledError:
        pass


# ── REST models ───────────────────────────────────────────────────────
class CommandRequest(BaseModel):
    prompt: str
    session_id: str

class StopRequest(BaseModel):
    session_id: str


# ── REST routes ───────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"service": "AutoNex", "version": "4.0.0", "status": "running"}

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

@app.get("/api/ride/history")
async def ride_history(pickup: str = "", drop: str = "", limit: int = 20):
    return {"history": get_price_history(pickup or None, drop or None, limit)}

@app.get("/api/ride/bookings")
async def ride_bookings(limit: int = 10):
    return {"bookings": get_booking_log(limit)}


# ── Browser Agent WebSocket ───────────────────────────────────────────
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    try:
        while True:
            try:
                data = await websocket.receive_json()
            except Exception:
                break

            prompt = data.get("prompt", "").strip()
            if not prompt:
                await manager.send_step(session_id, {"type": "error", "message": "Empty prompt"})
                continue

            if session_id in active_sessions:
                try: await active_sessions[session_id].stop()
                except Exception: pass
                del active_sessions[session_id]

            agent = BrowserAgent(session_id=session_id, headless=False)
            active_sessions[session_id] = agent

            await manager.send_step(session_id, {"type": "planning", "message": f"Planning: {prompt}"})

            try:
                steps = await plan_task(prompt)
                await manager.send_step(session_id, {
                    "type": "plan_ready", "steps": steps,
                    "message": f"Plan ready — {len(steps)} steps",
                })
            except Exception as e:
                steps = fallback_plan(prompt)
                await manager.send_step(session_id, {
                    "type": "plan_ready", "steps": steps,
                    "message": f"Fallback plan — {len(steps)} steps",
                })

            await manager.send_step(session_id, {"type": "browser_starting", "message": "Launching browser..."})
            try:
                await asyncio.wait_for(agent.start(), timeout=25)
                await manager.send_step(session_id, {"type": "browser_ready", "message": "Browser ready"})
            except Exception as e:
                await manager.send_step(session_id, {"type": "error", "message": f"Browser failed: {e}"})
                active_sessions.pop(session_id, None)
                continue

            async def on_step(update: Dict[str, Any]):
                await manager.send_step(session_id, update)

            try:
                await agent.execute_steps(steps, on_step)
            except Exception as e:
                await manager.send_step(session_id, {"type": "error", "message": f"Execution error: {e}"})

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(session_id)
        if session_id in active_sessions:
            try: await active_sessions[session_id].stop()
            except Exception: pass
            active_sessions.pop(session_id, None)


# ── Ride Agent WebSocket ──────────────────────────────────────────────
@app.websocket("/ws-ride/{session_id}")
async def ride_websocket(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)

    async def send(payload: Dict):
        try:
            await manager.send_step(session_id, payload)
        except Exception:
            pass

    try:
        while True:
            try:
                data = await websocket.receive_json()
            except Exception:
                break

            action = data.get("action", "")

            if action == "compare":
                pickup = data.get("pickup", "").strip()
                drop   = data.get("drop",   "").strip()
                if not pickup or not drop:
                    await send({"type": "error", "message": "pickup and drop required"})
                    continue
                await send({"type": "ride_status",
                            "message": f"Fetching prices: {pickup} to {drop}",
                            "phase": "scraping"})
                ping = asyncio.create_task(_keepalive(session_id))
                try:
                    result = await asyncio.wait_for(
                        run_ride_agent(pickup, drop, session_id, on_update=send),
                        timeout=20,
                    )
                except asyncio.TimeoutError:
                    result = {"status": "error", "error": "API timed out"}
                    await send({"type": "error", "message": "Price fetch timed out"})
                finally:
                    ping.cancel()
                    try: await ping
                    except asyncio.CancelledError: pass

            elif action == "book":
                pickup   = data.get("pickup", "").strip()
                drop     = data.get("drop",   "").strip()
                provider = data.get("provider", "").strip()
                if not pickup or not drop or not provider:
                    await send({"type": "error", "message": "pickup, drop, provider required"})
                    continue
                names = {"uber": "Uber", "ola": "Ola", "rapido": "Rapido"}
                await send({"type": "ride_status",
                            "message": f"Opening browser for {names.get(provider, provider)}...",
                            "phase": "booking"})
                ping = asyncio.create_task(_keepalive(session_id))
                try:
                    result = await asyncio.wait_for(
                        run_ride_agent(pickup, drop, session_id,
                                       on_update=send, book_provider=provider),
                        timeout=180,
                    )
                except asyncio.TimeoutError:
                    result = {"status": "error", "error": "Booking timed out"}
                    await send({"type": "error", "message": "Booking timed out"})
                finally:
                    ping.cancel()
                    try: await ping
                    except asyncio.CancelledError: pass
                await send({"type": "booking_complete", "result": result, "phase": "done"})

            elif action == "history":
                history = get_price_history(
                    data.get("pickup") or None,
                    data.get("drop")   or None,
                    limit=20,
                )
                await send({"type": "history_result", "history": history})

            else:
                await send({"type": "error", "message": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(session_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, loop="asyncio", reload=False)