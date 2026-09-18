# Monash Hackathon

Hackathon project workspace.

## Project brief

> Add the problem, target user, proposed solution, and success metric here.

## Quick start

```bash
npm install
npm run dev
```

The app is a Vite + React dashboard using Tailwind CSS and shadcn-style UI components. It currently uses local demo data so the shell is ready while the hackathon problem statement is still being defined.

### React Grab

React Grab is enabled in development builds only. Keep the Vite server running, then start its clipboard watcher from the project root:

```bash
npm run react-grab
```

Hover an element in the browser and press `Cmd+C` (or `Ctrl+C`) to copy source-aware context. The watcher prints each grab so an agent can consume it. React Grab and the Wrangler Grab extension can both stay installed, but only activate one grab mode at a time: keep Wrangler Grab mode off while using React Grab, then toggle Wrangler Grab on when you need its component export actions.

To create a production build:

```bash
npm run build
```

## Formatting

The repository uses Prettier with the shared settings in `.prettierrc`. Install the **Prettier - Code formatter** VS Code extension and enable format-on-save through the checked-in workspace settings. Run `npm run format:check` before committing, or `npm run format` to apply formatting.

## Environment

Copy `.env.example` to `.env` and fill in local values. Never commit `.env` or real credentials.

## Working agreements

- Read [`AGENTS.md`](AGENTS.md) before making changes.
- Prefer the smallest working end-to-end slice.
- Reuse existing project and platform capabilities before adding dependencies.
- Keep the demo path reproducible for every teammate.
- Follow the [team Git workflow](docs/team-git-workflow.md) for branches, pull requests, and conflict resolution.

## Hackathon checklist

- [ ] Problem and target user are written down
- [ ] One end-to-end demo path works locally
- [ ] Setup and environment variables are documented
- [ ] Loading, empty, and error states are handled
- [ ] Demo data and external-service fallbacks are defined
- [ ] Final pitch, screenshots, and demo script are ready

Git setup test - Gabriella
