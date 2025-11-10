# AI Coding Rules (Apply to ALL generated code)

- Use TypeScript with strict mode; no `any`.
- Use our tokens from `.baseline/design-tokens.json`.
- Accessibility: respect WCAG 2.2 AA; toasts use `role="alert"`/`aria-live` patterns; modals trap focus. [oai_citation:10‡W3C](https://www.w3.org/WAI/standards-guidelines/wcag/?utm_source=chatgpt.com)
- API: Use `src/api/client.ts` for all network calls. Timeouts, retries (respect `Retry-After`), correlation ID, and `Idempotency-Key` on POST/PATCH. Errors are `application/problem+json` per RFC 9457. [oai_citation:11‡MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After?utm_source=chatgpt.com)
- Commits: Conventional Commits; generate tests with Testing Library + Vitest/Jest. Use SemVer for version bumps. [oai_citation:12‡Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/?utm_source=chatgpt.com)
