"""
browser_agent.py — AutoNex v7.0 — Visible Automation
Changes vs v6.1:
  • slow_mo=60     → every Playwright action has a 60ms built-in delay
  • highlight()    → yellow border + label flash on every element before interaction
  • scroll_into_view before every click/type so element is always on screen
  • typing delay   → 80–140ms per character (human-speed, clearly visible)
  • browser window brought to front on start
"""

import sys
import asyncio
import base64
import random
import re
import time
from typing import Dict, Any, Callable, Optional, List

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from playwright.async_api import (
    async_playwright, Browser, BrowserContext, Page, Playwright,
    Error as PlaywrightError, TimeoutError as PlaywrightTimeout,
)
from memory import (
    record_selector_success, record_selector_failure,
    get_best_selectors, save_task,
)

# ── Per-action timeouts ───────────────────────────────────────────────
ACTION_TIMEOUT = {
    "click": 8000, "type": 8000, "extract": 5000,
    "hover": 6000, "select": 8000, "clear": 6000, "focus": 6000,
}
DEFAULT_TIMEOUT = 8000

# ── JS snippet: flash a coloured outline + label on an element ────────
_HIGHLIGHT_JS = """
(selector, label) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const prev = el.style.cssText;
    el.style.outline = '3px solid #facc15';
    el.style.outlineOffset = '2px';
    el.style.transition = 'outline 0.15s';

    // floating label
    const tag = document.createElement('div');
    tag.innerText = label;
    tag.style.cssText = [
        'position:fixed','z-index:99999','background:#facc15',
        'color:#000','font:bold 12px/1 monospace','padding:4px 8px',
        'border-radius:4px','pointer-events:none','white-space:nowrap',
    ].join(';');
    const r = el.getBoundingClientRect();
    tag.style.top  = Math.max(4, r.top - 24) + 'px';
    tag.style.left = r.left + 'px';
    document.body.appendChild(tag);

    setTimeout(() => {
        el.style.cssText = prev;
        tag.remove();
    }, 900);
}
"""

_CLICK_RIPPLE_JS = """
(selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    const dot = document.createElement('div');
    dot.style.cssText = [
        'position:fixed','z-index:99999','pointer-events:none',
        `left:${cx-16}px`,`top:${cy-16}px`,
        'width:32px','height:32px','border-radius:50%',
        'background:rgba(250,204,21,0.6)',
        'animation:autonex-ripple 0.5s ease-out forwards',
    ].join(';');
    const style = document.createElement('style');
    style.textContent = `@keyframes autonex-ripple {
        0%   { transform:scale(0.5); opacity:1 }
        100% { transform:scale(2.5); opacity:0 }
    }`;
    document.head.appendChild(style);
    document.body.appendChild(dot);
    setTimeout(() => { dot.remove(); style.remove(); }, 600);
}
"""


def _healing_candidates(selector: str, action: str) -> List[str]:
    candidates = []
    stripped = re.sub(r':nth[^\s,>+~]*', '', selector).strip()
    if stripped and stripped != selector:
        candidates.append(stripped)
    last = selector.split()[-1] if ' ' in selector else selector
    if last != selector:
        candidates.append(last)

    SEMANTIC_MAP = {
        "input[type='search']":  ["input[placeholder*='search' i]", "input[name='q']", "input[type='text']"],
        "input[type='text']":    ["input[placeholder]", "textarea"],
        "button[type='submit']": ["button:has-text('Search')", "input[type='submit']"],
        "a[href*='/p/']":        ["div[data-id] a", "li a"],
        "ytd-video-renderer a":  ["a#video-title", "h3 a", "a[href*='watch']"],
        "#productTitle":         ["h1", ".product-title"],
        "article h3 a":          ["h3 a", "article a", "main a"],
        "article:visible":       ["article", "h3 a", "div[role='article']"],
        "article a":             ["h3 a", "main a", "a[data-n-au]"],
    }
    for pattern, alts in SEMANTIC_MAP.items():
        if pattern in selector:
            candidates.extend(alts)
            break

    if action == "click":
        label = re.findall(r'\[.*?["\'](.+?)["\'].*?\]', selector)
        if label:
            candidates += [f"text={label[0]}", f"[aria-label*='{label[0]}' i]"]

    tag = re.match(r'^(\w+)', selector)
    if tag:
        candidates.append(tag.group(1))

    return candidates[:8]


class BrowserAgent:

    def __init__(self, session_id: str, headless: bool = False):
        self.session_id  = session_id
        self.headless    = headless
        self._playwright: Optional[Playwright]     = None
        self._browser:    Optional[Browser]        = None
        self._context:    Optional[BrowserContext] = None
        self._page:       Optional[Page]           = None
        self._is_running = False
        self._task_start = 0.0
        self._completed_steps: List[Dict] = []

    def _page_alive(self) -> bool:
        try:
            return self._page is not None and not self._page.is_closed()
        except Exception:
            return False

    async def _ensure_page(self):
        if not self._context:
            return
        try:
            pages = self._context.pages
            if not pages:
                return
            newest = pages[-1]
            if newest != self._page and not newest.is_closed():
                print(f"[Agent] → new tab: {newest.url}")
                self._page = newest
        except Exception as e:
            print(f"[Agent] _ensure_page: {e}")

    # ── Highlight element before interaction ──────────────────────────
    async def _highlight(self, selector: str, label: str = ""):
        """Flash yellow outline + label on the element for ~900ms."""
        if not self._page_alive():
            return
        try:
            await self._page.evaluate(_HIGHLIGHT_JS, selector, label or selector[:40])
            await asyncio.sleep(0.3)   # let user see the highlight
        except Exception:
            pass   # highlight is cosmetic — never block execution

    async def _ripple(self, selector: str):
        """Show a click ripple animation."""
        if not self._page_alive():
            return
        try:
            await self._page.evaluate(_CLICK_RIPPLE_JS, selector)
        except Exception:
            pass

    async def _scroll_into_view(self, selector: str):
        """Scroll the element into the viewport before interacting."""
        if not self._page_alive():
            return
        try:
            await self._page.eval_on_selector(
                selector,
                "el => el.scrollIntoView({behavior:'smooth', block:'center'})"
            )
            await asyncio.sleep(0.4)
        except Exception:
            pass

    async def start(self):
        self._playwright = await async_playwright().start()
        self._browser    = await self._playwright.chromium.launch(
            headless=self.headless,
            slow_mo=60,             # ← 60ms delay between every Playwright op
            args=[
                "--no-sandbox", "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars", "--start-maximized",
                "--disable-extensions",
            ]
        )
        self._context = await self._browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            extra_http_headers={"Accept-Language": "en-IN,en;q=0.9"},
        )
        await self._context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver',   {get: () => undefined});
            Object.defineProperty(navigator, 'plugins',     {get: () => [1,2,3,4,5]});
            Object.defineProperty(navigator, 'languages',   {get: () => ['en-IN','en']});
            window.chrome = {runtime:{}, loadTimes:()=>{}, csi:()=>{}, app:{}};
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({query: () => Promise.resolve({state:'granted'})})
            });
        """)
        self._page       = await self._context.new_page()
        self._task_start = time.time()
        # Move mouse to centre so it's visible from the start
        await self._page.mouse.move(640, 400)
        self._is_running = True

    async def stop(self):
        self._is_running = False
        for obj, method in [
            (self._page,       lambda o: o.close()   if not o.is_closed() else None),
            (self._context,    lambda o: o.close()),
            (self._browser,    lambda o: o.close()),
            (self._playwright, lambda o: o.stop()),
        ]:
            if obj:
                try:    await method(obj)
                except: pass

    async def take_screenshot(self) -> Optional[str]:
        if not self._page_alive():
            return None
        try:
            data = await self._page.screenshot(type="jpeg", quality=72, full_page=False)
            return base64.b64encode(data).decode("utf-8")
        except Exception:
            return None

    # ── Main execution loop ───────────────────────────────────────────
    async def execute_steps(
        self,
        steps: List[Dict[str, Any]],
        on_step_update: Callable[[Dict[str, Any]], Any],
        prompt: str = "",
    ):
        if not self._page:
            await self.start()

        total        = len(steps)
        final_status = "success"
        self._completed_steps = []

        for i, step in enumerate(steps):
            if not self._is_running:
                break
            if not self._page_alive():
                await on_step_update({"type": "error", "message": "Browser page closed"})
                final_status = "failed"
                break

            step_num = i + 1
            action   = step.get("action", "unknown")
            desc     = step.get("description", action.capitalize())

            await on_step_update({
                "type": "step_start", "step_number": step_num,
                "total_steps": total, "action": action,
                "description": desc,  "status": "running",
            })

            try:
                result, healed = await self._execute_with_healing(step)

                if action in ("click", "open", "navigate"):
                    await self._ensure_page()

                screenshot = None
                if action in ("open", "click", "navigate", "press_key", "screenshot", "hover", "type"):
                    screenshot = await self.take_screenshot()

                if healed and self._page_alive():
                    record_selector_success(self._page.url, action, healed)

                self._completed_steps.append({
                    **step, "result": result,
                    "status": "success", "step_number": step_num,
                })

                await on_step_update({
                    "type": "step_complete",  "step_number": step_num,
                    "total_steps": total,      "action": action,
                    "description": desc,       "status": "success",
                    "result": result,          "screenshot": screenshot,
                    "current_url": self._page.url if self._page_alive() else None,
                    "_healed": healed != step.get("selector"),
                })

            except PlaywrightTimeout:
                screenshot = await self.take_screenshot()
                sel = step.get("selector", "")
                if self._page_alive() and sel:
                    record_selector_failure(self._page.url, action, sel, "timeout")
                print(f"[Agent] Timeout step {step_num} ({action} '{sel}') — skipping")
                await on_step_update({
                    "type": "step_error",  "step_number": step_num,
                    "total_steps": total,  "action": action,
                    "description": desc,   "status": "error",
                    "error": "Element not found — skipped",
                    "screenshot": screenshot,
                    "current_url": self._page.url if self._page_alive() else None,
                })
                final_status = "partial"
                continue

            except PlaywrightError as e:
                err = str(e)
                screenshot = await self.take_screenshot()
                if "closed" in err.lower():
                    await self._ensure_page()
                    if not self._page_alive():
                        final_status = "failed"; break
                    continue
                if self._page_alive() and step.get("selector"):
                    record_selector_failure(self._page.url, action, step.get("selector",""), err)
                await on_step_update({
                    "type": "step_error",  "step_number": step_num,
                    "total_steps": total,  "action": action,
                    "description": desc,   "status": "error",
                    "error": err[:200],    "screenshot": screenshot,
                    "current_url": self._page.url if self._page_alive() else None,
                })
                final_status = "partial"
                if action in ("click","type","extract","hover","select","clear","focus"):
                    continue
                else:
                    final_status = "failed"; break

            except Exception as e:
                screenshot = await self.take_screenshot()
                await on_step_update({
                    "type": "step_error",  "step_number": step_num,
                    "total_steps": total,  "action": action,
                    "description": desc,   "status": "error",
                    "error": str(e)[:200], "screenshot": screenshot,
                    "current_url": self._page.url if self._page_alive() else None,
                })
                final_status = "partial"
                if action in ("click","type","extract","hover","select"):
                    continue
                else:
                    final_status = "failed"; break

        duration = round(time.time() - self._task_start, 2)
        if prompt and self._completed_steps:
            save_task(
                prompt=prompt, steps=self._completed_steps,
                status=final_status,
                url=self._page.url if self._page_alive() else "",
                duration_s=duration,
            )
        final = await self.take_screenshot()
        await on_step_update({
            "type": "task_complete", "status": "done",
            "message": f"Task completed in {duration}s",
            "screenshot": final,
            "current_url": self._page.url if self._page_alive() else None,
            "duration_s": duration,
        })

    # ── Self-healing ──────────────────────────────────────────────────
    async def _execute_with_healing(self, step: Dict[str, Any]):
        action   = step.get("action")
        selector = step.get("selector")

        if not selector or action not in ("click","type","hover","extract","select","clear","focus"):
            return await self._execute_single_step(step), selector

        current_url = self._page.url if self._page_alive() else ""
        memory_sels = get_best_selectors(current_url, action, limit=3)
        fallbacks   = _healing_candidates(selector, action)
        candidates  = [selector] + [s for s in memory_sels + fallbacks if s != selector]

        last_err = None
        for candidate in candidates:
            try:
                result = await self._execute_single_step({**step, "selector": candidate})
                if candidate != selector:
                    print(f"[Heal] '{selector}' → '{candidate}'")
                return result, candidate
            except PlaywrightError as e:
                if "closed" in str(e).lower():
                    raise
                last_err = e
            except Exception as e:
                last_err = e

        raise last_err or Exception(f"All candidates failed: {selector}")

    # ── Step implementations ──────────────────────────────────────────
    async def _execute_single_step(self, step: Dict[str, Any]) -> str:
        action  = step.get("action")
        timeout = ACTION_TIMEOUT.get(action, DEFAULT_TIMEOUT)

        if action not in ("wait",) and not self._page_alive():
            raise PlaywrightError("Page not available")

        # ── open ─────────────────────────────────────────────────────
        if action == "open":
            url = step.get("url", "https://duckduckgo.com")
            await self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            try:
                await self._page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass
            await asyncio.sleep(random.uniform(0.5, 1.0))
            return f"Opened {url}"

        # ── type ─────────────────────────────────────────────────────
        elif action == "type":
            sel  = step.get("selector")
            text = step.get("text", "")
            await self._page.wait_for_selector(sel, timeout=timeout, state="attached")
            await self._scroll_into_view(sel)
            await self._highlight(sel, f"Typing: {text[:30]}")
            await self._page.click(sel)              # focus the field first
            await self._page.fill(sel, "")           # clear existing text
            # Type character by character — clearly visible
            await self._page.type(sel, text, delay=random.randint(80, 140))
            await asyncio.sleep(random.uniform(0.3, 0.6))
            return f"Typed '{text}'"

        # ── click ────────────────────────────────────────────────────
        elif action == "click":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=timeout, state="attached")
            await self._scroll_into_view(sel)
            await self._highlight(sel, "Clicking…")
            await self._ripple(sel)
            await asyncio.sleep(0.15)               # pause so ripple is visible
            await self._page.click(sel)
            await asyncio.sleep(random.uniform(0.8, 1.5))
            return f"Clicked {sel}"

        # ── double_click ─────────────────────────────────────────────
        elif action == "double_click":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=timeout, state="attached")
            await self._scroll_into_view(sel)
            await self._highlight(sel, "Double-clicking…")
            await self._page.dblclick(sel)
            await asyncio.sleep(0.8)
            return f"Double-clicked {sel}"

        # ── press_key ────────────────────────────────────────────────
        elif action == "press_key":
            key = step.get("key", "Enter")
            await self._page.keyboard.press(key)
            await asyncio.sleep(random.uniform(0.8, 1.5))
            return f"Pressed {key}"

        # ── wait ─────────────────────────────────────────────────────
        elif action == "wait":
            ms = step.get("milliseconds", 1000)
            await asyncio.sleep(ms / 1000)
            return f"Waited {ms}ms"

        # ── scroll ───────────────────────────────────────────────────
        elif action == "scroll":
            direction = step.get("direction", "down")
            amount    = step.get("amount", 600)
            # Smooth scroll in two steps so it's visible
            half = amount // 2
            await self._page.evaluate(f"window.scrollBy({{top:{half if direction=='down' else -half},behavior:'smooth'}})")
            await asyncio.sleep(0.3)
            await self._page.evaluate(f"window.scrollBy({{top:{half if direction=='down' else -half},behavior:'smooth'}})")
            await asyncio.sleep(0.4)
            return f"Scrolled {direction}"

        # ── extract ──────────────────────────────────────────────────
        elif action == "extract":
            sel = step.get("selector", "body")
            try:
                await self._page.wait_for_selector(sel, timeout=timeout, state="attached")
                await self._highlight(sel, "Extracting…")
                return (await self._page.inner_text(sel))[:800]
            except Exception:
                try:
                    return (await self._page.inner_text("body"))[:400]
                except Exception:
                    return "Could not extract content"

        # ── hover ────────────────────────────────────────────────────
        elif action == "hover":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=timeout, state="attached")
            await self._scroll_into_view(sel)
            await self._highlight(sel, "Hovering…")
            await self._page.hover(sel)
            await asyncio.sleep(0.5)
            return f"Hovered {sel}"

        # ── select ───────────────────────────────────────────────────
        elif action == "select":
            sel   = step.get("selector")
            value = step.get("value", "")
            await self._page.wait_for_selector(sel, timeout=timeout, state="attached")
            await self._scroll_into_view(sel)
            await self._highlight(sel, f"Selecting: {value}")
            await self._page.select_option(sel, value)
            return f"Selected '{value}'"

        # ── clear ────────────────────────────────────────────────────
        elif action == "clear":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=timeout, state="attached")
            await self._highlight(sel, "Clearing…")
            await self._page.fill(sel, "")
            return f"Cleared {sel}"

        # ── focus ────────────────────────────────────────────────────
        elif action == "focus":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=timeout, state="attached")
            await self._page.focus(sel)
            return f"Focused {sel}"

        # ── navigate ─────────────────────────────────────────────────
        elif action == "navigate":
            url = step.get("url", "")
            await self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            return f"Navigated to {url}"

        # ── screenshot ───────────────────────────────────────────────
        elif action == "screenshot":
            return "Screenshot captured"

        # ── tab_open ─────────────────────────────────────────────────
        elif action == "tab_open":
            url  = step.get("url", "about:blank")
            page = await self._context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            self._page = page
            return f"Opened tab: {url}"

        # ── tab_switch ───────────────────────────────────────────────
        elif action == "tab_switch":
            idx   = step.get("index", -1)
            pages = self._context.pages
            if 0 <= idx < len(pages):
                self._page = pages[idx]
                return f"Switched to tab {idx}"
            return "Tab index out of range"

        return f"Unknown action: {action}"