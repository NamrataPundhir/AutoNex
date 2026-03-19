"""
browser_agent.py — Production Playwright Browser Automation Engine
"""

import sys
import asyncio
import base64
import random
from typing import Dict, Any, Callable, Optional, List

if sys.platform == "win32":
   asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright


class BrowserAgent:

    def __init__(self, session_id: str, headless: bool = False):
        self.session_id = session_id
        self.headless = headless
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._is_running = False

    async def start(self):
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=False,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--start-maximized",
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
        # Stealth — hide automation fingerprints
        await self._context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-IN', 'en']});
            window.chrome = {runtime: {}, loadTimes: () => {}, csi: () => {}, app: {}};
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({ query: () => Promise.resolve({ state: 'granted' }) })
            });
        """)
        self._page = await self._context.new_page()
        # Random human-like mouse movement
        await self._page.mouse.move(
            random.randint(300, 900),
            random.randint(200, 600)
        )
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
                try:
                    await method(obj)
                except Exception:
                    pass

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
        on_step_update: Callable[[Dict[str, Any]], Any]
    ):
        if not self._page:
            await self.start()

        total = len(steps)

        for i, step in enumerate(steps):
            if not self._is_running:
                break

            step_num  = i + 1
            action    = step.get("action", "unknown")
            desc      = step.get("description", action.capitalize())

            # ── Notify: running ──────────────────────────────────────────────
            await on_step_update({
                "type": "step_start", "step_number": step_num,
                "total_steps": total, "action": action,
                "description": desc,  "status": "running"
            })

            try:
                result     = await self._execute_single_step(step)
                screenshot = None
                if action in ("open","click","navigate","press_key","screenshot","hover"):
                    screenshot = await self.take_screenshot()

                await on_step_update({
                    "type": "step_complete", "step_number": step_num,
                    "total_steps": total,    "action": action,
                    "description": desc,     "status": "success",
                    "result": result,        "screenshot": screenshot,
                    "current_url": self._page.url if self._page else None
                })

            except Exception as e:
                screenshot = await self.take_screenshot()
                await on_step_update({
                    "type": "step_error",  "step_number": step_num,
                    "total_steps": total,  "action": action,
                    "description": desc,   "status": "error",
                    "error": str(e),       "screenshot": screenshot,
                    "current_url": self._page.url if self._page else None
                })
                # Only break on navigation failures; continue on element errors
                if action in ("click", "type", "extract", "hover", "select"):
                    continue
                else:
                    break

        # ── Final completion ─────────────────────────────────────────────────
        final = await self.take_screenshot()
        await on_step_update({
            "type": "task_complete", "status": "done",
            "message": "Task completed successfully",
            "screenshot": final,
            "current_url": self._page.url if self._page else None
        })

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
            script = f"window.scrollBy(0, {amount if direction == 'down' else -amount})"
            await self._page.evaluate(script)
            await asyncio.sleep(0.5)
            return f"Scrolled {direction} {amount}px"

        elif action == "extract":
            sel = step.get("selector", "body")
            try:
                await self._page.wait_for_selector(sel, timeout=8000)
                text = await self._page.inner_text(sel)
                return text[:800]
            except Exception:
                return "Element not found"

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

        elif action == "screenshot":
            return "Screenshot captured"

        elif action == "navigate":
            url = step.get("url", "")
            await self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            return f"Navigated to {url}"

        return f"Unknown action: {action}"