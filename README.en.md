[Русский](README.md) · English

# advisor-copywriting — Claude Code plugin

Command: `/advisor-copywriting`.

## Было → стало

To be written (README contract 2026-09, phase 3).

## Как это работает

Два режима: VERDICT — совет оценивает готовый текст (SWOT, карта консенсуса, переписанные фрагменты); WRITE — конвейер бриф → три драфта → критика по типу текста → синтез финала.

## Установка и первый запуск

```bash
claude plugin marketplace add https://github.com/beCyborg/jadlis-start.git
claude plugin install advisor-copywriting@jadlis --config MEMORY_DIR=~/advisors-memory
```

## Границы, стоимость, обновление

Book digests are derivative works, no licence: see [NOTICE.md](NOTICE.md). This repository is generated from a private source; open issues here, edits land in the source.

```bash
claude plugin marketplace update jadlis
claude plugin update advisor-copywriting@jadlis
```
