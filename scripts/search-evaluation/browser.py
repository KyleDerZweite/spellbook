"""Real Chromium keyboard checks. Run with uvx --from playwright==1.64.1 python."""

import asyncio
import json
import time
from pathlib import Path

from playwright.async_api import Error, async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / ".local/search-evaluation"
ORIGIN = "http://localhost:5173"


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = {"checks": [], "errors": [], "timings": {}}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        evidence["browser"] = browser.version
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800}, service_workers="block"
        )
        page = await context.new_page()
        page.on("pageerror", lambda error: evidence["errors"].append(str(error)))
        try:
            await page.goto(ORIGIN + "/__search-evaluation")
            await page.locator('[data-evaluation-ready="true"]').wait_for()
            variant = page.get_by_label("Search variant")
            await variant.select_option("lexical")
            await variant.focus()
            await page.keyboard.press("Control+k")
            dialog = page.get_by_role("dialog", name="Power-user search")
            field = page.get_by_role("combobox", name="Power-user search")
            await expect(dialog).to_be_visible()
            await expect(field).to_be_focused()
            evidence["checks"].append(
                "Ctrl+K opens exactly one dialog and focuses the input"
            )
            assert await page.get_by_role("dialog").count() == 1

            started = time.perf_counter()
            await field.fill("sol ri")
            await expect(page.locator(".evaluation-result").first).to_contain_text(
                "Sol Ring"
            )
            evidence["timings"]["lexical_completion_ms"] = (
                time.perf_counter() - started
            ) * 1000
            selected = await field.get_attribute("aria-activedescendant")
            await page.keyboard.press("ArrowDown")
            assert await field.get_attribute("aria-activedescendant") != selected
            await page.keyboard.press("ArrowUp")
            await page.keyboard.press("Enter")
            await page.wait_for_url("**/mtg/search?**")
            await expect(page.locator("main")).to_contain_text("Sol Ring")
            evidence["checks"].append(
                "Arrow selection and Enter open the actual public card destination"
            )
            await page.go_back()
            await page.locator('[data-evaluation-ready="true"]').wait_for()
            await variant.focus()
            await page.keyboard.press("Control+k")
            await expect(field).to_have_value("sol ri")
            await page.keyboard.press("Escape")
            await expect(dialog).to_be_hidden()
            await expect(variant).to_be_focused()
            evidence["checks"].append(
                "Back restores the query; Escape restores prior focus"
            )

            await page.keyboard.press("Meta+k")
            await expect(dialog).to_be_visible()
            evidence["checks"].append("Cmd+K uses the same dialog")
            await field.fill("zzqxvnl")
            await expect(page.locator(".evaluation-empty")).to_have_text("No matches")
            evidence["checks"].append("Lexical no-match state is explicit")

            completed = asyncio.Event()

            async def slow_response(route):
                response = await route.fetch()
                await asyncio.sleep(0.7)
                await route.fulfill(response=response)
                completed.set()

            await page.route("**/__search-evaluation/query", slow_response)
            started = time.perf_counter()
            await field.fill("passw")
            await expect(page.locator(".evaluation-result").first).to_contain_text(
                "Password"
            )
            evidence["timings"]["static_suggestion_ms"] = (
                time.perf_counter() - started
            ) * 1000
            assert not completed.is_set()
            await completed.wait()
            await page.unroute("**/__search-evaluation/query", slow_response)
            evidence["checks"].append(
                "Static navigation appears before a deliberately delayed real provider response"
            )

            old_started = asyncio.Event()
            release = asyncio.Event()

            async def stale_response(route):
                if route.request.post_data_json["query"] == "sol ri":
                    response = await route.fetch()
                    old_started.set()
                    await release.wait()
                    try:
                        await route.fulfill(response=response)
                    except Error:
                        # Browser cancellation is also a valid stale-request outcome.
                        pass
                else:
                    await route.continue_()

            await page.route("**/__search-evaluation/query", stale_response)
            await field.fill("sol ri")
            await asyncio.wait_for(old_started.wait(), timeout=10)
            await field.fill("passw")
            await expect(page.locator(".evaluation-result").first).to_contain_text(
                "Password"
            )
            release.set()
            await page.unroute("**/__search-evaluation/query", stale_response)
            await expect(page.locator(".evaluation-result").first).to_contain_text(
                "Password"
            )
            evidence["checks"].append(
                "An older held response cannot replace the current query results"
            )

            async def unavailable(route):
                await route.abort("failed")

            await page.route("**/__search-evaluation/query", unavailable)
            await field.fill("pass")
            await expect(page.locator(".evaluation-status")).to_contain_text(
                "Search unavailable"
            )
            await expect(page.locator(".evaluation-result").first).to_contain_text(
                "Password"
            )
            await page.unroute("**/__search-evaluation/query", unavailable)
            evidence["checks"].append(
                "Provider failure preserves usable local navigation matches"
            )

            await field.dispatch_event(
                "keydown", {"key": "Enter", "isComposing": True, "bubbles": True}
            )
            await expect(dialog).to_be_visible()
            evidence["checks"].append(
                "A simulated composing Enter does not activate a result"
            )
            await field.fill("sol ri")
            await expect(page.locator(".evaluation-result").first).to_contain_text(
                "Sol Ring"
            )
            await page.screenshot(path=str(OUT / "desktop.png"))
            await page.set_viewport_size({"width": 390, "height": 844})
            await expect(field).to_be_focused()
            assert await page.evaluate(
                "document.documentElement.scrollWidth <= innerWidth"
            )
            box = await dialog.bounding_box()
            assert box and box["x"] >= 0 and box["x"] + box["width"] <= 390
            await page.screenshot(path=str(OUT / "mobile.png"))
            evidence["checks"].append(
                "The same keyboard dialog fits 1280px and 390px layouts without horizontal overflow"
            )
            await page.set_viewport_size({"width": 1280, "height": 800})
            evidence["variant_walkthroughs"] = []
            for mode in [
                "baseline",
                "lexical",
                "lexical-scan",
                "bm25",
                "vector",
                "hybrid",
                "vector-ann",
                "hybrid-ann",
            ]:
                await page.keyboard.press("Escape")
                await variant.select_option(mode)
                await variant.focus()
                await page.keyboard.press("Control+k")
                await expect(field).to_be_focused()
                for query in ["sol ri", "zerstöre alle kreaturen"]:
                    await field.fill("")
                    await expect(field).to_have_value("")

                    def matching(response, query=query, mode=mode):
                        return response.url.endswith(
                            "/__search-evaluation/query"
                        ) and response.request.post_data_json == {
                            "query": query,
                            "variant": mode,
                        }

                    started = time.perf_counter()
                    async with page.expect_response(matching) as pending:
                        await field.fill(query)
                    response = await pending.value
                    assert response.ok
                    payload = await response.json()
                    await expect(page.locator("[data-command-list]")).to_have_attribute(
                        "aria-busy", "false"
                    )
                    if payload["results"]:
                        await expect(
                            page.locator(".evaluation-result").first
                        ).to_contain_text(payload["results"][0]["name"])
                    else:
                        await expect(page.locator(".evaluation-empty")).to_have_text(
                            "No matches"
                        )
                    evidence["variant_walkthroughs"].append(
                        {
                            "variant": mode,
                            "query": query,
                            "visible_ms": (time.perf_counter() - started) * 1000,
                            "inference_ms": payload["inference_ms"],
                            "retrieval_ms": payload["retrieval_ms"],
                            "cache_hit": payload["cache_hit"],
                            "top5": [row["name"] for row in payload["results"][:5]],
                        }
                    )
            evidence["checks"].append(
                "All eight real providers render both completion and German-description responses in the same keyboard menu"
            )
            await page.keyboard.press("Escape")
            await variant.select_option("lexical")
            await variant.focus()
            await page.keyboard.press("Control+k")
            await field.fill("decks containing Sol Ring")
            await expect(page.locator(".evaluation-result").first).to_contain_text(
                "Elven Expedition"
            )
            await page.keyboard.press("Enter")
            await page.wait_for_url("**/auth/login?**")
            await page.get_by_label("Username", exact=True).fill("demo")
            await page.get_by_label("Password", exact=True).fill("demo")
            await page.get_by_role("button", name="Sign in", exact=True).click()
            await page.wait_for_url("**/mtg/decks?deck=**")
            await expect(page.locator("main")).to_contain_text("Elven Expedition")
            await expect(page.locator("main")).to_contain_text("Sol Ring")
            evidence["checks"].append(
                "Deck membership result survives real login and opens the actual seeded Deck"
            )
            await page.goto(ORIGIN + "/__search-evaluation")
            await page.locator('[data-evaluation-ready="true"]').wait_for()
            await page.keyboard.press("Control+k")
            await field.fill("passwort ändern")
            await expect(page.locator(".evaluation-result").first).to_contain_text(
                "Password"
            )
            await page.keyboard.press("Enter")
            await page.wait_for_url("**/settings/password")
            await expect(
                page.get_by_label("Current password", exact=True)
            ).to_be_visible()
            evidence["checks"].append(
                "German Settings alias opens the actual authenticated password page without mutation"
            )
            assert not evidence["errors"], evidence["errors"]
            evidence["status"] = "passed"
        except BaseException:
            evidence["status"] = "failed"
            await page.screenshot(path=str(OUT / "browser-failure.png"))
            raise
        finally:
            (OUT / "browser.json").write_text(json.dumps(evidence, indent=2) + "\n")
            await browser.close()
    print(json.dumps(evidence))


if __name__ == "__main__":
    asyncio.run(main())
