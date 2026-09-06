export const meta = {
  name: 'council-influence',
  description: 'Совет книжных советников по маркетингу/influence (ростер и validator-протокол параметризуются через args): fan-out → cross-verify claims → validator-синтез',
  phases: [
    { title: 'Fan-out', detail: 'Советники читают каждый свою книгу и дают принципы (параллельно)' },
    { title: 'Cross-verify', detail: 'curator выделяет consensus/conflict-claims → 3 скептика на claim, мажоритарное голосование' },
    { title: 'Synthesize', detail: 'validator взвешивает советы, пишет единый вердикт в workDir' },
  ],
}

// ── Параметры (skill передаёт через args; дефолты — для dry-run через /workflows) ──
// args может прийти JSON-строкой (харнесс не парсит нетипизированный параметр) — шим как в full-research-core.js
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
// Корень плагина: ${CLAUDE_PLUGIN_ROOT} в JS не подставляется — скилл передаёт значением.
const PLUGIN_ROOT = A.pluginRoot || '.'
const QUERY = A.query || 'Как запустить контент-стратегию и набрать первую аудиторию для нового продукта?'
const USER_CONTEXT = A.userContext || 'Контекст не задан (dry-run).'
const QUORUM = A.quorum || 8
const WORK_DIR = A.workDir || 'adv-influence/.tmp-council-dryrun'
const SKEPTICS = 3
const MAX_CLAIMS = 12

// Воркер: пиннинг Opus 5 + effort high через субагента advisor-opus.
// Реестр агентов кэшируется на старте сессии — если субагент создан в текущей сессии,
// оркестратор может передать workerOpts: { model: 'opus' } как фоллбэк.
const WORKER_OPTS = A.workerOpts || { agentType: 'advisors:advisor-opus' }
const w = extra => Object.assign({}, WORKER_OPTS, extra)

// Хвост ролевого промпта для headless-исполнения (нет StructuredOutput — финал печатается JSON-блоком)

// 12 советников. Skill резолвит plugin-пути (momtest/positioning) с preflight.
// Канонический реестр советников живёт в SKILL.md скилла `adv-influence` — он резолвит
// plugin-пути с preflight и передаёт готовый список в args.advisors. Второй копии здесь
// нет намеренно: дублированный реестр расходился с каноном при каждом version bump.
const ADVISORS = A.advisors
if (!Array.isArray(ADVISORS) || !ADVISORS.length) {
  throw new Error('args.advisors пуст: реестр советников передаёт скилл adv-influence, workflow своего списка не держит')
}

// ── Схемы ──
const ADVISOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    book: { type: 'string' },
    principles: {
      type: 'array',
      description: '3-5 самых релевантных принципов из этой книги',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tag: { type: 'string', description: 'citation tag, напр. [INF:SP]' },
          recommendation: { type: 'string' },
          example: { type: 'string' },
          risk: { type: 'string' },
        },
        required: ['tag', 'recommendation', 'example', 'risk'],
      },
    },
    assessment: { type: 'string' },
    confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    fileWritten: { type: 'string' },
  },
  required: ['slug', 'book', 'principles', 'assessment', 'confidence', 'fileWritten'],
}

const CURATOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    advisorsRead: { type: 'integer' },
    claims: {
      type: 'array',
      description: 'самые решающие consensus/conflict-claims (до 12) для проверки скептиками',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          statement: { type: 'string' },
          category: { type: 'string', description: 'тема (positioning, content, acquisition, ...)' },
          type: { type: 'string', enum: ['consensus', 'conflict', 'unique'] },
          supportingBooks: { type: 'array', items: { type: 'string' } },
          opposingBooks: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'statement', 'category', 'type', 'supportingBooks', 'opposingBooks'],
      },
    },
  },
  required: ['advisorsRead', 'claims'],
}

const VOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claimId: { type: 'string' },
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['claimId', 'refuted', 'reason'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reportPath: { type: 'string' },
    mainThesis: { type: 'string' },
    topActions: { type: 'array', items: { type: 'string' } },
    advisorsSynthesized: { type: 'integer' },
  },
  required: ['reportPath', 'mainThesis', 'topActions', 'advisorsSynthesized'],
}

// ── Промпты ──
function advisorPrompt(a) {
  return `Ты — советник на основе книги **${a.book}** (${a.author}).

## Запрос пользователя
${QUERY}

## Контекст пользователя
${USER_CONTEXT}

## Инструкции
1. Прочитай \`${a.skillPath}/SKILL.md\` (tool Read, абсолютный путь).
2. Следуя Reference Navigation, прочитай ВСЕ reference files в \`${a.skillPath}/references/\`.
3. Проанализируй запрос через призму ЭТОЙ книги.
4. Выбери 3-5 самых релевантных принципов. Для каждого: citation tag \`[${a.prefix}:CODE]\`, рекомендация, пример из книги, risk.

## Правила
- Отвечай ТОЛЬКО от лица этой книги. НЕ спавни саб-агентов, НЕ вызывай skills.
- Язык = язык запроса.

## Сохранение
Через Write сохрани полный совет в \`${WORK_DIR}/${a.slug}.md\` в формате:
# ${a.book} (${a.author}) — совет
## Ключевые принципы
### [${a.prefix}:CODE] {Principle Name}
**Рекомендация:** ... / **Пример из книги:** ... / **Риск:** ...
## Общая оценка ситуации
## Confidence: HIGH/MEDIUM/LOW

После записи верни структуру (schema): slug="${a.slug}", book, principles, assessment, confidence, fileWritten="${WORK_DIR}/${a.slug}.md".
Если references недоступны — дай совет по SKILL.md и отметь это в assessment.`
}

function curatorPrompt(files) {
  return `Ты — куратор кросс-книжного синтеза маркетингового совета. Прочитай ВСЕ файлы советников и выдели самые РЕШАЮЩИЕ claims для проверки скептиками.

## Запрос
${QUERY}
## Контекст
${USER_CONTEXT}

## Файлы советников (Read каждый)
${files.map(f => `- ${f}`).join('\n')}

## Задача
1. Прочитай все файлы.
2. Выдели до ${MAX_CLAIMS} самых важных claims по запросу.
3. Классифицируй: type="consensus" (3+ книг), "conflict" (противоречие), "unique".
4. Приоритет — consensus и conflict (их оспорят скептики). Для каждого — supportingBooks и opposingBooks.

Каждый claim — конкретное проверяемое утверждение, не тема. Язык = язык запроса. Верни строго по схеме.`
}

function skepticPrompt(claim, idx) {
  return `Ты — скептик-рефутатор №${idx + 1} в маркетинговом совете. Попытайся ОПРОВЕРГНУТЬ claim. Не балансируй — атакуй. По умолчанию refuted=true при серьёзных сомнениях.

## Claim
"${claim.statement}"
(категория: ${claim.category}; тип: ${claim.type}; ЗА: ${(claim.supportingBooks || []).join(', ') || '—'}; ПРОТИВ: ${(claim.opposingBooks || []).join(', ') || '—'})

## Контекст
Запрос: ${QUERY}
Контекст: ${USER_CONTEXT}

## Как атаковать
- Когда эта тактика навредит именно здесь (аудитория, канал, стадия)?
- Это эмпирически подтверждённый приём или гуру-вера? Подтверждается несколькими школами или одной книгой?
- Противоречит ли другой книге совета?
- Это вечнозелёный принцип или платформо-зависимый хак, который устареет?

Будь конкретным. Верни по схеме: refuted (bool) + reason (одна фраза). claimId="${claim.id}".
НЕ спавни саб-агентов, НЕ вызывай skills.`
}

const VALIDATOR_PROTOCOL = A.validatorProtocol || `${PLUGIN_ROOT}/skills/adv-influence/protocols/validator-protocol.md`
function validatorPrompt(files, ledger) {
  return `Ты — синтезатор-валидатор Совета Советников по маркетингу. Ты — ЕДИНСТВЕННЫЙ синтезатор.

## Твой протокол (источник истины)
Прочитай \`${VALIDATOR_PROTOCOL}\` (Read tool) и следуй ему ПОЛНОСТЬЮ: формула (Relevance×3 + Specificity×2 + Agreement×2 + Confidence×1)/8, кросс-книжный синтез БЕЗ категорийной группировки (общий список), SWOT, карта консенсуса, рейтинг, формат вердикта. Если файл недоступен — используй формулу и формат из памяти.

## Входные данные
- WORK_DIR: \`${WORK_DIR}\`
- REFINED_QUERY: ${QUERY}
- USER_CONTEXT: ${USER_CONTEXT}
- Файлы советников (Read каждый): ${files.map(f => `\`${f}\``).join(', ')}

## Cross-verification ledger (ДОПОЛНЕНИЕ к протоколу)
${JSON.stringify(ledger, null, 2)}

Учти ledger поверх протокола: REFUTED-claim не идёт в «Что делать» и не консенсус; CONTESTED → «Против» + SPLIT в карте. Добавь в карту консенсуса колонку Ledger.

## Запись
Сохрани вердикт через Write в \`${WORK_DIR}/council-verdict.md\` (формат — из протокола). Читай только файлы в ${WORK_DIR}. НЕ спавни саб-агентов, НЕ вызывай skills. Язык = язык файлов.
После записи верни по схеме: reportPath="${WORK_DIR}/council-verdict.md", mainThesis, topActions, advisorsSynthesized.`
}

// ═══ Phase 1 — Fan-out ═══
phase('Fan-out')
log(`Запускаю ${ADVISORS.length} советников по маркетингу/influence...`)

const advisorResults = (await parallel(ADVISORS.map(a => () =>
  agent(advisorPrompt(a), w({ label: a.slug, phase: 'Fan-out', schema: ADVISOR_SCHEMA }))
))).filter(Boolean)

const files = advisorResults.map(r => r.fileWritten).filter(Boolean)
log(`Ответило советников: ${advisorResults.length}/${ADVISORS.length}`)

if (advisorResults.length < QUORUM) {
  log(`Кворум не набран (${advisorResults.length} < ${QUORUM}) — частичные ответы без синтеза.`)
  return {
    workDir: WORK_DIR,
    status: 'low-quorum',
    advisorsAnswered: advisorResults.length,
    files,
    advisorResults,
    claimLedger: [],
  }
}

// ═══ Phase 2 — Cross-verify ═══
phase('Cross-verify')

const curated = await agent(curatorPrompt(files), w({ label: 'curator', phase: 'Cross-verify', schema: CURATOR_SCHEMA }))
const claimsToTest = (curated.claims || [])
  .filter(c => c.type === 'consensus' || c.type === 'conflict')
  .slice(0, MAX_CLAIMS)
log(`Куратор выделил ${(curated.claims || []).length} claims, на проверку идёт ${claimsToTest.length} (consensus/conflict).`)

const claimLedger = (await parallel(claimsToTest.map(c => () =>
  parallel(Array.from({ length: SKEPTICS }, (_, i) => () =>
    agent(skepticPrompt(c, i), w({ label: `refute:${c.id}#${i + 1}`, phase: 'Cross-verify', schema: VOTE_SCHEMA }))
  )).then(votes => {
    const v = votes.filter(Boolean)
    const refutes = v.filter(x => x.refuted).length
    const verdict = refutes >= Math.ceil(SKEPTICS / 2 + 0.5) ? 'REFUTED' : (refutes > 0 ? 'CONTESTED' : 'SUPPORTED')
    return { ...c, verdict, refuteVotes: refutes, totalVotes: v.length, reasons: v.map(x => x.reason) }
  })
))).filter(Boolean)

const supported = claimLedger.filter(c => c.verdict === 'SUPPORTED').length
const contested = claimLedger.filter(c => c.verdict === 'CONTESTED').length
const refuted = claimLedger.filter(c => c.verdict === 'REFUTED').length
log(`Ledger: SUPPORTED=${supported}, CONTESTED=${contested}, REFUTED=${refuted}`)

// ═══ Phase 3 — Synthesize ═══
phase('Synthesize')

// validator пишет вердикт в файл ДО structured-возврата — отказ возврата (retry cap) не должен ронять прогон
const VERDICT_FIELDS = 'reportPath (строка), mainThesis (строка), topActions (массив строк), advisorsSynthesized (целое число)'
const validatorCall = agent(validatorPrompt(files, claimLedger), w({ label: 'validator', phase: 'Synthesize', schema: VERDICT_SCHEMA }))
const verdict = (await validatorCall.catch(e => {
  log(`validator structured-return не удался (${e && e.message ? e.message : e}) — вердикт читай из файла`)
  return null
})) || {}

return {
  workDir: WORK_DIR,
  status: 'ok',
  advisorsAnswered: advisorResults.length,
  files,
  claimLedger,
  reportPath: verdict.reportPath || `${WORK_DIR}/council-verdict.md`,
  verdictMeta: {
    mainThesis: verdict.mainThesis,
    topActions: verdict.topActions,
    advisorsSynthesized: verdict.advisorsSynthesized,
    ledgerSummary: { supported, contested, refuted },
  },
}
