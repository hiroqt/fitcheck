# FitCheck Agent Instructions

## Mission

Build and maintain FitCheck as a privacy-first live clothing style preview. Read `docs/PRODUCT_BRIEF.md`, `docs/PRD.md`, `docs/ARD.md`, `docs/SDD.md`, and `docs/SECURITY.md` before making a substantial change. The security document may be added in parallel; until it lands, follow the privacy/security constraints in the SDD and ADR.

## Non-negotiable boundaries

- Keep webcam frames and uploaded garment pixels in the browser for validation and preparation. For the accepted Lucy 2.6 MVP, after the user starts a session and sees the provider data-use notice, send the video-only camera stream and prepared garment reference directly to Decart; never log or persist either. The local token route must not receive media.
- Request camera access only after explicit user action; stop all media tracks on stop, unmount, and failure.
- The preview is illustrative. Do not add fit, size, material, or purchase guarantees.
- Do not add retailer scraping, broad browser permissions, accounts, checkout, or remote media providers beyond the accepted Decart integration without an accepted scope/architecture review.
- Verify commercial permissions for each dependency, model, model checkpoint, and asset independently; repository license labels are not enough.
- Do not add credentials or user imagery to source, fixtures, tests, or context notes.
- Do not weaken CI, GitHub/GitLab main protections, or security checks to make a change pass.

## Working agreements

- Preserve the existing Vite/React/TypeScript conventions and use the smallest complete change.
- Trace callers and flows before changing camera, pose, file, or rendering behavior.
- Add behavior-focused checks for new non-trivial logic at the highest practical public seam.
- Run the relevant checks documented in `package.json` and CI. Report exact commands, results, and unverified behavior.
- Keep PRs focused; branch names use `<area>/<short-description>` and never include `codex`.
- All changes to hosted `main` go through a reviewed pull/merge request. Do not push directly to the protected remote branch.

## Self-improving context (human-reviewed)

FitCheck improves its instructions through evidence, not autonomous policy mutation:

1. When a task reveals a reusable lesson, record a short factual note in `docs/context/lessons.md` with date, trigger, evidence, and the action that prevents recurrence.
2. Record accepted product/architecture changes in `docs/context/decisions.md` with source, date, status, and superseded decision if any.
3. Keep `docs/context/worklog.md` to milestone summaries: goal, changed files, checks actually run, and next action. Do not copy transcripts or private data.
4. Propose edits to `AGENTS.md`, hooks, CI, and security rules in a PR with rationale and tests; a human must approve them.
5. Never let an agent directly rewrite its own policy, silently install hooks, remove safeguards, or turn an inferred observation into an accepted product decision.
6. Periodically compact stale worklog entries while preserving current decisions, constraints, and unresolved risks.

No context update may contain images, video, faces, file contents from user uploads, credentials, or identifying personal data.

