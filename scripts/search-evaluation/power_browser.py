"""Actual global palette journeys against the owned Demo web/API, with Chromium."""

import asyncio
import json
import os
import time
from pathlib import Path

from playwright.async_api import Error, async_playwright, expect

OUT = Path(__file__).resolve().parents[2] / ".local/search-evaluation"
ORIGIN = os.environ.get("POWER_SEARCH_BROWSER_ORIGIN", "http://localhost:5173")


async def main():
    evidence = {"origin": ORIGIN, "checks": [], "errors": [], "timings": {}}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            color_scheme="dark",
            service_workers="block",
        )
        page = await context.new_page()
        page.on("pageerror", lambda error: evidence["errors"].append(str(error)))
        dialog = page.get_by_role("dialog", name="Power-user search", exact=True)
        field = page.get_by_role("combobox", name="Power-user search", exact=True)
        results = page.locator(".power-search-result")

        async def visit(path="/"):
            await page.goto(ORIGIN + path)
            await page.locator('[data-global-search-ready="true"]').wait_for()

        async def search(query):
            await page.keyboard.press("Control+k")
            await expect(field).to_be_focused()
            await field.fill(query)

        try:
            await visit()
            nav = page.locator('.primary-nav a[aria-label="Search"]')
            await nav.focus()
            await search("")
            assert await page.get_by_role("dialog").count() == 1
            await dialog.screenshot(path=str(OUT / "power-dark-empty.png"))
            await page.keyboard.press("Escape")
            await expect(dialog).to_be_hidden()
            await expect(nav).to_be_focused()
            await page.keyboard.press("Meta+k")
            await expect(field).to_be_focused()
            evidence["checks"].append(
                "Global Ctrl/Cmd+K opens one palette; Escape restores focus"
            )

            await field.fill("Sol Ring")
            await expect(
                page.locator('.power-search-result[data-source="catalog"]').first
            ).to_contain_text("Sol Ring")
            assert (
                await page.locator(
                    '.power-search-result[data-source="inventory"], .power-search-result[data-source="deck-card"]'
                ).count()
                == 0
            )
            evidence["checks"].append(
                "Guest receives actual Catalog matches and no private contexts"
            )

            guest_catalog = page.locator(
                '.power-search-result[data-source="catalog"]'
            ).filter(has_text="Sol Ring")
            printing_href = await guest_catalog.get_attribute("href")
            await guest_catalog.click()
            await page.wait_for_url("**/mtg/search?**")
            card_dialog = page.get_by_role("dialog", name="Sol Ring", exact=True)
            await expect(card_dialog).to_be_visible()
            await expect(page.locator(".native-card-panel")).to_have_count(0)
            await expect(card_dialog.get_by_role("img").first).to_be_visible()
            await page.wait_for_function("""() => {
                const image = document.querySelector('[role="dialog"] img');
                return image?.complete && image.naturalWidth > 0;
            }""")
            await page.screenshot(path=str(OUT / "power-printing-desktop.png"))
            await page.keyboard.press("Escape")
            await expect(card_dialog).to_be_hidden()
            assert "printing=" not in page.url
            await expect(page.locator(".search-status")).to_be_focused()
            await search("Sol Ring")
            await expect(guest_catalog).to_be_visible()
            await guest_catalog.click()
            await expect(card_dialog).to_be_visible()
            await page.keyboard.press("Escape")
            await expect(card_dialog).to_be_hidden()
            assert printing_href
            await visit(printing_href)
            await expect(card_dialog).to_be_visible()
            await visit()
            await page.go_back()
            await expect(card_dialog).to_be_visible()
            await page.go_forward()
            await expect(card_dialog).to_be_hidden()
            await page.go_back()
            await expect(card_dialog).to_be_visible()
            await page.reload()
            await expect(card_dialog).to_be_visible()
            await page.set_viewport_size({"width": 390, "height": 844})
            bounds = await card_dialog.bounding_box()
            assert bounds and bounds["width"] <= 390 and bounds["x"] >= 0
            await page.screenshot(path=str(OUT / "power-printing-mobile.png"))
            await card_dialog.get_by_role("button", name="Close card detail").click()
            await expect(card_dialog).to_be_hidden()
            assert "printing=" not in page.url
            await page.set_viewport_size({"width": 1280, "height": 900})
            native_context = await browser.new_context(java_script_enabled=False)
            native_page = await native_context.new_page()
            await native_page.goto(ORIGIN + printing_href)
            await expect(native_page.get_by_role("region", name="Selected card")).to_contain_text(
                "Sol Ring"
            )
            await expect(native_page.get_by_role("link", name="Sign in to add cards")).to_be_visible()
            await native_context.close()
            await visit(printing_href + "&deckQuery=retained")
            await expect(page.get_by_role("region", name="Selected card")).to_contain_text("Sol Ring")
            await expect(card_dialog).to_be_hidden()
            for printing in ["bad", "00000000-0000-4000-8000-000000000000"]:
                await visit("/mtg/search?q=Sol+Ring&printing=" + printing)
                await expect(page.get_by_role("region", name="Selected card")).to_contain_text(
                    "Invalid printing selection" if printing == "bad" else "This printing is unavailable"
                )
                await expect(card_dialog).to_be_hidden()
            evidence["checks"].append(
                "Guest Quick Search opens the shared Card dialog; direct/reloaded/mobile links work, close clears the target and restores focus, native/error feedback remains available"
            )
            await search("Sol Ring")

            await field.fill("passwort ändern")
            await expect(results.first).to_contain_text("Password")
            await field.dispatch_event(
                "keydown", {"key": "Enter", "isComposing": True, "bubbles": True}
            )
            await expect(dialog).to_be_visible()
            await page.keyboard.press("Enter")
            await page.wait_for_url("**/auth/login?**")
            await page.get_by_label("Username", exact=True).fill("demo")
            await page.get_by_label("Password", exact=True).fill("demo")
            await page.get_by_role("button", name="Sign in", exact=True).click()
            await page.wait_for_url("**/settings/password")
            await expect(
                page.get_by_label("Current password", exact=True)
            ).to_be_visible()
            evidence["checks"].append(
                "Settings alias survives login return; composing Enter does not activate"
            )

            await visit()
            started = time.perf_counter()
            await search("Sol Ring")
            catalog = page.locator(
                '.power-search-result[data-source="catalog"]'
            ).filter(has_text="Sol Ring")
            inventory = page.locator(
                '.power-search-result[data-source="inventory"]'
            ).filter(has_text="Sol Ring")
            deck = page.locator('.power-search-result[data-source="deck-card"]').filter(
                has_text="Elven Expedition"
            )
            await expect(catalog).to_be_visible()
            await expect(inventory).to_be_visible()
            await expect(deck).to_be_visible()
            evidence["timings"]["three_contexts_visible_ms"] = (
                time.perf_counter() - started
            ) * 1000
            assert (
                len(
                    {
                        await row.get_attribute("href")
                        for row in [catalog, inventory, deck]
                    }
                )
                == 3
            )
            await dialog.screenshot(path=str(OUT / "power-dark-contexts.png"))
            evidence["checks"].append(
                "One real card has separate Catalog, owned Inventory and named Deck rows with distinct destinations"
            )

            await inventory.click()
            await page.wait_for_url("**/mtg/inventory?q=Sol+Ring")
            await expect(page.locator("main")).to_contain_text("Sol Ring")
            await search("Sol Ring")
            await expect(deck).to_be_visible()
            await deck.click()
            await page.wait_for_url("**/mtg/decks?deck=**")
            await expect(page.locator("main")).to_contain_text("Elven Expedition")
            await expect(page.locator("main")).to_contain_text("Sol Ring")
            await search("Sol Ring")
            await expect(catalog).to_be_visible()
            await catalog.click()
            await page.wait_for_url("**/mtg/search?**")
            assert "printing=" in page.url
            await expect(card_dialog).to_be_visible()
            await expect(page.locator(".native-card-panel")).to_have_count(0)
            await card_dialog.get_by_role("button", name="Close card detail").click()
            evidence["checks"].append(
                "All three actual destinations open their matching card/owned view/Deck"
            )

            await visit("/mtg/decks")
            await search("Elven Exp")
            await expect(
                page.locator('.power-search-result[data-source="deck"]').filter(
                    has_text="Elven Expedition"
                )
            ).to_be_visible()
            evidence["checks"].append(
                "Deck-name completion is independent of contained-card matching"
            )
            await page.keyboard.press("Escape")
            await page.get_by_role("link", name="New deck", exact=True).first.click()
            editor = page.get_by_role("dialog", name="Create a deck")
            await expect(editor).to_be_visible()
            await editor.get_by_label("Deck name", exact=True).fill("Retained draft")
            await page.evaluate("""() => {
                window.addEventListener('keydown', function observe(event) {
                    if (event.ctrlKey && event.key === 'k') {
                        document.documentElement.dataset.blockedSearchDefault = String(event.defaultPrevented);
                        window.removeEventListener('keydown', observe);
                    }
                });
            }""")
            await page.keyboard.press("Control+k")
            await expect(dialog).to_be_hidden()
            await expect(editor.get_by_label("Deck name", exact=True)).to_be_focused()
            assert (
                await page.locator("html").get_attribute("data-blocked-search-default")
                == "true"
            )
            await expect(editor.get_by_label("Deck name", exact=True)).to_have_value(
                "Retained draft"
            )
            await editor.get_by_role("button", name="Cancel", exact=True).click()
            evidence["checks"].append(
                "An active editing dialog retains its focus/draft and does not open a competing palette"
            )

            await visit()
            await page.locator('.primary-nav a[aria-label="Search"]').click()
            overlay = page.get_by_role("dialog", name="Search cards", exact=True)
            await expect(overlay).to_be_visible()
            await search("passw")
            await expect(dialog).to_be_visible()
            await page.keyboard.press("Escape")
            await expect(overlay).to_be_visible()
            await expect(overlay.get_by_role("searchbox")).to_be_focused()
            await page.keyboard.press("Escape")
            evidence["checks"].append(
                "Global search can open above ordinary Search and return to its existing input"
            )

            await visit()
            await search("Sol Ring")
            await expect(inventory).to_be_visible()
            before = await field.get_attribute("aria-activedescendant")
            await page.keyboard.press("ArrowDown")
            assert await field.get_attribute("aria-activedescendant") != before
            for width, height, theme in [
                (390, 844, "dark"),
                (390, 844, "light"),
                (1280, 900, "light"),
            ]:
                await page.set_viewport_size({"width": width, "height": height})
                await page.evaluate(
                    "theme => window.dispatchEvent(new CustomEvent('spellbook:set-theme', {detail: theme}))",
                    theme,
                )
                assert await page.evaluate(
                    "document.documentElement.scrollWidth <= innerWidth"
                )
                box = await dialog.bounding_box()
                assert (
                    box
                    and box["x"] >= 0
                    and box["x"] + box["width"] <= width
                    and box["y"] + box["height"] <= height
                )
                await dialog.screenshot(path=str(OUT / f"power-{theme}-{width}.png"))
            evidence["checks"].append(
                "Arrow selection and dark/light 390px/1280px layouts preserve usable context rows"
            )

            async def unavailable(route):
                await route.abort("failed")

            await page.route("**/api/v1/mtg/power-search?**", unavailable)
            await field.fill("passw")
            await expect(page.locator(".power-search-status")).to_contain_text(
                "Search unavailable"
            )
            await expect(results.first).to_contain_text("Password")
            await page.unroute("**/api/v1/mtg/power-search?**", unavailable)
            evidence["checks"].append(
                "Provider failure keeps immediate local Settings usable"
            )

            held, release = asyncio.Event(), asyncio.Event()

            async def stale(route):
                if "query=Sol+Ring" in route.request.url:
                    response = await route.fetch()
                    held.set()
                    await release.wait()
                    try:
                        await route.fulfill(response=response)
                    except Error:
                        pass
                else:
                    await route.continue_()

            await page.route("**/api/v1/mtg/power-search?**", stale)
            await field.fill("Sol Ring")
            await asyncio.wait_for(held.wait(), timeout=10)
            await field.fill("passw")
            await expect(results.first).to_contain_text("Password")
            release.set()
            await page.unroute("**/api/v1/mtg/power-search?**", stale)
            await expect(results.first).to_contain_text("Password")
            evidence["checks"].append(
                "A held stale database response cannot replace a new Settings query"
            )
            await page.keyboard.press("Escape")
            await visit()
            await search("tastenkürzel")
            await expect(results.first).to_have_attribute(
                "href", "/settings#power-user-search"
            )
            await page.keyboard.press("Enter")
            await page.wait_for_url("**/settings#power-user-search")
            binding_box = await page.locator("#power-user-search").bounding_box()
            header_box = await page.locator(".primary-nav").bounding_box()
            assert (
                binding_box
                and header_box
                and binding_box["y"] >= header_box["y"] + header_box["height"]
            )
            await expect(page.locator("#power-user-search")).to_contain_text(
                "Ctrl / Cmd + K"
            )
            assert (
                await page.locator(
                    "#power-user-search button, #power-user-search a"
                ).count()
                == 0
            )
            evidence["checks"].append("Settings exposes the binding as read-only text")
            await search("decks")
            await expect(results.first).to_have_attribute("href", "/mtg/decks")
            await page.keyboard.press("Enter")
            await page.wait_for_url("**/mtg/decks")
            evidence["checks"].append(
                "Exact Decks navigation becomes the default selection instead of a fuzzy New deck action"
            )
            await search("Sol Ring")
            await expect(inventory).to_be_visible()
            held.clear()
            release.clear()
            await page.route("**/api/v1/mtg/power-search?**", stale)
            await field.fill("")
            await field.fill("Sol Ring")
            await asyncio.wait_for(held.wait(), timeout=10)
            cookie = next(
                c["value"]
                for c in await context.cookies(ORIGIN)
                if c["name"] == "spellbook_session"
            )
            logout = await context.request.post(
                "http://127.0.0.1:3001/api/v1/auth/logout",
                data={},
                headers={"Authorization": "Bearer " + cookie},
            )
            assert logout.ok
            await page.evaluate("window.dispatchEvent(new Event('online'))")
            await expect(page.get_by_role("alert")).to_contain_text(
                "Your session has ended"
            )
            release.set()
            await page.unroute("**/api/v1/mtg/power-search?**", stale)
            await expect(
                page.locator(
                    '.power-search-result[data-source="inventory"], .power-search-result[data-source="deck-card"]'
                )
            ).to_have_count(0)
            await field.fill("passw")
            await expect(results.first).to_contain_text("Password")
            evidence["checks"].append(
                "Real session revocation and SavedState refresh clear private contexts; a held owner response cannot restore them"
            )
            assert not evidence["errors"], evidence["errors"]
            evidence["status"] = "passed"
        except BaseException:
            evidence["status"] = "failed"
            await page.screenshot(path=str(OUT / "power-browser-failure.png"))
            raise
        finally:
            (OUT / "power-browser.json").write_text(
                json.dumps(evidence, indent=2) + "\n"
            )
            await browser.close()
    print(json.dumps(evidence))


if __name__ == "__main__":
    asyncio.run(main())
