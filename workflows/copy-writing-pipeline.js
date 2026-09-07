export const meta = {
  name: 'copy-writing-pipeline',
  description: 'WRITE-конвейер adv-copy: бриф → 3 драфта → критика советников по routing-matrix → синтез финального текста → файл в папке памяти',
  phases: [
    { title: 'Drafts', detail: '3 параллельных writer-агента: линзы PAS / lead-under-awareness / emotional-LF8' },
    { title: 'Critique', detail: 'советники по routing-matrix критикуют все 3 драфта, помечают лучшие фрагменты' },
    { title: 'Synthesize', detail: 'синтезатор собирает финал из лучшего в драфтах с учётом критики' },
    { title: 'Deliver', detail: 'пост-write по memory-write-contract: запись в журнал прогонов' },
  ],
}

// ── Параметры (adv-copy Phase A готовит бриф интерактивно и передаёт сюда готовым) ──
// args может прийти JSON-строкой (харнесс не парсит нетипизированный параметр) — шим как в council-influence.js
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
// Корень плагина: ${CLAUDE_PLUGIN_ROOT} в JS не подставляется — скилл передаёт значением.
const PLUGIN_ROOT = A.pluginRoot || '.'

const brief = A.brief || {}
const outputName = A.outputName
const today = A.today
const outDir = A.outDir
if (!outDir) { return { status: 'error', reason: 'args.outDir обязателен: скилл adv-copy передаёт папку памяти значением' } }
const workDir = A.workDir || `${outDir}/.tmp-write-${outputName}`
const WORK_DIR = workDir

// Воркер совета: субагент плагина (Opus, effort high). Оркестратор может передать
// workerOpts: { model: 'opus' } как фоллбэк, если субагент недоступен.
const WORKER_OPTS = A.workerOpts || { agentType: 'advisor-copywriting:advisor-opus' }
const w = extra => Object.assign({}, WORKER_OPTS, extra)

// ── Константы ──
const ROSTER = [
  { slug: 'sugarman',      prefix: 'ADW',  book: 'The Adweek Copywriting Handbook', author: 'Sugarman',    skillPath: `${PLUGIN_ROOT}/lenses/advisor-sugarman` },
  { slug: 'cashvertising', prefix: 'CASH', book: 'Cashvertising',                   author: 'Whitman',     skillPath: `${PLUGIN_ROOT}/lenses/advisor-cashvertising` },
  { slug: 'schwartz',      prefix: 'BTA',  book: 'Breakthrough Advertising',        author: 'Schwartz',    skillPath: `${PLUGIN_ROOT}/lenses/advisor-schwartz` },
  { slug: 'bly',           prefix: 'CPH',  book: "The Copywriter's Handbook",       author: 'Bly',         skillPath: `${PLUGIN_ROOT}/lenses/advisor-bly` },
  { slug: 'great-leads',   prefix: 'GL',   book: 'Great Leads',                     author: 'Masterson/Forde', skillPath: `${PLUGIN_ROOT}/lenses/advisor-great-leads` },
  { slug: 'cialdini',      prefix: 'INF',  book: 'Influence',                       author: 'Cialdini',    skillPath: `${PLUGIN_ROOT}/lenses/advisor-cialdini` },
  { slug: 'heath',         prefix: 'MTS',  book: 'Made to Stick',                   author: 'Heath & Heath', skillPath: `${PLUGIN_ROOT}/lenses/advisor-heath` },
  { slug: 'berger',        prefix: 'CTG',  book: 'Contagious',                      author: 'Berger',      skillPath: `${PLUGIN_ROOT}/lenses/advisor-berger` },
]
// Phase A может передать подмножество фактически построенных советников.
const ADVISORS = (Array.isArray(A.advisors) && A.advisors.length) ? A.advisors : ROSTER

const ROUTING = {
  'short-form': ['heath', 'berger', 'cashvertising', 'great-leads'],
  'landing':    ['schwartz', 'sugarman', 'cashvertising', 'cialdini'],
  'email':      ['bly', 'great-leads', 'sugarman', 'cialdini'],
  'vsl':        ['sugarman', 'bly', 'schwartz', 'great-leads', 'cashvertising'],
}

const EXTRA_REFS = {
  'short-form': [`${PLUGIN_ROOT}/skills/advisor-copywriting/protocols/short-form-hook-point.md`],
  'email':      [`${PLUGIN_ROOT}/lenses/advisor-bly/references/boron-letters.md`],
  '*':          [`${PLUGIN_ROOT}/skills/advisor-copywriting/references/copy-patterns-classics.md`],
}

const LENSES = [
  { id: 'pas', name: 'Классика прямого отклика (PAS/AIDA)',
    refs: ['advisor-bly/references/formats-and-formulas.md', 'advisor-sugarman/references/frameworks.md'],
    instruction: 'Строй текст по проверенной формуле (PAS или AIDA — выбери под тип), слиппери-слайд от первого предложения, каждый блок тянет к следующему.' },
  { id: 'awareness', name: 'Лид под стадию осознанности',
    refs: ['advisor-great-leads/references/lead-types.md', 'advisor-schwartz/references/awareness-sophistication.md'],
    instruction: 'Выбери тип лида под awarenessStage и sophistication из брифа; заголовок и первые 20% текста — строго под эту стадию.' },
  { id: 'lf8', name: 'Эмоциональное ядро Life-Force 8',
    refs: ['advisor-cashvertising/references/principles-core.md'],
    instruction: 'Найди доминирующее LF8-желание аудитории, строй цепочку желание → триггер → формулировка; эмоция ведёт, логика оправдывает.' },
]

// Хвост ролевого промпта для headless-исполнения (нет StructuredOutput — финал печатается JSON-блоком)

// ── Схемы structured-output ──
const DRAFT_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  lens: { type: 'string' }, path: { type: 'string' },
  hooks: { type: 'array', items: { type: 'string' } },   // 3–5 вариантов крючка/заголовка
  approach: { type: 'string' },                          // 2–3 фразы: как построен драфт
}, required: ['lens', 'path', 'hooks', 'approach'] }

const CRITIQUE_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  slug: { type: 'string' }, path: { type: 'string' },
  perDraft: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
    lens: { type: 'string' }, score: { type: 'integer' },   // 1–10
    strengths: { type: 'array', items: { type: 'string' } },
    fixes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      issue: { type: 'string' }, rewrite: { type: 'string' }, tag: { type: 'string' } },  // tag = [PREFIX:NN]
      required: ['issue', 'rewrite', 'tag'] } },
  }, required: ['lens', 'score', 'strengths', 'fixes'] } },
  bestFragments: { type: 'object', additionalProperties: false, properties: {
    hook: { type: 'string' }, lead: { type: 'string' }, offer: { type: 'string' }, cta: { type: 'string' } },
    required: ['hook', 'lead', 'offer', 'cta'] },          // «лучший X среди драфтов» + почему, с линзой
}, required: ['slug', 'path', 'perDraft', 'bestFragments'] }

const FINAL_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  reportPath: { type: 'string' }, finalHook: { type: 'string' },
  altHooks: { type: 'array', items: { type: 'string' } },
  techniques: { type: 'array', items: { type: 'string' } }, // citation-теги
  status: { type: 'string' },
}, required: ['reportPath', 'finalHook', 'altHooks', 'techniques', 'status'] }

const DELIVER_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  status: { type: 'string' }, notes: { type: 'string' } }, required: ['status'] }

// ── Промпты ──
function writerPrompt(l) {
  const lensRefs = l.refs.map(r => `${PLUGIN_ROOT}/lenses/${r}`)
  const extraRefs = (EXTRA_REFS[brief.type] || []).concat(EXTRA_REFS['*'] || [])
  const allRefs = lensRefs.concat(extraRefs)
  return `Ты — нейтральный копирайтер прямого отклика. Линза этого драфта: **${l.name}**.
${l.instruction}

## Бриф (JSON — источник истины, ничего не выдумывай сверх него)
${JSON.stringify(brief, null, 2)}

## Инструкции
1. Прочитай существующие reference-файлы (tool Read, несуществующие молча пропусти):
${allRefs.map(r => `   - ${r}`).join('\n')}
2. Если \`brief.swipeFile\` задан и файл существует — прочитай его и используй как образцы тона/крючков, НЕ копируй дословно.
3. Напиши ПОЛНЫЙ драфт под \`brief.type\` (${brief.type}):
   - short-form: готовый пост/скрипт в пределах платформенных лимитов из constraints;
   - landing: все блоки от hero до CTA;
   - email: серия писем (число — из брифа, иначе 3);
   - vsl: сценарий со сценами и таймкодами.
4. Язык текста = \`brief.language\` (${brief.language}); лексика — из \`brief.audience\`; НЕ выдумывай пруфы/цифры сверх \`brief.offer\`.
5. Сначала \`mkdir -p "${workDir}"\` (Bash), затем Write в \`${workDir}/draft-${l.id}.md\`; в конце файла — секция \`## Крючки-альтернативы\` (3–5 вариантов).
6. Верни структуру по схеме: lens="${l.id}", path="${workDir}/draft-${l.id}.md", hooks (3–5), approach (2–3 фразы).

НЕ спавни саб-агентов, НЕ вызывай skills. Рассуждения — на языке брифа.`
}

function criticPrompt(c, ds) {
  const extraRefs = (EXTRA_REFS[brief.type] || []).concat(EXTRA_REFS['*'] || [])
  return `Ты — советник на основе книги **${c.book}** (${c.author}). Критикуешь ВСЕ драфты строго через призму ЭТОЙ книги.

## Бриф (JSON)
${JSON.stringify(brief, null, 2)}

## Инструкции
1. Прочитай \`${c.skillPath}/SKILL.md\` (Read, абсолютный путь); по его Reference Navigation — до 2–3 reference-файлов под тип текста «${brief.type}».
2. Прочитай ВСЕ файлы драфтов (Read каждый):
${ds.map(d => `   - ${d.path}`).join('\n')}
3. Прочитай доп. референсы, если существуют (молча пропусти отсутствующие):
${extraRefs.map(r => `   - ${r}`).join('\n')}
4. Для КАЖДОГО драфта: score 1–10 через призму именно этой книги; strengths; конкретные fixes (issue → готовый rewrite-фрагмент → citation-тег \`[${c.prefix}:NN]\` из СВОИХ references — НЕ выдумывай теги).
5. Затем bestFragments: лучший hook/lead/offer/cta среди всех драфтов, с указанием линзы-источника и почему.
6. Write полной критики в \`${workDir}/critique-${c.slug}.md\`, затем верни структуру по схеме: slug="${c.slug}", path="${workDir}/critique-${c.slug}.md", perDraft[], bestFragments.

Язык = язык брифа (${brief.language}). НЕ спавни саб-агентов, НЕ вызывай skills.`
}

function synthPrompt(ds, cs) {
  const draftPaths = ds.map(d => d.path)
  const critiquePaths = cs.map(c => c.path)
  const finalPath = `${outDir}/${outputName}.md`
  return `Ты — синтезатор-финализатор текста. Собери ФИНАЛЬНЫЙ текст из лучшего в драфтах с учётом критики.

## Бриф (JSON — источник истины)
${JSON.stringify(brief, null, 2)}

## Файлы драфтов (Read каждый)
${draftPaths.map(p => `- ${p}`).join('\n')}

## Файлы критик (Read каждый)
${critiquePaths.length ? critiquePaths.map(p => `- ${p}`).join('\n') : '- (критик нет — синтез только из драфтов)'}

## Задача
- Собери финальный текст, взяв лучшее из каждого драфта (bestFragments критиков — сильный сигнал, но арбитр — ты).
- Примени fixes критиков, где они улучшают текст; отклонённые fixes перечисли в сводке с причиной.
- Не изобретай факты/пруфы сверх брифа; язык = brief.language (${brief.language}); связность выше лоскутности — перепиши швы.
- Сначала \`mkdir -p "${outDir}"\` (Bash), затем Write результата в \`${finalPath}\` по шаблону:

---
type: ${brief.type}
language: ${brief.language}
date: ${today}
source: adv-copy/write
---
# ${outputName}

## Финальный текст
{готовый к использованию текст}

## Альтернативные крючки
{5–10 штук, отранжированы}

## Использованные приёмы
{список: [PREFIX:NN] — что применено и где}

## Сводка критики
{по драфтам: что взято, что отклонено и почему; таблица score×критик}

## В свайп-файл?
> Победивший крючок — кандидат в \`_Свайп-файл.md\` (секция ${brief.type}/${brief.language}). Занести после подтверждения пользователя — сам конвейер в свайп-файл не пишет.

После записи верни поля по схеме: reportPath="${finalPath}", finalHook, altHooks (массив), techniques (массив citation-тегов), status="ok".

НЕ спавни саб-агентов, НЕ вызывай skills.`
}

function deliverPrompt() {
  const finalPath = `${outDir}/${outputName}.md`
  return `Ты — лёгкий deliver-агент пост-write. Файл результата уже записан: \`${finalPath}\`.

## Инструкции
1. Прочитай \`${PLUGIN_ROOT}/shared/memory-write-contract.md\` (Read).
2. Выполни его post-write шаги для файла \`${finalPath}\`: в т.ч. строку в журнал прогонов \`${outDir}/../../Журнал советов.md\` вида \`- ${today} · adv-copy · WRITE · ${outputName} — <итог одной строкой>\`.
3. Журнала нет — создай его с заголовком \`# Журнал советов\` и допиши строку.
4. Ничего не удаляй; драфты в \`${workDir}\` оставь (пользователь может захотеть посмотреть).

Верни по схеме: status, notes. НЕ спавни саб-агентов, НЕ вызывай skills.`
}

// ── Валидация args (до phase()) ──
if (!A.brief || !brief.task || !brief.type || !brief.language || !outputName) {
  return { status: 'error', reason: 'brief/outputName incomplete — Phase A обязана собрать бриф' }
}
if (!ROUTING[brief.type]) {
  return { status: 'error', reason: `неизвестный тип текста «${brief.type}» — нет routing-matrix` }
}

// ═══ Phase 1 — Drafts ═══
phase('Drafts')
log(`Пишу драфты (линзы: ${LENSES.map(l => l.id).join(', ')})...`)
const drafts = (await parallel(LENSES.map(l => () =>
  agent(writerPrompt(l), w({ label: `draft:${l.id}`, phase: 'Drafts', schema: DRAFT_SCHEMA }))
))).filter(Boolean)
if (drafts.length < 2) {
  log(`Недостаточно драфтов (${drafts.length} < 2) — прекращаю.`)
  return { status: 'insufficient-drafts', drafts, workDir }
}

// ═══ Phase 2 — Critique ═══
phase('Critique')
const bySlug = Object.fromEntries(ADVISORS.map(a => [a.slug, a]))
const critics = ROUTING[brief.type].map(s => bySlug[s]).filter(Boolean)
log(`Критики по routing-matrix (${brief.type}): ${critics.map(c => c.slug).join(', ') || '—'}`)
const critiques = (await parallel(critics.map(c => () =>
  agent(criticPrompt(c, drafts), w({ label: `critique:${c.slug}`, phase: 'Critique', schema: CRITIQUE_SCHEMA }))
))).filter(Boolean)
const criticsWarning = critiques.length === 0
if (criticsWarning) log('Ни один критик не ответил — синтез только из драфтов (criticsWarning).')

// ═══ Phase 3 — Synthesize ═══
phase('Synthesize')
const FINAL_FIELDS = 'reportPath (строка), finalHook (строка), altHooks (массив строк), techniques (массив строк), status (строка)'
const synthText = synthPrompt(drafts, critiques)
const finalDefaultPath = `${outDir}/${outputName}.md`
const synthCall = agent(synthText, w({ label: 'synth', phase: 'Synthesize', schema: FINAL_SCHEMA }))
// Файл пишется ДО structured-возврата — отказ возврата не теряет работу (файл уже на диске).
const final = (await synthCall.catch(e => {
  log(`synth structured-return не удался (${e && e.message ? e.message : e}) — читай файл из ${finalDefaultPath}`)
  return { reportPath: finalDefaultPath, status: 'written-no-meta' }
})) || { reportPath: finalDefaultPath, status: 'written-no-meta' }

// ═══ Phase 4 — Deliver ═══
phase('Deliver')
// Null-агент (упавший deliver) не роняет прогон — .catch → null.
const delivered = await agent(deliverPrompt(), { label: 'deliver', phase: 'Deliver', schema: DELIVER_SCHEMA }).catch(() => null)

// ── Возврат ──
return {
  status: final.status === 'written-no-meta' ? 'written-no-meta' : 'ok',
  reportPath: final.reportPath || finalDefaultPath,
  finalHook: final.finalHook,
  altHooks: final.altHooks,
  techniques: final.techniques,
  drafts: drafts.map(d => ({ lens: d.lens, path: d.path })),
  critics: critiques.map(c => c.slug),
  criticsWarning,
  deliverStatus: delivered && delivered.status,
  workDir,
}
