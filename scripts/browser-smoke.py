"""Opt-in, read-only Demo browser acceptance against an existing adapter-node build."""

import argparse
import ipaddress
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--build-dir", type=Path, default=ROOT / "frontend/build")
    parser.add_argument("--browser-executable")
    parser.add_argument("--output", type=Path, default=ROOT / ".local/browser-smoke")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--preflight-only", action="store_true")
    modes.add_argument("--workspace-only", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {
        "check_source_revision": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "server_artifact": {
            "build_directory": str(args.build_dir.resolve()),
            "source_revision": "unknown",
        },
        "cases": [],
    }
    browser = None
    contexts = []
    errors = []
    case = "target and artifact"
    try:
        if not __debug__:
            raise RuntimeError(
                "Run without Python optimization so smoke assertions remain active"
            )
        url = urlsplit(args.origin)
        assert (
            url.scheme == "http"
            and url.port
            and not url.path
            and not url.query
            and not url.fragment
            and not url.username
            and not url.password
        ), "An explicit HTTP loopback origin with port and no path is required"
        assert (
            url.hostname == "localhost"
            or ipaddress.ip_address(url.hostname).is_loopback
        ), "Target must be loopback"
        report["origin"] = args.origin
        assert (args.build_dir / "index.js").is_file() and (
            args.build_dir / "handler.js"
        ).is_file(), "Existing adapter-node build required"
        artifact = (args.build_dir / "adapter-node.js").read_text()
        exported = re.search(r"^export const origin = (.+);$", artifact, re.MULTILINE)
        assert exported and exported[1] != "undefined", (
            "Existing public build Origin required"
        )
        assert json.loads(exported[1]) == args.origin, "Build Origin mismatch"
        from playwright.sync_api import expect, sync_playwright

        with sync_playwright() as pw:
            try:
                browser = pw.chromium.launch(
                    headless=True, executable_path=args.browser_executable
                )

                def context(js=True):
                    ctx = browser.new_context(
                        java_script_enabled=js,
                        viewport={"width": 1280, "height": 800},
                        locale="en-US",
                    )
                    contexts.append(ctx)
                    return ctx

                c = context()
                page = c.new_page()
                page.set_default_timeout(12000)
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on(
                    "console",
                    lambda message: (
                        errors.append(message.text)
                        if message.type == "error" and "svelte.dev/e/" in message.text
                        else None
                    ),
                )

                def go(path):
                    response = page.goto(args.origin + path)
                    assert response.status == 200

                def passed():
                    assert not errors, "Application pageerror: " + "; ".join(errors)
                    report["cases"].append({"case": case, "status": "passed"})

                def locale(lang):
                    page.locator("details.language-control > summary").click()
                    page.locator(f"button[name=locale][value={lang}]").click()
                    expect(page.locator("html")).to_have_attribute("lang", lang)

                case = "Demo readiness"
                go("/auth/login")
                expect(page.locator("main")).to_contain_text(re.compile(r"Demo|demo"))
                expect(
                    page.locator("main p").filter(has_text="demo / demo")
                ).to_be_visible()
                page.locator("[name=username]").fill("demo")
                page.locator("[name=password]").fill("demo")
                page.get_by_role("button", name="Sign in", exact=True).click()
                page.wait_for_url(lambda u: "/auth/login" not in u)
                assert c.request.get(args.origin + "/api/v1/auth/session").status == 200
                go("/mtg/search?q=Pili-Pala")
                expect(page.get_by_text("Pili-Pala", exact=True).first).to_be_visible()
                go("/mtg/inventory")
                expect(page.locator("[data-inventory-row]").first).to_be_visible()
                passed()
                if not args.preflight_only:
                    for (
                        lang,
                        filter_title,
                        deck_title,
                        new_deck,
                        close_filters,
                        close_actions,
                        close_dialog,
                    ) in (
                        (
                            "en",
                            "Filters",
                            "Create a deck",
                            "New deck",
                            "Close filters",
                            "Close actions",
                            "Close dialog",
                        ),
                        (
                            "de",
                            "Filter",
                            "Deck erstellen",
                            "Neues Deck",
                            "Filter schließen",
                            "Aktionen schließen",
                            "Dialog schließen",
                        ),
                    ):
                        for width, height in ((390, 844), (1280, 800)):
                            page.set_viewport_size({"width": width, "height": height})
                            mobile = width == 390
                            case = f"Inventory toolbar and actions ({lang}, {width}x{height})"
                            go("/mtg/inventory")
                            locale(lang)
                            toolbar = page.locator(".inventory-toolbar")
                            filters = toolbar.get_by_role(
                                "button", name="Filter", exact=True
                            )
                            expect(toolbar.get_by_role("status")).to_have_text(
                                re.compile(r"^[1-9].*·.*")
                            )
                            count = toolbar.locator(".inventory-result-count")
                            match_count = count.inner_text()
                            page.evaluate("window.scrollTo(0, 700)")
                            if mobile:
                                expect(toolbar).to_have_css("position", "sticky")
                                assert abs(toolbar.bounding_box()["y"] - 64) <= 1
                            assert page.evaluate(
                                "document.documentElement.scrollWidth <= innerWidth"
                            )
                            filters.focus()
                            filters.press("Enter")
                            panel = page.get_by_role(
                                "dialog", name=filter_title, exact=True
                            )
                            expect(panel).to_be_visible()
                            if mobile:
                                box = panel.bounding_box()
                                assert abs(box["y"] + box["height"] - height) <= 1
                                page.screenshot(
                                    path=str(
                                        args.output / f"inventory-sheet-{lang}.png"
                                    )
                                )
                                panel.get_by_role("searchbox").fill("Kamigawa")
                                expect(panel.get_by_role("checkbox")).to_have_count(1)
                                panel.get_by_role("checkbox").check()
                                expect(count).not_to_have_text(match_count)
                                panel.get_by_role("checkbox").uncheck()
                                expect(count).to_have_text(match_count)
                                panel.get_by_role("button", name=close_filters).click()
                            else:
                                expect(panel).to_have_css("position", "relative")
                                page.keyboard.press("Escape")
                            expect(filters).to_be_focused()
                            page.evaluate("window.scrollTo(0, 0)")
                            actions = page.locator(
                                "[data-inventory-row] .entry-menu"
                            ).first
                            actions.focus()
                            actions.press("Enter")
                            menu = page.get_by_role("menu")
                            expect(menu).to_be_visible()
                            if mobile:
                                expect(menu).to_have_css("position", "fixed")
                                menu.get_by_role("menuitem", name=close_actions).click()
                            else:
                                page.keyboard.press("Escape")
                            expect(actions).to_be_focused()
                            if mobile and lang == "en":
                                # Both presentation changes replace the Bits UI trigger.
                                for start, end in ((390, 641), (641, 390)):
                                    page.set_viewport_size(
                                        {"width": start, "height": height}
                                    )
                                    filters.focus()
                                    filters.press("Enter")
                                    expect(panel).to_be_visible()
                                    page.set_viewport_size(
                                        {"width": end, "height": height}
                                    )
                                    expect(panel).to_have_css(
                                        "position",
                                        "fixed" if end == 390 else "relative",
                                    )
                                    page.keyboard.press("Escape")
                                    expect(filters).to_be_focused()

                                rows = page.locator("[data-inventory-row]")
                                previous = rows.nth(4).locator(".entry-menu")
                                following = rows.nth(5).locator(".card-identity")
                                following.focus()
                                previous.evaluate(
                                    """(button) => {
                                        const toolbar = document.querySelector('.inventory-toolbar');
                                        window.scrollBy(0, button.getBoundingClientRect().bottom
                                            - toolbar.getBoundingClientRect().bottom + 2);
                                    }"""
                                )
                                page.keyboard.press("Shift+Tab")
                                expect(previous).to_be_focused()
                                assert previous.bounding_box()["y"] >= (
                                    toolbar.bounding_box()["y"]
                                    + toolbar.bounding_box()["height"]
                                    - 1
                                )
                            passed()

                            case = f"Decks filters and form dialog ({lang}, {width}x{height})"
                            go("/mtg/decks")
                            filters = page.get_by_role(
                                "button", name="Filter", exact=True
                            )
                            filters.focus()
                            filters.press("Enter")
                            panel = page.get_by_role(
                                "dialog",
                                name="Filter decks"
                                if lang == "en"
                                else "Decks filtern",
                            )
                            expect(panel).to_be_visible()
                            page.keyboard.press("Escape")
                            expect(filters).to_be_focused()
                            create = page.get_by_role(
                                "link", name=new_deck, exact=True
                            ).first
                            create.focus()
                            create.press("Enter")
                            dialog = page.get_by_role(
                                "dialog", name=deck_title, exact=True
                            )
                            expect(dialog).to_be_visible()
                            box = dialog.bounding_box()
                            if mobile:
                                assert abs(box["y"] + box["height"] - height) <= 1
                                page.screenshot(
                                    path=str(args.output / f"deck-sheet-{lang}.png")
                                )
                                # Reduce the available height with the form open, as a keyboard does.
                                page.set_viewport_size({"width": width, "height": 260})
                                dialog.locator("#new-name").fill("Sheet smoke draft")
                                submit = dialog.locator("button[type=submit]")
                                submit.scroll_into_view_if_needed()
                                expect(submit).to_be_in_viewport()
                                close = dialog.get_by_role("button", name=close_dialog)
                                expect(close).to_be_in_viewport()
                                close.click()
                                page.set_viewport_size(
                                    {"width": width, "height": height}
                                )
                            else:
                                assert (
                                    abs(box["y"] + box["height"] / 2 - height / 2) <= 1
                                )
                                page.keyboard.press("Escape")
                            expect(create).to_be_focused()
                            assert page.evaluate(
                                "document.documentElement.scrollWidth <= innerWidth"
                            )
                            passed()

                if not args.preflight_only and not args.workspace_only:
                    case = "enhanced bilingual search and semantic retention"
                    go("/mtg/search?q=Pili-Pala")
                    for lang in ("en", "de"):
                        locale(lang)
                        expect(
                            page.get_by_text("Pili-Pala", exact=True).first
                        ).to_be_visible()
                        assert parse_qs(urlsplit(page.url).query)["q"] == ["Pili-Pala"]
                    locale("en")
                    go("/mtg/search")
                    red = page.locator("button.filter-color").nth(3)
                    red.click()
                    expect(red).to_have_attribute("data-logic", "OR")
                    expect(red).to_have_attribute("aria-label", re.compile(r"^Red"))
                    expect(
                        page.locator(".color-expression .full-expression")
                    ).to_have_text("Red")
                    page.wait_for_url(re.compile(".*color.*"))
                    query = parse_qs(urlsplit(page.url).query)
                    locale("de")
                    assert parse_qs(urlsplit(page.url).query) == query
                    expect(red).to_have_attribute("aria-label", re.compile(r"^Rot"))
                    expect(
                        page.locator(".color-expression .full-expression")
                    ).to_have_text("Rot")
                    expect(page.locator("[data-card-id]").first).to_be_visible()
                    page.screenshot(path=str(args.output / "desktop.png"))
                    passed()
                    case = "Inspector symbols focus and quantity draft"
                    go("/mtg/search?q=Pili-Pala")
                    locale("en")
                    trigger = page.get_by_text("Pili-Pala", exact=True).first
                    trigger.click()
                    dialog = page.get_by_role("dialog", name="Pili-Pala", exact=True)
                    quantity = dialog.locator("form.deck-add input[name=quantity]")
                    quantity.fill("7")
                    page.get_by_role("button", name="Card Info", exact=True).click()
                    expect(dialog.locator(".ms-2").first).to_be_visible()
                    expect(dialog.locator(".ms-untap").first).to_be_visible()
                    page.screenshot(path=str(args.output / "inspector.png"))
                    page.get_by_role("button", name="Printings", exact=True).click()
                    expect(quantity).to_have_value("7")
                    page.keyboard.press("Escape")
                    expect(dialog).not_to_be_visible()
                    assert page.locator(":focus").evaluate(
                        '(e)=>e.textContent.includes("Pili-Pala")'
                    )
                    trigger.click()
                    expect(quantity).to_have_value("1")
                    page.keyboard.press("Escape")
                    passed()
                    case = "mobile filters"
                    go("/mtg/search")
                    page.set_viewport_size({"width": 390, "height": 844})
                    toggle = page.get_by_role("button", name="Filters", exact=True)
                    toggle.click()
                    page.locator("button.filter-trigger").filter(
                        has_text="Language"
                    ).click()
                    page.get_by_role("button", name="All languages", exact=True).click()
                    toggle = page.get_by_role("button", name="Filters (1)", exact=True)
                    expect(toggle).to_be_visible()
                    toggle.focus()
                    toggle.press("Enter")
                    expect(toggle).to_have_attribute("aria-expanded", "false")
                    toggle.press("Enter")
                    page.get_by_role(
                        "button", name="Clear filters", exact=True
                    ).first.click()
                    expect(
                        page.get_by_role("button", name="Filters", exact=True)
                    ).to_be_visible()
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= innerWidth"
                    )
                    page.screenshot(path=str(args.output / "mobile.png"))
                    passed()
                    case = "native no-JavaScript filter submission"
                    native = context(False)
                    # Transfer session only in memory; never persist authentication artifacts.
                    native.add_cookies(c.cookies())
                    np = native.new_page()
                    np.goto(args.origin + "/mtg/search")

                    for summary in np.locator("main details > summary").all():
                        if summary.is_visible():
                            summary.click()
                    np.locator("input[name=color][value=R]").check()
                    np.get_by_role("button", name="Apply filters", exact=True).click()
                    assert parse_qs(urlsplit(np.url).query).get("color") == ["R"]
                    expect(np.locator("input[name=color][value=R]")).to_be_checked()
                    passed()
            finally:
                try:
                    for ctx in contexts:
                        ctx.close()
                finally:
                    if browser:
                        browser.close()
    # Preserve the failed case in the CLI report and return a nonzero exit status.
    except Exception as error:  # noqa: BLE001
        report["cases"].append(
            {"case": case, "status": "failed", "error": str(error)[:1200]}
        )
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    failed = any(item["status"] == "failed" for item in report["cases"])
    print(json.dumps(report))
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
