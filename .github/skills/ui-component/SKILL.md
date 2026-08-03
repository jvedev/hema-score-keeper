---
name: ui-component
description: >
  Scaffold and register a new UI web component in `packages/ui` by running the
  generator script in `.github/skills/ui-component/scripts`. Use when the user
  asks to create, scaffold, or add a new web component in the UI package.
---

Create framework-agnostic custom elements for `packages/ui` with the repo's
`.mjs` generator script instead of emitting long inline scaffolding instructions
or relying on PowerShell-based npm wrappers.

## When to use

Use this skill when the user asks for:
- a new web component in `packages/ui`
- component scaffolding with html/css templates
- global custom-element registration
- component tests with Vitest + Playwright
- Storybook stories for isolated UI development

## Required workflow

1. Ask for `componentName` only if it is not already clear.
2. Derive defaults unless the user explicitly wants overrides:
   - `elementTag = componentName`
   - `className = PascalCase(componentName)`
3. Run the generator directly with Node:

   ```bash
   node .github/skills/ui-component/scripts/create-ui-component.mjs --name "<componentName>"
   ```

4. If needed, override derived names:

   ```bash
   node .github/skills/ui-component/scripts/create-ui-component.mjs --name "<componentName>" --tag "<elementTag>" --class "<className>"
   ```

5. For a preview without writing files:

   ```bash
   node .github/skills/ui-component/scripts/create-ui-component.mjs --name "<componentName>" --dry-run
   ```

## What the generator creates

- `packages/ui/src/components/<componentName>/<componentName>.ts`
- `packages/ui/src/components/<componentName>/<componentName>.html`
- `packages/ui/src/components/<componentName>/<componentName>.css`
- `packages/ui/src/components/<componentName>/<componentName>.test.ts`
- `packages/ui/src/components/<componentName>/<componentName>.stories.ts`
- export in `packages/ui/src/index.ts`

## Rules

- Use the `.mjs` script directly instead of manually rewriting the templates.
- `componentName` must be kebab-case.
- Custom element tag must contain a hyphen.
- Generated component must extend `BaseComponent`.
- Generated test must target Vitest browser mode with Playwright provider.
- Generated story must be available to Storybook via `packages/ui/src/components/**/*.stories.ts`.
