# Decisions

## 2026-11-09 — Use Decart Lucy 2.6 for live previews

- **Source:** User first selected Decart Lucy VTON, then clarified the app should use Lucy 2.6 and on 2026-11-09 explicitly confirmed continuing with Decart after reviewing the media-transmission boundary.
- **Decision:** Replace the local Canvas/MediaPipe rendering and scratch-trained still-preview direction with Lucy 2.6 realtime video editing and garment try-on. Camera video and garment reference images are sent to Decart after explicit Start.
- **Credential boundary:** Keep the permanent API key in root `.env` as `DECART_API_KEY`; server middleware mints 60-second tokens limited to Lucy 2.6, exact origin, and 10-minute sessions. Local middleware only; no production deployment target chosen.
- **Disclosure:** Tell users provider receives camera and garment media. Current Decart API terms permit using inputs/outputs to operate and improve/train its services.
- **Status:** Implemented as a local Vite development/preview integration; production backend, provider validation, and live camera QA remain open.
- **Supersedes:** ADR-001 browser-local Canvas/WebGL overlay and ADR-002 scratch-trained local still preview. Related renderer/training code and artifacts were removed.

## Historical decisions

Earlier browser-local rendering and training decisions are superseded by the 2026-11-09 Lucy decision above. Their historical evidence and milestone notes remain in `worklog.md`.
