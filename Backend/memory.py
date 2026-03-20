"""
memory.py — AutoNex Agent Memory System
Gives the browser agent a persistent brain:
  • Selector cache  — remembers CSS selectors that worked per domain
  • Task history    — every completed run stored with steps + outcome
  • User context    — preferred sites, common search patterns
  • Failure log     — what failed so planner avoids it next time

Storage: SQLite (zero extra dependencies, works everywhere)
"""

import sqlite3
import json
import os
import re
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

DB_PATH = os.path.join(os.path.dirname(__file__), "autonex_memory.db")


# ══════════════════════════════════════════════════════════════════════
# DB SETUP
# ══════════════════════════════════════════════════════════════════════

def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS selector_cache (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            domain    TEXT    NOT NULL,
            action    TEXT    NOT NULL,
            selector  TEXT    NOT NULL,
            hits      INTEGER DEFAULT 1,
            last_used TEXT    NOT NULL,
            UNIQUE(domain, action, selector)
        );

        CREATE TABLE IF NOT EXISTS task_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt     TEXT    NOT NULL,
            status     TEXT    NOT NULL,        -- success | partial | failed
            steps_json TEXT    NOT NULL,        -- full steps array as JSON
            url        TEXT,
            duration_s REAL,
            created_at TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS failure_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            domain     TEXT,
            selector   TEXT,
            action     TEXT,
            error      TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_context (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)

# Run on import
init_db()


# ══════════════════════════════════════════════════════════════════════
# SELECTOR CACHE
# ══════════════════════════════════════════════════════════════════════

def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return url


def record_selector_success(url: str, action: str, selector: str):
    """Call this every time a selector works. Builds up hit counts."""
    domain = _domain(url)
    now    = datetime.now().isoformat()
    with _conn() as c:
        c.execute("""
            INSERT INTO selector_cache (domain, action, selector, hits, last_used)
            VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(domain, action, selector)
            DO UPDATE SET hits = hits + 1, last_used = excluded.last_used
        """, (domain, action, selector, now))


def get_best_selectors(url: str, action: str, limit: int = 5) -> list[str]:
    """Returns the most reliable selectors for this domain+action combo."""
    domain = _domain(url)
    with _conn() as c:
        rows = c.execute("""
            SELECT selector FROM selector_cache
            WHERE domain = ? AND action = ?
            ORDER BY hits DESC, last_used DESC
            LIMIT ?
        """, (domain, action, limit)).fetchall()
    return [r["selector"] for r in rows]


def record_selector_failure(url: str, action: str, selector: str, error: str):
    domain = _domain(url)
    with _conn() as c:
        c.execute("""
            INSERT INTO failure_log (domain, selector, action, error, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (domain, selector, action, error[:400], datetime.now().isoformat()))


# ══════════════════════════════════════════════════════════════════════
# TASK HISTORY
# ══════════════════════════════════════════════════════════════════════

def save_task(
    prompt: str,
    steps: list,
    status: str,
    url: str = "",
    duration_s: float = 0.0,
):
    with _conn() as c:
        c.execute("""
            INSERT INTO task_history (prompt, status, steps_json, url, duration_s, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            prompt, status, json.dumps(steps),
            url, round(duration_s, 2), datetime.now().isoformat()
        ))


def get_history(limit: int = 20) -> list[dict]:
    with _conn() as c:
        rows = c.execute("""
            SELECT id, prompt, status, url, duration_s, created_at
            FROM task_history ORDER BY created_at DESC LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_task_steps(task_id: int) -> list[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT steps_json FROM task_history WHERE id = ?", (task_id,)
        ).fetchone()
    if row:
        return json.loads(row["steps_json"])
    return []


def get_similar_task(prompt: str) -> Optional[dict]:
    """
    Finds the most recent successful task with a similar prompt.
    Used by the planner to reuse proven step sequences.
    Simple keyword overlap — no embeddings needed for a hackathon.
    """
    keywords = set(re.findall(r'\w+', prompt.lower())) - {
        "the","a","an","on","in","at","to","of","and","or","for","is","are","please"
    }
    with _conn() as c:
        rows = c.execute("""
            SELECT id, prompt, steps_json, url FROM task_history
            WHERE status = 'success'
            ORDER BY created_at DESC LIMIT 50
        """).fetchall()

    best_score, best_row = 0, None
    for row in rows:
        past_words = set(re.findall(r'\w+', row["prompt"].lower()))
        score = len(keywords & past_words) / max(len(keywords), 1)
        if score > best_score:
            best_score, best_row = score, row

    if best_score >= 0.5 and best_row:
        return {
            "id":     best_row["id"],
            "prompt": best_row["prompt"],
            "steps":  json.loads(best_row["steps_json"]),
            "url":    best_row["url"],
            "score":  round(best_score, 2),
        }
    return None


# ══════════════════════════════════════════════════════════════════════
# USER CONTEXT (key/value preferences)
# ══════════════════════════════════════════════════════════════════════

def set_context(key: str, value: str):
    with _conn() as c:
        c.execute("""
            INSERT INTO user_context (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """, (key, value, datetime.now().isoformat()))


def get_context(key: str) -> Optional[str]:
    with _conn() as c:
        row = c.execute(
            "SELECT value FROM user_context WHERE key = ?", (key,)
        ).fetchone()
    return row["value"] if row else None


def get_all_context() -> dict:
    with _conn() as c:
        rows = c.execute("SELECT key, value FROM user_context").fetchall()
    return {r["key"]: r["value"] for r in rows}


# ══════════════════════════════════════════════════════════════════════
# PLANNER CONTEXT STRING
# Used to inject memory into the LLM system prompt
# ══════════════════════════════════════════════════════════════════════

def build_planner_context(prompt: str, current_url: str = "") -> str:
    """
    Returns a short context string to prepend to the LLM prompt.
    Tells the planner what worked before on this domain/task.
    """
    lines = []

    # 1 — similar past task
    similar = get_similar_task(prompt)
    if similar:
        lines.append(
            f"[MEMORY] Similar past task ({int(similar['score']*100)}% match): "
            f'"{similar["prompt"]}" — succeeded in {len(similar["steps"])} steps.'
        )

    # 2 — known working selectors for current domain
    if current_url:
        for action in ("click", "type", "extract"):
            sels = get_best_selectors(current_url, action, limit=2)
            if sels:
                lines.append(
                    f"[MEMORY] On {_domain(current_url)}, "
                    f"'{action}' worked with: {', '.join(sels[:2])}"
                )

    # 3 — user preferences
    ctx = get_all_context()
    if ctx.get("preferred_search_engine"):
        lines.append(f"[PREFERENCE] Default search: {ctx['preferred_search_engine']}")
    if ctx.get("location"):
        lines.append(f"[PREFERENCE] User location: {ctx['location']}")

    return "\n".join(lines) if lines else ""