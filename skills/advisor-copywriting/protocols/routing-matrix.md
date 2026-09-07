# Routing Matrix — критики WRITE-режима по типу текста

Источник истины для набора критиков в `copy-writing-pipeline.js` (Phase 2 — Critique).
Каждый тип текста нагружает свои слабые места → к нему подобран набор советников, чья книга
это место закрывает. Отсутствующий в фактическом ростере slug **молча выпадает** (preflight
в SKILL.md Phase A); упавший критик = просто меньше критик, конвейер не блокируется.

## ROUTING (тип текста → критики)

```js
const ROUTING = {
  'short-form': ['heath', 'berger', 'cashvertising', 'great-leads'],
  'landing':    ['schwartz', 'sugarman', 'cashvertising', 'cialdini'],
  'email':      ['bly', 'great-leads', 'sugarman', 'cialdini'],
  'vsl':        ['sugarman', 'bly', 'schwartz', 'great-leads', 'cashvertising'],
}
```

## Дополнительные референсы (extra reading)

Подмешиваются writer'ам и критикам как доп. чтение, **если файл существует** (несуществующий
молча пропускается):

```js
const EXTRA_REFS = {
  'short-form': ['{PLUGIN_ROOT}/skills/advisor-copywriting/protocols/short-form-hook-point.md'],
  'email':      ['{PLUGIN_ROOT}/lenses/advisor-bly/references/boron-letters.md'],
  '*':          ['{PLUGIN_ROOT}/skills/advisor-copywriting/references/copy-patterns-classics.md'],
}
```

- `*` (`copy-patterns-classics.md`) подмешивается ко ВСЕМ типам — сводный банк классических приёмов.
- `short-form-hook-point.md` — линза Hook Point (первые 3 секунды в ленте).
- `boron-letters.md` — Gary Halbert о письмах, живой канон email-копии.

## Обоснование — какая книга что ловит в каком типе

### short-form (пост, Reels/TikTok-скрипт, мем-карточка, caption)
Слабое место: **остановить скролл и заставить поделиться за секунды**, конверсия вторична.
- **heath [MTS]** — липкость: конкретность, неожиданность, память. Пост забывают через секунду — Heath против этого.
- **berger [CTG]** — STEPPS/шеринг: почему этим делятся. Для short-form охват = репост, это его домен.
- **cashvertising [CASH]** — LF8-эмоция в первой строке: желание/страх как крючок. Быстрый эмоциональный удар.
- **great-leads [GL]** — тип лида под стадию осознанности: первые слова = весь бюджет внимания.
- *(extra)* `short-form-hook-point.md` — анатомия 3-секундного крючка.

### landing (лендинг: hero → оффер → пруфы → CTA)
Слабое место: **провести холодный трафик от заголовка до кнопки**, длинная убеждающая структура.
- **schwartz [BTA]** — awareness × sophistication: с чего начинать и как обещать под состояние рынка. Ядро лендинга.
- **sugarman [ADW]** — слиппери-слайд: каждый блок тянет к следующему, скольжение до CTA.
- **cashvertising [CASH]** — LF8 + 17 принципов: эмоциональные триггеры и пруф-элементы по всей странице.
- **cialdini [INF]** — 6 принципов влияния: social proof, authority, scarcity, commitment на кнопке и в пруфах.

### email (письмо или серия)
Слабое место: **тема письма → открытие → один клик**, личный доверительный тон, серия.
- **bly [CPH]** — форматы и формулы писем, subject lines, структура — прямой домен Bly.
- **great-leads [GL]** — открывающий абзац письма = лид; удержать после темы.
- **sugarman [ADW]** — личный тон, curiosity/seeds, слиппери-слайд внутри письма.
- **cialdini [INF]** — reciprocity/commitment для серии (последовательность писем строит обязательство).
- *(extra)* `boron-letters.md` — Halbert о персональном письме, каноничен для email-тона.

### vsl (video sales letter, сценарий)
Слабое место: **удержать зрителя без возможности проматывать назад**, длинная устная продажа.
- **sugarman [ADW]** — слиппери-слайд критичен: в видео нельзя «перечитать», каждая секунда тянет дальше.
- **bly [CPH]** — структура длинной продажи, порядок блоков, снятие возражений.
- **schwartz [BTA]** — механизм под sophistication: удержать искушённого зрителя «как это работает».
- **great-leads [GL]** — cold open = лид VSL; первые 60 секунд решают отток.
- **cashvertising [CASH]** — эмоциональная дуга LF8 через весь сценарий, удержание на желании.

## Инвариант

- Наборы критиков фиксированы (без циклов-до-бюджета): 4 книги на тип, 5 на VSL.
- Каждый критик оценивает ВСЕ 3 драфта через призму СВОЕЙ книги, ставит score 1–10,
  даёт точечные fixes с citation-тегом `[PREFIX:NN]` из своих references (не выдумывать теги).
- Bias-скосы (см. SKILL.md и validator-protocol.md) критик учитывает честно: не выходит
  за домен книги, свою слепую зону не выдаёт за силу.
