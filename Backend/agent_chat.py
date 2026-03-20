"""
agent_chat.py — AutoNex Talkative AI Agent
Adds a conversational AI layer on top of AutoNex that:
  • Answers questions naturally using Groq (llama3-70b)
  • Recalls previous tasks, selectors, and user context from memory.db
  • Triggers browser automation tasks directly from chat
  • Streams responses token-by-token over WebSocket
  • Maintains full conversation history per session
"""

import os
import json
import asyncio
import re
from datetime import datetime
from typing import List, Dict, Any, AsyncGenerator
from groq import AsyncGroq
from memory import (
    get_history, get_task_steps, get_all_context,
    set_context, get_similar_task, build_planner_context,
    get_best_selectors,
)

# ── System prompt for the chat agent ─────────────────────────────────
CHAT_SYSTEM_PROMPT = """
You are AXON — the talkative, intelligent AI assistant built into AutoNex, 
a browser automation platform. You are friendly, concise, and proactive.

YOUR CAPABILITIES:
1. Answer any question the user asks — conversationally, not robotically
2. Recall and discuss previous automation tasks from memory
3. Trigger new browser automation tasks when the user asks
4. Remember user preferences and context
5. Explain what AutoNex did in past sessions

YOUR PERSONALITY:
- Speak like a smart, helpful colleague — not a formal chatbot
- Use short paragraphs, never bullet walls
- Be proactive: if you see something relevant in memory, mention it
- Use casual contractions: "I've", "you'll", "let's", "didn't"
- Occasionally use light emphasis with **bold** for key info
- Never say "As an AI language model..." — just answer

MEMORY CONTEXT FORMAT:
When you receive [MEMORY: ...] blocks, use that data naturally in your response.
Don't robotically recite it — weave it into your answer like you actually remember.

TASK TRIGGERING:
If the user wants to run a browser task, respond conversationally AND include
at the very end of your message, on its own line:
  [TRIGGER_TASK: <the exact task prompt>]
Example: If user says "search flipkart for headphones", say something like
"Sure, I'll pull that up for you right now!" then on a new line:
  [TRIGGER_TASK: search flipkart for headphones]

QUESTION ABOUT MEMORY:
If asked about past tasks, selectors, history, or "what did I do", 
use the memory context provided to give a real answer.

KEEP RESPONSES:
- Conversational questions: 1-3 sentences
- Memory recall: 2-5 sentences with actual data
- Task triggers: 1 sentence + [TRIGGER_TASK: ...]
- Explanations: up to a short paragraph
"""


# ══════════════════════════════════════════════════════════════════════
# MEMORY CONTEXT BUILDER FOR CHAT
# ══════════════════════════════════════════════════════════════════════

def build_chat_memory_context(user_message: str) -> str:
    """
    Builds a rich memory context block to inject into the chat prompt.
    Pulls from task history, user context, and selector cache.
    """
    lines = []
    msg_lower = user_message.lower()

    # ── Detect memory-related questions ──────────────────────────────
    memory_keywords = {
        "history", "before", "last", "previous", "yesterday", "did i",
        "what did", "past", "earlier", "remember", "recall", "ran",
        "task", "searched", "opened", "clicked", "typed", "automation"
    }
    is_memory_query = bool(set(msg_lower.split()) & memory_keywords)

    # ── Always inject recent history summary ─────────────────────────
    history = get_history(limit=10)
    if history:
        lines.append("[MEMORY: Recent Task History]")
        for t in history[:5]:
            ts = t["created_at"][:16].replace("T", " ")
            lines.append(
                f"  • [{ts}] \"{t['prompt']}\" → {t['status']}"
                + (f" ({t['duration_s']}s)" if t.get("duration_s") else "")
            )

    # ── If memory query, inject more detail ──────────────────────────
    if is_memory_query:
        similar = get_similar_task(user_message)
        if similar:
            lines.append(f"\n[MEMORY: Most Similar Task ({int(similar['score']*100)}% match)]")
            lines.append(f"  Prompt: \"{similar['prompt']}\"")
            steps_summary = [
                s.get("description", s.get("action", "")) 
                for s in similar["steps"][:6]
            ]
            lines.append(f"  Steps: {' → '.join(steps_summary)}")

    # ── User context / preferences ────────────────────────────────────
    ctx = get_all_context()
    if ctx:
        lines.append("\n[MEMORY: User Preferences & Context]")
        for k, v in ctx.items():
            lines.append(f"  {k}: {v}")

    # ── Statistics ────────────────────────────────────────────────────
    if history:
        total     = len(history)
        succeeded = sum(1 for t in history if t["status"] == "success")
        lines.append(f"\n[MEMORY: Stats] {total} recent tasks, {succeeded} succeeded")

    return "\n".join(lines) if lines else ""


# ══════════════════════════════════════════════════════════════════════
# TASK TRIGGER DETECTION
# ══════════════════════════════════════════════════════════════════════

TASK_TRIGGER_PATTERN = re.compile(r'\[TRIGGER_TASK:\s*(.+?)\]', re.IGNORECASE)

TASK_INTENT_WORDS = {
    "open", "search", "find", "buy", "add", "cart", "play", "watch",
    "go", "visit", "login", "sign", "fill", "submit", "click", "type",
    "navigate", "browse", "check", "look", "get", "scroll", "download",
    "automate", "run", "do", "start", "launch", "book", "order",
}

QUESTION_WORDS = {
    "what", "who", "when", "where", "why", "how", "is", "are", "was",
    "were", "did", "does", "do", "can", "could", "would", "should",
    "tell", "explain", "describe", "show me", "history", "remember"
}


def classify_message(message: str) -> str:
    """
    Returns:
      'task'     — should trigger browser automation
      'question' — should answer conversationally
      'both'     — answer + potentially trigger
    """
    words = set(message.lower().split())
    
    has_task_intent   = bool(words & TASK_INTENT_WORDS)
    has_question_word = bool(words & QUESTION_WORDS)
    
    # Explicit task signals
    if any(phrase in message.lower() for phrase in [
        "go to", "open ", "search for", "find me", "add to cart",
        "play ", "watch ", "buy ", "log in", "sign in"
    ]):
        return "task"
    
    # Question about past data → just answer
    if any(phrase in message.lower() for phrase in [
        "what did i", "show my", "my history", "last task", "previous",
        "what was", "did you", "did i", "how many", "tell me about"
    ]):
        return "question"

    if has_task_intent and not has_question_word:
        return "task"
    if has_question_word and not has_task_intent:
        return "question"
    
    return "both"


# ══════════════════════════════════════════════════════════════════════
# STREAMING CHAT RESPONSE
# ══════════════════════════════════════════════════════════════════════

async def stream_chat_response(
    user_message: str,
    conversation_history: List[Dict[str, str]],
    session_id: str,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Streams the AI chat response token by token.
    Yields dicts:
      {"type": "token",        "content": "..."}   — partial text
      {"type": "done",         "full_text": "..."}  — complete response
      {"type": "trigger_task", "prompt": "..."}     — task to execute
      {"type": "error",        "message": "..."}    — error
    """
    api_key = os.getenv("GROQ_AI_KEY")
    if not api_key:
        yield {"type": "error", "message": "GROQ_API_KEY not set"}
        return

    # Build memory context
    memory_ctx = build_chat_memory_context(user_message)
    
    # Inject memory into the user message for this turn
    enhanced_user_msg = user_message
    if memory_ctx:
        enhanced_user_msg = f"{memory_ctx}\n\nUser: {user_message}"

    # Build messages array (keep last 20 turns for context)
    messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    
    # Add conversation history (skip the last user turn, we'll add enhanced version)
    for turn in conversation_history[-20:]:
        messages.append(turn)
    
    # Add current (memory-enhanced) user message
    messages.append({"role": "user", "content": enhanced_user_msg})

    client    = AsyncGroq(api_key=api_key)
    full_text = ""

    try:
        stream = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=600,
            messages=messages,
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                token      = delta.content
                full_text += token
                yield {"type": "token", "content": token}

        # Check for task trigger in the full response
        trigger_match = TASK_TRIGGER_PATTERN.search(full_text)
        task_prompt   = None
        
        if trigger_match:
            task_prompt = trigger_match.group(1).strip()
            # Remove the trigger tag from the displayed text
            clean_text = TASK_TRIGGER_PATTERN.sub("", full_text).strip()
        else:
            clean_text = full_text

        yield {"type": "done", "full_text": clean_text}

        if task_prompt:
            yield {"type": "trigger_task", "prompt": task_prompt}

    except asyncio.TimeoutError:
        yield {"type": "error", "message": "Response timed out. Try again."}
    except Exception as e:
        yield {"type": "error", "message": f"AI error: {str(e)[:200]}"}


# ══════════════════════════════════════════════════════════════════════
# SESSION STORE  (in-memory, keyed by session_id)
# ══════════════════════════════════════════════════════════════════════

# { session_id: [ {"role": "user"|"assistant", "content": "..."}, ... ] }
_chat_sessions: Dict[str, List[Dict[str, str]]] = {}


def get_session_history(session_id: str) -> List[Dict[str, str]]:
    return _chat_sessions.get(session_id, [])


def append_to_session(session_id: str, role: str, content: str):
    if session_id not in _chat_sessions:
        _chat_sessions[session_id] = []
    _chat_sessions[session_id].append({"role": role, "content": content})
    # Cap at 40 messages to avoid token blowout
    if len(_chat_sessions[session_id]) > 40:
        _chat_sessions[session_id] = _chat_sessions[session_id][-40:]


def clear_session(session_id: str):
    _chat_sessions.pop(session_id, None)


def get_all_sessions() -> Dict[str, int]:
    """Returns { session_id: message_count }"""
    return {sid: len(msgs) for sid, msgs in _chat_sessions.items()}