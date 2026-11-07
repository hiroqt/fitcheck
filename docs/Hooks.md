# Hooks and Automated Checks

## Purpose

Hooks should catch quick, deterministic mistakes close to the change. They do not replace CI or authorize policy changes.

## Git hook contract

The repository may use a versioned `.githooks/` directory configured through `core.hooksPath`. Any installed hook must be visible, reviewable, documented here, and safe to skip only where a documented alternative exists. A hook must not modify files, transmit source/user data, install dependencies, or access camera/media.

### `pre-commit`

When installed, run the fast local quality checks available in the package scripts (format/lint and type check). It must not commit, stage, amend, or rewrite source. If checks need installed dependencies and they are absent, print the setup command and fail clearly.

### `pre-push`

No pre-push hook is required for the MVP. CI is authoritative for the complete check set. The hosted `main` protection is the actual control that blocks direct pushes; a local hook alone cannot enforce that policy.

## CI hooks/events

- GitHub Actions: `pull_request` into `main`, pushes to `main` for post-merge verification, and manual dispatch.
- GitLab CI: merge-request pipelines for changes targeting `main`, plus post-merge pipeline on `main`.
- Required check should be a stable job/context (for example, `quality`) that completes formatting/lint, type checks, behavior checks, production build, and dependency audit.

## Agent lifecycle

There is no autonomous agent hook that edits memory, instructions, code, or permissions. The self-improvement loop is the human-reviewed Markdown process in `AGENTS.md` and `docs/context/`.

## Maintenance

Update this document whenever a hook is added, removed, or changes behavior. Review the hook source and CI workflow in the same PR. Do not add network access or secret-bearing environment variables to local hooks.

