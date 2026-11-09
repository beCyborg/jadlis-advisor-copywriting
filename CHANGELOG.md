# Changelog — advisor-copywriting

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).
До 1.0.0 совет жил в плагине `advisors` 1.0.0–1.0.3 (репо `advisors`, теперь приватный источник `jadlis-advisors-source`).

## [Unreleased]

## [1.0.7] — 2026-11-09 — финальный агент из личного файла, механика на medium / final agent from a personal file, mechanical steps at medium

### Для человека
- Последний агент совета — валидатор VERDICT (`council-influence.js`) и финальный текст WRITE (`copy-writing-pipeline.js`) — может работать на модели из личного файла `~/.claude/skills/_shared/final-agent.json` (например, Fable 5.2 · high). Скилл говорит одной строкой, какую модель он получил. Нет файла — всё как раньше: Opus 5.5 · xhigh.
- Пустой ответ или сбой на модели из файла — один повтор на Opus 5.5 · xhigh, вердикт не теряется.
- Механические шаги (вопрошатели `council-question-harvest.js` и `deliver` в `copy-writing-pipeline.js`) работают на effort medium, а не low.

### For agents
- Added: `scripts/final-agent.py`; `finalAgent()` + `FINAL_OPTS` in the engines (valid `args.finalOpts` → per-call `model` + `effort`; null/throw → one retry on the worker default, label `<label>→opus-retry`).
- Changed: `effort: 'low'` → `'medium'` (вопрошатели `council-question-harvest.js` и `deliver` в `copy-writing-pipeline.js`); skill passes `finalOpts: FINAL_OPTS` in the Workflow args; `model:`/`effort:` removed from the skill frontmatter.
- Source: `jadlis-advisors-source` advisors 1.0.8. Tests: `tools/test-final-opts.mjs`.

## [1.0.6] — 2026-10-02 — Проверка args до первого агента / Args guard before the first agent

### Для человека

- Если аргументы совета не разобрались (кавычки „“ или голая " внутри значения), пришли пустыми (повтор прогона без аргументов) или в них не хватает ключа, совет теперь сразу падает с понятной ошибкой и не запускает ни одного агента. Раньше он молча прогонял весь совет на тестовых данных.
- Рабочая папка прогона должна быть абсолютным путём; если папка памяти задана относительным путём, скилл делает её абсолютной и говорит об этом.

### For agents

- Changed: every engine in `workflows/` — one guard block right after args normalisation: a string that fails `JSON.parse` throws (script name, parse error, 300-char preview, hint about „“/unescaped `\"` and that resume does not inherit args); dry-run defaults only with `args.dryRun === true`; otherwise required keys must be non-empty and `workDir` absolute, else throw before any `agent()`.
- Changed: `workflows/copy-writing-pipeline.js` — required without `dryRun`: brief, outputName, today, advisors, outDir, workDir, pluginRoot; outDir absolute too.
- Changed: `workflows/council-influence.js` — required without `dryRun`: query, advisors, workDir, pluginRoot.
- Changed: `workflows/council-question-harvest.js` — required without `dryRun`: query, roster, councilType, workDir.
- Changed: `skills/advisor-copywriting/SKILL.md` Phase A.0 step 2 — a relative `MEMORY_DIR` (after `~` expansion) is made absolute (`$(pwd)/…`) and the user is told.
- Migration: callers that relied on silent defaults must pass the full args; a deliberate test run passes `dryRun: true`. A resumed run must pass the same args again.

## [1.0.5] — 2026-09-23 — Контракт прогона / Run contract

### Для человека

- В скилл добавлен короткий «контракт прогона»: в VERDICT и WRITE сказано, какой файл в папке `Копирайтинг` и какая строка журнала означают конец прогона.
- Свайп-файл по-прежнему пополняется только по вашему подтверждению; остальные шаги совет делает сам, не спрашивая «Продолжить?».
- Драфтеры WRITE-конвейера получают указание писать на языке брифа вместо просьбы «рассуждать» на нём.

### For agents

- Added: `skills/advisor-copywriting/SKILL.md` — `## Run contract` before `## Phase A.0`: per-mode Done when (VERDICT verdict / WRITE final text in `{OUTPUT_DIR}`, journal line `adv-copy · {режим}`, profile session log; low quorum, insufficient-drafts, micro-request also end the run), own confirm steps (A.0, A.1, A.3, A.4 brief interview, retry offer, swipe file), ledger check for VERDICT, citation-tag check for WRITE, `{WORK_DIR}/progress.md`, final report shape.
- Changed: `workflows/copy-writing-pipeline.js:127` — draft prompt: the request to reason in the brief's language → «Пиши на языке брифа».
- Migration: none.
- Refs: Anthropic guide «Getting the most out of Opus 5.5» (adopted 2026-09-23) — no requests to show reasoning; every skill states what "done" means and when to stop.

## [1.0.4] — 2026-09-22 — Effort по ролям / Effort by role

### Для человека

- Финал в режиме WRITE сводит синтезатор, а вердикт в режиме VERDICT — валидатор; оба теперь на повышенном уровне рассуждений `xhigh`. Драфты, критики, советники и скептики остаются на `high`.
- Запись файла (deliver) идёт на `low`, кластеризатор уточняющих вопросов — на `medium`: оба шага механические.
- Почему: исследование Opus 5.5 от 22.09.2026 — прирост `xhigh` измерен на итоговых документах (GDPval +128 Elo) и стоит немного, когда агент один в конце цепочки; на веерах он не окупается, поэтому они остаются на `high`.

### For agents

- Changed: `workflows/copy-writing-pipeline.js` — `synth` step: `effort: 'xhigh'`; `deliver` step (no worker agentType): `effort: 'low'`.
- Changed: `workflows/council-influence.js` (VERDICT mode) — `validator` step: `effort: 'xhigh'`.
- Changed: `workflows/council-question-harvest.js` — `question-clusterer` step: `effort: 'medium'` (mechanical dedup).
- Unchanged: drafts, critics, advisors, curator, skeptics (`high`), question askers (`low`).
- Migration: none. The per-call `effort` overrides the worker frontmatter `effort: high` and is merged after a caller-supplied `workerOpts`, so it applies in the fallback path too.
- Refs: Opus 5.5 study 2026-09-22 — `xhigh` gains are measured on final documents (GDPval-AA 1692 → 1820, +128 Elo) and cost little on a single agent at the end of the chain; fan-outs stay `high`.

## [1.0.3] — 2026-09-22 — Переход на Opus 5.5 / Switch to Opus 5.5

### Для человека

- Совет целиком — советники, скептики и валидатор — теперь работает на новой модели Opus 5.5 с окном контекста в 1 млн токенов.
- Требует Claude Code ≥ 2.1.280: более старые версии могут не знать эту модель — сначала обновите Claude Code, потом совет.
- Effort, состав линз, формат вердикта и папка памяти не менялись.

### For agents

- Changed: `agents/advisor-opus.md` — `model: opus` → `model: claude-opus-5-5` (`effort: high` unchanged).
- Changed: `skills/advisor-copywriting/SKILL.md` — frontmatter `model: opus` → `model: claude-opus-5-5` (`effort: high` unchanged).
- Changed: `workflows/copy-writing-pipeline.js`, `workflows/council-influence.js` — header comments: documented fallback `workerOpts: { model: 'claude-opus-5-5' }` (was `'opus'`); `council-influence.js` also names the worker pin Opus 5.5. Code path unchanged.
- Migration: requires Claude Code ≥ 2.1.280 — older versions may reject the unknown model ID `claude-opus-5-5` when loading the skill or spawning `advisor-copywriting:advisor-opus`; update Claude Code (`claude update`). The 1M context window is native to the model — no `[1m]` suffix. Callers that pass their own `workerOpts` are unaffected.

## [1.0.2] — 2026-09-08

### Для человека

- Обновление из источника jadlis-advisors-source.

### For agents

- Regenerated by `tools/split-councils.py`; see the source repo commit in `SHARED_FROM.txt`.

## [1.0.0] — 2026-09-07

### Для человека

- Первый релиз под именем `advisor-copywriting`: выделен из `advisors` 1.0.3 — репо на совет, команда `/advisor-copywriting`, ключ настройки `MEMORY_DIR`.

### For agents

- Generated by `tools/split-councils.py` of `jadlis-advisors-source`; worker agent `advisor-copywriting:advisor-opus`; `SHARED_FROM.txt` carries the source tag + content hash checked by CI.
