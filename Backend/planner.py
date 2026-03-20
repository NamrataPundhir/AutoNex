"""
planner.py — AutoNex v6.1
Changes vs v6.0:
  • Removed all :visible selectors from fallback plans (causes timeout)
  • Google News uses reliable selectors: a[href*='articles'], h3 a
  • All wait_for_selector now uses state="attached" (not visible)
  • Fallback news plan uses DuckDuckGo news as backup
"""

import json
import re
import os
import asyncio
from typing import List, Dict, Any
from groq import AsyncGroq
from memory import build_planner_context, get_similar_task


SYSTEM_PROMPT = """
You are an expert browser automation AI for Indian users.
Convert ANY user request into precise browser automation steps.
Return ONLY a valid JSON array — no explanation, no markdown, no extra text.

Each step MUST follow this schema exactly:
{
  "action":       "string",
  "selector":     "string or null",
  "text":         "string or null",
  "url":          "string or null",
  "key":          "string or null",
  "direction":    "up or down",
  "milliseconds": 1000,
  "description":  "human readable label"
}

═══════════════════════════════════════════════
ALLOWED ACTIONS:
open, type, click, wait, press_key, scroll,
hover, select, extract, screenshot, clear,
focus, double_click, tab_open, tab_switch
═══════════════════════════════════════════════

═══════════════════════════════════════════════
CRITICAL SELECTOR RULES:
═══════════════════════════════════════════════
1  NEVER use :visible, :hidden, :enabled in selectors — causes timeouts
2  Use text matchers for buttons: button:has-text('Add to Cart')
3  Prefer id selectors: #add-to-cart-button over complex chains
4  For news: use  h3 a  or  a[href*='articles']  not  article:visible
5  For type: ONLY core keywords, never the full sentence

═══════════════════════════════════════════════
PLANNING RULES:
═══════════════════════════════════════════════
1  Always start with open
2  Add wait 2000–3000ms after page navigation
3  Add wait 1000–1500ms after clicks
4  End every plan with screenshot
5  Total steps: 6–18
6  If [MEMORY] hints are given, use those selectors

═══════════════════════════════════════════════
SELECTOR REFERENCE:
═══════════════════════════════════════════════
Search box      → input[name='q'], input[type='search']
Add to cart     → button:has-text('ADD TO CART'), #add-to-cart-button
Buy now         → button:has-text('Buy Now'), button:has-text('BUY NOW')
Login           → button:has-text('Login'), a:has-text('Sign In')
Email           → input[type='email'], input[name='email']
Password        → input[type='password']
Submit          → button[type='submit'], input[type='submit']
Checkout        → button:has-text('Checkout')
News article    → h3 a, a[href*='articles'], .article a
Product card    → a[href*='/p/'], div[data-component-type='s-search-result'] h2 a

═══════════════════════════════════════════════
EXAMPLES:
═══════════════════════════════════════════════

USER: add iphone 16 to cart on flipkart
[
  {"action":"open",       "url":"https://www.flipkart.com/search?q=iphone+16",    "description":"Search Flipkart"},
  {"action":"wait",       "milliseconds":3000,                                     "description":"Wait for results"},
  {"action":"scroll",     "direction":"down",                                      "description":"Scroll to products"},
  {"action":"click",      "selector":"a[href*='/p/']",                            "description":"Open first product"},
  {"action":"wait",       "milliseconds":3000,                                     "description":"Wait for product page"},
  {"action":"screenshot",                                                           "description":"Product page"},
  {"action":"click",      "selector":"button:has-text('ADD TO CART')",            "description":"Add to cart"},
  {"action":"wait",       "milliseconds":2000,                                     "description":"Wait for cart"},
  {"action":"screenshot",                                                           "description":"Cart updated"}
]

USER: latest tech news today
[
  {"action":"open",       "url":"https://news.google.com/search?q=tech+news",     "description":"Google News"},
  {"action":"wait",       "milliseconds":3000,                                     "description":"Wait for results"},
  {"action":"click",      "selector":"h3 a",                                      "description":"Open first article"},
  {"action":"wait",       "milliseconds":3000,                                     "description":"Wait for article"},
  {"action":"extract",    "selector":"h1",                                         "description":"Get headline"},
  {"action":"screenshot",                                                           "description":"Article page"}
]

USER: login to amazon with test@gmail.com and password123
[
  {"action":"open",       "url":"https://www.amazon.in/ap/signin",                "description":"Amazon login"},
  {"action":"wait",       "milliseconds":2000,                                     "description":"Wait for page"},
  {"action":"type",       "selector":"input[type='email']","text":"test@gmail.com","description":"Enter email"},
  {"action":"click",      "selector":"input[id='continue']",                      "description":"Continue"},
  {"action":"wait",       "milliseconds":1500,                                     "description":"Wait"},
  {"action":"type",       "selector":"input[type='password']","text":"password123","description":"Enter password"},
  {"action":"click",      "selector":"input[id='signInSubmit']",                  "description":"Sign in"},
  {"action":"wait",       "milliseconds":3000,                                     "description":"Wait for login"},
  {"action":"screenshot",                                                           "description":"Login result"}
]
"""

ALLOWED_ACTIONS = {
    "open","type","click","wait","press_key","scroll","hover",
    "select","extract","screenshot","clear","focus","double_click",
    "tab_open","tab_switch","retry","if_exists",
}

_CART_WORDS  = {"add","cart","buy","purchase","order","checkout","wishlist"}
_LOGIN_WORDS = {"login","signin","sign","log","account","password","email","credential"}
_FORM_WORDS  = {"fill","form","submit","enter","register","signup","apply","book"}
_VIDEO_WORDS = {"watch","play","video","youtube","stream","music","song","lofi","lo-fi"}
_NEWS_WORDS  = {"news","headline","today","latest","current","article","read"}
_WIKI_WORDS  = {"wiki","wikipedia","explain","meaning","define","history"}

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

_CHAIN_SPLITS = [
    r'\bthen\b', r'\bafter that\b', r'\band also\b',
    r'\bnext\b',  r'\bafterwards\b', r'\bfollowed by\b',
]


def _extract_keywords(prompt: str) -> str:
    words   = prompt.split()
    cleaned = [re.sub(r"[^\w\-]", "", w) for w in words if w.lower() not in _FILLER]
    result  = " ".join(w for w in cleaned if w).strip()
    return result if result else prompt

def _to_query(prompt: str) -> str:
    return _extract_keywords(prompt).replace(" ", "+")

def _intent(prompt: str) -> set:
    p = set(prompt.lower().split())
    found = set()
    if p & _CART_WORDS:  found.add("cart")
    if p & _LOGIN_WORDS: found.add("login")
    if p & _FORM_WORDS:  found.add("form")
    if p & _VIDEO_WORDS: found.add("video")
    if p & _NEWS_WORDS:  found.add("news")
    if p & _WIKI_WORDS:  found.add("wiki")
    return found

def sanitize_steps(steps: List[Dict], prompt: str) -> List[Dict]:
    keywords     = _extract_keywords(prompt)
    prompt_lower = prompt.lower().strip()
    for step in steps:
        if step.get("action") != "type":
            continue
        text = step.get("text", "").strip()
        if text.lower() == prompt_lower:
            step["text"] = keywords
        elif len(text.split()) > 6 and "@" not in text:
            step["text"] = keywords
    return steps

def validate_steps(steps: List[Dict]) -> List[Dict]:
    v = [s for s in steps if isinstance(s, dict) and s.get("action") in ALLOWED_ACTIONS]
    if not v:
        raise ValueError("Empty steps")
    return v

def extract_json(raw: str):
    raw = re.sub(r"```json|```", "", raw)
    s, e = raw.find("["), raw.rfind("]")
    if s == -1 or e == -1:
        raise ValueError("No JSON array found")
    return json.loads(raw[s:e+1])

def _split_chain(prompt: str) -> List[str]:
    pattern = '|'.join(_CHAIN_SPLITS)
    return [p.strip() for p in re.split(pattern, prompt, flags=re.IGNORECASE) if p.strip()]


# ── Main entry ────────────────────────────────────────────────────────
async def plan_task(prompt: str) -> List[Dict]:
    similar = get_similar_task(prompt)
    if similar and similar["score"] >= 0.85:
        print(f"[Planner] Memory replay {similar['score']:.2f}: '{similar['prompt']}'")
        return sanitize_steps(similar["steps"], prompt)

    parts = _split_chain(prompt)
    if len(parts) > 1:
        print(f"[Planner] Chained: {len(parts)} sub-tasks")
        all_steps: List[Dict] = []
        for part in parts:
            sub = await _plan_single(part)
            if sub and sub[-1].get("action") == "screenshot":
                sub = sub[:-1]
            all_steps.extend(sub)
        all_steps.append({"action": "screenshot", "description": "Final state"})
        return all_steps

    return await _plan_single(prompt)


async def _plan_single(prompt: str) -> List[Dict]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("Missing GROQ_API_KEY")

    mem = build_planner_context(prompt)
    msg = f"{mem}\n\nUser request: {prompt}" if mem else f"User request: {prompt}"

    client = AsyncGroq(api_key=api_key)
    try:
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                temperature=0.1,
                max_tokens=2000,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": msg},
                ],
            ),
            timeout=30,
        )
        steps = validate_steps(extract_json(resp.choices[0].message.content))
        # Strip any :visible the LLM still generates
        for step in steps:
            if step.get("selector"):
                step["selector"] = step["selector"].replace(":visible", "").strip()
        return sanitize_steps(steps, prompt)

    except Exception as e:
        print(f"[Planner] LLM failed ({e}), using fallback")
        return fallback_plan(prompt)


# ── Fallback plans ────────────────────────────────────────────────────
def fallback_plan(prompt: str) -> List[Dict]:
    p       = prompt.lower()
    q       = _to_query(prompt)
    intents = _intent(prompt)
    print(f"[Planner] Fallback: q='{q}' intents={intents}")

    # ADD TO CART
    if "cart" in intents or "buy" in p:
        if "amazon" in p:
            return [
                {"action":"open",       "url":f"https://www.amazon.in/s?k={q}",            "description":"Search Amazon"},
                {"action":"wait",       "milliseconds":3000},
                {"action":"click",      "selector":"div[data-component-type='s-search-result'] h2 a", "description":"First result"},
                {"action":"wait",       "milliseconds":3000},
                {"action":"screenshot", "description":"Product page"},
                {"action":"click",      "selector":"#add-to-cart-button",                  "description":"Add to cart"},
                {"action":"wait",       "milliseconds":2000},
                {"action":"screenshot", "description":"Cart updated"},
            ]
        return [
            {"action":"open",       "url":f"https://www.flipkart.com/search?q={q}",        "description":"Search Flipkart"},
            {"action":"wait",       "milliseconds":3000},
            {"action":"click",      "selector":"a[href*='/p/']",                           "description":"First product"},
            {"action":"wait",       "milliseconds":3000},
            {"action":"screenshot", "description":"Product page"},
            {"action":"click",      "selector":"button:has-text('ADD TO CART')",           "description":"Add to cart"},
            {"action":"wait",       "milliseconds":2000},
            {"action":"screenshot", "description":"Cart updated"},
        ]

    # NEWS — fixed selectors, no :visible
    if "news" in intents:
        return [
            {"action":"open",       "url":f"https://news.google.com/search?q={q}&hl=en-IN", "description":"Google News"},
            {"action":"wait",       "milliseconds":4000,                                    "description":"Wait for page"},
            {"action":"click",      "selector":"h3 a",                                     "description":"Open first article"},
            {"action":"wait",       "milliseconds":3000,                                    "description":"Wait for article"},
            {"action":"extract",    "selector":"h1",                                        "description":"Get headline"},
            {"action":"extract",    "selector":"p",                                         "description":"Get content"},
            {"action":"screenshot", "description":"Article"},
        ]

    # YOUTUBE
    if "video" in intents or "youtube" in p:
        return [
            {"action":"open",       "url":f"https://www.youtube.com/results?search_query={q}", "description":"YouTube search"},
            {"action":"wait",       "milliseconds":3000},
            {"action":"click",      "selector":"ytd-video-renderer a#thumbnail",           "description":"First video"},
            {"action":"wait",       "milliseconds":4000},
            {"action":"screenshot", "description":"Video playing"},
        ]

    # WIKIPEDIA
    if "wiki" in intents:
        return [
            {"action":"open",       "url":f"https://en.wikipedia.org/wiki/Special:Search?search={q}", "description":"Wikipedia"},
            {"action":"wait",       "milliseconds":2000},
            {"action":"click",      "selector":"div.mw-search-result-heading a",           "description":"First result"},
            {"action":"wait",       "milliseconds":2000},
            {"action":"extract",    "selector":"p",                                        "description":"Content"},
            {"action":"screenshot", "description":"Wikipedia article"},
        ]

    # FLIPKART
    if any(w in p for w in ["flipkart","laptop","phone","mobile","earphone",
                             "headphone","tablet","camera","television"]):
        return [
            {"action":"open",       "url":f"https://www.flipkart.com/search?q={q}",        "description":"Flipkart search"},
            {"action":"wait",       "milliseconds":3000},
            {"action":"scroll",     "direction":"down"},
            {"action":"click",      "selector":"a[href*='/p/']",                           "description":"First product"},
            {"action":"wait",       "milliseconds":3000},
            {"action":"extract",    "selector":"h1",                                       "description":"Product name"},
            {"action":"screenshot", "description":"Product page"},
        ]

    # AMAZON
    if "amazon" in p:
        return [
            {"action":"open",       "url":f"https://www.amazon.in/s?k={q}",                "description":"Amazon search"},
            {"action":"wait",       "milliseconds":3000},
            {"action":"click",      "selector":"div[data-component-type='s-search-result'] h2 a", "description":"First result"},
            {"action":"wait",       "milliseconds":3000},
            {"action":"extract",    "selector":"#productTitle",                            "description":"Title"},
            {"action":"extract",    "selector":"span.a-price-whole",                       "description":"Price"},
            {"action":"screenshot", "description":"Product"},
        ]

    # DEFAULT
    return [
        {"action":"open",       "url":f"https://duckduckgo.com/?q={q}",                    "description":"DuckDuckGo"},
        {"action":"wait",       "milliseconds":3000},
        {"action":"click",      "selector":"a[data-testid='result-title-a']",              "description":"First result"},
        {"action":"wait",       "milliseconds":3000},
        {"action":"scroll",     "direction":"down"},
        {"action":"extract",    "selector":"h1",                                           "description":"Headline"},
        {"action":"screenshot", "description":"Result"},
    ]