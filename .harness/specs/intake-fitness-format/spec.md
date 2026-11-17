# intake-fitness-format — Spec (hotfix)

## Intent

`asdd intake` (slice intent-intake) rejects Intent items written from the official intent template: the template and
the PO-mode example (`cli/steering/templates/intent.md`, `product-delivery/references/po-mode-tracker-output.md`)
write the fitness bullet as `- **status:** fit`, but the parser accepts only `- **status**: fit` or `- status: fit`.
Found at integration by running the P6.3 example through the P6.4 parser. Accept the colon inside or outside the bold.

Mapped: `cli/src/harness/intake-lib.mjs`, `cli/src/harness/intake-lib.test.mjs`

## Requirements

- **REQ-001.** `asdd intake` shall accept the Intent fitness status written as `- **status:** fit`, `- **status**: fit`, or `- status: fit`, and still reject any value other than `fit`.
