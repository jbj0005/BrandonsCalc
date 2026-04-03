<!-- @spec TOOLING_CONFIGS -->
<!-- @version 1.0 -->
<!-- @section:overview -->

# Tooling Configuration Guide

> How linters, formatters, and utilities integrate with the anchor system.

---

<!-- @section:eslint -->

## ESLint

Custom rules to enforce anchors:

- `local/require-file-anchor` — Warn if file missing identity anchor
- `local/require-spec-reference` — Warn if file missing @spec
- `local/unique-section-names` — Error if duplicate sections

---

<!-- @section:prettier -->

## Prettier

```json
{
  "proseWrap": "preserve"
}
```

**Critical:** Preserves anchor comments in markdown.

---

<!-- @section:vscode -->

## VS Code Snippets

Add to `.vscode/snippets.code-snippets`:

```json
{
  "Component Anchor": {
    "prefix": "@component",
    "body": [
      "<!-- @component ${1:Name} -->",
      "<!-- @spec ${2:SPEC}.md -->",
      "",
      "<!-- @section:props -->"
    ]
  },
  "Store Anchor": {
    "prefix": "@store",
    "body": [
      "// @store ${1:Name}",
      "// @spec ${2:SPEC}.md",
      "",
      "// @section:types"
    ]
  }
}
```

---

<!-- @section:quick-ref -->

## Quick Reference

| Tool | Anchor Role |
|------|-------------|
| ESLint | Validates presence |
| Prettier | Preserves format |
| VS Code | Snippets + navigation |
| Husky | Pre-commit validation |
