# spec-drift MCP — Gaps, mejoras y roadmap priorizado

> Análisis inicial: `tools/spec-drift` tras los slices `spec-drift-apps`, `sensor-fixes` y `spec-drift-empty`
> (noviembre 2026): unas 13.400 líneas en `src` + `ui`, 32 herramientas, 6 prompts, 3 dashboards (MCP Apps), 101 tests e2e.
>
> **Estado actual (2026-11-14):** P0–P4 hechos salvo **P4.5, diferido a una versión posterior**. Unas 22.600 líneas en
> `src` + `ui`, 40 herramientas, 8 prompts, 3 dashboards, 226 tests unitarios y 140 e2e. Slices: `review-quality` (P0),
> `rule-coverage` (P1), `spec-drift-adoption` (P2), `spec-drift-depth` (P3), `spec-drift-demand` (P4).
>
> Las referencias de mercado son orientativas (conocimiento hasta mediados de 2026): verificarlas antes de decidir.

## 1. Qué es hoy

Son tres productos en un solo servidor:

| Pilar                     | Qué hace                                                                                                                          | Fortaleza                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Análisis estático**     | Corre las reglas `.semgrep/` del repo (o CodeQL) y las reglas de capas y ciclos, y agrupa la deriva por ADR; baseline y tendencia | La regla está ligada a una decisión (ADR), no solo a un estilo                                                                                    |
| **PR review**             | Divide el diff en grupos, aplica un checklist por lenguaje (64 rule docs), verifica los hallazgos y los contrasta con el ticket   | Deja una review _pending_ que firma un humano; ancla cada comentario a la línea citada; SARIF; fingerprints; trata el diff como dato no confiable |
| **Auditoría del harness** | Spec drift DRIFT-01…07, cumplimiento de requisitos, loop de aprendizaje                                                           | Une spec → feature → archivo → test; solo lectura                                                                                                 |

**Diferencia frente al mercado:** corre en el host del usuario, con su modelo y sus credenciales (no es un SaaS); el
humano decide siempre; verifica contra _la spec y los ADRs del equipo_, no solo "si el código es bueno".

## 2. Posicionamiento

- **No competir como revisor de IA genérico** (CodeRabbit, Greptile, Qodo, Copilot code review, Cursor Bugbot…).
  Ese mercado está saturado, lo están integrando los IDEs y plataformas, y los SaaS ya traen modo CI.
- **Ganar en conformidad con lo que el equipo decidió:** ADR → regla → deriva → tendencia, y spec → requisito → test.
  La review de PR es el canal de entrada; el valor es la gobernanza.
- **Hueco del mercado:** las herramientas de spec-driven development (Spec Kit, Kiro, Tessl…) generan specs, pero no
  verifican después que el código las siga cumpliendo. Esa parte es la que cubre este servidor.
- **Mantener lo que genera confianza:** solo lectura, humano en el bucle, sin SaaS.

## 3. Gaps detectados

Estado (2026-11-14): G1–G9, G11 y G12 cubiertos por P0–P4 (G1 a falta de medir la primera línea base con el modelo del
equipo; G9: elicitation hecha, notificaciones de recursos y OAuth remoto no). **G10 sigue abierto:** P4.5, diferido.

| ID  | Gap                                                                                    | Impacto                                                                       |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| G1  | Evaluación con 3 casos (`eval/cases`)                                                  | No se puede afirmar la precisión ni detectar regresiones de prompt o modelo   |
| G2  | Métricas de review solo locales (`~/.local/state/pr-review/metrics.jsonl`)             | El mejor dato de calidad no llega al Tech Lead ni al loop de aprendizaje      |
| G3  | Sin baseline en el análisis                                                            | En repos legacy, cientos de hallazgos: el dashboard se vuelve ruido           |
| G4  | Las reglas generadas solo se validan por sintaxis                                      | Reglas ruidosas desde el día 1                                                |
| G5  | Sin historia ni tendencia                                                              | No responde "¿la deriva sube o baja?"                                         |
| G6  | 32 herramientas siempre cargadas                                                       | Gasto de contexto, errores al elegir herramienta, límites de algunos clientes |
| G7  | Identidad y distribución confusas (nombre, paquete privado sin scope, rutas absolutas) | Difícil de instalar fuera de la máquina del autor                             |
| G8  | Análisis largo síncrono (hasta 600 s), sin MCP Tasks                                   | Mala experiencia en el host                                                   |
| G9  | Primitivas MCP sin usar (elicitation, notificaciones de recursos, OAuth remoto)        | Prompts frágiles donde bastaría una pregunta estructurada                     |
| G10 | Solo GitHub (`gh`)                                                                     | Fuera para GitLab, Bitbucket, Azure DevOps                                    |
| G11 | Review solo interactiva, sin modo CI                                                   | No cubre "se abre el PR → review automática"                                  |
| G12 | Un solo motor (Semgrep); sin chequeos de grafo de dependencias                         | Ciclos y capas, frecuentes en las fallas de arquitectura, quedan sin cubrir   |

## 4. Roadmap priorizado

Escala: **Valor** (alto / medio / bajo) · **Esfuerzo** S (≤ 2 días) / M (≤ 1 semana) / L (> 1 semana).

### P0 — Base de confianza (sin esto, todo lo demás es fe)

> **Estado (2026-11-12): hecho** en el slice `review-quality`. 35 casos sintéticos (9 lenguajes, 12 limpios) validados en
> `pnpm test`; `pnpm eval score` con desglose por lenguaje y categoría y `--baseline`; `pnpm eval harvest` para casos
> privados desde reviews reales; `asdd learn` registra las reviews del proyecto y `learning_report` muestra la calidad
> del equipo. Pendiente: medir la primera línea base con el modelo que use el equipo (la debe correr una persona; el CI
> no ejecuta modelos).

#### P0.1 Juego de evaluación de 30-50 casos · cubre G1

- **Propuesta:** casos etiquetados por lenguaje y categoría, tomados de reviews reales (un comentario eliminado = falso
  positivo; uno conservado = verdadero positivo). `pnpm eval` en CI ante cada cambio de prompt, reglas o modelo.
- **Valor:** alto · **Esfuerzo:** M
- **Hecho cuando:** precision, recall y F1 publicados por categoría; CI falla si la precisión baja más de X puntos.

#### P0.2 Métricas compartidas con el loop de aprendizaje · cubre G2

- **Propuesta:** cada publish añade una señal anónima por regla (kept / edited / removed) al aprendizaje del kit
  (`.harness/state/learning`); las reglas ruidosas se convierten en patrones y luego en propuestas de steering.
- **Valor:** alto · **Esfuerzo:** M · **Depende de:** P0.1 (mismo formato de etiqueta)
- **Hecho cuando:** `learning_report` muestra las reglas de review más editadas o borradas del equipo.

### P1 — Reforzar lo que lo diferencia

> **Estado (2026-11-12): hecho** en el slice `rule-coverage`. `adr_coverage` y la pestaña **ADRs** del dashboard
> (cobertura, ADRs sin regla con "Ask the agent", referencias colgantes, prompt `write-adr-rule`); reglas con tests
> (`semgrep --test`), `validate_rules` (listas / no listas: sin test, test fallido, ruidosa) y badge de test por regla;
> `.semgrep/` nunca se escanea como código (análisis, review de PR y auditoría del kit).

#### P1.1 Cobertura de ADRs (feature nueva)

- **Propuesta:** cruzar los ADRs (`.harness/specs/*/design.md`, `docs/adr/`) con `metadata.adr` de las reglas.
  Herramienta y panel: "ADRs sin regla que los haga cumplir", "reglas sin ADR".
- **Valor:** alto (lo que lo diferencia; no lo ofrece nadie) · **Esfuerzo:** S-M
- **Hecho cuando:** el dashboard lista los ADRs sin regla, con la opción de pedirle al agente la regla para ese ADR.

#### P1.2 Validar las reglas generadas · cubre G4

- **Propuesta:** el prompt `generate-architecture-rules` crea fixtures `ok`/`bad` por regla y corre `semgrep --test`;
  el dashboard muestra los hits de cada regla sobre el repo antes de aceptarla.
- **Valor:** alto · **Esfuerzo:** S
- **Hecho cuando:** ninguna regla generada se propone sin su test y su conteo de hits.

### P2 — Usable en repos reales y fácil de adoptar

> **Estado (2026-11-13): hecho** en el slice `spec-drift-adoption`. `spec-drift baseline [--write]` (`.semgrep/baseline.json`,
> hallazgos nuevos / existentes / resueltos), `spec-drift record` y `drift_trend` con la pestaña **Trend**,
> `SPEC_DRIFT_TOOLSETS` (`analysis`, `review`, `audit`), y `spec-drift config --client …` con la guía "Install in 5
> minutes". Distribución: solo la guía, sin publicar paquete (decisión del Tech Lead).

#### P2.1 Baseline / ratchet del análisis · cubre G3

- **Propuesta:** `.semgrep/baseline.json` con fingerprints (ya existen en PR review). El análisis muestra "nuevos /
  existentes / resueltos" y solo los nuevos cuentan como deriva.
- **Valor:** alto · **Esfuerzo:** M
- **Hecho cuando:** un repo legacy con N violaciones previas muestra 0 nuevas tras crear el baseline.

#### P2.2 Tendencia de deriva · cubre G5

- **Propuesta:** guardar los análisis y auditorías por fecha (solo lectura del historial que escribe `asdd audit` o CI);
  curva por ADR, regla y slice en el dashboard.
- **Valor:** alto · **Esfuerzo:** M · **Depende de:** P2.1
- **Hecho cuando:** el dashboard responde "¿vamos a mejor?" para los últimos N sprints.

#### P2.3 Toolsets configurables · cubre G6

- **Propuesta:** `TOOLSETS=review,analysis,audit` (o tres servidores); cada equipo carga solo lo que usa.
- **Valor:** medio · **Esfuerzo:** S
- **Hecho cuando:** con `TOOLSETS=review` se listan solo las herramientas de review.

#### P2.4 Identidad y distribución · cubre G7

- **Propuesta:** un solo nombre de producto, paquete con scope (`@org/spec-drift`), instalación con `npx` sin rutas
  absolutas; guía de instalación de 5 minutos.
- **Valor:** medio · **Esfuerzo:** S
- **Hecho cuando:** un compañero lo instala en un proyecto nuevo sin editar rutas.

### P3 — Más profundidad de análisis

> **Estado (2026-11-14): hecho** en el slice `spec-drift-depth`. `traceability_matrix` (REQ → feature → archivo → test →
> PR, con huecos y Markdown) y su vista en el dashboard de auditoría; el riesgo por archivo del PR ("Read first") en la
> review, el prompt y la pestaña Coverage; la tabla `Dependency layers` de `domain-layer.project.md` como reglas
> `dep-layer` y `dep-cycle` de un motor de grafo junto a Semgrep, detrás del puerto `CodeAnalyzer`; `analysis_start` /
> `analysis_job` para escaneos largos y elicitation (`inputRequired`) para el ticket y la confirmación del publish.
> Cambio frente a la propuesta: el protocolo MCP 2026-07-28, el que habla el SDK en uso, eliminó MCP Tasks; los
> escaneos largos son jobs en memoria que el host consulta.

#### P3.1 Matriz de trazabilidad (feature nueva)

- **Propuesta:** vista REQ → feature → archivo → test → PR con los datos del grafo de conocimiento del kit.
- **Valor:** alto para clientes regulados o auditorías · **Esfuerzo:** M

#### P3.2 Riesgo del PR (feature nueva)

- **Propuesta:** cruzar los hotspots de la auditoría (churn × enlaces a REQ × hallazgos) con los archivos del PR; la
  review indica dónde mirar primero.
- **Valor:** medio-alto · **Esfuerzo:** S-M

#### P3.3 Reglas de grafo de dependencias · cubre G12

- **Propuesta:** chequeo de ciclos y capas (al estilo dependency-cruiser o los module boundaries de Nx) generado desde la
  tabla de capas de `domain-layer.project.md`, detrás del puerto `CodeAnalyzer`.
- **Valor:** medio-alto · **Esfuerzo:** M-L

#### P3.4 MCP Tasks y elicitation · cubre G8, G9

- **Propuesta:** análisis largo como tarea asíncrona; elicitation para confirmar el publish y pedir el ticket.
- **Valor:** medio · **Esfuerzo:** S-M (según el soporte de los hosts)

### P4 — Según demanda

> **Estado (2026-11-14): hecho salvo P4.5** en el slice `spec-drift-demand`. P4.1 `drift_origin` (blame y `git log -S`,
> con PR); P4.2 el prompt `fix-rule-violations` y **Ask the agent to fix** por regla en el dashboard; P4.3 `cost` en
> `metrics.jsonl` (minutos, llamadas, caracteres y tokens estimados) y medianas en `pr_review_metrics`; P4.4
> `spec-drift ci-review` imprime un workflow de GitHub Actions que deja una review _pending_ a nombre del revisor (su
> token), que es quien la firma; P4.6 adaptador CodeQL con `SPEC_DRIFT_ENGINE=codeql` (probado con un CLI simulado: aquí
> no está instalado CodeQL); P4.7 `repos_overview` sobre `SPEC_DRIFT_REPOS`.
>
> **P4.5 (GitLab / Azure DevOps): diferido a una versión posterior**, por decisión del Tech Lead (2026-11-14). Hoy la
> review de PR solo funciona con GitHub (`gh`). Cuando se retome: un puerto de proveedor (metadatos y diff del PR,
> comentarios existentes, crear la review _pending_) con GitHub como primer adaptador, y luego GitLab (`glab`, merge
> request con notas en borrador) y Azure DevOps (`az repos pr`).

Pendiente de verificar en un entorno real: el adaptador CodeQL contra el CLI de CodeQL y el workflow de `ci-review` en
GitHub Actions (ambos probados aquí con dobles).

| ID   | Propuesta                                                                                    | Cubre | Valor          | Esfuerzo |
| ---- | -------------------------------------------------------------------------------------------- | ----- | -------------- | -------- |
| P4.1 | "Por qué está esta deriva": el commit y el PR que la introdujeron (`git log -S`, blame)      | —     | Medio          | S        |
| P4.2 | Autofix guiado: "arregla las N violaciones de la regla X" → prompt al agente → nuevo escaneo | —     | Medio          | S        |
| P4.3 | Coste y tiempo por review (tokens, llamadas, minutos); enlaza con la telemetría de fases     | —     | Medio          | S        |
| P4.4 | Modo CI opcional (GitHub Action) que deja la review en _pending_; el humano sigue firmando   | G11   | Medio          | M        |
| P4.5 | Adaptadores GitLab / Azure DevOps — **diferido a una versión posterior**                     | G10   | Según clientes | L        |
| P4.6 | Adaptador CodeQL real                                                                        | G12   | Bajo-medio     | L        |
| P4.7 | Vista multi-repo u organización                                                              | —     | Según clientes | L        |

## 5. Resumen de prioridades

| Prioridad | Ítems                                                         | Por qué ahora                                             | Estado                                    |
| --------- | ------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| **P0**    | Juego de evaluación, métricas compartidas                     | Sin medir la calidad no se puede mejorar ni confiar       | Hecho (falta la primera línea base)       |
| **P1**    | Cobertura de ADRs, validar reglas generadas                   | Refuerza lo que diferencia al producto, con poco esfuerzo | Hecho                                     |
| **P2**    | Baseline, tendencia, toolsets, distribución                   | Hace el producto adoptable en repos y equipos reales      | Hecho (distribución: solo la guía)        |
| **P3**    | Trazabilidad, riesgo del PR, grafo de dependencias, MCP Tasks | Profundidad, una vez la base está medida                  | Hecho (jobs en lugar de MCP Tasks)        |
| **P4**    | CI, otros proveedores, CodeQL, multi-repo                     | Solo si los clientes lo piden                             | Hecho salvo P4.5, diferido a otra versión |

## 6. Fuera de alcance (decisiones vigentes)

- El servidor **no escribe** en el repositorio: el triage y las propuestas se registran con el CLI `asdd`, y las
  reglas las escribe el agente en el host, a petición del usuario.
- El modelo **no publica** una review visible: solo _pending_; firma el humano.
- No se convierte en SaaS ni guarda código fuera de la máquina del usuario.

## 7. Cómo medir el éxito

| Métrica                                                       | Fuente                | Objetivo inicial                 |
| ------------------------------------------------------------- | --------------------- | -------------------------------- |
| Precisión de la review (comentarios conservados / publicados) | `metrics.jsonl`, P0.1 | ≥ 70 % y subiendo                |
| ADRs con al menos una regla                                   | P1.1                  | De la línea base actual a ≥ 80 % |
| Deriva nueva por sprint                                       | P2.1, P2.2            | Tendencia a la baja              |
| Tiempo de instalación en un proyecto nuevo                    | P2.4                  | ≤ 10 minutos                     |
