# Roam GTD

GTD dashboard and weekly review wizard for Roam Research.

## Features

- GTD Dashboard in a right-side `Drawer`
- 8-step Weekly Review wizard
- Dedicated Next Actions modal with native Roam block editing
- Native daily-note spawn for grouped `#up` next actions under `[[Plans, Priorities]]`
- Project-aware next-action spawn nesting (`context -> project ref -> todo ref`)
- Category counts for inbox, next actions, waiting, delegated, someday, stale, deferred, and projects
- SmartBlocks commands:
  - `<%ROAMGTDDASHBOARD%>`
  - `<%ROAMGTDREVIEW%>`
- Reactive refresh through Roam `addPullWatch` for `TODO` and `DONE` changes

## Install

### Local development

1. Clone the repo.
2. Install dependencies:

```bash
pnpm install --shamefully-hoist
```

3. Build extension bundle:

```bash
pnpm build:roam
```

4. Start the local dev server that serves `build/extension.js` with the CORS headers Roam expects:

```bash
pnpm serve:roam-dev
```

5. In Roam, open `Settings` -> `Extensions` -> `Developer Extensions`, click the link icon, and load:

```text
http://127.0.0.1:8765/
```

Roam will request `extension.js`, `README.md`, `extension.css`, and `CHANGELOG.md` from that base URL. The local dev server provides the required fallback files automatically.

6. After each rebuild, refresh the remote dev extension row in Roam or run `Reload developer extensions` from the command palette.

## Commands

Use Roam command palette:

- `GTD: Open Dashboard`
- `GTD: Weekly Review`
- `GTD: Next Actions`
- `GTD: Spawn Next Actions in Today`
- `GTD: Spawn Next Actions for Tomorrow`

## Settings

Open the Roam settings panel tab `Roam GTD` and configure:

- Next Action Tag
- Waiting For Tag
- Delegated Tag
- Someday/Maybe Tag
- Inbox Page
- Daily Note Parent Block (for spawned next actions)
- Stale Threshold (days)
- Top Goal Attribute
- Review Item Mode (`list` or `one-by-one`)

## Weekly Review flow

1. Inbox Zero
2. Next Actions
3. Waiting For
4. Delegated
5. Stale
6. Projects
7. Someday/Maybe
8. Weekly Wrap-Up

Step 8 can save a summary block to `[[Weekly Reviews]]`.

## Development scripts

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build:roam`
- `pnpm serve:roam-dev`
- `pnpm check`

## CI and release

- CI runs on pushes and pull requests to `main`.
- Tag pushes (`v*`) trigger a release workflow and upload `build/extension.js`.
