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
  *'${user_config'*) echo "ADVISORS_MEMORY_DIR не задан" >&2; exit 2 ;;
esac

mkdir -p "$MEM" "$MEM/Профили" "$MEM/_runs"
cp -Rn "$ROOT/assets/memory-skeleton/." "$MEM/" 2>/dev/null || true

# Шаблоны *.tpl → рабочие имена (в репозитории они лежат под .tpl, чтобы не
# путаться с README самого репозитория).
find "$MEM" -type f -name '*.tpl' | while IFS= read -r f; do
  t="${f%.tpl}"
  if [ -e "$t" ]; then rm -f "$f"; else mv "$f" "$t"; fi
done

printf '%s\n' "$MEM"
