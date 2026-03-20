# ── Add these imports to main.py ─────────────────────────────────────
from memory import get_history, get_task_steps, get_all_context, set_context

# ── Add these routes to main.py ───────────────────────────────────────

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
async def set_memory_context(key: str, value: str):
    set_context(key, value)
    return {"saved": True}

# ── Update the WebSocket handler to pass prompt to execute_steps ──────
# Change this line inside the websocket_endpoint:
#
#   await agent.execute_steps(steps, on_step)
#
# To:
#
#   await agent.execute_steps(steps, on_step, prompt=prompt)