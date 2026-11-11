---
inclusion: always
classification: portable
---

# Security Rules

> Portable baseline — tune for your threat model and compliance needs in this file or a `security-rules.project.md` if you prefer.

## Data Classification

- **Public** — freely shareable
- **Internal** — business-sensitive; access control
- **Confidential** — PII, tokens, message content; encrypt + audit
- **Restricted** — keys/secrets; strong encryption + strict access

## Invariants

- **SEC-01.** Prefer short-lived tokens; rotate API keys.
- **SEC-02.** Use secure session cookie flags when applicable (HttpOnly, Secure, SameSite).
- **SEC-03.** Enforce least privilege / RBAC for admin operations.
- **SEC-04.** Never commit secrets; use env / secret managers.
- **SEC-05.** Do not log tokens, passwords, or raw PII.
- **SEC-06.** Rotate on suspicion of compromise.
- **SEC-07.** TLS in transit for non-local traffic.
- **SEC-08.** Encrypt confidential/restricted data at rest when the product requires it.
- **SEC-09.** Validate and sanitize untrusted input at trust boundaries.

## Negative space

No threat-model tailoring (projects tune in this file or `security-rules.project.md`), no secrets-manager runbooks (procedures live in skills), no vuln-scanning rules (`audit-codebase.mjs`, `semgrep`, CI own detection).

## Enforcement

Reviewer-enforced on slices touching auth, tokens, PII, encryption, payments, or public APIs; `asdd gate` blocks credential-exposing shell patterns; secret checks run in CI. HTTP/GraphQL contract work also loads skill `api-and-interface-design` when installed.

## Escalation

Threat-model/data-class dispute → Tech Lead `dissent` session; a new class or rule → steering proposal, not a mid-slice inline edit.
