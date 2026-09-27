# /design-sync — repo-specific notes

## Why this repo needs extra setup

`budget-calculator` is not a standalone component-library package: it's a
Next.js app (`private: true`, no `main`/`module`/`exports`, no `.d.ts`
output) whose reusable UI primitives live inline at `lib/ui/*.tsx`. There is
no Storybook and no build that produces a `dist/`. The converter's package
shape handles this via its "no dist → synthesize an entry from src/"
fallback, but two things needed a repo-specific workaround to get there:

1. **`PKG_DIR` resolution.** Without `--entry`, the converter resolves the
   package directory as `<node_modules>/<cfg.pkg>` — which doesn't exist for
   an app that isn't installed as a dependency of itself. Fix: a symlink
   `node_modules/budget-calculator -> ..` (the repo root) makes that path
   resolve to the real repo. **Recreate this on every fresh clone**:
   ```sh
   ln -sfn .. node_modules/budget-calculator
   ```
   (`node_modules/` is gitignored, so the symlink never survives a clone or
   a fresh `npm ci`.) Passing `--entry` instead was tried and rejected: the
   converter treats *any* `--entry` value as the literal dist entry (see
   `lib/bundle.mjs` `resolveDistEntry` — an override always wins, even a
   single non-dist `.tsx` file), which bundles only that one file instead of
   synthesizing from the whole `srcDir`.

2. **`NavRow` cannot be bundled for a browser.** It imports `next/link`,
   and bundling Next's `Link` pulls in Next's client router internals,
   which reference bare `process.env.__NEXT_*` — undefined in a browser
   IIFE, so the whole synthesized entry threw at eval time and **every**
   component (not just NavRow) came up as `[BUNDLE_EXPORT] not a component`
   on `window.Haushaltsplanung`. `cfg.componentSrcMap: {"NavRow": null}`
   only excludes a component from the *card list* — the entry synthesis in
   `lib/source-kit.mjs` walks `srcDir` directly and ignores `componentSrcMap`
   for that step, so it still pulled `NavRow.tsx` in. Fix: `cfg.srcDir`
   points at `.design-sync/synth-src/`, a curated directory of symlinks to
   every `lib/ui/*.tsx` file **except** `NavRow.tsx`. This directory is
   committed (symlinks, so `git` tracks them as such) and must be
   regenerated whenever a file is added to/removed from `lib/ui/`:
   ```sh
   rm -rf .design-sync/synth-src && mkdir -p .design-sync/synth-src
   for f in lib/ui/*.tsx; do
     base=$(basename "$f")
     [ "$base" = "NavRow.tsx" ] && continue
     ln -sf "../../$f" ".design-sync/synth-src/$base"
   done
   ```
   `NavRow` is consequently **not in the synced bundle at all** — not a
   floor card, genuinely absent. It only works inside a Next.js router
   context anyway, so a standalone claude.ai/design preview couldn't
   exercise it meaningfully even if it rendered. It stays documented in the
   Artifact-based design system doc (`lib/ui/NavRow.tsx`) instead.

3. **`cssEntry` is a generated file, not committed.** The app's real component
   CSS only exists as Tailwind utility classes generated at build time —
   `app/globals.css` alone (`@import 'tailwindcss'` unresolved) has no
   utility classes, so copying it verbatim would ship components with no
   layout. The actual `cssEntry` (`.design-sync/.cache/compiled-tailwind.css`,
   gitignored) is produced by compiling Tailwind directly from source with
   the Tailwind v4 CLI, scanning the real templates — **not** from
   `.next/`/`out/_next/` (those paths are blocked by this repo's
   `.claude/settings.json` `permissions.deny`, and shouldn't be depended on
   anyway since they're build output, not source). Regenerate before every
   build/re-sync:
   ```sh
   npx --yes @tailwindcss/cli@4 -i app/globals.css \
     -o .design-sync/.cache/compiled-tailwind.css \
     --content "lib/ui/**/*.tsx" --content "app/**/*.tsx" --content "components/**/*.tsx"
   ```

4. **Excluded from component discovery, deliberately** (via
   `cfg.componentSrcMap` — none currently set; kept here for the next
   person who wonders why the count is what it is): none. All 12
   PascalCase value exports under the curated `synth-src/` came through
   (`Button`, `Card`, `CardHeader`, `Field`, `Banner`, `EmptyState`, `Icon`,
   `ProgressBar`, `SegmentedControl`, `Sheet`, `AmountInput`, `WizardSteps`).
   `CardHeader` didn't src-match to its own file (it's a second export
   inside `Card.tsx`) — cosmetic, not a problem.

## Playwright / render-check

The repo's pinned `@playwright/test` (1.63.0) wants chromium build 1243;
the environment's pre-cached chromium was build 1194 (a different pin).
Ran `npx playwright install chromium` (network via the environment's proxy)
to fetch 1243 into `/opt/pw-browsers/` alongside the pre-cached build.
`package-validate.mjs` was then run with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

## Render check state at last build

12/12 components structurally clean (bundle exports, `.d.ts`, styles).
8/12 render non-blank from the floor card's crash-prevention props; 4
(`Card`, `CardHeader`, `EmptyState`, `ProgressBar`) show the honest
unauthored floor card — real components, just no authored `.tsx` preview
yet under `.design-sync/previews/`.

## Re-sync risks

- **`cssEntry` and the `node_modules/budget-calculator` symlink are both
  gitignored and machine-local** — every fresh clone/session must redo
  steps 1 and 3 above before running `package-build.mjs`, or the build
  fails (`NO_DIST`/`ZERO_MATCH` for the symlink; unstyled or `CSS_RUNTIME`
  for the CSS).
- **`.design-sync/synth-src/` will silently miss new components** added to
  `lib/ui/` until someone re-runs the regeneration loop in note 2 — a new
  file there won't error, it just won't be in the bundle or the card
  count until the symlink directory is refreshed.
- **The Tailwind CSS compile in note 3 doesn't scan the full app** (only
  `lib/ui`, `app`, `components` globs) — if a `lib/ui` component starts
  using a utility class that's only ever written elsewhere in the app,
  regenerating from the current globs would still catch it since it scans
  the whole `app/`/`components/` trees, but a genuinely new utility
  introduced only inside a page component and referenced via some
  indirect class-name construction could be missed. None observed at this
  sync.
- **No design-agent authorization in this environment** — the upload to
  claude.ai/design never happened (see final output of the sync session
  that produced this file). `ds-bundle/` and `.design-sync/.cache/` were
  left in place locally; re-running the sync from a session with
  `/design-login` completed can pick straight up from the committed
  `config.json`/`synth-src/`/this file.
- **Preview authoring is incomplete**: `Card`, `CardHeader`, `EmptyState`,
  `ProgressBar` still show the floor card. The other 8 render but have not
  been authored/graded against the absolute rubric either — floor-card
  status was accepted for this pass given the authorization blocker; no
  component has a `.design-sync/previews/<Name>.tsx` yet.
