# Real-device & responsiveness pass (backlog L3.4)

Deferred from `X.2` as "not automatable — a manual pass on physical hardware
before launch". This doc is the runbook for that pass, plus the automated
pre-check that de-risks it.

## Automated coverage (runs in CI)

Two specs run at mobile viewports on every push:

- **`apps/web/e2e/responsive.spec.ts`** — the key public + authenticated screens at
  a phone (375×667) and tablet (768×1024) viewport, failing on any
  **document-level horizontal scroll** (the CLAUDE.md rule — wide tables scroll
  inside their own container, not the page). Includes `/console/dev/template-editor`.
- **`apps/web/e2e/mobile-critical-path.spec.ts`** — the **full happy path**
  (signup → onboarding → client → product → template-editor tab check → create +
  issue an invoice → download the PDF → send) re-run under Playwright's
  **`iPhone 13`** and **`iPad Mini`** device profiles (real mobile viewport +
  `hasTouch` + mobile UA). Every screen asserts no page side-scroll; the primary
  CTAs assert a sane tap-target size; the template editor asserts its Design/Preview
  **tabbed** collapse.

```sh
npm run test:e2e -w @invoice-saas/web -- mobile-critical-path
```

Both run on the **Chromium** engine, so they cover Android Chrome and catch layout
/ flow regressions at mobile size. What they do **not** cover, and what a ~10-minute
manual pass on a real phone still adds: iOS **Safari (WebKit)** rendering quirks,
the iOS keyboard viewport resize, momentum scrolling, safe-area insets, and the
subjective "does it feel right to tap". Not launch-blocking — the critical paths
are proven to complete on mobile — but worth doing once hardware is handy.

## 1. Serve localhost to a real device (`L3.4.1`)

### Same Wi-Fi (LAN)

```sh
npm run dev:lan
```

Prints the machine's LAN IP and starts both dev servers bound to every interface
(`vite` via `server.host`, the API's dev CORS already allows private-range LAN
origins). On the phone/tablet open the printed `http://<lan-ip>:5173`. The
script plumbs `VITE_API_URL=http://<lan-ip>:4000` so the app's API calls resolve
from the device (a bare `localhost` would mean the device itself).

- The device and this machine must be on the same network.
- Allow `node` through the macOS firewall if prompted.

### Stable HTTPS origin (tunnel)

Some flows want a real `https://` origin. With `npm run dev` (or `npm run dev:lan`)
already up:

```sh
cloudflared tunnel --url http://localhost:5173      # or: ngrok http 5173
```

Dev-mode CORS also allows `*.trycloudflare.com` / `*.ngrok-free.app` /
`*.ngrok.io` / `*.ngrok.dev` / `*.loca.lt` (see `apps/api/src/lib/cors-origin.ts`).
If the web app can't reach the API through the tunnel, also tunnel `:4000` and set
`VITE_API_URL` to that URL. Production stays locked to the single `WEB_ORIGIN`.

## 2. Critical-path walk, per device (`L3.4.2`)

The flow below is covered automatically at `iPhone 13` + `iPad Mini` size by
`mobile-critical-path.spec.ts` (Chromium). The **manual** pass adds the WebKit /
physical-hardware delta: run it once on a real phone in **iOS Safari** and once in
**Android Chrome**. Watch for: broken layout, any horizontal page scroll, tap
targets too small/cramped, text clipped, sticky headers/footers overlapping
content, the keyboard covering the focused field.

| # | Step | Watch for |
|---|---|---|
| 1 | Sign up → land on onboarding | Form usable one-handed; no zoom-on-focus jump |
| 2 | Onboarding: business profile, skip logo, finish | Buttons reachable; stepper not clipped |
| 3 | Create a client (dialog) | Dialog fits; fields + actions visible above keyboard |
| 4 | Create a product | Same |
| 5 | New invoice → pick client, add 2–3 line items | Line items switch to stacked **cards** below `md`; the live preview sits **below** the form (stacked), not causing side-scroll |
| 6 | Change template / open the inline designer | Editor is the stacked **edit ⇆ preview tabbed** view on phone |
| 7 | Save (finalize) the invoice | — |
| 8 | Download the PDF | See §3 |
| 9 | Send the invoice | Success state renders; "download instead" fallback usable |
| 10 | Invoice list, clients list, products list | Table → **card** layout below `md`; no side-scroll; pagination tappable |
| 11 | Settings / business profile | — |

## 3. PDF on mobile (`L3.4.3`)

Download one **Macedonian (MK)** invoice and one **Albanian (SQ)** invoice and
open each in the device's **native PDF viewer** (iOS Files/Preview, Android's
default viewer):

- Cyrillic (МК) and Albanian diacritics (ë, ç) render as real glyphs, not boxes
  or "?" — the self-hosted Noto fonts (`D10`) must be embedded.
- Text is selectable / searchable (the round-trip check in `render:check` covers
  this on desktop; confirm it survives on the phone viewer too).
- Layout matches the on-screen preview (same shared renderer).

## Results log

| Date | Device / OS / browser | Steps 1–11 | PDF MK | PDF SQ | Notes |
|---|---|---|---|---|---|
| 2026-09-01 | emulated — `iPhone 13` (Playwright/Chromium) | pass (automated) | — | — | `mobile-critical-path.spec.ts`; no page side-scroll, editor tabbed, CTAs sized |
| 2026-09-01 | emulated — `iPad Mini` (Playwright/Chromium) | pass (automated) | — | — | same spec |
| 2026-09-01 | PDF render path (`render:check`, Puppeteer) | — | pass | pass | 18/18 template×lang; 9 embedded `/FontFile2` per PDF; MK ~7 KB > SQ (Cyrillic subset) |
| _pending_ | real phone — iOS Safari | | | | WebKit + physical-feel delta (~10 min) |
| _pending_ | real phone — Android Chrome | | | | |

## Fixed during this epic

- `/console/invoices/new` scrolled sideways on a phone (~844px content in 375px):
  the form/preview grid's single-column track (below `lg`) was pushed to the
  preview's intrinsic ~794px page width. Added `min-w-0` to both columns in
  `invoice-form-fields.tsx` so the track can shrink and the preview's fit-scale
  measures the real narrow width. Guarded by `responsive.spec.ts`.

## Known minor gap (not fixed)

- The line-items editor's **mobile card** layout labels its inputs "Description",
  "Unit price", … without the row number that the **desktop table** puts in the
  `aria-label` ("Description 1"). Multiple cards therefore expose several
  identically-named fields to a screen reader. Low impact (each field sits in its
  own visually-distinct card) — fold into the dark-mode a11y sweep rather than
  churn the i18n keys now.
