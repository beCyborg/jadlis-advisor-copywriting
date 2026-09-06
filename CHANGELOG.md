# Changelog — advisors

## [Unreleased]

### Для человека

- Воркеры советов работают на effort `high` вместо `xhigh`: то же качество разбора, заметно меньше расхода лимитов.

### For agents

- Changed: `effort: high` вместо `xhigh` в `agents/advisor-opus-xhigh.md` и во frontmatter пяти советов (`adv-copy`, `adv-Decision`, `adv-influence`, `adv-product`, `adv-sales`); основание — ресёрч 06.09.2026 «Effort для плана и кода»: выше `high` растут токены, а не качество. Имя агента оставлено прежним — на него ссылаются 7 workflow.
- Changed: агент переименован `advisor-opus-xhigh` → `advisor-opus` — effort в имени врал после перевода на `high`, а меняется он чаще модели. Обновлены `agentType` в семи воркфлоу, ссылки в `adv-influence` и `adv-product`, карта файлов в `CLAUDE.md`.
- Migration: **breaking** — переопределения `workerOpts` со старым `advisors:advisor-opus-xhigh` больше не резолвятся; заменить на `advisors:advisor-opus`.

## [1.0.0] — 2026-09-06 — Первый публичный выпуск: восемь советов в одном плагине / First public release: eight councils in one plugin

### Для человека

- Восемь советов директоров в одной установке: решения, продукт, медийность, продажи, тексты, когнитивные искажения, стратегия власти, диагностика проектов.
- Всё, что советы пишут, лежит в вашей папке памяти — обычные markdown-файлы; путь задаётся при установке (`ADVISORS_MEMORY_DIR`) и меняется через `/plugin configure`.
- Внешних сервисов, API-ключей и MCP-серверов не требуется: линзы читаются с диска, работает только Claude Code.

### For agents

- Added: `skills/` — 8 councils (`adv-Decision`, `adv-product`, `adv-influence`, `adv-sales`, `adv-copy`, `adv-CognitiveBiases`, `green-advisor`, `adv-nupp`), each with an explicit `allowed-tools`, `argument-hint` and a `Константы` / `Constants` block.
- Added: `lenses/advisor-*` — 54 book lenses shipped as data, not skills; they are read by council workers and never registered in the skill listing. Five of them (`advisor-ajtbd`, `advisor-make`, `advisor-momtest`, `advisor-positioning`, `advisor-yc-startup`) were restored from the author's archived per-lens plugin repos and now live next to the rest instead of being resolved by absolute path with a preflight.
- Added: `workflows/` — `council-decision-core.js`, `council-product.js`, `council-influence.js`, `council-question-harvest.js`, `sales-council.js`, `sales-write-pipeline.js`, `copy-writing-pipeline.js`.
- Added: `agents/advisor-opus-xhigh.md` — the single worker type; workflows reference it as `advisors:advisor-opus-xhigh`.
- Added: `shared/council-interview-protocol.md`, `shared/memory-write-contract.md`, `assets/memory-skeleton/`, `scripts/init-memory.sh` (idempotent memory-folder bootstrap; `*.tpl` files are renamed to their working names on unpack).
- Added: `userConfig.ADVISORS_MEMORY_DIR` (type `directory`, default `~/advisors-memory`, `required: false`). Verdicts land in `<memory>/Вердикты/<Council>/`; `<memory>/Вердикты/README.md` is the only service file there.
- Changed: all paths are plugin-relative — `${CLAUDE_PLUGIN_ROOT}` in `SKILL.md`, `{PLUGIN_ROOT}` / `{MEMORY_DIR}` placeholders in protocols and lenses, `args.pluginRoot` in workflow scripts.
- Removed: the Fable bridge (nested headless `claude -p`) from every workflow — synthesis now runs in the same worker type as the rest of the council; `args.fableBridge` is gone.
- Removed: Obsidian-specific post-write steps (daily-note edits, `obsidian` CLI dedup) — replaced by an append-only run log in the memory folder.
- Changed: `adv-product` ships the full 16-advisor roster (quorum 11) and `adv-influence` the full 15 (quorum 10); the per-lens preflight against external plugin paths is gone — every lens resolves inside the plugin. Roster criteria: `skills/adv-product/references/roster-criteria.md`.
- Migration: none — first release.
