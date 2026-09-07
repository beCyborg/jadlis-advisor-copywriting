Русский · [English](README.en.md)

# Тексты, прошедшие восемь книг

Плагин `advisor-copywriting` для Claude Code. Команда — `/advisor-copywriting`.

## Было → стало

Раздел заполняется по контракту README 2026-09 (фаза 3 плана «GitHub beCyborg как витрина Jadlis»).

## Как это работает

Два режима: VERDICT — совет оценивает готовый текст (SWOT, карта консенсуса, переписанные фрагменты); WRITE — конвейер бриф → три драфта → критика по типу текста → синтез финала.

## Установка и первый запуск

```bash
claude plugin marketplace add https://github.com/beCyborg/jadlis-start.git
claude plugin install advisor-copywriting@jadlis --config MEMORY_DIR=~/advisors-memory
```

## Границы, стоимость, обновление

Конспекты книг — производные работы, лицензии нет: см. [NOTICE.md](NOTICE.md). Правки принимаются только в источнике (`jadlis-advisors-source`), этот репо генерируется.

```bash
claude plugin marketplace update jadlis
claude plugin update advisor-copywriting@jadlis
```
