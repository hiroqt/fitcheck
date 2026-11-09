# Architecture Decision Record

## ADR-003: Use Decart Lucy 2.6 for realtime previews

- **Status:** Accepted by the user; local integration in progress.
- **Date:** 2026-11-09.
- **Decision:** Replace the browser mesh overlay and scratch-trained still model with Decart Lucy 2.6 realtime editing and garment try-on. The browser captures camera video after the user starts, sends the stream and garment reference/prompt to Decart, and displays the remote stream.
- **Credential handling:** Keep the permanent key in a server environment variable. For local development, Vite provides a same-origin token route that issues 60-second client tokens restricted to `lucy-2.6`, the exact request origin, and a maximum 10-minute session.
- **Disclosure:** Clearly tell users that live video and garment images are sent to Decart. Decart's published API terms permit use of inputs and outputs to operate and improve/train its services.
- **Production gate:** Vite's local middleware is not a production API. A production serverless/backend endpoint, deployment target, HTTPS, user abuse controls, usage/cost limits, and complete privacy/legal review are required before launch.
- **Source:** User requested Lucy VTON then clarified Lucy 2.6 on 2026-11-09; current provider docs at [Lucy 2.6](https://docs.platform.decart.ai/models/realtime/lucy-2.6), [Authentication](https://docs.platform.decart.ai/getting-started/authentication), and [API Terms](https://docs.platform.decart.ai/resources/api-terms).

### Consequences

- Preview quality and camera output depend on a network connection, Decart availability, its model, and the user's input.
- The experience no longer claims browser-local media processing. The explicit camera-start action gates transmission.
- Lucy 2.6 supports VTON but Decart documents Lucy VTON as its dedicated optimized model; this app follows the user's explicit Lucy 2.6 choice.
- Provider credits may be consumed while a session is connected. Current UI uses standard speed; fast mode is omitted because it costs more.
- The permanent key is not suitable for client-side use and must be rotated if it was previously exposed.

## Superseded decisions

- **ADR-002 (2026-11-09):** random-initialized local still model and loopback-only inference. Superseded by ADR-003; training scaffold removed.
- **ADR-001 (2026-11-07):** browser-local Canvas/WebGL try-on. Superseded by ADR-003; rendering pipeline removed.
