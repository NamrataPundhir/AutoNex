"""
planner.py — Advanced AI Planner
Operator-style reasoning planner for browser automation
"""

import json
import re
import os
import asyncio
from typing import List, Dict, Any
from groq import AsyncGroq


# ---------------- SYSTEM PROMPT ----------------

SYSTEM_PROMPT = """
You are an expert browser automation AI.

Convert the user request into browser automation steps.

Return ONLY valid JSON array.

Each step must follow schema:

{
 "action": "...",
 "selector": "...",
 "text": "...",
 "url": "...",
 "milliseconds": 1000,
 "description": "..."
}

Allowed actions:
open
type
click
wait
press_key
scroll
hover
select
extract
screenshot
tab_open
tab_switch
retry
if_exists

Planning rules:

1 Always start with open
2 Add waits between actions
3 Use stable selectors
4 Prefer search boxes when available
5 Click first relevant result
6 Use scroll when needed
7 Extract useful information when possible
8 End with screenshot
9 Total steps: 6-12
10 For ALL 'type' actions, use ONLY the core search keywords — NEVER the full user sentence.
   WRONG: "open youtube and play lo-fi music video"
   RIGHT: "lo-fi music"
   WRONG: "search flipkart for samsung tv under 50000"
   RIGHT: "samsung tv 50000"
"""


# ---------------- ACTIONS ----------------

ALLOWED_ACTIONS = {
    "open", "type", "click", "wait", "press_key",
    "scroll", "hover", "select", "extract",
    "screenshot", "tab_open", "tab_switch", "retry", "if_exists"
}


# ---------------- KEYWORD EXTRACTOR ----------------

_FILLER = {
    # intent verbs
    "search", "find", "look", "show", "get", "open", "buy", "purchase",
    "order", "check", "tell", "give", "list", "play", "watch", "go",
    "visit", "start", "launch", "navigate",
    # common words
    "please", "can", "you", "me", "for", "the", "a", "an", "on", "in",
    "at", "to", "of", "and", "or", "with", "from", "what", "is", "are",
    "best", "top", "good", "latest", "new", "cheapest", "cheap", "how",
    "much", "does", "want", "need", "i", "my", "about", "some", "any",
    "all",
    # site names (never part of the search query)
    "youtube", "google", "amazon", "flipkart", "wikipedia", "wiki",
    "twitter", "instagram", "facebook", "reddit",
    # price modifiers
    "under", "below", "above", "within", "upto", "up", "price", "cost",
    # misc
    "website", "site", "page", "video", "videos",
}

def _extract_keywords(prompt: str) -> str:
    """
    Strips filler/intent words and site names, returns only the
    meaningful search topic.

    Examples:
        "open youtube and play lo-fi music"           -> "lo-fi music"
        "buy laptop under 50000"                      -> "laptop 50000"
        "search flipkart for samsung tv under 50000"  -> "samsung tv 50000"
        "find best running shoes for men"             -> "running shoes men"
        "what is quantum computing"                   -> "quantum computing"
    """
    words    = prompt.split()
    keywords = [w for w in words if w.lower() not in _FILLER]

    cleaned = []
    for w in keywords:
        w_clean = re.sub(r"[^\w\-]", "", w)   # keep hyphens (lo-fi)
        if w_clean:
            cleaned.append(w_clean)

    result = " ".join(cleaned).strip()
    return result if result else prompt


def _to_query(prompt: str) -> str:
    """Returns URL-safe query string from prompt keywords."""
    return _extract_keywords(prompt).replace(" ", "+")


# ---------------- SANITIZE TYPE TEXT ----------------

def sanitize_steps(steps: List[Dict[str, Any]], prompt: str) -> List[Dict[str, Any]]:
    """
    UNCONDITIONALLY replaces the text of every 'type' action with
    clean extracted keywords. No conditions — this guarantees the
    raw prompt never reaches any search box regardless of LLM output.
    """
    keywords = _extract_keywords(prompt)

    for step in steps:
        if step.get("action") != "type":
            continue
        original = step.get("text", "")
        step["text"] = keywords
        if original != keywords:
            print(f"[Sanitize] '{original}' -> '{keywords}'")

    return steps


# ---------------- VALIDATION ----------------

def validate_steps(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    validated = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        action = step.get("action")
        if action not in ALLOWED_ACTIONS:
            continue
        validated.append(step)
    if not validated:
        raise ValueError("Planner produced empty steps")
    return validated


# ---------------- CLEAN JSON ----------------

def extract_json(raw: str):
    raw = re.sub(r"```json", "", raw)
    raw = re.sub(r"```", "", raw)
    start = raw.find("[")
    end   = raw.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("JSON not found")
    return json.loads(raw[start:end+1])


# ---------------- MAIN PLANNER ----------------

async def plan_task(prompt: str) -> List[Dict[str, Any]]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("Missing GROQ_API_KEY")

    client = AsyncGroq(api_key=api_key)

    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model="llama3-70b-8192",
                temperature=0.2,
                max_tokens=1200,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": prompt}
                ],
            ),
            timeout=25
        )
        raw   = response.choices[0].message.content
        steps = extract_json(raw)
        steps = validate_steps(steps)
        steps = sanitize_steps(steps, prompt)  # ← always clean type text
        return steps

    except Exception as e:
        print("Planner failed:", e)
        return fallback_plan(prompt)


# ---------------- FALLBACK ----------------

def fallback_plan(prompt: str) -> List[Dict[str, Any]]:
    p = prompt.lower()
    q = _to_query(prompt)

    print(f"[Planner] Fallback: prompt='{prompt}' -> query='{q}'")

    # ---------- FLIPKART ----------
    if any(w in p for w in ["laptop", "phone", "mobile", "buy", "price",
                              "earphone", "headphone", "tablet", "camera",
                              "tv", "television", "watch", "flipkart"]):
        return sanitize_steps([
            {"action": "open",     "url": f"https://www.flipkart.com/search?q={q}"},
            {"action": "wait",     "milliseconds": 3000},
            {"action": "scroll",   "direction": "down"},
            {"action": "click",    "selector": "a[href*='/p/']"},
            {"action": "wait",     "milliseconds": 3000},
            {"action": "extract",  "selector": "h1, ._30jeq3, ._16Jk6d"},
            {"action": "screenshot"},
        ], prompt)

    # ---------- AMAZON ----------
    if "amazon" in p:
        return sanitize_steps([
            {"action": "open",     "url": f"https://www.amazon.in/s?k={q}"},
            {"action": "wait",     "milliseconds": 3000},
            {"action": "click",    "selector": "div[data-component-type='s-search-result'] h2 a"},
            {"action": "wait",     "milliseconds": 3000},
            {"action": "extract",  "selector": "#productTitle, span.a-price-whole"},
            {"action": "screenshot"},
        ], prompt)

    # ---------- YOUTUBE ----------
    if "youtube" in p or "video" in p or "watch" in p or "play" in p:
        return sanitize_steps([
            {"action": "open",     "url": f"https://www.youtube.com/results?search_query={q}"},
            {"action": "wait",     "milliseconds": 3000},
            {"action": "click",    "selector": "ytd-video-renderer a#thumbnail"},
            {"action": "wait",     "milliseconds": 4000},
            {"action": "screenshot"},
        ], prompt)

    # ---------- WIKIPEDIA ----------
    if "wiki" in p or "what is" in p or "who is" in p or "explain" in p:
        return sanitize_steps([
            {"action": "open",     "url": f"https://en.wikipedia.org/wiki/Special:Search?search={q}"},
            {"action": "wait",     "milliseconds": 2000},
            {"action": "click",    "selector": "div.mw-search-result-heading a"},
            {"action": "wait",     "milliseconds": 2000},
            {"action": "extract",  "selector": "p"},
            {"action": "screenshot"},
        ], prompt)

    # ---------- NEWS ----------
    if any(w in p for w in ["news", "today", "latest", "headline", "current"]):
        return sanitize_steps([
            {"action": "open",     "url": f"https://news.google.com/search?q={q}"},
            {"action": "wait",     "milliseconds": 3000},
            {"action": "click",    "selector": "article h3 a"},
            {"action": "wait",     "milliseconds": 3000},
            {"action": "extract",  "selector": "h1, p"},
            {"action": "screenshot"},
        ], prompt)

    # ---------- DEFAULT — DuckDuckGo ----------
    return sanitize_steps([
        {"action": "open",     "url": f"https://duckduckgo.com/?q={q}"},
        {"action": "wait",     "milliseconds": 3000},
        {"action": "click",    "selector": "a[data-testid='result-title-a']"},
        {"action": "wait",     "milliseconds": 3000},
        {"action": "scroll",   "direction": "down"},
        {"action": "extract",  "selector": "h1, p"},
        {"action": "screenshot"},
    ], prompt)