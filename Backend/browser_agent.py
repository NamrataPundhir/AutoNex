"""
browser_agent.py — AutoNex v5.0 — Self-Healing Browser Automation Engine
"""

import sys
import asyncio
import base64
import random
import time
from typing import Dict, Any, Callable, Optional, List

# ── WINDOWS FIX ───────────────────────────────────────────────────────
# ProactorEventLoop required for Playwright subprocess creation on Windows.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright
from memory import (
    record_selector_success,
    record_selector_failure,
    get_best_selectors,
    save_task,
)


# ── Self-healing selector candidates ─────────────────────────────────
def _healing_candidates(selector: str, action: str) -> List[str]:
    import re
    candidates = []

    stripped = re.sub(r':nth[^\s,>+~]*', '', selector).strip()
    if stripped and stripped != selector:
        candidates.append(stripped)

    last_part = selector.split()[-1] if ' ' in selector else selector
    if last_part != selector:
        candidates.append(last_part)

    SEMANTIC_MAP = {
        "input[type='search']":    ["input[placeholder*='search' i]", "input[name='q']", "input[type='text']"],
        "input[type='text']":      ["input[placeholder]", "textarea"],
        "button[type='submit']":   ["button:has-text('Search')", "input[type='submit']", "[role='button']"],
        "a[href*='/p/']":          ["div[data-id] a", "article a", "li a"],
        "ytd-video-renderer a":    ["a#video-title", "h3 a", "a[href*='watch']"],
        "#productTitle":           ["h1", ".product-title", "[data-feature-name='title'] h1"],
    }
    for pattern, alts in SEMANTIC_MAP.items():
        if pattern in selector:
            candidates.extend(alts)
            break

    if action == "click":
        label = re.findall(r'\[.*?["\'](.+?)["\'].*?\]', selector)
        if label:
            candidates.append(f"text={label[0]}")
            candidates.append(f"[aria-label*='{label[0]}' i]")

    tag = re.match(r'^(\w+)', selector)
    if tag:
        candidates.append(f"{tag.group(1)}:visible")

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

    async def start(self):
        self._playwright = await async_playwright().start()
        self._browser    = await self._playwright.chromium.launch(
            headless=self.headless,
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
        await self._page.mouse.move(random.randint(300, 900), random.randint(200, 600))
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
        if not self._page or self._page.is_closed():
            return None
        try:
            data = await self._page.screenshot(type="jpeg", quality=72, full_page=False)
            return base64.b64encode(data).decode("utf-8")
        except Exception:
            return None

    async def execute_steps(
        self,
        steps: List[Dict[str, Any]],
        on_step_update: Callable[[Dict[str, Any]], Any],
        prompt: str = "",
    ):
        if not self._page:
            await self.start()

        total = len(steps)
        self._completed_steps = []
        final_status = "success"

        for i, step in enumerate(steps):
            if not self._is_running:
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
                result, healed_selector = await self._execute_with_healing(step)
                screenshot = None
                if action in ("open", "click", "navigate", "press_key", "screenshot", "hover"):
                    screenshot = await self.take_screenshot()

                if healed_selector and self._page:
                    record_selector_success(self._page.url, action, healed_selector)

                self._completed_steps.append({
                    **step, "result": result,
                    "status": "success", "step_number": step_num,
                })

                await on_step_update({
                    "type": "step_complete",   "step_number": step_num,
                    "total_steps": total,       "action": action,
                    "description": desc,        "status": "success",
                    "result": result,           "screenshot": screenshot,
                    "current_url": self._page.url if self._page else None,
                    "_healed": healed_selector != step.get("selector"),
                    "_original_selector": step.get("selector"),
                })

            except Exception as e:
                screenshot   = await self.take_screenshot()
                final_status = "partial"

                if self._page:
                    record_selector_failure(
                        self._page.url, action,
                        step.get("selector", ""), str(e)
                    )

                await on_step_update({
                    "type": "step_error",  "step_number": step_num,
                    "total_steps": total,  "action": action,
                    "description": desc,   "status": "error",
                    "error": str(e),       "screenshot": screenshot,
                    "current_url": self._page.url if self._page else None,
                })

                if action in ("click", "type", "extract", "hover", "select"):
                    continue
                else:
                    final_status = "failed"
                    break

        duration = round(time.time() - self._task_start, 2)
        if prompt and self._completed_steps:
            save_task(
                prompt=prompt, steps=self._completed_steps,
                status=final_status,
                url=self._page.url if self._page else "",
                duration_s=duration,
            )

        final = await self.take_screenshot()
        await on_step_update({
            "type": "task_complete", "status": "done",
            "message": f"Task completed in {duration}s",
            "screenshot": final,
            "current_url": self._page.url if self._page else None,
            "duration_s": duration,
        })

    async def _execute_with_healing(self, step: Dict[str, Any]):
        action   = step.get("action")
        selector = step.get("selector")

        if not selector or action not in ("click", "type", "hover", "extract", "select"):
            result = await self._execute_single_step(step)
            return result, selector

        current_url = self._page.url if self._page else ""
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
            except Exception as e:
                last_err = e
                continue

        raise last_err or Exception(f"All candidates failed: {selector}")

    async def _execute_single_step(self, step: Dict[str, Any]) -> str:
        action = step.get("action")

        if action == "open":
            url = step.get("url", "https://duckduckgo.com")
            await self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(random.uniform(0.8, 1.5))
            return f"Opened {url}"

        elif action == "type":
            sel  = step.get("selector")
            text = step.get("text", "")
            await self._page.wait_for_selector(sel, timeout=10000)
            await self._page.fill(sel, "")
            await self._page.type(sel, text, delay=random.randint(60, 110))
            await asyncio.sleep(random.uniform(0.4, 0.9))
            return f"Typed '{text}'"

        elif action == "click":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=10000)
            await self._page.click(sel)
            await asyncio.sleep(random.uniform(0.8, 1.5))
            return f"Clicked {sel}"

        elif action == "press_key":
            key = step.get("key", "Enter")
            await self._page.keyboard.press(key)
            await asyncio.sleep(random.uniform(0.8, 1.5))
            return f"Pressed {key}"

        elif action == "wait":
            ms = step.get("milliseconds", 1000)
            await asyncio.sleep(ms / 1000)
            return f"Waited {ms}ms"

        elif action == "scroll":
            direction = step.get("direction", "down")
            amount    = step.get("amount", 600)
            await self._page.evaluate(
                f"window.scrollBy(0, {amount if direction == 'down' else -amount})"
            )
            await asyncio.sleep(0.5)
            return f"Scrolled {direction} {amount}px"

        elif action == "extract":
            sel = step.get("selector", "body")
            await self._page.wait_for_selector(sel, timeout=8000)
            text = await self._page.inner_text(sel)
            return text[:800]

        elif action == "hover":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=10000)
            await self._page.hover(sel)
            await asyncio.sleep(0.5)
            return f"Hovered {sel}"

        elif action == "select":
            sel   = step.get("selector")
            value = step.get("value", "")
            await self._page.wait_for_selector(sel, timeout=10000)
            await self._page.select_option(sel, value)
            return f"Selected '{value}'"

        elif action == "clear":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=10000)
            await self._page.fill(sel, "")
            return f"Cleared {sel}"

        elif action == "focus":
            sel = step.get("selector")
            await self._page.wait_for_selector(sel, timeout=10000)
            await self._page.focus(sel)
            return f"Focused {sel}"

        elif action == "navigate":
            url = step.get("url", "")
            await self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            return f"Navigated to {url}"

        elif action == "screenshot":
            return "Screenshot captured"

        return f"Unknown action: {action}"