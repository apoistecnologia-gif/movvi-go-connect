"""
Contrast invariant tests for the Passenger app (/passageiro/app).

Walks visible text-bearing elements inside the MovviSheet (cards, address
suggestions, headings, muted labels) and computes the WCAG contrast ratio
of each element's computed color against its effective background (walking
up ancestors when the background is transparent).

Fails when contrast drops below WCAG AA:
  - 4.5:1 for normal text
  - 3.0:1 for large text (>= 24px, or >= 18.66px bold)

For every failure, the offending element is outlined in magenta and a
screenshot is captured under /tmp/browser/passenger-contrast/ so the
regression is visually inspectable.

Run:
    python3 tests/e2e/passenger-contrast.e2e.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
OUT = Path("/tmp/browser/passenger-contrast")
OUT.mkdir(parents=True, exist_ok=True)

STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

VIEWPORTS = [
    (360, 740, "360x740"),
    (390, 844, "390x844"),
]

# WCAG AA thresholds
AA_NORMAL = 4.5
AA_LARGE = 3.0


# JS injected into the page. Enumerates visible text-bearing elements
# inside the sheet, resolves each to an effective background color
# (walking ancestors for the first non-transparent bg), and returns the
# ones that fail WCAG AA. It only checks elements that render actual text
# (own text nodes with non-empty content) to avoid double-counting parents.
FIND_LOW_CONTRAST_JS = r"""
() => {
  const parseColor = (str) => {
    // Handles rgb(a) and 'transparent'
    if (!str || str === 'transparent') return null;
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    const [r, g, b, a] = [parts[0], parts[1], parts[2], parts[3] ?? 1];
    return { r, g, b, a };
  };
  const overOpaque = (fg, bg) => {
    // Composite fg over bg using fg.a (bg assumed opaque here)
    const a = fg.a;
    return {
      r: Math.round(fg.r * a + bg.r * (1 - a)),
      g: Math.round(fg.g * a + bg.g * (1 - a)),
      b: Math.round(fg.b * a + bg.b * (1 - a)),
      a: 1,
    };
  };
  const relLum = ({ r, g, b }) => {
    const chan = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const contrast = (a, b) => {
    const L1 = relLum(a), L2 = relLum(b);
    const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
    return (hi + 0.05) / (lo + 0.05);
  };
  const effectiveBg = (el) => {
    // Point-sample the stack at the element's center. elementsFromPoint
    // returns front-to-back; we scan back-to-front looking for the first
    // ancestor/underlay with an opaque background-color OR background-image
    // (gradients count as opaque for contrast purposes).
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let stack = document.elementsFromPoint(cx, cy) || [];
    // Filter to ancestors + the element itself so overlays that don't
    // actually sit behind the text don't skew the result.
    stack = stack.filter(n => n === el || n.contains(el) || el.contains(n));
    // Walk furthest-back first (stack is front-to-back → reverse)
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i];
      const s = getComputedStyle(node);
      const bgc = parseColor(s.backgroundColor);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        // Approximate gradient by falling back to the underlying bg color
        // of this same node, then defaulting to body bg.
        if (bgc && bgc.a >= 0.999) return bgc;
      }
      if (bgc && bgc.a >= 0.999) return bgc;
    }
    return parseColor(getComputedStyle(document.body).backgroundColor)
        || { r: 255, g: 255, b: 255, a: 1 };
  };

  const hasOwnText = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0) return true;
    }
    return false;
  };
  const roots = [
    document.querySelector('[data-scroll]'),   // MovviSheet scroller
    document.body,                              // full page fallback
  ].filter(Boolean);
  const seen = new Set();
  const failures = [];
  const AA_NORMAL = 4.5, AA_LARGE = 3.0;
  const walk = (node) => {
    if (!(node instanceof Element)) return;
    if (seen.has(node)) return;
    seen.add(node);
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      for (const c of node.children) walk(c);
      return;
    }
    if (hasOwnText(node)) {
      const fg = parseColor(style.color);
      if (fg) {
        const bg = effectiveBg(node);
        const composed = fg.a < 0.999 ? overOpaque(fg, bg) : fg;
        const ratio = contrast(composed, bg);
        const px = parseFloat(style.fontSize);
        const weight = parseInt(style.fontWeight, 10) || 400;
        const large = px >= 24 || (px >= 18.66 && weight >= 700);
        const threshold = large ? AA_LARGE : AA_NORMAL;
        if (ratio < threshold) {
          failures.push({
            selector: (() => {
              const path = [];
              let n = node;
              while (n && n !== document.body && path.length < 4) {
                let seg = n.tagName.toLowerCase();
                if (n.id) seg += '#' + n.id;
                else if (n.className && typeof n.className === 'string') {
                  const cls = n.className.trim().split(/\s+/).slice(0, 2).join('.');
                  if (cls) seg += '.' + cls;
                }
                path.unshift(seg);
                n = n.parentElement;
              }
              return path.join(' > ');
            })(),
            text: (node.textContent || '').trim().slice(0, 80),
            color: style.color,
            bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
            ratio: Math.round(ratio * 100) / 100,
            threshold,
            fontSize: px,
            fontWeight: weight,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          });
        }
      }
    }
    for (const c of node.children) walk(c);
  };
  roots.forEach(walk);
  return failures;
}
"""


HIGHLIGHT_JS = r"""
(rects) => {
  document.querySelectorAll('[data-contrast-highlight]').forEach(n => n.remove());
  for (const r of rects) {
    const div = document.createElement('div');
    div.setAttribute('data-contrast-highlight', '1');
    Object.assign(div.style, {
      position: 'fixed',
      left: r.x + 'px', top: r.y + 'px',
      width: r.w + 'px', height: r.h + 'px',
      outline: '2px solid magenta',
      background: 'rgba(255, 0, 255, 0.12)',
      pointerEvents: 'none',
      zIndex: '2147483647',
    });
    document.body.appendChild(div);
  }
}
"""

CLEAR_HIGHLIGHT_JS = "() => document.querySelectorAll('[data-contrast-highlight]').forEach(n => n.remove())"


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


async def audit_state(page, label: str, state: str) -> list[dict]:
    failures = await page.evaluate(FIND_LOW_CONTRAST_JS)
    await page.screenshot(path=str(OUT / f"{label}__{state}__plain.png"))
    if failures:
        await page.evaluate(HIGHLIGHT_JS, [f["rect"] for f in failures])
        await page.wait_for_timeout(150)
        await page.screenshot(path=str(OUT / f"{label}__{state}__FAIL.png"))
        await page.evaluate(CLEAR_HIGHLIGHT_JS)
    return failures


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
        await page.wait_for_timeout(1500)

        # State A: initial (sheet at first snap, destination input visible)
        fails_a = await audit_state(page, label, "1_initial")
        for f in fails_a:
            errors.append(
                f"[{label}/initial] ratio={f['ratio']} < {f['threshold']} "
                f"color={f['color']} bg={f['bg']} "
                f"<{f['selector']}> \"{f['text']}\""
            )

        # State B: focused destination — expands sheet, exposes suggestions card
        try:
            inp = page.locator(
                'input[placeholder="Para onde vamos?"], input[placeholder="Para onde você vai?"]'
            ).first
            await inp.click(timeout=3000)
            await inp.fill("Av Paulista 1000")
            await page.wait_for_timeout(1400)
        except Exception as e:
            errors.append(f"[{label}] could not focus destination: {e}")

        fails_b = await audit_state(page, label, "2_focused")
        for f in fails_b:
            errors.append(
                f"[{label}/focused] ratio={f['ratio']} < {f['threshold']} "
                f"color={f['color']} bg={f['bg']} "
                f"<{f['selector']}> \"{f['text']}\""
            )
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
                    print("  FAIL", e)
                all_errors.extend(errs)
            else:
                print("  OK")
        await browser.close()

    print("\nScreenshots:", OUT)
    if all_errors:
        print(f"\n{len(all_errors)} contrast failures (see *__FAIL.png).")
        return 1
    print("\nAll contrast invariants passed.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
