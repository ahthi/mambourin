# Static site build — Mambourin Marketplace
Source: https://www.mambourinmarketplace.shopping/

---

## 1. How we view/analyse the original site

Headless browser crawling with Playwright. Not screenshots, not manual dev tools — a Node.js script (crawl.js) that:

- Launches a stealth Chromium instance (using playwright-extra + puppeteer-extra-plugin-stealth to avoid bot detection)
- Visits every page, scrolls to the bottom to trigger lazy-loaded images and carousel content
- Waits for jQuery-driven components to initialise before capturing page.content()
- Follows every internal link automatically up to a configurable MAX_PAGES limit
- Simultaneously captures all non-HTML assets (CSS, JS bundles, images, fonts) as they're requested by the browser

Unlike tools like wget or httrack, Playwright captures post-scroll DOM state — important for lazy-loaded images, infinite scroll, and any Handlebars-rendered content (search results, toast messages) that gets injected at runtime.

Note: this site is classic Sitecore XP (server-side .NET rendering), not headless/JSS. The HTML is fully rendered on the server — there's no blank shell problem. Playwright's main value here is scroll-triggered content and asset interception, not JS rendering.

---

## 2. How we handle the design

We don't touch the design at all. We use the site's actual CSS, class names, and assets verbatim. Specifically:

- The site's CSS bundles (`/assets/corporate/css/app.css`, `project.css`) are saved locally during the crawl
- Fonts are served from `/-/media/FontCssFiles/` (Sitecore media library) — these need to be captured and served locally, as the Sitecore media endpoint won't be available statically
- Adobe Typekit (Synthese, Campton fonts) loads from `use.typekit.net` — keep the external link, no capture needed
- Google Fonts (Aleo) — keep the external link
- Font Awesome Pro loads from `use.typekit.net` via `/assets/corporate/libraries/` — capture locally
- Images fall into two buckets:
  - **Aprimo CDN** (`p3.aprimocdn.net`) — external URLs, preserve as-is
  - **Sitecore media library** (`/-/media/`) — need to be captured locally during the crawl
- All inline styles, class names, and component structure come from the Sitecore-rendered HTML exactly as delivered
- The only CSS we add is a small `static-fixes.css` for UI patches (carousel buttons, form fallbacks, etc.)

Zero colour-matching, zero font-guessing, zero layout rebuilding. It's the real thing.

---

## 3. Build approach

Downloaded HTML → cleaned static site. The pipeline is three scripts:

**Step 1 — crawl.js**: Playwright crawl that saves server-rendered HTML + all assets to a `dist/` folder, rewriting absolute URLs to root-relative paths as it goes. Key capture targets:
- `/-/media/` paths (Sitecore media — fonts, images, SVGs)
- `/assets/corporate/` (CSS and JS bundles)
- `/~/media/FontCssFiles/` (font CSS)
- `/bundles/corporate-js` (bundled JS)
- Aprimo CDN images can be left as external URLs

**Step 2 — postprocess.js**: A Cheerio pass over all HTML files that:
- Strips Sitecore Experience Forms scripts (`/sitecore modules/Web/ExperienceForms/scripts/`) — keeps the form HTML but removes the broken server-dependent JS
- Removes the Sitecore-specific jQuery validation and AJAX scripts that require a live backend
- Rewrites any remaining absolute same-origin links to relative
- Fixes custom carousel (`fpa-carousel`) frozen states — removes inline transforms, hides slides after the first
- Injects a small vanilla JS snippet for mobile hamburger toggle (the `fpa-retail-header__burger-menu-button` component)
- Replaces Handlebars search result templates with a static "use the live site for search" fallback message

**Step 3 — fix2.js**: A second Cheerio pass for QA-driven fixes:
- Broken internal links, Sitecore `~/link.aspx` artefacts, favicon path fixes
- Strips any leaked .NET debug output (e.g. `System.Linq.Enumerable+<TakeIterator>` strings that appeared in the live HTML)
- Injects `static-fixes.js` (vanilla JS) into every page for: carousel nav, store category filtering, contact form fallback (redirect to Formspree or similar), search fallback
- Replaces Sitecore Experience Forms (newsletter/contact) with a static HTML form posting to Formspree or Netlify Forms

The output is a `dist/` folder that Netlify serves directly — no build step required.

---

## 4. Dynamic features — handling plan

| Feature | Live implementation | Static approach |
|---|---|---|
| Store search/filter | API call (likely `/api/stores` or similar) | Static JSON of all stores; client-side JS filter |
| Offers listing | API-driven | Crawl all offer pages; static HTML listing |
| Contact/enquiry forms | Sitecore Experience Forms (.NET) | Replace with Netlify Forms or Formspree |
| Opening hours | Hardcoded in HTML | Preserve as-is from crawl |
| Carousels (`fpa-carousel`) | jQuery plugin | Vanilla JS prev/next, or CSS scroll snap |
| Mega menu | jQuery toggle | Vanilla JS toggle (already straightforward) |
| Google Maps (`/getting-here`) | Embedded iframe | Preserve embed — no static issue |
| reCAPTCHA | Google reCAPTCHA v2 | Keep on any static forms; remove from stripped Sitecore forms |

---

## 5. What we give Claude Code

The workflow that gets good results:

1. **QA audit first** — don't jump straight to fixing. Have Claude compare the live site vs the local static version systematically: every nav item, every page, every link, every component. Output a CSV bug report.
2. **Fix in priority order** — broken links first (easy, high impact), then non-functional components (store filter, carousels), then graceful degradations (forms, search)
3. **Use Cheerio for HTML patching, not regex.** Reliable on messy real-world HTML.
4. **Inject shared JS/CSS files rather than inlining fixes per-page** — one file to maintain, injected into all pages via the fix script.

---

## 6. Sample initial prompt

```
We have a local static site version of https://www.mambourinmarketplace.shopping/ running at localhost:8080.
It was crawled from the live Sitecore XP site using Playwright.

Taking on the role of a QA engineer, compare the local site with the live site —
check every menu item, every page, every link, all components.

Produce a bug report as a CSV with columns:
Page Name, Component/Element, Local URL, Live URL, Description, Severity, Category

Focus on:
(1) pages that exist on the live site but are missing locally
(2) internal links that 404
(3) components that don't work (carousels, store filter, forms)
(4) Sitecore artefacts in the HTML (~/link.aspx, System.Linq strings, /-/media/ 404s)

Ignore external links. Treat any link to mambourinmarketplace.shopping as an internal link.
```

Then after the audit:

```
Fix as much of this as you can to give a static site experience as close to the source as possible.
If there's a basic way to show content instead of a Sitecore-dependent UI feature you can't replicate,
take that option. The intention is that a customer unfamiliar with the site could find what they need
and wouldn't know it's different from the original.
```

---

## TL;DR

The quality comes from Playwright capturing the real server-rendered HTML, not from reconstruction. Claude's job is cleanup and patching, not rebuilding. The site is already fully rendered on the server — it's jQuery sprinkles on top of plain HTML, not a React SPA. Starting from wget or raw HTML downloads would get most of the way there, but Playwright handles lazy-loaded images and asset interception properly.
