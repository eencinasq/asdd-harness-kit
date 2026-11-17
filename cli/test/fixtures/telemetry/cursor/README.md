# Cursor fixtures

None. D-3 was decided on 2026-11-17 (PO/TL eencinas): Cursor is treated as **hookless** for guidance loads.

No live `beforeReadFile` payload was captured, and a fixture copied only from vendor docs does not count as proof
(ADR-004). So:

- `asdd observe cursor` answers `{"permission":"allow"}` and records nothing (the TASK-010 default, pinned by TASK-012 tests);
- the installer wires no Cursor `beforeReadFile` hook (TASK-014);
- `asdd profile` shows Cursor loads as `unknown`, never `not observed`.

To ship the Cursor load hook later, commit a `method: "live-capture"` fixture here and reopen D-3.
