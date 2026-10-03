# Website icons

- Status: Canonical reference; replacement artwork remains proposed
- Last Reviewed: 2026-10-03
- Source of Truth: browser specifications, vendor documentation, and current frontend files
- Update Triggers: icon selection, favicon or manifest changes, browser installation requirements
- Related Docs: [Reference index](./README.md), [Design direction](../product/ui-design-direction.md)

A favicon identifies a browser tab or bookmark at very small sizes. An installed app icon identifies a home screen or launcher entry. A detailed illustration can support marketing, but shrinking that illustration does not produce a useful favicon.

The current [HTML document](../../frontend/src/app.html) links to `/favicon.ico` with `sizes="any"`. The [manifest](../../frontend/static/manifest.webmanifest) also declares this file as its only icon with `sizes: "any"`. Inspection on 2026-10-03 found one 64 by 64 pixel image inside the ICO. The declarations are inaccurate: `any` describes a scalable resource. There is no SVG favicon, Apple touch icon, 192 or 512 pixel manifest PNG, or maskable icon in `frontend/static/`.

The proposed asset set separates browser and installation requirements. It is not yet implemented.

| Use                        | Proposed file and declaration                                                                                | Reason                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser tabs and bookmarks | `favicon.svg`, `rel="icon"`, `type="image/svg+xml"`, `sizes="any"`                                           | A simple vector mark scales cleanly. Test its contrast in light and dark browser chrome.                                                                                    |
| Browser fallback           | `favicon.ico` containing 16, 32 and 48 pixel images, declared with those exact sizes                         | Small raster versions can receive deliberate pixel adjustments. Retain the root path for clients that request it directly.                                                  |
| Apple home screen          | Opaque `apple-touch-icon.png`, 180 by 180 pixels, linked with `rel="apple-touch-icon"` and `sizes="180x180"` | Apple's documented Web Clip mechanism differs from the browser favicon. Apple also documents device-specific 152 and 167 pixel variants; add them if testing requires them. |
| Installed app              | Manifest PNGs at 192 and 512 pixels, with exact sizes and `purpose: "any"`                                   | Chromium's published installation guidance asks for both sizes. This is browser guidance, not a universal manifest specification minimum.                                   |
| Adaptive launcher          | Separate opaque 512 pixel PNG with `purpose: "maskable"`                                                     | The launcher may crop the background into different shapes. Keep the essential mark inside the centered circular safe zone.                                                 |

Use a bold silhouette, a few solid shapes, and enough empty space to preserve the mark at 16 pixels. For Spellbook's selection review, require important strokes and gaps to remain about two pixels wide in the 16 pixel raster. This is a project review criterion, not a browser rule. Avoid fine lettering, tiny textures, decorative glows, and scenes containing several objects. Inspect 16, 32 and 48 pixel versions at their actual size on light and dark backgrounds. A large preview alone cannot establish favicon legibility.

For a maskable icon, the specification guarantees a centered circle with a radius of 40 percent of the image's smaller dimension. Keep every essential part inside that circle, not merely inside a square with a 10 percent margin. Fill the entire canvas with an opaque background. Let the operating system apply its mask instead of baking rounded corners into the artwork. Review circular, rounded square and other launcher masks before shipping.

Keep an editable SVG master after selecting the mark. Draw its shapes deliberately and derive PNG and ICO exports from it. The generated PNG explorations are concepts, not vectors; neither resizing nor putting a PNG inside an SVG makes the design vector artwork. Check pixel alignment and simplify the 16 pixel export when necessary. Keep generated originals and provenance reports separate from browser assets because conversion can discard that metadata.

Verify actual file dimensions, ICO entries, MIME types, alpha, and every referenced URL. Check the selected favicon in browser tabs and bookmarks, and inspect the installed icon on supported devices. A web manifest alone does not prove installation works. Browser caches can retain an old favicon, so verify the fetched file when checking a replacement.

Sources checked on 2026-10-03:

- [WHATWG HTML, icon link type](https://html.spec.whatwg.org/multipage/links.html#rel-icon) defines icon selection and reserves `sizes="any"` for scalable icons.
- [MDN, rel attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel#icon) distinguishes browser icons from Apple's Web Clip mechanism.
- [MDN, manifest icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons) explains `src`, `sizes`, `type`, and `purpose`.
- [W3C Web App Manifest, icon masks and safe zone](https://www.w3.org/TR/appmanifest/#icon-masks) defines the maskable circle and clipping behavior.
- [Chromium guidance, add a web app manifest](https://web.dev/articles/add-manifest) documents 192 and 512 pixel installation icons.
- [Apple, configuring web applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) documents PNG touch icons and 180, 167 and 152 pixel examples. This is archived vendor documentation; validate current target devices before release.
