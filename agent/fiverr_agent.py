#!/usr/bin/env python3
"""
Fiverr AI Agent
Uses Claude Computer Use + Playwright to automate Fiverr tasks:
  - Navigate and log in
  - Browse buyer requests and send tailored offers
  - Respond to customer inbox messages
  - Manage gig listings

Usage:
  python fiverr_agent.py "Browse buyer requests for web dev jobs and send offers"
  python fiverr_agent.py --headless "Check inbox and reply to messages"

Requires:
  ANTHROPIC_API_KEY environment variable (or set in .env)
"""

import asyncio
import base64
import json
import os
import sys
from typing import Any

from playwright.async_api import async_playwright, Browser, Page
import anthropic

# ─── Constants ────────────────────────────────────────────────────────────────

SCREEN_WIDTH = 1280
SCREEN_HEIGHT = 800
MODEL = "claude-sonnet-4-6"
MAX_STEPS = 80

SYSTEM_PROMPT = """\
You are an expert Fiverr assistant agent operating inside a browser.
You can see the current state of the Fiverr website and take actions to complete tasks.

Capabilities:
- Navigate Fiverr by clicking, typing, scrolling, and using keyboard shortcuts
- Log into a Fiverr seller account
- Browse "Buyer Requests" and send professional offers
- Read and reply to inbox messages with personalised, helpful responses
- View and edit gig listings

Rules to follow:
1. Always take a screenshot first to understand the current page state.
2. Be patient — wait for pages to load before interacting.
3. Write professional, personalised messages. Reference the buyer's specific request.
4. When sending an offer always include: relevant experience, clear deliverable, realistic timeline.
5. If you encounter a CAPTCHA or bot-detection, stop and report it immediately.
6. Never click "Buy" or spend money — you are a seller agent only.
7. When a task is fully complete, summarise what you did in plain English.
"""


# ─── Key mapping (xdotool → Playwright) ──────────────────────────────────────

KEY_MAP: dict[str, str] = {
    "Return": "Enter",
    "BackSpace": "Backspace",
    "Delete": "Delete",
    "Escape": "Escape",
    "Tab": "Tab",
    "space": "Space",
    "ctrl+a": "Control+a",
    "ctrl+c": "Control+c",
    "ctrl+v": "Control+v",
    "ctrl+x": "Control+x",
    "ctrl+z": "Control+z",
    "ctrl+shift+a": "Control+Shift+a",
    "super": "Meta",
    "Page_Down": "PageDown",
    "Page_Up": "PageUp",
    "End": "End",
    "Home": "Home",
    "Left": "ArrowLeft",
    "Right": "ArrowRight",
    "Up": "ArrowUp",
    "Down": "ArrowDown",
}


# ─── Agent ────────────────────────────────────────────────────────────────────

class FiverrAgent:
    def __init__(self, api_key: str, headless: bool = True, config_path: str = "config.json"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.headless = headless
        self.page: Page | None = None
        self.browser: Browser | None = None
        self.config = self._load_config(config_path)

    def _load_config(self, path: str) -> dict:
        full_path = os.path.join(os.path.dirname(__file__), path)
        if os.path.exists(full_path):
            with open(full_path) as f:
                return json.load(f)
        return {}

    async def screenshot(self) -> str:
        """Return a base64-encoded PNG of the current viewport."""
        data = await self.page.screenshot(full_page=False)
        return base64.standard_b64encode(data).decode("utf-8")

    async def execute_action(self, tool_input: dict[str, Any]) -> str | None:
        """Execute a computer-use action; return base64 screenshot when needed."""
        action = tool_input.get("action", "")

        if action == "screenshot":
            return await self.screenshot()

        if action == "left_click":
            x, y = tool_input["coordinate"]
            await self.page.mouse.click(x, y)
            await asyncio.sleep(0.6)

        elif action == "right_click":
            x, y = tool_input["coordinate"]
            await self.page.mouse.click(x, y, button="right")
            await asyncio.sleep(0.4)

        elif action == "double_click":
            x, y = tool_input["coordinate"]
            await self.page.mouse.dblclick(x, y)
            await asyncio.sleep(0.4)

        elif action == "middle_click":
            x, y = tool_input["coordinate"]
            await self.page.mouse.click(x, y, button="middle")
            await asyncio.sleep(0.4)

        elif action == "mouse_move":
            x, y = tool_input["coordinate"]
            await self.page.mouse.move(x, y)

        elif action == "left_click_drag":
            sx, sy = tool_input["start_coordinate"]
            ex, ey = tool_input["coordinate"]
            await self.page.mouse.move(sx, sy)
            await self.page.mouse.down()
            await asyncio.sleep(0.1)
            await self.page.mouse.move(ex, ey, steps=10)
            await self.page.mouse.up()
            await asyncio.sleep(0.4)

        elif action == "type":
            await self.page.keyboard.type(tool_input["text"], delay=25)

        elif action == "key":
            raw = tool_input["text"]
            key = KEY_MAP.get(raw, raw)
            await self.page.keyboard.press(key)
            await asyncio.sleep(0.2)

        elif action == "scroll":
            x, y = tool_input["coordinate"]
            direction = tool_input.get("direction", "down")
            amount = int(tool_input.get("amount", 3))
            await self.page.mouse.move(x, y)
            delta_y = -amount * 120 if direction == "up" else amount * 120
            await self.page.mouse.wheel(delta_x=0, delta_y=delta_y)
            await asyncio.sleep(0.4)

        elif action == "cursor_position":
            return json.dumps({"x": 0, "y": 0})

        # After every non-screenshot action, return a fresh screenshot
        await asyncio.sleep(0.5)
        return await self.screenshot()

    def _build_tool_result(self, tool_use_id: str, screenshot_b64: str) -> dict:
        return {
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": screenshot_b64,
                    },
                }
            ],
        }

    async def run(self, task: str) -> str:
        """Run an agentic loop until the task is complete or max steps reached."""
        async with async_playwright() as playwright:
            self.browser = await playwright.chromium.launch(
                headless=self.headless,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
            )
            context = await self.browser.new_context(
                viewport={"width": SCREEN_WIDTH, "height": SCREEN_HEIGHT},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
            )
            self.page = await context.new_page()

            print("Opening Fiverr…")
            await self.page.goto("https://www.fiverr.com", wait_until="domcontentloaded", timeout=30_000)
            await asyncio.sleep(2)

            initial_screenshot = await self.screenshot()

            # Build initial context for Claude, injecting seller profile if configured
            seller_context = ""
            if self.config.get("seller"):
                s = self.config["seller"]
                seller_context = (
                    f"\n\nSeller profile:\n"
                    f"  Username : {s.get('username', 'N/A')}\n"
                    f"  Skills   : {', '.join(s.get('skills', []))}\n"
                    f"  Services : {', '.join(s.get('services', []))}\n"
                    f"  Min price: ${s.get('min_price_usd', 0)}\n"
                    f"  Max price: ${s.get('max_price_usd', 0)}\n"
                    f"  Delivery : {s.get('delivery_days', 3)} days\n"
                )
                if self.config.get("offer_template"):
                    seller_context += f"\nOffer template:\n{self.config['offer_template']}\n"

            messages: list[dict] = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Task: {task}{seller_context}\n\n"
                                "Here is the current state of the browser:"
                            ),
                        },
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": initial_screenshot,
                            },
                        },
                    ],
                }
            ]

            tools = [
                {
                    "type": "computer_20250124",
                    "name": "computer",
                    "display_width_px": SCREEN_WIDTH,
                    "display_height_px": SCREEN_HEIGHT,
                }
            ]

            print(f"\nTask: {task}\n{'─' * 60}")

            for step in range(1, MAX_STEPS + 1):
                response = self.client.beta.messages.create(
                    model=MODEL,
                    max_tokens=4096,
                    system=SYSTEM_PROMPT,
                    tools=tools,
                    messages=messages,
                    betas=["computer-use-2025-01-24"],
                )

                print(f"\n[step {step}] stop_reason={response.stop_reason}")

                tool_uses = []
                final_texts = []

                for block in response.content:
                    if hasattr(block, "text") and block.text:
                        final_texts.append(block.text)
                        print(f"  Claude: {block.text[:200]}")
                    elif getattr(block, "type", None) == "tool_use":
                        act = block.input.get("action", "?")
                        coord = block.input.get("coordinate", "")
                        txt = block.input.get("text", "")
                        print(f"  Action: {act} {coord or txt}")
                        tool_uses.append(block)

                # Append assistant turn
                messages.append({"role": "assistant", "content": response.content})

                # Task complete when Claude stops using tools
                if response.stop_reason == "end_turn" and not tool_uses:
                    result = "\n".join(final_texts) or "Task completed."
                    print(f"\n{'─' * 60}\nDone: {result}")
                    return result

                # Execute each tool call and collect results
                tool_results = []
                for tool_use in tool_uses:
                    screenshot_b64 = await self.execute_action(tool_use.input)
                    if screenshot_b64:
                        tool_results.append(
                            self._build_tool_result(tool_use.id, screenshot_b64)
                        )
                    else:
                        tool_results.append(
                            {"type": "tool_result", "tool_use_id": tool_use.id, "content": "Action executed."}
                        )

                if tool_results:
                    messages.append({"role": "user", "content": tool_results})

            return "Max steps reached without completing the task."


# ─── Entry point ──────────────────────────────────────────────────────────────

async def main() -> None:
    # Load .env if present
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY is not set.")
        print("  Set it in agent/.env or export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    args = sys.argv[1:]
    headless = "--headless" in args
    args = [a for a in args if a != "--headless"]

    if args:
        task = " ".join(args)
    else:
        print("\nFiverr AI Agent  —  powered by Claude Computer Use")
        print("=" * 55)
        print("\nExample tasks:")
        print('  "Log in with email user@example.com password mypass"')
        print('  "Browse buyer requests for web design jobs, send 3 offers"')
        print('  "Check my inbox and reply professionally to all unread messages"')
        print('  "Update my Logo Design gig: set price to $25, 2-day delivery"\n')
        task = input("Enter task: ").strip()
        if not task:
            print("No task entered. Exiting.")
            sys.exit(0)

    agent = FiverrAgent(api_key=api_key, headless=headless)
    result = await agent.run(task)
    print(f"\nResult:\n{result}")


if __name__ == "__main__":
    asyncio.run(main())
