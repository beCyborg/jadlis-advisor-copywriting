#!/bin/sh
# Разворачивает скелет папки памяти советов. Идемпотентно: существующие файлы не трогает.
# Usage: init-memory.sh <memory-dir> [plugin-root]
set -eu

MEM="${1:?usage: init-memory.sh <memory-dir> [plugin-root]}"
ROOT="${2:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"

case "$MEM" in
  '~')   MEM="$HOME" ;;
  '~/'*) MEM="$HOME/${MEM#\~/}" ;;
esac

case "$MEM" in
  *'${user_config'*) echo "MEMORY_DIR не задан" >&2; exit 2 ;;
esac

mkdir -p "$MEM" "$MEM/Профили" "$MEM/_runs"
cp -Rn "$ROOT/assets/memory-skeleton/." "$MEM/" 2>/dev/null || true

# Шаблоны *.tpl → рабочие имена (в репозитории они лежат под .tpl, чтобы не
# путаться с README самого репозитория).
find "$MEM" -type f -name '*.tpl' | while IFS= read -r f; do
  t="${f%.tpl}"
  if [ -e "$t" ]; then rm -f "$f"; else mv "$f" "$t"; fi
done

# Профиль каждого совета: пустой скелет, если файла ещё нет (советы читают его в Phase A
# и дописывают журнал сессий в Phase C; без файла первый прогон идёт с пустым контекстом).
for prof in adv-Decision adv-product adv-influence adv-sales adv-copy adv-CognitiveBiases adv-nupp green-advisor adv-psy; do
  f="$MEM/Профили/$prof.md"
  [ -e "$f" ] && continue
  printf -- '---\nupdated: %s\n---\n\n# %s — профиль\n\n## Profile\nПостоянный контекст: продукт, аудитория, стадия, ограничения, позиционирование. Ведёт человек; советы читают целиком и не переписывают.\n\n## Session log\n' "$(date +%F)" "$prof" > "$f"
done

printf '%s\n' "$MEM"
