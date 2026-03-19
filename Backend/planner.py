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
9 Total steps: 6–12
"""


# ---------------- ACTIONS ----------------

ALLOWED_ACTIONS = {
    "open",
    "type",
    "click",
    "wait",
    "press_key",
    "scroll",
    "hover",
    "select",
    "extract",
    "screenshot",
    "tab_open",
    "tab_switch",
    "retry",
    "if_exists"
}


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
    end = raw.rfind("]")

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
                    {"role": "user", "content": prompt}
                ],
            ),

            timeout=25

        )

        raw = response.choices[0].message.content

        steps = extract_json(raw)

        steps = validate_steps(steps)

        return steps

    except Exception as e:

        print("Planner failed:", e)

        return fallback_plan(prompt)


# ---------------- FALLBACK ----------------

def fallback_plan(prompt: str):

    p = prompt.lower()
    q = prompt.replace(" ", "+")

    # ---------- FLIPKART (BEST FOR INDIA) ----------
    if "laptop" in p or "phone" in p or "buy" in p or "price" in p:

        return [
            {
                "action": "open",
                "url": f"https://www.flipkart.com/search?q={q}"
            },
            {"action": "wait", "milliseconds": 3000},

            {
                "action": "scroll",
                "direction": "down"
            },

            {
                "action": "click",
                "selector": "a[href*='/p/']"
            },

            {"action": "wait", "milliseconds": 3000},

            {
                "action": "extract",
                "selector": "h1, span, div"
            },

            {"action": "screenshot"}
        ]

    # ---------- AMAZON ----------
    if "amazon" in p:

        return [
            {
                "action": "open",
                "url": f"https://www.amazon.in/s?k={q}"
            },
            {"action": "wait", "milliseconds": 3000},

            {
                "action": "click",
                "selector": "div[data-component-type='s-search-result'] h2 a"
            },

            {"action": "wait", "milliseconds": 3000},

            {
                "action": "extract",
                "selector": "#productTitle, span"
            },

            {"action": "screenshot"}
        ]

    # ---------- YOUTUBE ----------
    if "youtube" in p:

        return [
            {
                "action": "open",
                "url": f"https://www.youtube.com/results?search_query={q}"
            },
            {"action": "wait", "milliseconds": 3000},

            {
                "action": "click",
                "selector": "ytd-video-renderer a#thumbnail"
            },

            {"action": "wait", "milliseconds": 4000},

            {"action": "screenshot"}
        ]

    # ---------- DEFAULT (NO GOOGLE) ----------
    return [
        {
            "action": "open",
            "url": f"https://duckduckgo.com/?q={q}"
        },
        {"action": "wait", "milliseconds": 3000},

        {
            "action": "click",
            "selector": "a[data-testid='result-title-a']"
        },

        {"action": "wait", "milliseconds": 3000},

        {
            "action": "scroll",
            "direction": "down"
        },

        {"action": "screenshot"}
    ]