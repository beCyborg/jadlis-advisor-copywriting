---
name: advisor-copywriting
user-invocable: true
argument-hint: "<текст для оценки> ИЛИ <что написать> (--verdict / --write)"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
  - Workflow
model: claude-opus-5-5
effort: high
description: |
  Совет директоров по маркетинговому копирайтингу — 8 советников-книг, ДВА режима.
  VERDICT: совет оценивает и критикует готовый текст (SWOT, карта консенсуса,
  переписанные фрагменты). WRITE: конвейер бриф → 3 драфта → критика по типу текста
  → синтез финала (+ альтернативные крючки, приёмы с тегами, сводка критики).
  8 книг: The Adweek Copywriting Handbook (Sugarman), Cashvertising (Whitman),
  Breakthrough Advertising (Schwartz), The Copywriter's Handbook (Bly),
  Great Leads (Masterson/Forde), Influence (Cialdini), Made to Stick (Heath & Heath),
  Contagious (Berger). Типы текста: short-form, landing, email, VSL.
  Invoke via /advisor-copywriting.
  English triggers: write copy, landing page copy, email sequence, sales copy,
  critique my copy, write a post, write a landing, write an email, copywriting,
  headline, hook, VSL script, sales letter, rewrite this copy.
  Russian triggers: напиши текст, напиши пост, напиши лендинг, напиши email,
  напиши письмо, напиши VSL, сделай текст, придумай заголовок, оцени текст,
  критикуй текст, проверь текст, разбери текст, копирайтинг, заголовок, крючок,
  продающий текст, оффер, перепиши текст.
  DO NOT TRIGGER when: разбор звонка/транскрипта, застрявшая сделка, письмо
  конкретному клиенту в живой сделке (аутрич, фоллоу-ап после звонка/демо, КП),
  возражения и переговоры (use /adv-sales); продающий вебинар/сцена — отказ
  (контур отложен).
---

# Совет по копирайтингу — 8 советников, 2 режима (Skill + Workflow)

Тяжёлую часть исполняют детерминированные workflow. Скилл делает интерактивный
intake (Phase A), маршрутизирует в один из двух режимов и оформляет результат.

- **VERDICT** — совет оценивает и критикует готовый текст → `council-influence.js`.
- **WRITE** — конвейер написания (бриф → драфты → критика → синтез) → `copy-writing-pipeline.js`.

## Константы

```
PLUGIN_ROOT = ${CLAUDE_PLUGIN_ROOT}
MEMORY_DIR  = ${user_config.MEMORY_DIR}
OUTPUT_DIR  = {MEMORY_DIR}/Копирайтинг
PROFILE     = {MEMORY_DIR}/Профили/adv-copy.md
RUN_LOG     = {MEMORY_DIR}/Журнал советов.md
SWIPE_FILE  = {MEMORY_DIR}/Свайп-файл.md
WORK_DIR    = {MEMORY_DIR}/_runs/copy-{QUERY_SLUG}
```

> [!tip] Перед запуском и перед применением правок
> Прочитай `${CLAUDE_PLUGIN_ROOT}/shared/council-verdict-playbook.md` (Read по требованию):
> сессионное окно валит фан-аут целиком, консенсус фан-аута опровергается чаще, чем кажется,
> и правки применяются только из вердикта.

Внутри протоколов, линз и общих контрактов пути записаны плейсхолдерами `{PLUGIN_ROOT}` и
`{MEMORY_DIR}`: подстановка `${CLAUDE_PLUGIN_ROOT}` и `${user_config.*}` в читаемые файлы не
доходит. Подставляй значения сам; литеральный `{PLUGIN_ROOT}` в Read не отправляй.

## Run contract

- **Done when:** VERDICT — on `status: "ok"` the verdict is copied to `{OUTPUT_DIR}/{FILE_NAME}.md` (`test -s` passes), shown with the ledger, and `{WORK_DIR}` is removed; WRITE — on `status: "ok" | "written-no-meta"` `{OUTPUT_DIR}/{outputName}.md` exists (`test -s` passes) and is shown with its path; in both, one line `- YYYY-MM-DD · adv-copy · {режим} · {имя файла} — …` is appended to `{RUN_LOG}` and a session-log entry to `{PROFILE}`. Low quorum (answers shown with the warning), `insufficient-drafts`/`error` (reason shown) and a micro-request answered from one lens (A.5) also end the run, with no verdict file.
- **Keep going vs. stop:** a step inside this skill's scope that needs no input from the user — do it, don't announce it and stop. Never end a turn on a status line, a recap naming the next step, or an offer to continue («Сделать?», «Продолжить?»). Stop only when you cannot continue without the user, or before anything risky (delete, send outward, payments, secrets).
- This skill's own confirm steps override "keep going": the Phase A.0 stop when `MEMORY_DIR` is unset, the mode question in A.1 when the request is ambiguous, the request for the text in A.3 when it is empty, the brief interview in A.4 (plus the optional question-harvest batch), the retry offer after `insufficient-drafts`, and the swipe-file entry — only on the user's explicit confirmation. Default-accept applies only where the skill already allows it (harvest empty or failed → the pipeline runs without it).
- **Subagent results:** in VERDICT the council's per-claim cross-verification (skeptics' ledger) is the check; before presenting, spot-check one SUPPORTED claim — its citation tag exists in that lens's `references/`. WRITE has no ledger: open the final file and check 1–2 citation tags against the cited lens's `references/`; tags you did not check are labelled «не проверено».
- **Progress file:** a run longer than 10 steps, or one with user answers between steps (the WRITE brief interview always adds them), keeps a `- [ ]` checklist in `{WORK_DIR}/progress.md`, ticked as it goes; after a pause or context compaction, re-read it and continue from the first unticked item. It goes away with `{WORK_DIR}` and is not an advisor answer in the low-quorum listing.
- **Final report:** result (verdict or final text + path) → «Не удалось подтвердить» (what, and where it was looked for) → **От тебя:** on its own line, only when the user must do or decide something.

## Phase A.0 — гейт памяти (первым, каждый запуск)

1. `MEMORY_DIR` пуст **или** в нём буквально видно `${user_config` → **остановиться**:
   > Не задана папка памяти советов. Открой `/plugin` → advisor-copywriting → настройки и укажи
   > `MEMORY_DIR` (например `~/advisors-memory`), либо переустанови плагин с
   > `--config MEMORY_DIR=<путь>`. Тексты в текущую рабочую папку совет не пишет.
2. Путь начинается с `~/` → заменить `~` на `$HOME` **до любой записи**.
3. Развернуть скелет — идемпотентно, существующие файлы не трогает; если папка создана
   впервые, сказать об этом и перечислить, что в ней появилось:
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/init-memory.sh" "{MEMORY_DIR}" "${CLAUDE_PLUGIN_ROOT}"
   ```
4. `mkdir -p "{OUTPUT_DIR}"` — подпапка вердиктов этого совета.
5. Ни один шаг скилла не пишет за пределы `{MEMORY_DIR}`.

Дом результатов обоих режимов — `{OUTPUT_DIR}`.

## Ростер (8 советников)

Колонка Bias — известный скос советника; validator применяет его как поправку веса
(протокол `protocols/validator-protocol.md`, раздел Bias adjustments), а WRITE-критик
получает его в промпте. Формат для движка — ровно `{slug, book, author, prefix, skillPath}`;
своего ростера `council-influence.js` не держит и падает, если `args.advisors` пуст.

| Slug | Книга | Author | Prefix | Bias (известный скос) | SKILL_PATH |
|------|-------|--------|--------|------------------------|------------|
| sugarman | The Adweek Copywriting Handbook | Sugarman | ADW | print/mail-order эпоха; слеп к платформам и лентам | `${CLAUDE_PLUGIN_ROOT}/lenses/advisor-sugarman` |
| cashvertising | Cashvertising | Whitman | CASH | крен в страх/срочность — перегревает копию | `${CLAUDE_PLUGIN_ROOT}/lenses/advisor-cashvertising` |
| schwartz | Breakthrough Advertising | Schwartz | BTA | примеры 1966 мертвы, фреймворки живы — механику переносить, кейсы не цитировать | `${CLAUDE_PLUGIN_ROOT}/lenses/advisor-schwartz` |
| bly | The Copywriter's Handbook | Bly | CPH | широта без глубины — generic там, где специалисты глубже | `${CLAUDE_PLUGIN_ROOT}/lenses/advisor-bly` |
| great-leads | Great Leads | Masterson/Forde | GL | только лид/первые 500 слов — молчит об остальном тексте | `${CLAUDE_PLUGIN_ROOT}/lenses/advisor-great-leads` |
| cialdini | Influence | Cialdini | INF | влияние вообще, не копирайтинг-механика — слаб в структуре текста | `${CLAUDE_PLUGIN_ROOT}/lenses/advisor-cialdini` |
| heath | Made to Stick | Heath & Heath | MTS | липкость идей, не прямые продажи — слаб в оффере/CTA | `${CLAUDE_PLUGIN_ROOT}/lenses/advisor-heath` |
| berger | Contagious | Berger | CTG | вирусность/шеринг, не конверсия — слаб в продающей структуре | `${CLAUDE_PLUGIN_ROOT}/lenses/advisor-berger` |

## Phase A — INTAKE (интерактивная, в главной сессии, ДО workflow)

### A.1 Маршрутизация режима

1. **Явные флаги.** `--verdict` → VERDICT; `--write` → WRITE. Приоритет над эвристикой.
2. **Эвристика глаголов** (если флага нет):
   - `оцени / оценить / критикуй / раскритикуй / проверь / разбери / разбор / что не так / улучши существующий` → **VERDICT**.
   - `напиши / написать / сделай / создай / придумай / сочини / нужен текст / перепиши` → **WRITE**.
3. **Неоднозначность** (ни один паттерн не сработал, или сработали оба) → `AskUserQuestion`:
   «Оценить готовый текст советом (VERDICT) или написать новый (WRITE)?».

### A.2 Память

Прочитай `{PROFILE}` (если есть) → `USER_CONTEXT` (продукт, аудитория, позиционирование,
брендовый тон). Постоянная секция `## Profile` **курируется пользователем** — входит
в USER_CONTEXT целиком, но НЕ переписывается (session log — только append).

### A.3 VERDICT preflight

Для каждого советника ростера проверь существование `skillPath` (`ls -d "{skillPath}"`).
`N_built` = число существующих. `quorum = ceil(0.75 × N_built)` (все 8 → quorum 6).
Собери массив `advisors` = только существующие, в формате `{slug, book, author, prefix, skillPath}`.
`RAW_QUERY` = текст для оценки (если пуст — попроси вставить текст).

### A.4 WRITE — бриф-интервью

Проведи интервью по `protocols/brief-protocol.md` (Read по требованию) и собери объект
`brief` **СТРОГО по контракту** `copy-writing-pipeline.js` — ключи ровно:
`task, type ('short-form'|'landing'|'email'|'vsl'), language ('uk'|'ru'|'en'), audience, offer,
awarenessStage (1–5), sophistication (1–5), cta, constraints, swipeFile, context`.
Правила интервью:
- **Язык текста** (`language`) — по брифу (UK/RU/EN), не по языку сессии. Для `uk` драфты пишутся на украинском (не перевод с RU); `ru`-версия того же лендинга — отдельный WRITE-проход (transcreation).
- **Реальный язык аудитории** — проси у пользователя дословные фразы/цитаты аудитории
  (как она сама называет проблему/желание). НЕ выдумывать формулировки за неё; выдуманное
  помечать как гипотезу в `context`.
- **Пруфы только реальные** — кейсы, цифры, гарантии в `offer` берутся из брифа, не сочиняются.
- **Свайп-файл.** Путь `{SWIPE_FILE}` → в `brief.swipeFile` (может не существовать — тогда
  всё равно передать путь, конвейер сам проверит).
- **Опционально** предложи прогнать question-harvest перед конвейером:
  `Workflow({scriptPath:"${CLAUDE_PLUGIN_ROOT}/workflows/council-question-harvest.js",
  args:{query: brief.task, userContext: USER_CONTEXT, roster: advisors→{slug, name:"{book} ({author})", skillPath},
  councilType:'copy', maxQuestionsPerAdvisor:3, workDir: WORK_DIR, pluginRoot: PLUGIN_ROOT}})` →
  дедуп кластеров против известного → 1 батч AskUserQuestion → дополнить `brief.context`.
  Harvest пуст/упал → не блокировать.
`advisors` (WRITE) = фактически существующие из ростера (тот же preflight `ls -d`, что в A.3).

### A.5 Экономика (оба режима)

Для **микро-запроса** (нужен один крючок / одна строка / быстрая проверка одного заголовка)
полный совет избыточен: ответь сам, прочитав нужную линзу
(`${CLAUDE_PLUGIN_ROOT}/lenses/advisor-sugarman`, `…/advisor-cashvertising`, …) — линзы лежат
данными в плагине и не требуют совета. WRITE-конвейер = 3 драфта + критика, дороже
стандартного VERDICT — не запускать ради одной фразы.

## VERDICT-режим

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/council-influence.js",
  args: {
    query: RAW_QUERY,                 // текст, который оценивает совет
    userContext: USER_CONTEXT,        // память (вкл. Profile) + бриф-контекст, если есть
    advisors: <массив {slug, book, author, prefix, skillPath} — существующие из ростера>,
    quorum: <ceil(0.75 × N_built)>,
    workDir: WORK_DIR,
    pluginRoot: PLUGIN_ROOT,     // ${CLAUDE_PLUGIN_ROOT} в JS НЕ подставляется — передаём значением
    validatorProtocol: "${CLAUDE_PLUGIN_ROOT}/skills/advisor-copywriting/protocols/validator-protocol.md"
  }
})
```

`QUERY_SLUG` — lowercase, спецсимволы→дефис, ≤50. Дождись `<task-notification>`.
Результат:
- **`status: "low-quorum"`** (ответило < quorum): покажи доступные `{WORK_DIR}/*.md` напрямую
  с warning «Только N/{N_built} советников ответили».
- **`status: "ok"`:**
  1. Имя файла `FILE_NAME` — короткое **русское** название темы (3–7 слов), без `/ \ : # ^ [ ] |`;
     проверь коллизию `ls "{OUTPUT_DIR}"`, занято → суффикс « (2)».
  2. `cp "{WORK_DIR}/council-verdict.md" "{OUTPUT_DIR}/{FILE_NAME}.md"`.
  3. Покажи полный вердикт; отметь ledger SUPPORTED/CONTESTED/REFUTED (`verdictMeta.ledgerSummary`).
  4. Сообщи путь. `rm -rf "{WORK_DIR}"`.
  5. Пост-write (см. ниже).

## WRITE-режим

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/copy-writing-pipeline.js",
  args: {
    brief: <объект из A.4, строго по контракту>,
    outputName: <имя результата без .md; русское или латиница, без «/»>,
    today: "<date +%F>",              // подставить фактическую дату shell-командой
    advisors: <фактически существующие из ростера — формат {slug,prefix,book,author,skillPath}>,
    outDir: OUTPUT_DIR,
    workDir: WORK_DIR,
    pluginRoot: PLUGIN_ROOT          // ${CLAUDE_PLUGIN_ROOT} в JS НЕ подставляется — передаём значением
  }
})
```

`today` подставляй результатом `date +%F` (не хардкодить). Дождись `<task-notification>`.
Результат — файл `{OUTPUT_DIR}/{outputName}.md` (уже записан конвейером: финальный текст +
альтернативные крючки + приёмы с citation-тегами + сводка критики).
- `status: "ok" | "written-no-meta"` → покажи файл, сообщи путь, пост-write (ниже).
- `status: "insufficient-drafts" | "error"` → покажи `reason`; при insufficient-drafts драфты
  остались в `workDir` — предложи повтор.
- **Свайп-файл.** Победивший крючок — кандидат в `{SWIPE_FILE}` (секция `{type}/{language}`).
  Занести ТОЛЬКО с явного подтверждения пользователя — ни скилл, ни конвейер не пишут в свайп-файл сами.

## Пост-write (оба режима)

Следуй `${CLAUDE_PLUGIN_ROOT}/shared/memory-write-contract.md` (Read по требованию): допиши
одну строку в `{RUN_LOG}` — `- YYYY-MM-DD · adv-copy · {режим} · {имя файла} — {итог одной
строкой}`. Обнови `{PROFILE}` (session log — append; секцию `## Profile` не трогать).

## Ключевые принципы

1. **Каждый агент = 1 книга.** Синтез — только в validator (VERDICT) / синтезаторе (WRITE).
2. **Citations обязательны** — теги `[PREFIX:CODE]` из references советника, не выдуманные.
3. **Bias-поправки применяются явно** — по таблице выше и `protocols/validator-protocol.md`.
4. **Реальный язык аудитории > выдуманных формулировок** (WRITE, см. brief-protocol).
5. **Микро-запрос → чтение одной линзы**, а не полный совет (A.5).

## Response Language

Язык интерфейса/вердикта = язык запроса. Язык генерируемого текста (WRITE) = `brief.language`.
Citation-теги всегда на английском.
