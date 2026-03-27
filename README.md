# SignalBoard

SignalBoard is Nightshift build 042: a dark-mode personal signal intelligence board for tracking topics, scoring headline sentiment and urgency, and managing a follow-up action queue.

## Live link

https://obrera.github.io/nightshift-042-signalboard/

## Stack

- TypeScript
- Vite
- React
- Tailwind CSS

## Features

- Hacker News Algolia topic feed search with refresh and saveable topic presets
- Deterministic sentiment and urgency scoring for fetched headlines
- Sortable signal table and trend summary cards
- Action queue with pinning, notes, status tracking, and JSON export/import
- Responsive desktop/mobile layout with dark UI by default

## Development

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
npm run deploy
```

## GitHub Pages

The repo includes a workflow that deploys the Vite build from the `main` branch using GitHub Pages.
