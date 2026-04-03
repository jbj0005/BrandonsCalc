<!-- @spec CLI_SECRETS -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# CLI Tools & Secrets

> Agents should run available CLI operations directly instead of asking the user to do them.
> Secrets belong in `.env` and must be mirrored in `.env.example`.

---

<!-- @section:cli-first-rule -->

## Agent CLI-First Rule

1. If an action can be completed with a local CLI, run it.
2. Ask the user only when blocked by missing credentials, unavailable permissions, or destructive confirmation requirements.
3. State the exact blocker when you cannot proceed.

---

<!-- @section:baseline-cli -->

## Baseline CLI Expectations

```bash
npm run dev
npm run build
npm run check
npm run format
npm run test:e2e
```

- Use `rg` / `rg --files` for code search.
- Prefer non-interactive commands where possible.
- Record new required commands in `package.json` and `AGENTS.md`.

---

<!-- @section:secrets -->

## Secrets Handling

- `.env` is local-only and gitignored.
- `.env.example` documents every required variable with blank values.
- Never hardcode credentials in source, docs, or tests.
- Client-safe env vars use public prefixes appropriate to the framework (`PUBLIC_`, `NEXT_PUBLIC_`, etc.).

---

<!-- @section:optional-tools -->

## Optional Tooling

Add sections here as your project adopts more infrastructure:

- Supabase CLI
- Cloud provider CLI
- Error tracking CLI
- Billing / email provider workflows

Keep this file concrete. Remove sections that do not exist in the project.

---

<!-- @section:quick-ref -->

## Quick Reference

| Rule | Requirement |
| --- | --- |
| Run commands directly | Yes |
| Ask user to click dashboards | No |
| Keep `.env.example` updated | Yes |
| Expose server secrets to client | Never |
