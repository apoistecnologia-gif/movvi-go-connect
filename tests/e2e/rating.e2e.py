"""
E2E Playwright tests for RatingScreen flow (passenger + driver).
Covers: star selection, submission, navigation after completion,
error recovery, and protection against duplicate submission.

Targets the in-app harness route /dev/rating-test which mirrors the
real RatingScreen UI but stubs backend calls so tests can run without
auth/GPS/ride state.
"""
import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
SCREENSHOTS = Path("/tmp/browser/rating-e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


async def run_side(page, side: str, *, mode: str = "ok") -> None:
    url = f"{BASE}/dev/rating-test?side={side}&mode={mode}"
    await page.goto(url, wait_until="networkidle")
    await page.wait_for_selector(f'[data-testid="rating-{side}"]', timeout=15000)
    await expect(page.get_by_test_id(f"rating-{side}")).to_be_visible()

    # Default 5 stars; pick 4 stars
    await page.get_by_test_id("star-4").click()
    await page.get_by_test_id("comment-input").fill("Ótima corrida!")
    await page.screenshot(path=str(SCREENSHOTS / f"{side}-{mode}-1.png"))

    if mode == "fail":
        # First click fails
        await page.get_by_test_id("submit-button").click()
        await expect(page.get_by_test_id("rating-error")).to_be_visible()
        await expect(page.get_by_test_id("submit-button")).to_have_text("Tentar novamente")
        await page.screenshot(path=str(SCREENSHOTS / f"{side}-{mode}-2-error.png"))
        # Retry succeeds
        await page.get_by_test_id("submit-button").click()
    else:
        await page.get_by_test_id("submit-button").click()

    # Confirmation screen
    await expect(page.get_by_test_id("rating-confirmation")).to_be_visible()
    await page.screenshot(path=str(SCREENSHOTS / f"{side}-{mode}-3-confirmation.png"))

    # Finish navigates home
    async with page.expect_navigation(wait_until="domcontentloaded"):
        await page.get_by_test_id("finish-button").click()
    assert page.url.rstrip("/") == BASE.rstrip("/"), f"expected home, got {page.url}"


async def double_click_test(page) -> None:
    """Ensure double clicking submit only triggers ONE submission."""
    await page.goto(f"{BASE}/dev/rating-test?side=passenger", wait_until="networkidle")
    await page.wait_for_selector('[data-testid="rating-passenger"]', timeout=15000)
    await page.get_by_test_id("star-3").click()
    btn = page.get_by_test_id("submit-button")
    # Fire two clicks rapidly
    await btn.click()
    try:
        await btn.click(timeout=200)
    except Exception:
        pass
    await expect(page.get_by_test_id("rating-confirmation")).to_be_visible()
    count = await page.get_by_test_id("submit-count").inner_text()
    assert count == "1", f"expected 1 submission, got {count}"


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        page.on("pageerror", lambda e: print(f"[pageerror] {e}"))

        failures = []
        for case in [
            ("passenger ok", lambda: run_side(page, "passenger", mode="ok")),
            ("driver ok",    lambda: run_side(page, "driver",    mode="ok")),
            ("passenger fail+retry", lambda: run_side(page, "passenger", mode="fail")),
            ("driver fail+retry",    lambda: run_side(page, "driver",    mode="fail")),
            ("double click guard",   lambda: double_click_test(page)),
        ]:
            name, fn = case
            try:
                await fn()
                print(f"PASS  {name}")
            except Exception as e:
                print(f"FAIL  {name}: {e}")
                failures.append(name)

        await browser.close()
        return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
