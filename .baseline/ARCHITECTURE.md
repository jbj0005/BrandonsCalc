# App Architecture (Web)

- UI: component-driven (atoms → molecules → organisms → templates → pages); build in isolation with Storybook. [oai_citation:13‡atomicdesign.bradfrost.com](https://atomicdesign.bradfrost.com/?utm_source=chatgpt.com)
- State: local component state first, then context/query libs as needed.
- Data: all I/O through `src/api/client.ts`.
- Observability: OpenTelemetry for traces; add `X-Request-ID` to each call. [oai_citation:14‡OpenTelemetry](https://opentelemetry.io/docs/specs/otel/overview/?utm_source=chatgpt.com)
