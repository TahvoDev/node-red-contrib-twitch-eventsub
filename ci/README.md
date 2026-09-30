# CI

`github-actions.yml` is the CI workflow for this package. Copy it to
`.github/workflows/ci.yml` to activate it.

It is kept here rather than in `.github/workflows/` because the GitHub App token
used to open the security PR does not have the `workflows` permission, and GitHub
refuses a push that creates a workflow file. Once the app has `workflows: write`
(or a maintainer copies the file), the workflow runs on every push and PR:

- `npm run typecheck` — strict TypeScript (`noImplicitAny`)
- `npm run lint` — `eslint-plugin-security` / `eslint-plugin-no-unsanitized`
- `node scripts/check-forbidden-patterns.js` — sink grep (`.html()`, `Object.assign`, string-built URLs, …)
- `npm run build` — build + unit tests
- `npm run test:coverage` — ≥90% line/function coverage on `src/security/`
- `npm run audit` — runtime dependency audit

Everything above is also part of `npm run check`, so the gates hold even without
GitHub Actions.
