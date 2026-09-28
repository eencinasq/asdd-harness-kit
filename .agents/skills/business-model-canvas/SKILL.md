---
name: business-slice-canvas
description: Parses Business Model Canvas and Lean Canvas inputs into structured product capabilities, personas, and revenue-critical features.
---

# Business Model Canvas Analysis

Parses BMC or Lean Canvas and maps sections to capabilities.

## BMC-to-Capability Mapping

| BMC Section | Capability Type |
|---|---|
| Value Propositions | Core Features |
| Customer Segments | Personas |
| Revenue Streams | Billing Capabilities (auto-tagged MUST) |
| Channels | Platform Capabilities |
| Key Partnerships | Integration Capabilities |
| Customer Relationships | Support/UX Capabilities |

## Process

1. Parse Input (JSON, Markdown, or Lean Canvas format)
2. Map BMC sections to capabilities
3. Generate capability entries with source, persona, business context, FRs, EARS criteria
4. Flag revenue-critical capabilities

## Confidence Scoring

- 1.0: Structured BMC with all 9 blocks
- 0.9: Partial but value propositions clear
- 0.8: BMC referenced but not provided
- < 0.8: Insufficient information
