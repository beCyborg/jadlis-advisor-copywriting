export const meta = {
  name: 'council-question-harvest',
  description: 'Интервью-фаза советов (общая для adv-Decision/product/influence): советники задают уточняющие вопросы → кластеризатор дедуплицирует для AskUserQuestion в главной сессии',
  phases: [
    { title: 'Question fan-out', detail: 'каждый советник (effort low) читает только свой SKILL.md и возвращает до 3 вопросов, ответов на которые нет в query/userContext' },
    { title: 'Cluster', detail: 'один агент сводит сырые вопросы в ≤12 дедуплицированных кластеров с unlockValue и вариантами ответа' },
  ],
}

// ── Параметры (skill передаёт через args; дефолты — для самостоятельного dry-run через /workflows) ──
// args может прийти JSON-строкой (харнесс не парсит нетипизированный параметр) — шим как в council-product.js
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
// Корень плагина: ${CLAUDE_PLUGIN_ROOT} в JS не подставляется — скилл передаёт значением.
const PLUGIN_ROOT = A.pluginRoot || '.'
const QUERY = A.query || 'Как выбрать нишу и дойти до первых платящих клиентов для микро-SaaS?'
const USER_CONTEXT = A.userContext || 'Контекст не задан (dry-run).'
const COUNCIL_TYPE = A.councilType || 'product' // 'decision' | 'product' | 'influence'
const WORK_DIR = A.workDir || 'council-harvest/.tmp-dryrun'
const MAX_Q = A.maxQuestionsPerAdvisor || 3
const MAX_CLUSTERS = 12

// Воркер: тот же пиннинг, что в council-ядрах. effort:'low' — вопрошатели дешёвые
// (per-call override; если frontmatter агента победит — вопрошатели уйдут на high:
// дороже, но не сломается; тогда передать более дешёвый workerOpts из скилла).
const WORKER_OPTS = A.workerOpts || { agentType: 'advisor-copywriting:advisor-opus' }
const w = extra => Object.assign({}, WORKER_OPTS, extra)

// Ростер: [{slug, name, skillPath}] — post-preflight список из скилла
// (name: book у product/influence, lensName у decision). Дефолт — для dry-run.
const DEFAULT_ROSTER = [
  { slug: 'hormozi', name: '$100M Leads (Hormozi)', skillPath: `${PLUGIN_ROOT}/lenses/advisor-hormozi` },
  { slug: 'traction', name: 'Traction (Weinberg & Mares)', skillPath: `${PLUGIN_ROOT}/lenses/advisor-traction` },
]
const ROSTER = (Array.isArray(A.roster) && A.roster.length) ? A.roster : DEFAULT_ROSTER

// ── Схемы ──
const ASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    questions: {
      type: 'array',
      description: `0-${MAX_Q} вопросов; пустой массив = советнику всё ясно из query/userContext`,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string', description: 'один уточняющий вопрос (только если ответа НЕТ в query/userContext)' },
          whyItMatters: { type: 'string', description: 'зачем этот вопрос именно этой призме (1 фраза)' },
          unlocks: { type: 'string', description: 'какой анализ разблокирует ответ' },
          suggestedOptions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4, description: '2-4 конкретных варианта ответа для выбора кнопкой' },
        },
        required: ['question', 'whyItMatters', 'unlocks', 'suggestedOptions'],
      },
    },
  },
  required: ['slug', 'questions'],
}

const CLUSTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clusters: {
      type: 'array',
      description: `до ${MAX_CLUSTERS} дедуплицированных кластеров, отсортированных по unlockValue (high→low)`,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'короткий kebab-id' },
          canonicalQuestion: { type: 'string', description: 'самая чёткая формулировка вопроса кластера' },
          askedBy: { type: 'array', items: { type: 'string' }, description: 'slugs всех советников, задавших вопрос из этого кластера' },
          unlockValue: { type: 'string', enum: ['high', 'med', 'low'], description: 'high = без ответа несколько советников слепы / влияет на ядро решения' },
          options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: '2-3 объединённых варианта ответа (4-й слот займёт «Не знаю» в главной сессии)' },
          header: { type: 'string', description: 'заголовок-чип для AskUserQuestion, ≤12 символов' },
        },
        required: ['id', 'canonicalQuestion', 'askedBy', 'unlockValue', 'options', 'header'],
      },
    },
    harvestFile: { type: 'string', description: 'путь к записанному harvest.json' },
  },
  required: ['clusters', 'harvestFile'],
}

// ── Промпт вопрошателя ──
const ROLE_WORD = COUNCIL_TYPE === 'decision' ? 'линза-советник' : 'книжный советник'
function askPrompt(a) {
  return `Ты — ${ROLE_WORD} совета на этапе ИНТЕРВЬЮ (до основной делиберации). Твоя призма: «${a.name}».
Задача — НЕ анализировать запрос, а понять, чего тебе не хватает, чтобы дать сильный совет именно через твою призму, и спросить это у пользователя.

## Запрос пользователя
${QUERY}

## Уже известный контекст
${USER_CONTEXT}

## Инструкции
1. Прочитай ТОЛЬКО \`${a.skillPath}/SKILL.md\` (tool Read, абсолютный путь). Reference-файлы НЕ читай — это быстрый проход.
2. Определи, каких фактов не хватает, чтобы применить методологию твоей призмы к этому запросу.
3. Сформулируй до ${MAX_Q} уточняющих вопросов. Вопрос генери ТОЛЬКО если ответа нет ни в запросе, ни в известном контексте. Всё ясно → верни пустой массив questions.
4. Для каждого вопроса: whyItMatters (зачем твоей призме), unlocks (какой анализ разблокирует ответ), suggestedOptions (2-4 конкретных варианта ответа, готовых для выбора кнопкой).

## Правила
- Вопросы специфичны для ТВОЕЙ призмы, не общие («какая у вас цель?» — плохо, если призма не про цели).
- Не дублируй известное. Пользователь может не знать ответа — это тоже ценная информация, спрашивать можно.
- НЕ спавни саб-агентов, НЕ вызывай skills, НЕ пиши файлов. Язык вопросов = язык запроса.

Верни строго по схеме: slug="${a.slug}", questions[].`
}

// ── Промпт кластеризатора ──
function clusterPrompt(raw) {
  return `Ты — кластеризатор вопросов интервью-фазы совета. Советники сдали сырые уточняющие вопросы — сведи их в дедуплицированный набор для интервью пользователя.

## Запрос
${QUERY}

## Известный контекст
${USER_CONTEXT}

## Сырые вопросы (советник → вопрос)
${JSON.stringify(raw, null, 2)}

## Задача
1. Сгруппируй семантически совпадающие вопросы разных советников в ОДИН кластер; canonicalQuestion — самая чёткая формулировка.
2. askedBy — slugs ВСЕХ советников, задавших вопрос из кластера (это сигнал важности).
3. unlockValue: high (несколько советников слепы без ответа / влияет на ядро решения), med, low.
4. options — 2-3 объединённых варианта ответа (НЕ 4: четвёртый слот займёт опция «Не знаю» в главной сессии); header — чип ≤12 символов.
5. Выкинь вопросы, ответ на которые уже есть в запросе/контексте. Итог — не более ${MAX_CLUSTERS} кластеров, отсортированных по unlockValue (high→low).
6. Через Write сохрани итог в \`${WORK_DIR}/harvest.json\` (JSON: {"clusters": [...]}) — один файл, больше на диск ничего не пиши.

Верни строго по схеме: clusters[], harvestFile="${WORK_DIR}/harvest.json".
НЕ спавни саб-агентов, НЕ вызывай skills. Язык = язык запроса.`
}

// ═══ Phase 1 — Question fan-out ═══
phase('Question fan-out')
log(`Интервью-харвест (${COUNCIL_TYPE}): ${ROSTER.length} советников, до ${MAX_Q} вопросов каждый...`)

const asked = (await parallel(ROSTER.map(a => () =>
  agent(askPrompt(a), w({ label: `ask:${a.slug}`, phase: 'Question fan-out', effort: 'low', schema: ASK_SCHEMA }))
))).filter(Boolean)

// Плоский список вопросов с привязкой к советнику; сломанные/пустые ответы отсекаются
const raw = []
for (const r of asked) {
  for (const q of (r.questions || [])) {
    if (q && q.question) raw.push({ slug: r.slug || 'unknown', question: q.question, whyItMatters: q.whyItMatters, unlocks: q.unlocks, suggestedOptions: q.suggestedOptions })
  }
}
log(`Вопрошателей ответило: ${asked.length}/${ROSTER.length} · сырых вопросов: ${raw.length}`)

// Никто не задал вопросов (всем ясно, либо все упали) → кластеризация не нужна
if (raw.length === 0) {
  log('Вопросов не собрано — возвращаю пустой набор кластеров.')
  return { clusters: [], advisorsAnswered: asked.length, advisorsExpected: ROSTER.length, harvestFile: null, workDir: WORK_DIR }
}

// ═══ Phase 2 — Cluster (barrier оправдан: дедуп требует всех вопросов сразу) ═══
phase('Cluster')
// кластеризатор пишет harvest.json ДО structured-возврата — отказ возврата (retry cap) не должен ронять прогон
const clustered = await agent(clusterPrompt(raw), w({ label: 'question-clusterer', phase: 'Cluster', schema: CLUSTER_SCHEMA }))
  .catch(e => {
    log(`Кластеризатор structured-return не удался (${e && e.message ? e.message : e}) — кластеры читай из harvest.json`)
    return null
  })

const clusters = (clustered && Array.isArray(clustered.clusters)) ? clustered.clusters.slice(0, MAX_CLUSTERS) : []
log(`Кластеров: ${clusters.length}`)

return {
  clusters,
  advisorsAnswered: asked.length,
  advisorsExpected: ROSTER.length,
  rawQuestionCount: raw.length,
  harvestFile: `${WORK_DIR}/harvest.json`,
  workDir: WORK_DIR,
}
