---
inclusion: always
---

# Security Rules

> Portable baseline — tune for your threat model and compliance needs in this file or a `security-rules.project.md` if you prefer.

## Data Classification

- **Public** — freely shareable
- **Internal** — business-sensitive; access control
- **Confidential** — PII, tokens, message content; encrypt + audit
- **Restricted** — keys/secrets; strong encryption + strict access

## Authentication & Authorization

- Prefer short-lived tokens; rotate API keys
- Use secure session cookie flags when applicable (HttpOnly, Secure, SameSite)
- Enforce least privilege / RBAC for admin operations

## Secrets

- Never commit secrets; use env / secret managers
- Do not log tokens, passwords, or raw PII
- Rotate on suspicion of compromise

## Transport & storage

- TLS in transit for non-local traffic
- Encrypt confidential/restricted data at rest when the product requires it
- Validate and sanitize untrusted input at trust boundaries

## When to load

Any slice touching auth, tokens, PII, encryption, payments, or public APIs must read this file. HTTP/GraphQL contract work also loads skill `api-and-interface-design` when that module is installed.
