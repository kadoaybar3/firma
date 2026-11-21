# localhost:4400 (Firma Rehberi production build): jury score
Estimate, not affiliated with Awwwards. Independent critic, from 1 page (homepage) on 2026-11-18.

**The idea, as the critic read it:** A Turkish local business directory for Afyonkarahisar: a search-first landing page that routes people to nearby firms by category, with listing pages, contact details and an "add your business" pitch.
**Critic overall: 6.35** (0.4 Design 6.5 + 0.3 Usability 6.5 + 0.2 Creativity 6 + 0.1 Content 6, strict scale)
**Jury estimate: about 7.5** (critic + 1.1, measured on two recent Sites of the Day; the gap on weaker sites is not measured)
**Band, from the estimate:** Site of the Day range (7.2 and up) — treat with caution: the offset comes from two winners.

| Criterion | Score | Evidence |
|---|---|---|
| Design (40%) | 6.5 | d-01-hero: centered display type, floating search card, "84 firma · 123 kategori" stat line, eyebrow labels, single blue accent — a real system. But m-02-scroll / d-04: page text bleeds through the sticky header and collides with nav labels; hover language is a single recolor. |
| Usability (30%) | 6.5 | report: overflowX false, scrollFps 60 both breakpoints, no console errors, m-01 stacks search + full-width "Ara". Against: mobile LCP 4760 ms, d-00 first paint blank ("Veri bağlantısı kuruluyor…"), skipLinkFirst false, 6 of 8 primary hovers colorOnly. |
| Creativity (20%) | 6 | d-01, d-91-after-nav: competent generic directory pattern (centered hero search, category grid, listing rows, 4-step explainer) — swappable to any brand; desktop.idleMotion false, no signature moment in d-01…d-07. |
| Content (10%) | 6 | d-06, d-07: real Turkish copy with voice ("şehir şehir büyüyoruz"). Against: d-04 duplicate phone 05062776701 on two firms, every card "Kapalı", audit heaviest-page "images 0". |

| Developer | Score | Evidence |
|---|---|---|
| Semantics/SEO | 5 | audit.txt: FAIL 0 `<h1>`, FAIL no `<main>`, WARN 0 words visible in static HTML, WARN 404 has no h1; report.desktop.h1 exists only after JS (prerender head-only shell). |
| Animations/Transitions | 5 | d-90 a/b/c: hard cut, no intermediate frame; h-01 rest/hover pixel-identical (0 changed px); h-05…h-08 recolor text only; h-02/h-03/h-04 do answer. scrollFps 60, reduced.moving false. |
| Accessibility | 5 | a11y serious 2: contrast ×6 (.firm-status.is-closed #7c8798 on #fff, 3.63:1) + label-content-name-mismatch; skipLinkFirst false; noVisibleFocus on input + select. Positives: k-01…k-04 focus rings, reduced.hiddenText 0. |
| WPO | 6 | desktop LCP 1028 ms, CLS 0, loadMs 92, JS 72 KB gz. Against: mobile LCP 4760 ms (p.hero__subtitle), mobile settledMs 5531, d-00 blank first paint. |
| Responsive | 6 | m-01…m-06 recompose, overflowX false, offenders []. Against: 8 smallTargets under 24 px ("Profili gör 82x16", "Tümünü gör 102x19"); header bleed in m-02. |
| Markup/Meta-data | 6 | audit WARN missing og:image; viewport, favicon, alt text no FAILs; unique title in report. |

## Fixes, most score first
1. [WPO/Usability] mobile LCP 4760 ms + blank d-00: prerender h1/subtitle/search card into served HTML so the hero paints without JS.
2. [Animations] h-01 rest/hover pixel-identical: give the "Tüm kategoriler" trigger the h-04 border/shadow treatment; apply arrow-underline treatment of h-03/h-04 to h-05…h-08 text-only links.
3. [A11y] contrast 3.63:1 on `.firm-status.is-closed` → darken to ≥ #5f6b7a; add skip link first; :focus-visible ring on search input + il select.
4. [SEO] prerender `<h1>` and `<main>` into the static shell; add og:image; design the 404 h1.
5. [Design] m-02 header bleed: opaque sticky header background.
6. [Responsive] pad smallTargets to 24 px min-height.
7. [Animations] add a short route transition (fade/16 px rise) — d-90 shows a hard cut.
8. [Content] vary seeded data: duplicate phone, all cards "Kapalı".

## Measured
Mobile LCP 4760 ms, CLS 0; no loader; desktop settledMs 2524; scrollFps 60/60; axe serious 2, contrastNeedsReview 6; overflowX false; noHoverChange [], colorOnly 6 of 8 targets; idleMotion false; audit 2 FAIL / 3 WARN (1 page).

Not scored: anything stills can't show (how motion feels, sound).
