# ASDD + Harness — Gaps, mejoras y roadmap priorizado

> Estado analizado: pipeline ASDD + Harness del kit (noviembre 2026), comparado con Spec Kit, Kiro, Tessl, OpenSpec y BMAD.
> Las referencias de mercado son orientativas (conocimiento hasta 2026): verificarlas antes de apostar un ciclo.
> Estilo: el mismo formato que [`tools/spec-drift/docs/ROADMAP.md`](../tools/spec-drift/docs/ROADMAP.md).

## Estado de implementación (nov 2026)

| Prioridad | Slice | Hecho | Diferido (2ª versión del kit) |
|-----------|-------|-------|-------------------------------|
| **P0** | `asdd-p0` | P0.1 metrics, P0.2 init-flow + Spec Kit guide | P0.3 npm publish estable |
| **P1** | `asdd-p1` | skills `/asdd-*`, `status --html` + `pipeline_status`, `asdd converge` | MCP App `ext-apps` completo |
| **P2** | `asdd-p2` | `--hotfix` / lite / `--full`, `slice amend`, hill sensor | — |
| **P3** | `asdd-p3` | `waves`, `portfolio`, `converge-eval` | P3.3 Windows hooks, P3.4 import Spec Kit/OpenSpec |
| **P4** | `asdd-p4` | `tracker-sync`, Stop `advisory`, `spec-source` opt-in | P4.2 presets Cencosud |
| **Shaping** | `egm-shaping` | Intent fitness, Goldfish scope-split, concepts_brief, critique-first, brownfield pack | — |
| **P5** | `telemetry-emitters`, `skill-eval`, `learn-eval-gate`, `cost-metrics`, `asdd-ui`, `ui-gate-decisions`, `ui-insights` | `skill-eval`, `learn-eval-gate`, `asdd-ui`, `ui-gate-decisions` (P5.2, P5.3, P5.5, P5.6); en curso: `telemetry-emitters` | P5.8–P5.10 según demanda |
| **P6** | `tracker-binding`, `shaping-agent`, `grounded-shaping`, `intent-intake`, `shaping-cloud-setup` | — (abierto, nov 2026) | — |

Slices `asdd-p0`…`asdd-p4` están en `DONE` (escalated donde el scope cruzó módulos). El detalle por ítem está en §4.
`egm-shaping` porta conceptos EGM (Elephant/Goldfish) a `shape-up` / `product-delivery` para intents lite-fit; SoT de build sigue en `.harness/`.

### Comandos nuevos (referencia rápida)

| Comando | Roadmap |
|---------|---------|
| `asdd status --metrics` / `--json` / `--html` | P0.1, P1.2 |
| `asdd init-flow` | P0.2 |
| `asdd converge` / `converge-eval` | P1.3, P3.5 |
| `asdd slice init --hotfix` / `slice amend` | P2.1, P2.2 |
| `asdd waves` / `portfolio` | P3.1, P3.2 |
| `asdd tracker-sync` / `spec-source` | P4.1, P4.4 |
| `stop.mode=advisory` / `HARNESS_STOP_MODE` | P4.3 |

Skills: `asdd-status`, `asdd-next`, `asdd-implement`, `asdd-converge` (`cli/skills/`). Knowledge MCP: `pipeline_status`.

## 1. Qué es hoy

Tres capas en un solo kit:

| Capa | Qué hace | Fortaleza |
|------|----------|-----------|
| **Shape Up + Product Delivery** | Idea → pitch → bet → scopes → `intent.md` | Control de incertidumbre *antes* de codear; sin backlog |
| **ASDD** | 9 fases (o lite 4-artifact) por slice | Roles, gates EARS, handoffs tipados |
| **Harness** | Features, `scope_paths`, evidence, sessions, sensors DRIFT/learn, hooks | **Feedback determinista** — lo que el mercado aún pide y pocos entregan |

Nivel SDD ([Böckeler / Thoughtworks](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)): **spec-first + spec-anchored** (specs viven en `.harness/specs/`, DRIFT-02 reabre `passing`). **No** es Tessl *spec-as-source* por defecto (el humano sigue editando código; `asdd spec-source` es piloto opt-in).

**Diferencia frente al mercado:** no compite como “generador de markdown para el agente”; compite como **outer harness** (guías + sensores + evidencia) que envuelve cualquier modelo/runtime.

## 2. Posicionamiento

| Capacidad | Spec Kit | Kiro | OpenSpec | BMAD | Tessl | **ASDD+Harness** |
|-----------|----------|------|----------|------|-------|------------------|
| Flujo slash / UX rápida | ★★★★★ | ★★★★ | ★★★★★ | ★★★ | ★★★ | ★★★ (skills `/asdd-*` + CLI) |
| Integraciones agent | 30+ | IDE propio | muchas | skills | MCP | ~7 runtimes (hooks fuertes en Cursor/Claude) |
| Lite vs full (tamaño problema) | débil | débil | fuerte (deltas) | débil (pesado) | N/A | **fuerte** (hotfix / lite / full + escalation E1–E5 + amend) |
| Product shaping (Shape Up) | no | no | no | PRD/roles | no | **sí** |
| Sensors deterministas post-código | checklists AI | hooks IDE | validate | poco | tests↔spec | **DRIFT-01…07 + converge + verify-on-stop + CI** |
| Evidence / “done” | converge (LLM) | task UI | archive | roles | generate | **verification + evidence_hash** |
| Self-improving loop | no | parcial | no | no | registry | **`asdd learn` LP→SP** |
| Spec drift / ADR enforcement | analyze (LLM) | poco | poco | poco | build | **Semgrep + audit + Spec Drift MCP** |
| Distribución / adopción | `uvx specify` | producto AWS | npm | npx | beta | kit clone / `npm pack` (**P0.3 npm pin** aún pendiente) |
| Multi-repo / org | limitado | — | Stores (beta) | — | Registry | **`asdd portfolio`** (read-only) |

- **Ganar en:** conformidad con lo que el equipo decidió (intent → REQ → feature → archivo → test → PR) + sensores que no mienten.
- **No competir en:** “SDD en 5 minutos con un slash command” *sin* sensores (Spec Kit / OpenSpec dominan esa narrativa).
- **Hueco del mercado:** casi todos generan specs; casi nadie **verifica después** que el código las sigue cumpliendo. Eso es el núcleo del kit.
- **Mantener lo que genera confianza:** SoT bajo `.harness/`, MCP/chat no escribe triage, humano en gates Shape Up / Product Delivery.

## 3. Gaps detectados

| ID | Gap | Impacto | Estado |
|----|-----|---------|--------|
| **G1** | Curva de adopción alta | Spec Kit gana por default | **Mitigado** (P0.2 `init-flow` + guía Spec Kit); import Spec Kit/OpenSpec → P3.4 diferido |
| **G2** | Sin happy path chat-first | Claude/Cursor viven de slash | **Hecho** (P1.1 skills `asdd-*`) |
| **G3** | Distribución npm frágil | Fricción corporate / CI pin | **Abierto** (P0.3 diferido) |
| **G4** | Hill chart solo narrativa | Product Delivery sin feedback | **Hecho** (P2.3 `hill` + status + HILL-01) |
| **G5** | Overkill en cambios pequeños | Crítica Böckeler | **Hecho** (P2.1 `--hotfix`) |
| **G6** | Brownfield onboarding 15′ | Repos legacy abandonan | **Hecho** (P0.2 `init-flow`) |
| **G7** | UX de fase = JSON a mano | TL no ve el ciclo | **Hecho** (P1.2 `--html` + `pipeline_status`; MCP App full diferido) |
| **G8** | Waves sin orquestación | Ciclo lento en full | **Hecho** (P3.1 `asdd waves`) |
| **G9** | EARS semántico solo inferencial | Falso control si solo DRIFT | **Mitigado** (P1.3 converge + P3.5 `converge-eval`) |
| **G10** | Multi-repo / portfolio | Empresas multi-servicio | **Hecho** (P3.2 `asdd portfolio`) |
| **G11** | Windows nativo hooks | Adopción Win | **Abierto** (P3.3 diferido; WSL/Git Bash documentado) |
| **G12** | Medición del pipeline | No priorizar proceso | **Hecho** (P0.1 `status --metrics`) |
| **G13** | Slash/MCP surface débil vs Spec Drift | Claude usa Spec Drift | **Mitigado** (P1.1 skills + P1.2 `pipeline_status`) |
| **G14** | Slice DONE → evolve sin re-pitch | Mantenimiento a medias | **Hecho** (P2.2 `slice amend`) |
| **G15** | No se sabe qué steering/skills se cargan de verdad (instalado vs. usado) | Guías muertas o ignoradas sin señal | **Abierto** (P5.1 `telemetry-emitters`) |
| **G16** | Skills y agentes sin eval de comportamiento antes/después | Un cambio de guía puede regresar sin que nada lo detecte; el learning loop solo verifica a posteriori | **Hecho** (P5.2 `asdd skill-eval`, P5.3 QG-LEARN-10) |
| **G17** | Sin costo/tokens por slice, modelo o runtime | No se puede comparar configuraciones ni justificar el proceso | **Abierto** (P5.4 `cost-metrics`) |
| **G18** | UI dispersa y atada a hosts MCP (límite ~13 KB en Cursor) | TL/PM fuera del IDE no ven el ciclo completo | **Hecho** (P5.5 `asdd ui`) |
| **G19** | Gates humanos (`decided_by`) solo desde IDE/CLI | Fricción para quien decide; gates retrasados | **Hecho** (P5.6 `asdd gate-decide` + vista Gates) |
| **G20** | Skills/steering sin versión propia ni distribución entre repos | No hay packs de organización ni inventario de versiones | **Según demanda** (P5.8) |
| **G21** | Skills/agentes de terceros sin escaneo de seguridad | Prompt injection, comandos peligrosos, exfiltración | **Según demanda** (P5.9) |
| **G22** | Sin gobierno de organización (steering central, audit log agregado) | Cada repo diverge; sin trazabilidad multi-repo de overrides | **Según demanda** (P5.10) |
| **G23** | El proyecto no declara su tracker (Jira, Linear, GitHub) | Las skills preguntan o adivinan dónde viven pitches e intents | **Abierto** (P6.1 `tracker-binding`) |
| **G24** | El PO/PM no tiene un agente de solo lectura sobre el repo | Shaping desde el IDE o con permisos de escritura que no necesita | **Abierto** (P6.2 `shaping-agent`) |
| **G25** | Pitch e intents no se basan en el código, las specs ni el histórico | Scopes que duplican componentes; appetite sobreestimado | **Abierto** (P6.3 `grounded-shaping`) |
| **G26** | Nada importa un intent del tracker a la máquina del ingeniero | El ingeniero reescribe el intent a mano; se pierde la trazabilidad | **Abierto** (P6.4 `intent-intake`) |
| **G27** | El PO sin clon local no tiene las herramientas de grounding | Shaping solo posible con IDE y repo local | **Abierto** (P6.5 `shaping-cloud-setup`) |

## 4. Roadmap priorizado

Escala: **Valor** (alto / medio / bajo) · **Esfuerzo** S (≤ 2 días) / M (≤ 1 semana) / L (> 1 semana).

### P0 — Confianza y adopción

#### P0.1 Kit de evaluación del pipeline · cubre G12

- **Estado:** hecho en `asdd-p0` (`asdd status --metrics` / `--json`, `pipeline-metrics.mjs` + tests).
- **Propuesta:** métricas de proceso (fase duration, stop FAIL rate, escalation rate, lite share).
- **Valor:** alto · **Esfuerzo:** M

#### P0.2 Happy path de 15 minutos (brownfield) · cubre G1, G6

- **Estado:** hecho en `asdd-p0` (`asdd init-flow`, `cli/docs/guides/spec-kit-to-asdd.md`).
- **Propuesta:** install + 1 slice lite + feature mínima + `asdd check` verde.
- **Valor:** alto · **Esfuerzo:** M

#### P0.3 Publicar / pin npm estable · cubre G3

- **Estado:** **pendiente** — diferido hasta versión releasable (fuera de `asdd-p0`).
- **Propuesta:** `asdd-harness-kit` en registry + `npx asdd install`.
- **Valor:** alto · **Esfuerzo:** S–M (proceso)

### P1 — UX agent-native

#### P1.1 Slash / skills ASDD · cubre G2, G13

- **Estado:** hecho en `asdd-p1` (`cli/skills/asdd-{status,next,implement,converge}`).
- **Valor:** alto · **Esfuerzo:** M

#### P1.2 Pipeline dashboard · cubre G7

- **Estado:** hecho en `asdd-p1` (`asdd status --html` + knowledge `pipeline_status`). MCP App `ext-apps` completo diferido.
- **Valor:** alto · **Esfuerzo:** M

#### P1.3 Converge sensor (barato) · cubre G9

- **Estado:** hecho en `asdd-p1` (`asdd converge` en `asdd check`; CONVERGE-02 WARN salvo `--strict`).
- **Valor:** alto · **Esfuerzo:** S–M

### P2 — Encajar tamaños de problema

#### P2.1 Tres presets · cubre G5

- **Estado:** hecho en `asdd-p2` (`asdd slice init --hotfix` / default lite / `--full`).

| Preset | Cuándo | Artefactos |
|--------|--------|------------|
| `hotfix` | bug ≤ 1 archivo | feature + evidence; sin Discovery |
| `lite` | feature acotada | path lite actual |
| `full` | cross-cutting | `--full` |

#### P2.2 Evolución post-DONE · cubre G14

- **Estado:** hecho en `asdd-p2` (`asdd slice amend` → `in_progress` + `amendments/<stamp>.md`).

#### P2.3 Hill-chart sensor · cubre G4

- **Estado:** hecho en `asdd-p2` (`hill` on features; `asdd status` § Hill; `HILL-01` WARN en qa/knowledge).

### P3 — Más profundidad

| ID | Propuesta | Cubre | Estado |
|----|-----------|-------|--------|
| P3.1 | Waves (owners + deps → paralelismo) | G8 | **hecho** — `asdd waves` |
| P3.2 | Portfolio multi-repo read-only | G10 | **hecho** — `asdd portfolio` + `portfolio.json` |
| P3.3 | Windows hooks / WSL-only docs | G11 | **diferido** — 2ª versión |
| P3.4 | Import Spec Kit / OpenSpec | G1 | **diferido** — 2ª versión |
| P3.5 | Semantic converge-eval (EARS fixtures) | G9 | **hecho** — `asdd converge-eval` + `cli/eval/converge-ears/` |

### P4 — Según demanda

| ID | Propuesta | Estado |
|----|-----------|--------|
| P4.1 | Sync bi-direccional Jira/Linear más cerrado | **hecho** — `asdd tracker-sync` + skill Step 4 |
| P4.2 | Presets Cencosud | **diferido** — 2ª versión |
| P4.3 | Stop advisory-only | **hecho** — `stop.mode` / `HARNESS_STOP_MODE=advisory` |
| P4.4 | Spec-as-source experimental | **hecho** — `asdd spec-source` opt-in (**not** default SoT) |

### P5 — Medir y superficie humana

Origen: análisis del 2026-11-16 frente a Eminzo AI Factory (UI de escritorio sobre un orquestador) y Tessl (gestión del ciclo de vida de skills). Conclusión: el kit no necesita orquestar ni alojar loops; le falta **medir** sus guías y **mostrar** el estado a quien decide los gates.

| ID | Slice | Propuesta | Cubre | Modo | Depende de | Estado |
|----|-------|-----------|-------|------|------------|--------|
| P5.1 | `telemetry-emitters` | Fase 2 de `telemetry-contract`: emisores fail-open, spans de activación de steering/skills, `asdd profile` (guardrails AR-1…AR-10) | G15 | full | `telemetry-contract` | **abierto** |
| P5.2 | `skill-eval` | `asdd skill-eval`: fixtures por skill, comparación contra baseline, regresiones | G16 | lite | — | **hecho** — `asdd skill-eval` + `cli/eval/skills/` |
| P5.3 | `learn-eval-gate` | Propuestas `SP-*` que cambian guías requieren eval adjunta (`QG-LEARN-*`) | G16 | lite | P5.2 | **hecho** — QG-LEARN-10 |
| P5.4 | `cost-metrics` | Tokens y costo por slice, fase, modelo y runtime en `status --metrics` | G17 | lite | P5.1 | **abierto** |
| P5.5 | `asdd-ui` | `asdd ui`: servidor local Node sin dependencias, solo lectura, agrega pipeline + spec-drift + learning + knowledge | G18 | lite | — | **hecho** — `asdd ui` |
| P5.6 | `ui-gate-decisions` | Única escritura de la UI: decidir gates vía comando `asdd` (`decided_by` + nota) | G19 | lite | P5.5 | **hecho** — `asdd gate-decide`, vista Gates (Host/Origin) |
| P5.7 | `ui-insights` | Paneles de activación, evals y costo | G15–G17 | lite | P5.1, P5.2, P5.4, P5.5 | **abierto** |
| P5.8 | — | Packs versionados de skills/steering + `asdd fleet` (inventario multi-repo) | G20 | full | — | **según demanda** |
| P5.9 | — | Escaneo de seguridad de skills/agentes de terceros | G21 | lite | (P5.8 opcional) | **según demanda** |
| P5.10 | — | Steering de organización no sobrescribible + audit log agregado | G22 | full | P5.8 | **según demanda** |

Hotfixes que salieron del trabajo en paralelo (nov 2026): `npm-pack-json` (test de empaquetado), `guidance-proposal-skip`, `drift02-open-slices` (aplica SP-003/SP-005: DRIFT-02 solo en slices `in_progress`), `ui-assets-dist` (el build copia los assets de `cli/src` a `cli/dist`; `asdd ui` respondía 404 desde el paquete), `drift01-harness-logs` (aplica SP-006: los dos logs append-only de `docs/` quedan exentos de DRIFT-01). Integración: un worktree por agente (Claude, Cursor, Devin) y una rama de integración; ver `HARNESS_DRIFT_BASE` en SP-004.

Olas: **A** (medir) P5.1–P5.4 · **B** (superficie humana) P5.5–P5.7 · **C** (distribuir) P5.8–P5.10, sin slice hasta que haya demanda de compartir skills entre repos u organizaciones.

### P6 — Shaping del PO basado en evidencia

Origen: decisión del 2026-11-17. El PO/PM hace el pitch y el product delivery hasta el intent; todo lo que sale de ese proceso se basa en el código, las specs y las slices que ya existen, para no sobreestimar y reutilizar componentes. La salida (pitch e intents) vive en el tracker del proyecto (Jira, Linear o GitHub); los ingenieros toman cada intent y trabajan con el harness en su máquina, con cualquier agente de código.

```
PO/PM (Claude Desktop → Code, o claude.ai/code), repo en solo lectura
  shape-up + grounding        → Pitch en el tracker (betting_state, decided_by)
  product-delivery + grounding → un ítem Intent por scope (Reutiliza / Extiende / Nuevo con evidencia)
Ingeniero (su máquina, cualquier agente + harness)
  asdd intake → intent.md + slice init (modo sugerido) + source; grounding re-verificado contra el código actual
  pipeline normal → progreso de vuelta al Intent (tracker-sync)
```

| ID | Slice | Propuesta | Cubre | Modo | Depende de | Estado |
|----|-------|-----------|-------|------|------------|--------|
| P6.1 | `tracker-binding` | Bloque `tracker` en `project.json` + formato canónico del Intent por tracker | G23 | lite | — | **abierto** |
| P6.2 | `shaping-agent` | `asdd-shaping-agent` de solo lectura (sin Write/Edit en el runtime) + MCP de knowledge y del tracker | G24 | lite | — | **abierto** |
| P6.3 | `grounded-shaping` | Grounding obligatorio en `shape-up` y `product-delivery`; appetite con slices de referencia; modo PO que escribe solo en el tracker | G25 | lite | P6.1 | **abierto** |
| P6.4 | `intent-intake` | `asdd intake` (offline, valida y crea la slice), intake en `external-trackers`, validador `intent-evidence` | G26 | lite | P6.1 | **abierto** |
| P6.5 | `shaping-cloud-setup` | Script de setup para claude.ai/code (MCP + codegraph) y plays PO / ingeniero | G27 | lite | P6.1–P6.4 | **abierto** |

Paralelismo: P6.1 y P6.2 primero; P6.3 y P6.4 en paralelo tras P6.1; P6.5 al final. Fuera de alcance: chat de shaping dentro de `asdd ui` (cliente ACP) y MCP remoto de grounding para el chat de Claude Desktop — se revisan si P6.5 no basta.

## 5. Resumen

| Prioridad | Hecho ahora | Queda para 2ª versión |
|-----------|-------------|------------------------|
| **P0** | Metrics + 15′ onboarding | npm pin estable (P0.3) |
| **P1** | Slash skills, dashboard HTML/JSON, converge | MCP App `ext-apps` full |
| **P2** | Hotfix / amend / hill | — |
| **P3** | Waves, portfolio, converge-eval | Windows hooks, import Spec Kit/OpenSpec |
| **P4** | Tracker-sync, advisory Stop, spec-source pilot | Presets Cencosud |
| **P5** | `asdd ui` + decisión de gates, `asdd skill-eval` + QG-LEARN-10 (en curso: telemetría, costo, insights) | Packs, escaneo de skills, gobierno de organización (según demanda) |
| **P6** | — (abierto: tracker, agente PO, grounding, intake, setup cloud) | Cliente ACP en `asdd ui`, MCP remoto de grounding |

## 6. Fuera de alcance (decisiones vigentes)

- SoT solo bajo `.harness/`; manifests generados, no editados a mano.
- MCP / chat **no** escribe triage ni propuestas (`asdd triage` / `asdd learn`).
- Gates Shape Up / Product Delivery siguen siendo **humanos** (`decided_by`); Jev es opinión, no pipeline.
- No convertirse en SaaS ni en IDE propietario (no competir con Kiro como producto).
- No abrazar Tessl *spec-as-source* como default (código sigue siendo editable; el piloto es opt-in).
- No orquestar ni ejecutar agentes (modelo Eminzo) ni alojar loops con créditos (modelo Tessl); los loops programados viven en CI.
- App de escritorio (Tauri) aparcada: solo si aparecen usuarios fuera del IDE o necesidad multi-repo con notificaciones nativas, empaquetando `asdd ui`.

## 7. Cómo medir el éxito

| Métrica | Fuente | Objetivo inicial |
|---------|--------|------------------|
| Tiempo a primer `asdd check` verde en repo nuevo | P0.2 `init-flow` | ≤ 15 min |
| % sesiones Stop con FAIL que se corrigen antes de commit | hooks + learning | ↑ mes a mes |
| % slices que cierran en `lite`/`hotfix` sin escalate | `status --metrics` | mayoría del trabajo diario |
| Drift level `blocking` en PRs | CI DRIFT | tendencia a la baja |
| Adopción slash `/asdd-*` vs solo CLI | encuesta / uso | ≥ 50 % de sesiones Claude |
| `converge-eval` verde en CI | P3.5 | 0 mismatches en fixtures |

## 8. Veredicto

ASDD+Harness sigue **por delante en harness engineering** (sensors, evidence, learning, spec drift). Con P0–P4 implementados (salvo los diferidos a 2ª versión), el empaquetado de experiencia ya no es el cuello principal: hay slash skills, métricas de pipeline, presets de tamaño, amend, portfolio y un Stop advisory.

El riesgo restante es **distribución** (P0.3 npm pin) y **plataformas** (P3.3 Windows, P3.4 import Spec Kit). La jugada correcta no cambia: **no diluir los sensores**; seguir envolviéndolos en un happy path agent-native.
