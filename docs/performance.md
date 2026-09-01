# Performance profiling (backlog L3.5)

Pre-launch profiling pass, deferred from `X.3`. Run on the **local production
build**, not the dev server.

```sh
npm run build -w @invoice-saas/web
npm run preview -w @invoice-saas/web -- --port 4173 --strictPort   # serves dist/
# then, against a Chrome:
npx lighthouse http://localhost:4173/       --preset=desktop --only-categories=performance,accessibility,best-practices,seo
npx lighthouse http://localhost:4173/       --only-categories=performance,accessibility,best-practices,seo   # default = mobile, 4x CPU, slow 4G
npx lighthouse http://localhost:4173/login  --only-categories=performance,accessibility,best-practices,seo
```

Lighthouse is not a repo dependency (it pulls ~100 MB) — `npx` fetches it on
demand. This is a manual pre-launch gate, like the device pass.

## Results — 2026-09-01 (local prod build, Lighthouse 13.4.1)

| Page / profile | Perf | A11y | Best-pr. | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| `/` landing — **desktop** | **99** | 96 | 96 | 100 | 0.7 s | 0.8 s | 0 ms | 0 |
| `/` landing — **mobile** (4× CPU, slow 4G) | 83 | 96 | 96 | 100 | 3.2 s | 3.8 s | 40 ms | 0 |
| `/login` — mobile | 88 | 96 | 96 | 100 | 2.7 s | 3.2 s | 0 ms | 0 |

### L3.5.1 — throttled profiling

- **No long tasks.** TBT is 0–40 ms under 4× CPU throttling on every page — nothing
  blocks interaction. CLS is 0 everywhere (no layout shift from the `Reveal` /
  stagger animations or late-loading fonts).
- **Mobile LCP ≈ 3.8 s on simulated slow 4G** is network-bound, not CPU-bound —
  it's the base JS chunk (347 KB gz, below) arriving over throttled 4G, not script
  execution. Desktop LCP is 0.8 s. Acceptable for launch; the lever is route-level
  code-splitting (follow-up 1).
- **`prefers-reduced-motion` is honoured.** `main.tsx` wraps the app in
  `<MotionConfig reducedMotion="user">` (every `motion.*` respects the OS setting);
  the landing's `Reveal` blocks take `disabled={reduceMotion}`; GSAP + ScrollTrigger
  are `registerPlugin`'d only inside the lazy `landing-page` chunk, so a reduced-motion
  visitor who never scrolls the marketing page never parses them.
- **List stagger / virtualization jank on a real mid-range phone** stays a manual
  eyeball (feeds `docs/device-testing.md`); the automated signal is TBT + CLS above.

### L3.5.2 — Lighthouse on the prod build

- **A11y 96**, at/above the `X.5` baseline (the axe e2e — `apps/web/e2e/a11y.spec.ts` —
  still passes with zero serious/critical). Fixed here: `heading-order` on the landing
  (the feature-strip card titles were `<h3>` directly under the hero `<h1>` with no
  `<h2>` between — now `<h2>`). Remaining Lighthouse flag: `color-contrast` on the hero
  eyebrow pill (`bg-primary/10` + `text-primary`) — the same token pair `X.5` tuned for
  the nav tint; likely a sampling artifact of the `Reveal` entrance fade (axe, which
  runs after settle, does not flag it). Tracked with the dark-mode a11y sweep.
- **SEO 91 → 100.** Added `apps/web/public/robots.txt` (allow all, `Disallow: /console/`
  + `/admin/`). A `sitemap.xml` needs the real domain → V1.4.
- **Best-practices 96.** Two non-blocking flags: `errors-in-console` is
  `net::ERR_CONNECTION_REFUSED` (the preview runs without the API — not a code bug);
  `valid-source-maps` — the prod build emits none (follow-up 3).

### Bundle / chunk split (X.6.1 check)

`npm run build -w @invoice-saas/web` →

| Chunk | raw | gzip | Loaded when |
|---|---|---|---|
| `index-*.js` (base app) | 1.19 MB | **347 KB** | always |
| `esm-*.js` (`@sentry/react`) | 475 KB | 156 KB | only if `VITE_SENTRY_DSN` is set (dynamic import) |
| `chart-impl-*.js` (recharts) | 374 KB | 107 KB | first `/admin` chart (React.lazy, L2) |
| `landing-page-*.js` (marketing **+ GSAP**) | 121 KB | **46.65 KB** | route `/` only (React.lazy) |
| `index-*.css` | 44 KB | 8.6 KB | always |

- **Marketing chunk is still separate** — 46.65 KB gz, ~matches the `X.6.1` "~47 KB gz",
  GSAP is inside it (`grep gsap` hits `landing-page-*.js`, 0 hits in `index-*.js`).
- **Sentry is code-split** — a keyless build never fetches the 156 KB gz `esm` chunk.

## Follow-ups (not launch-blocking)

1. **Base chunk 347 KB gz.** Only `/` is `lazy()` today. Route-level `lazy()` for the
   `/console/*` and `/admin/*` trees, and/or `build.rollupOptions.output.manualChunks`
   splitting `react-router` / `@tanstack/react-query` / `@radix-ui/*` / `i18next`, would
   cut first load and the mobile LCP. Biggest single lever.
2. Sentry chunk (156 KB gz) is fine as-is — dynamic, DSN-gated.
3. **No prod source maps** (`valid-source-maps` fails). Turn on hidden source maps and
   upload them to Sentry as part of the deploy — do it with `V1.6.1`.
4. `color-contrast` on the landing hero pill — confirm real vs. animation artifact
   during the dark-mode a11y sweep.
