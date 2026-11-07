# CI/CD and protected branch workflow

## Quality checks

The GitHub Actions `Quality` workflow runs for pull requests targeting `main`, pushes to `main`, and manual dispatch. The GitLab pipeline runs for merge requests and the default branch. Both use the committed `package-lock.json` through `npm ci`, then run dependency advisory checks, lint when a lint script exists, TypeScript checking, Vitest, and the production build.

The GitHub workflow exposes a required check named `quality`. Configure `origin/main` to require this check and pull requests, prohibit force-pushes and branch deletion, and deny direct pushes. For GitLab, protect the default branch, disable direct developer pushes, require successful pipelines, and merge through merge requests. GitLab’s branch rules and GitHub’s branch protection are host settings, not repository YAML settings.

Do not configure a deployment job until a target environment, deployment credentials, and release policy are agreed. The current project has no backend or deployment target.

## Local hook

The tracked `.githooks/pre-commit` runs lint when configured, type-checking, and tests. Activate it per checkout with:

```sh
git config core.hooksPath .githooks
```

CI remains the authoritative required check because local hooks can be bypassed.

## Contributor commands

```sh
npm ci
npm run lint --if-present
npm run typecheck
npm test -- --run
npm run build
npm audit --audit-level=high
```

