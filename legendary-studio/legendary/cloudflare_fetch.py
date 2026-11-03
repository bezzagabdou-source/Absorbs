"""Browser-grade fetch for CDN links protected by Cloudflare's JS challenge.

Two strategies, cheapest first:
  1. curl_cffi — impersonates Chrome's TLS/HTTP2 fingerprint (passive checks).
  2. Playwright Chromium — actually solves the "Just a moment…" challenge,
     then re-issues the MP4 request with the cf_clearance cookie.

Exit 0 only when a real MP4 (ftyp box) was saved.
"""
from __future__ import annotations

import asyncio
import os
import sys

URL = os.environ.get("SOURCE_URL", "")
OUT = os.environ.get("SOURCE_OUT", "legendary-studio/out/source_url.mp4")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "video/mp4,application/octet-stream,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.image2url.com/",
    "Origin": "https://www.image2url.com",
    "Sec-Fetch-Dest": "video",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "same-origin",
}


def save(body: bytes) -> bool:
    if len(body) < 10000 or b"ftyp" not in body[:16]:
        return False
    os.makedirs(os.path.dirname(os.path.abspath(OUT)) or ".", exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(body)
    print(f"✅ saved {len(body)} bytes → {OUT}", flush=True)
    return True


def try_curl_cffi() -> bool:
    try:
        from curl_cffi import requests  # noqa: PLC0415
    except ImportError:
        print("curl_cffi unavailable", flush=True)
        return False
    for imp in ("chrome124", "chrome123", "chrome", "safari17_0"):
        try:
            r = requests.get(URL, impersonate=imp, headers=HEADERS, timeout=60)
            body = r.content
            print(f"curl_cffi[{imp}] → {r.status_code} · "
                  f"{r.headers.get('content-type')} · {len(body)} bytes · {body[:12]!r}",
                  flush=True)
            if r.status_code == 200 and save(body):
                return True
        except Exception as exc:
            print(f"curl_cffi[{imp}] error: {str(exc)[:180]}", flush=True)
    return False


async def _playwright() -> bool:
    try:
        from playwright.async_api import async_playwright  # noqa: PLC0415
    except ImportError:
        print("playwright unavailable", flush=True)
        return False
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage",
                      "--disable-blink-features=AutomationControlled",
                      "--disable-features=IsolateOrigins,site-per-process"],
            )
            ctx = await browser.new_context(user_agent=UA, locale="en-US",
                                            viewport={"width": 1280, "height": 800})
            await ctx.add_init_script(
                "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
            )
            page = await ctx.new_page()
            try:
                await page.goto("https://www.image2url.com/",
                                wait_until="domcontentloaded", timeout=60000)
            except Exception as exc:
                print("homepage goto:", str(exc)[:160], flush=True)
            for i in range(20):
                await page.wait_for_timeout(1500)
                title = (await page.title()) or ""
                print(f"  challenge tick {i}: {title[:70]}", flush=True)
                if "just a moment" not in title.lower() and "attention" not in title.lower():
                    break
            cookies = await ctx.cookies()
            print("cookies:", [c["name"] for c in cookies], flush=True)
            try:
                r = await ctx.request.get(URL, headers={"Referer": HEADERS["Referer"]},
                                          timeout=120000)
                body = await r.body()
                print(f"playwright request → {r.status} · "
                      f"{r.headers.get('content-type')} · {len(body)} bytes · {body[:12]!r}",
                      flush=True)
                if r.status == 200 and save(body):
                    await browser.close()
                    return True
            except Exception as exc:
                print("playwright request error:", str(exc)[:200], flush=True)
            await browser.close()
    except Exception as exc:
        print("playwright error:", str(exc)[:250], flush=True)
    return False


def main() -> int:
    if not URL:
        print("SOURCE_URL missing", flush=True)
        return 1
    if try_curl_cffi():
        return 0
    print("→ falling back to headless Chromium challenge solver", flush=True)
    if asyncio.run(_playwright()):
        return 0
    print("❌ all browser-grade strategies failed (Cloudflare challenge not solved)", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
