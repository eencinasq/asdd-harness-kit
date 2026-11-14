---
inclusion: auto
tags:
  - discovery
  - domain
  - design
  - task_planning
  - implementation
  - qa
  - refactor
classification: portable
---

# Domain logic placement contract

This is the portable contract for deciding where business rules belong. It is mandatory for every project using this harness. The project binding named in [README.md](README.md#project-bindings) defines the concrete layers, paths, exceptions, and checks. Agents must apply both this contract and that binding; they must not infer project architecture from this file.

## Required principles (invariants)

- **DOM-01.** **Keep business rules in the domain layer.** Place rules in the project's designated domain model or domain service. Keep transport, UI, and framework entry points focused on input/output, orchestration, and dependency wiring.
- **DOM-02.** **Separate policy from mechanisms.** Domain policy must not depend directly on external vendors, persistence engines, or delivery frameworks. Define a project-appropriate boundary for those mechanisms and implement integrations behind it.
- **DOM-03.** **Make exceptions explicit.** A project may keep a rule outside its domain layer only when its documented architecture allows it. Require a rationale in the design artifact and cite the applicable project decision. Existing code alone is not sufficient justification for extending an exception.
- **DOM-04.** **Respect state ownership.** Apply the project's documented distinction between durable business state and transient runtime state. Do not create domain entities or move transient state without evidence in the domain model/design.
- **DOM-05.** **Trace changes through the architecture.** Designs and task plans identify the domain concept, owning layer, integration boundaries, and any application-facing wiring affected. Implementation follows that approved placement.
- **DOM-06.** **Enforce boundaries.** Before declaring implementation complete, run the project binding's required boundary checks. QA and Refactor assess only the changed scope, while reporting any broader issue separately as existing debt.

## Negative space

- This contract defines no concrete layers, paths, or exceptions — those live only in the project binding; agents shall not infer project architecture from this file.
- Existing code is not precedent — DOM-03: an undocumented deviation never authorizes the next one.
- No project procedure lives here — binding-supplied commands and phase procedures stay in `domain-layer.project.md`.

## Phase responsibilities

- **Domain:** identify business concepts and state ownership; record gaps rather than inventing project structures.
- **Design:** map changed behavior to the project's domain layer and integration boundaries; document justified exceptions.
- **Task Planning:** order tasks according to the project's layer dependencies and include its required checks.
- **Implementation:** keep changes within the approved design and run required boundary checks before completion.
- **QA / Refactor:** assess placement and boundary compliance against the project binding and changed scope.

## Enforcement

DOM-06 runs through the project binding's `Gate command` and `verify_architecture_rules` (Semgrep — rule selection per [spec-drift.md](./spec-drift.md#bindings)); the Domain Placement Gate (`QG-BIND-04`…`06`) applies it at Implementation-complete, QA Mode B, and Refactor; an unfilled binding is `BLOCK` (`QG-BIND-03`), never inferred.

## Escalation

A placement or exception dispute → `dissent` session for Tech Lead ruling — the agent does not extend exceptions. A binding that contradicts this contract → steering proposal on the binding, not a contract edit mid-slice.

## Project bindings

Each project using these rules must provide a project-specific binding and list it in `.harness/steering/README.md`. The binding is mandatory and supplies concrete architecture, names, paths, exception policy, enforcement commands, and phase-specific procedures. For this repository, see [domain-layer.project.md](domain-layer.project.md). Placement severities and the SP-002 test command live in [quality-gates.project.md](quality-gates.project.md).
