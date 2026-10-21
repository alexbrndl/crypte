---
'@crypte/tokens': patch
---

A token whose `var()` fallback is a string holding a lone parenthesis, `var(--base, 'a ) b')`, is now read as an alias of `--base` instead of being kept as raw text.
