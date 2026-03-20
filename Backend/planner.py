"""
planner.py — AutoNex v5.0 — Memory-Aware AI Planner

New vs v4:
  • Memory context injection — past tasks + known selectors fed into LLM
  • Memory replay shortcut   — ≥85% similar past task → reuse proven steps
  • Task chaining            — "search X then check Y" splits into sub-plans
"""

import json
import re
import os
import asyncio
from typing import List, Dict, Any
from groq import AsyncGroq
from memory import build_planner_context, get_similar_task

SYSTEM_PROMPT = """
You are an expert browser automation AI.
Convert the user request into browser automation steps.
Return ONLY valid JSON array.
Each step: {"action":"...","selector":"...","text":"...","url":"...","milliseconds":1000,"description":"..."}
Allowed actions: open type click wait press_key scroll hover select extract screenshot tab_open tab_switch retry if_exists
Rules:
1 Always start with open
2 Add waits between actions
3 Use stable selectors
4 Prefer search boxes when available
5 Click first relevant result
6 Use scroll when needed
7 Extract useful information when possible
8 End with screenshot
9 Total steps: 6-12
10 For ALL type actions use ONLY core search keywords — NEVER the full user sentence.
   WRONG: "open youtube and play lo-fi music"  RIGHT: "lo-fi music"
If [MEMORY] hints are provided above the task, prefer the selectors mentioned there.
"""

ALLOWED_ACTIONS = {
    "open","type","click","wait","press_key","scroll","hover",
    "select","extract","screenshot","tab_open","tab_switch","retry","if_exists"
}

_FILLER = {
    "search","find","look","show","get","open","buy","purchase","order","check",
    "tell","give","list","play","watch","go","visit","start","launch","navigate",
    "please","can","you","me","for","the","a","an","on","in","at","to","of",
    "and","or","with","from","what","is","are","best","top","good","latest","new",
    "cheapest","cheap","how","much","does","want","need","i","my","about","some",
    "any","all","youtube","google","amazon","flipkart","wikipedia","wiki","twitter",
    "instagram","facebook","reddit","under","below","above","within","upto","up",
    "price","cost","website","site","page","video","videos","then","after","also",
}

def _extract_keywords(prompt: str) -> str:
    words   = prompt.split()
    cleaned = [re.sub(r"[^\w\-]", "", w) for w in words if w.lower() not in _FILLER]
    result  = " ".join(w for w in cleaned if w).strip()
    return result if result else prompt

def _to_query(prompt: str) -> str:
    return _extract_keywords(prompt).replace(" ", "+")

def sanitize_steps(steps: List[Dict], prompt: str) -> List[Dict]:
    keywords = _extract_keywords(prompt)
    for step in steps:
        if step.get("action") != "type":
            continue
        original = step.get("text", "")
        step["text"] = keywords
        if original != keywords:
            print(f"[Sanitize] '{original}' -> '{keywords}'")
    return steps

def validate_steps(steps: List[Dict]) -> List[Dict]:
    v = [s for s in steps if isinstance(s, dict) and s.get("action") in ALLOWED_ACTIONS]
    if not v:
        raise ValueError("Planner produced empty steps")
    return v

def extract_json(raw: str):
    raw = re.sub(r"```json", "", raw)
    raw = re.sub(r"```",     "", raw)
    s, e = raw.find("["), raw.rfind("]")
    if s == -1 or e == -1:
        raise ValueError("JSON not found")
    return json.loads(raw[s:e+1])

_CHAIN_SPLITS = [
    r'\bthen\b', r'\bafter that\b', r'\band also\b',
    r'\bnext\b',  r'\bafterwards\b', r'\bfollowed by\b',
]

def _split_chain(prompt: str) -> List[str]:
    pattern = '|'.join(_CHAIN_SPLITS)
    parts   = re.split(pattern, prompt, flags=re.IGNORECASE)
    return [p.strip() for p in parts if p.strip()]


# ── Main entry point ──────────────────────────────────────────────────
async def plan_task(prompt: str) -> List[Dict]:

    # 1 — Memory replay: reuse proven steps if ≥85% similar task found
    similar = get_similar_task(prompt)
    if similar and similar["score"] >= 0.85:
        print(f"[Planner] Memory replay score={similar['score']}: '{similar['prompt']}'")
        return sanitize_steps(similar["steps"], prompt)

    # 2 — Task chaining
    parts = _split_chain(prompt)
    if len(parts) > 1:
        print(f"[Planner] Chained: {len(parts)} sub-tasks")
        all_steps: List[Dict] = []
        for part in parts:
            sub = await _plan_single(part)
            if len(sub) > 1 and sub[-1].get("action") == "screenshot":
                sub = sub[:-1]   # remove intermediate screenshots
            all_steps.extend(sub)
        all_steps.append({"action": "screenshot", "description": "Final state"})
        return all_steps

    # 3 — Single task
    return await _plan_single(prompt)


async def _plan_single(prompt: str) -> List[Dict]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("Missing GROQ_API_KEY")

    # Inject memory context before the task description
    mem_context = build_planner_context(prompt)
    user_msg    = f"{mem_context}\n\nTask: {prompt}" if mem_context else prompt

    client = AsyncGroq(api_key=api_key)
    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model="llama3-70b-8192",
                temperature=0.2,
                max_tokens=1200,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": user_msg},
                ],
            ),
            timeout=25,
        )
        raw   = response.choices[0].message.content
        steps = validate_steps(extract_json(raw))
        return sanitize_steps(steps, prompt)

    except Exception as e:
        print(f"Planner failed: {e}")
        return fallback_plan(prompt)


# ── Fallback plans ────────────────────────────────────────────────────
def fallback_plan(prompt: str) -> List[Dict]:
    p = prompt.lower()
    q = _to_query(prompt)
    print(f"[Planner] Fallback: '{prompt}' -> '{q}'")

    if any(w in p for w in ["laptop","phone","mobile","buy","earphone","headphone",
                              "tablet","camera","tv","television","flipkart"]):
        return sanitize_steps([
            {"action":"open",    "url":f"https://www.flipkart.com/search?q={q}"},
            {"action":"wait",    "milliseconds":3000},
            {"action":"scroll",  "direction":"down"},
            {"action":"click",   "selector":"a[href*='/p/']"},
            {"action":"wait",    "milliseconds":3000},
            {"action":"extract", "selector":"h1, ._30jeq3"},
            {"action":"screenshot"},
        ], prompt)

    if "amazon" in p:
        return sanitize_steps([
            {"action":"open",    "url":f"https://www.amazon.in/s?k={q}"},
            {"action":"wait",    "milliseconds":3000},
            {"action":"click",   "selector":"div[data-component-type='s-search-result'] h2 a"},
            {"action":"wait",    "milliseconds":3000},
            {"action":"extract", "selector":"#productTitle, span.a-price-whole"},
            {"action":"screenshot"},
        ], prompt)

    if "youtube" in p or "video" in p or "watch" in p or "play" in p:
        return sanitize_steps([
            {"action":"open",  "url":f"https://www.youtube.com/results?search_query={q}"},
            {"action":"wait",  "milliseconds":3000},
            {"action":"click", "selector":"ytd-video-renderer a#thumbnail"},
            {"action":"wait",  "milliseconds":4000},
            {"action":"screenshot"},
        ], prompt)

    if "wiki" in p or "what is" in p or "who is" in p or "explain" in p:
        return sanitize_steps([
            {"action":"open",    "url":f"https://en.wikipedia.org/wiki/Special:Search?search={q}"},
            {"action":"wait",    "milliseconds":2000},
            {"action":"click",   "selector":"div.mw-search-result-heading a"},
            {"action":"wait",    "milliseconds":2000},
            {"action":"extract", "selector":"p"},
            {"action":"screenshot"},
        ], prompt)

    if any(w in p for w in ["news","today","latest","headline","current"]):
        return sanitize_steps([
            {"action":"open",    "url":f"https://news.google.com/search?q={q}"},
            {"action":"wait",    "milliseconds":3000},
            {"action":"click",   "selector":"article h3 a"},
            {"action":"wait",    "milliseconds":3000},
            {"action":"extract", "selector":"h1, p"},
            {"action":"screenshot"},
        ], prompt)

    return sanitize_steps([
        {"action":"open",    "url":f"https://duckduckgo.com/?q={q}"},
        {"action":"wait",    "milliseconds":3000},
        {"action":"click",   "selector":"a[data-testid='result-title-a']"},
        {"action":"wait",    "milliseconds":3000},
        {"action":"scroll",  "direction":"down"},
        {"action":"extract", "selector":"h1, p"},
        {"action":"screenshot"},
    ], prompt)