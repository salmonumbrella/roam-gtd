# Roam GTD

A Getting Things Done (GTD) extension for [Roam Research](https://roamresearch.com). Adds a dashboard drawer, an 8-step weekly review wizard, and daily-note spawning — all driven by your existing `{{[[TODO]]}}` blocks and tag conventions. Zero graph pollution: reads your data via Datalog, never writes metadata.

## What it does

**Dashboard** — a right-side drawer showing task counts across GTD categories (inbox, next actions, waiting, delegated, someday, stale, projects) with filter chips.

**Weekly Review** — a guided 8-step modal wizard:

1. Inbox Zero — triage items from your inbox page one by one with keyboard shortcuts
2. Next Actions — review `#up` items, mark done or reschedule
3. Waiting For — check `#watch` items
4. Delegated — follow up on `#delegated` items
5. Stale — surface TODOs untouched for N days
6. Projects — review project status
7. Someday/Maybe — revisit `#someday` items
8. Weekly Wrap-Up — save a structured summary to `[[Weekly Reviews]]`

**Daily Review** — a lighter daily check-in for stale inbox items.

**Next Actions** — a dedicated modal for browsing and editing next actions with native Roam block editing.

**Spawn Next Actions** — writes grouped `#up` next actions into today's or tomorrow's daily note under a configurable parent block (default: `[[Plans, Priorities]]`), nested by context and project.

## Tag vocabulary

All tags are configurable in extension settings. Defaults:

| GTD category | Default tag | Hotkey (in wizard) |
|---|---|---|
| Next Action | `#up` | `U` |
| Waiting For | `#watch` | `W` |
| Delegated | `#delegated` | `D` |
| Someday/Maybe | `#someday` | `S` |

## Commands

Open the Roam command palette (`Cmd+P`) and search:

- **GTD: Open Dashboard**
- **GTD: Weekly Review**
- **GTD: Daily Review**
- **GTD: Next Actions**
- **GTD: Spawn Next Actions in Today**
- **GTD: Spawn Next Actions for Tomorrow**
- **GTD: Rebuild Plans & Priorities**

## Settings

Open **Settings → Roam GTD** to configure:

- Tag names for each GTD category
- Delegate target tags (people, agents)
- Agent delegation webhook URL
- Inbox page name (default: `Triage`)
- Daily note parent block (default: `[[Plans, Priorities]]`)
- Stale threshold in days (default: 14)
- Top Goal attribute name
- Trigger List page name
- Review item mode (`list` or `one-by-one`)
- Language (`en` or `zh-TW`)
- Weekly review day and time
- Notification preferences (weekly and daily review reminders)
- Keyboard shortcuts for triage actions
- Tooltip visibility

## Install

### From source

```bash
git clone https://github.com/salmonumbrella/roam-gtd.git
cd roam-gtd
pnpm install --shamefully-hoist
pnpm build:roam
```

### Load in Roam

1. Start the local dev server:

```bash
pnpm serve:roam-dev
```

2. In Roam: **Settings → Extensions → Developer Extensions** → click the link icon → enter:

```
http://127.0.0.1:8765/
```

3. After each rebuild (`pnpm build:roam`), reload via **Cmd+P → "Reload developer extensions"**.

## Development

```bash
pnpm start             # dev mode with hot reload
pnpm build:roam        # production build
pnpm test              # run tests (vitest)
pnpm test:watch        # watch mode
pnpm lint              # oxlint
pnpm format            # oxfmt
pnpm typecheck         # tsgo
pnpm check             # all of the above in parallel
```

## License

MIT
