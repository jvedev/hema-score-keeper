# HEMA Score Keeper (beware this is in development and in no way production ready)

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

## Score-keeper API

De app gebruikt standaard de backend via `/api/v1`. De Vite-devserver proxy't
dat pad naar `http://localhost:3001`.

Zet alleen deze variabelen in `apps/score-keeper/.env.local` als je een andere
backend wilt gebruiken of bewust mockdata wilt afdwingen:

```sh
VITE_API_BASE_URL=https://api.example.com
VITE_USE_MOCK_API=true
```

De event-, arena- en rule-set-adapters gebruiken dezelfde backend als de rest
van de app. Als backend- en UI-data ooit verschillen, is de backend leidend.

## Backend

De backend staat in `apps/backend` en gebruikt Prisma met SQLite. Start hem met:

```sh
npm run backend:build
npm run backend:dev
```

De API luistert standaard op `http://localhost:3001` en biedt nu CRUD voor
clubs, vechters en toernooien, plus toernooi-arena's, poolindeling, bouts en
losse exchanges.
