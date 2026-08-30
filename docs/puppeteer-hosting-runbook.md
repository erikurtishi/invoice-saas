# Puppeteer on Hostinger — verification runbook

The backlog's #1 risk is "PDF rendering is slow/heavy on shared hosting", with the
mitigation: **test Puppeteer on the actual host in Phase 0/1, not Phase 4.** This is
that test. It has passed locally; it is not proven until it passes on Hostinger.

Hosting is a Hostinger VPS, provisioned later once the local build is far enough
along (decision D1). Root access means a failed launch here is fixable with
`apt install`, unlike the managed-hosting path this doc briefly assumed — so §5
("if Hostinger cannot run Chrome") is the unlikely branch, not the expected one.
Run this once the VPS exists, before Epic 4.3 is built on the assumption that it
already passed.

Everything here runs one committed script, `apps/api/scripts/pdf-smoke.mjs`, so the
laptop result and the VPS result are directly comparable.

---

## 1. Local baseline (already recorded)

macOS 15 (darwin arm64), Node 22.21.1, Chrome 152 bundled by Puppeteer 25.9.0:

| Measure | Result |
|---|---|
| Cold browser launch | ~300 ms |
| First render (A4) | ~66 ms |
| Warm render (A4, median of 5) | ~40 ms |
| Output size | 37 KB, 1 page |
| A4 page box | 596 × 842 pt (expected 595 × 842) |
| US Letter page box | 612 × 792 pt (expected 612 × 792) |
| Text extractable | yes, 151 chars |
| Macedonian + Albanian round trip | all pass |

Treat these as the target. A VPS will be slower; what matters is whether it is
*usably* slower and whether it launches at all.

---

## 2. On Hostinger

Deploy the repo through hPanel's GitHub deployment, then get a shell or a one-off
command runner on the app (hPanel terminal, or whatever the plan exposes) and run:

```bash
# 1. Node 22 (match the laptop; the repo's engines field requires >=22.12)
node -v

# 2. Chrome + its system libraries.
#    On a VPS this just works. On a managed environment it is the step that may be
#    impossible — and that is exactly what this run is here to find out.
npx puppeteer browsers install chrome --install-deps

# 3. The identical smoke test
npm run pdf:smoke
```

A successful run prints timings, both page sizes as `OK`, `text extractable: yes`,
and four `OK` lines under `cyrillic / albanian`.

**If there is no shell at all** on the plan, add a temporary admin-only route that
shells out to the script and returns its stdout, deploy it, hit it once, and delete
it in the next commit. Do not skip the test because the shell is inconvenient — an
unrun test is the risk the backlog is warning about.

**`--install-deps` needs root.** If it fails with a permission error, that is a
result, not a blocker: it means the platform will not let us install Chrome's
runtime libraries. Record it and go to §5.

---

## 3. What each failure means

| Symptom | Cause | Fix |
|---|---|---|
| `--install-deps` fails: permission denied / no `apt` | Managed environment, no root | **Not fixable here.** Go to §5 — PDF generation moves off this host |
| `FAILED TO LAUNCH CHROME`, `error while loading shared libraries` | Image lacks Chrome's runtime deps | `npx puppeteer browsers install chrome --install-deps`, or install `libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libasound2`. If neither is permitted, §5 |
| `No usable sandbox!` | VPS kernel disallows user namespaces | Already handled — the script passes `--no-sandbox`. Safe **only** because we render our own trusted HTML, never third-party pages |
| Crashes under load, `/dev/shm` errors | Container `/dev/shm` defaults to 64 MB | Already handled via `--disable-dev-shm-usage`; alternatively mount a larger `/dev/shm` |
| Launch succeeds, renders take **seconds** | Under-provisioned container | Chrome wants ~1 GB headroom and a real CPU core. Managed plans rarely give more on request — treat this as a §5 signal |
| OOM-killed mid-render | Not enough RAM, and no swap to add | Plan browser-instance pooling (`4.3.2`) rather than a browser per request; if it still OOMs, §5 |
| Cyrillic extracts as the wrong codepoints | Font substitution — see decision D10 | Do not rely on host fonts. Self-host Noto Sans/Serif (`3.1.6`) |

---

## 4. Numbers to write down

Record these from the VPS run — they size the queue and pooling work in `4.3.2`:

- cold launch time
- warm render median
- Chrome RSS (the script's figure sums the process group and double-counts shared
  memory, so treat it as an upper bound; `systemd-cgtop` or `docker stats` is more
  accurate)
- total RAM on the box

**Decision rule:** if Chrome will not launch, if a warm render exceeds roughly 1 s, or
if a pooled instance cannot sit in memory alongside Node, Epic 4.3 does not render
PDFs on this host. Go to §5. Better to learn that now than after Epic 4.3 is built on
the assumption.

---

## 5. If Hostinger cannot run Chrome

This is a realistic outcome on a managed Node plan, and it is survivable because
`3.1.2` mandates **one** render function producing HTML. Only the HTML→PDF step moves.

Options, in the order worth trying:

1. **A separate rendering service.** A small container host that allows Chrome
   (Fly.io, Railway, Render, a €5 VPS used for nothing else). The API POSTs
   `{ html, paperSize }` and gets PDF bytes back. Chrome's memory demand — the reason
   it is hard to host — stops being the app's problem, and `4.3.2`'s pooling lives
   in the one process that needs it.
2. **A hosted HTML→PDF API.** Fastest to integrate, a per-document cost, and an
   external dependency on the critical path of the product's core action. Fonts must
   still be self-hosted and referenced absolutely, or D10's Cyrillic bug returns.
3. **A pure-JS PDF library** (pdf-lib, jsPDF). **Rejected in advance:** it means
   writing a second renderer, which `3.1.2` forbids outright, and it is the direct
   cause of the "preview and PDF don't match" risk.

Whichever is chosen, the API's interface is `renderPdf(html, opts) => Buffer` and the
call site never knows the difference. Keep it that way from the first line of Epic 4.3.
