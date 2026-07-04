"""
Layout snapshot / invariant tests for the Passenger app (/passageiro/app).

Goals:
- Capture screenshots at several mobile viewports (including simulated
  keyboard-open heights) so regressions are reviewable.
- Assert two hard invariants on the MovviSheet:
    1. On initial snap, the destination input is visible without dragging.
    2. When a sticky footer/CTA exists, no scrollable content bottom overlaps
       the CTA's top edge after scrolling to the end (i.e. paddingBottom is
       large enough that cards/text never sit behind the fixed button).

This test only exercises the `selecting_destination` stage — the only stage
reachable without a working Google Maps key in the sandbox. Later stages
(route_preview, selecting_category, confirming_request, searching_driver)
must be validated on a real preview device with Maps enabled.

Run:
    python3 tests/e2e/passenger-layout.e2e.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
OUT = Path("/tmp/browser/passenger-layout")
OUT.mkdir(parents=True, exist_ok=True)

# (width, height, label). Heights suffixed with "_kb" simulate an open
# on-screen keyboard by reducing the visible viewport height ~45%.
VIEWPORTS = [
    (360, 740, "360x740"),
    (360, 400, "360x740_kb"),   # 360x740 with keyboard open
    (390, 844, "390x844"),
    (390, 460, "390x844_kb"),
    (414, 896, "414x896"),
    (414, 500, "414x896_kb"),
]

STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

TOLERANCE_PX = 2  # allow sub-pixel overlap from anti-aliasing


class LayoutError(AssertionError):
    pass


async def restore_session(context, page):
    if COOKIES_JSON:
        cookies = json.loads(COOKIES_JSON)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    if STORAGE_KEY and SESSION_JSON:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(SESSION_JSON)})"
        )


async def check_destination_visible_initially(page, label: str):
    """Invariant 1: the destination input must be visible without dragging."""
    handle = await page.evaluate_handle(
        """() => {
            const inputs = document.querySelectorAll(
                'input[placeholder="Para onde vamos?"], input[placeholder="Para onde você vai?"]'
            );
            return inputs[0] || null;
        }"""
    )
    el = handle.as_element()
    if not el:
        raise LayoutError(f"[{label}] destination input not rendered")
    box = await el.bounding_box()
    if not box:
        raise LayoutError(f"[{label}] destination input has no bounding box")
    vh = await page.evaluate("window.innerHeight")
    if box["y"] < 0 or box["y"] + box["height"] > vh + TOLERANCE_PX:
        raise LayoutError(
            f"[{label}] destination input not fully in viewport: "
            f"y={box['y']:.1f} h={box['height']:.1f} vh={vh}"
        )


async def check_footer_does_not_cover_content(page, label: str):
    """Invariant 2: after scrolling scroll container to bottom, the last
    content element must sit above the sticky footer (i.e. paddingBottom
    inside MovviSheet is large enough)."""
    result = await page.evaluate(
        """() => {
            const scroller = document.querySelector('[data-scroll]');
            if (!scroller) return { skipped: 'no-scroller' };
            const sheet = scroller.parentElement;
            // footer is scroller's next sibling in MovviSheet
            const footer = scroller.nextElementSibling;
            if (!footer) return { skipped: 'no-footer' };

            // Scroll to bottom to expose the last content row
            scroller.scrollTop = scroller.scrollHeight;

            const footerRect = footer.getBoundingClientRect();

            // Find the deepest visible descendant of the scroller whose
            // bottom is closest to the footer top.
            let worst = null;
            const walk = (node) => {
                if (!(node instanceof Element)) return;
                if (node.children.length === 0) {
                    const r = node.getBoundingClientRect();
                    const style = window.getComputedStyle(node);
                    if (
                        r.width > 0 && r.height > 0 &&
                        style.visibility !== 'hidden' &&
                        style.display !== 'none' &&
                        (node.textContent || '').trim().length > 0
                    ) {
                        if (!worst || r.bottom > worst.bottom) {
                            worst = {
                                bottom: r.bottom,
                                top: r.top,
                                text: (node.textContent || '').trim().slice(0, 60),
                                tag: node.tagName,
                            };
                        }
                    }
                }
                for (const c of node.children) walk(c);
            };
            walk(scroller);

            return {
                footerTop: footerRect.top,
                footerHeight: footerRect.height,
                worst,
                scrollHeight: scroller.scrollHeight,
                clientHeight: scroller.clientHeight,
            };
        }"""
    )

    if result.get("skipped"):
        # No sticky footer on this stage — nothing to assert
        return
    footer_top = result["footerTop"]
    worst = result.get("worst")
    if not worst:
        return
    # Worst-case content bottom must be at or above the footer's top edge.
    if worst["bottom"] > footer_top + TOLERANCE_PX:
        raise LayoutError(
            f"[{label}] content overlaps sticky CTA: "
            f"content <{worst['tag']}> bottom={worst['bottom']:.1f} "
            f"(\"{worst['text']}\") vs footerTop={footer_top:.1f}"
        )


async def snapshot_state(page, label: str, name: str):
    await page.wait_for_timeout(250)
    await page.screenshot(path=str(OUT / f"{label}__{name}.png"))


async def run_viewport(browser, width: int, height: int, label: str) -> list[str]:
    errors: list[str] = []
    context = await browser.new_context(
        viewport={"width": width, "height": height},
        is_mobile=True,
        has_touch=True,
        geolocation={"latitude": -23.55, "longitude": -46.63},
        permissions=["geolocation"],
    )
    page = await context.new_page()
    try:
        await restore_session(context, page)
        await page.goto(f"{BASE}/passageiro/app", wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_selector('[data-scroll]', timeout=15000)
        await page.wait_for_timeout(1500)  # let sheet settle to initial snap
        await snapshot_state(page, label, "1_initial")

        # Only assert initial visibility on natural viewports. The "_kb"
        # variants simulate the keyboard already open on first paint — a
        # state the real app never boots into (keyboard opens only after
        # focusing an input, which triggers the auto-expand snap).
        if not label.endswith("_kb"):
            try:
                await check_destination_visible_initially(page, label)
            except LayoutError as e:
                errors.append(str(e))


        # Focus destination to trigger expanded snap + keyboard-aware behavior
        try:
            inp = page.locator(
                'input[placeholder="Para onde vamos?"], input[placeholder="Para onde você vai?"]'
            ).first
            await inp.click(timeout=3000)
            await inp.fill("Av Paulista 1000")
            await page.wait_for_timeout(1200)
            await snapshot_state(page, label, "2_focused")
        except Exception as e:
            errors.append(f"[{label}] could not focus destination: {e}")

        # Assert CTA/footer does not cover content
        try:
            await check_footer_does_not_cover_content(page, label)
        except LayoutError as e:
            errors.append(str(e))

        await snapshot_state(page, label, "3_final")
    finally:
        await context.close()
    return errors


async def main() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        all_errors: list[str] = []
        for w, h, label in VIEWPORTS:
            print(f"→ {label} ({w}x{h})")
            errs = await run_viewport(browser, w, h, label)
            if errs:
                for e in errs:
                    print(f"  FAIL {e}")
                all_errors.extend(errs)
            else:
                print("  OK")
        await browser.close()

    print("\nScreenshots:", OUT)
    if all_errors:
        print(f"\n{len(all_errors)} layout invariant failures:")
        for e in all_errors:
            print(" -", e)
        return 1
    print("\nAll layout invariants passed.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
