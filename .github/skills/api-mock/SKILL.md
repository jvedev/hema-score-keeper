---
name: api-mock
description: >
  Create deterministic fetch API mocks and fixtures for tests by running the
  generator in `.github/skills/api-mock/scripts`. Use when tests need API calls
  mocked without network access or additional dependencies.
---

Create small, explicit `fetch` mocks that validate the HTTP method and URL,
return realistic `Response` objects, and fail loudly on unexpected requests.

## When to use

Use this skill when the user asks to:
- mock API calls in unit or browser tests
- create reusable request/response fixtures
- test success, empty, error, or delayed API responses
- prevent tests from reaching real services

## Required workflow

1. Identify the endpoint, HTTP method, response status, and response body.
2. Generate a mock module:

   ```bash
   node .github/skills/api-mock/scripts/create-api-mock.mjs --name "load-match" --url "/api/matches/42" --method GET --body '{"id":42}'
   ```

3. For non-JSON responses, use `--content-type`:

   ```bash
   node .github/skills/api-mock/scripts/create-api-mock.mjs --name "health" --url "/health" --body "ok" --content-type text/plain
   ```

4. Preview changes with `--dry-run`. Use `--force` only when replacing an
   existing generated mock is intentional.
5. Import the generated installer in the test, install it before the request,
   assert its recorded calls, and restore it afterward.

## Generator output

The script creates `test/mocks/<name>.mock.mjs` by default. Override this with
`--output <path>`.

Generated modules export:
- `<camelName>Response`: the configured response fixture
- `install<PascalName>Mock()`: installs the mock and returns `{ calls, restore }`

## Rules

- Never call a real API from a unit test.
- Match method and URL explicitly; reject unexpected requests.
- Return standard `Response` objects so production parsing logic is exercised.
- Restore `globalThis.fetch` in `afterEach` or a `finally` block.
- Keep credentials and production payloads out of fixtures.
- Prefer one focused mock per endpoint behavior over a catch-all mock server.
