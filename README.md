# HEMA Score Keeper

TypeScript monorepo voor een installable HEMA-scorekeeper en een herbruikbare
Web Components-library.

## Structuur

- `apps/score-keeper`: Vite-app, PWA-assets en applicatielogica.
- `packages/ui`: framework-onafhankelijke custom elements.
- `.github/skills/ui-component`: generator voor nieuwe UI-componenten.

Componenten laden hun HTML en CSS als Vite raw imports (`?raw`) en erven van
`BaseComponent` voor Shadow DOM en automatische event-cleanup.

## Commando's

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run storybook
```

Een nieuw component scaffold je met:

```sh
node .github/skills/ui-component/scripts/create-ui-component.mjs --name hema-example
```

## Arena API

De app gebruikt standaard mockdata uit
`apps/score-keeper/src/data/mock/fixtures/arenas.ts`. Zet voor de echte API de
volgende variabelen in `apps/score-keeper/.env.local`:

```sh
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://api.example.com
```

De arena-adapter roept `GET /api/v1/arena/{arenaId}` aan. Het eerste gebruikte
arena-ID is `arena-1`.
