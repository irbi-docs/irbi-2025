#!/bin/sh
# Pemakaian: ./jalankan.sh [preview|render]
# Memakai Quarto sistem bila ada; bila tidak, memakai salinan portabel di .tools/quarto.
cd "$(dirname "$0")" || exit 1
if ! command -v quarto >/dev/null 2>&1; then
  PATH="$PWD/.tools/quarto/bin:$PATH"
  export PATH
fi
PERINTAH="${1:-preview}"
[ $# -gt 0 ] && shift
exec quarto "$PERINTAH" "$@"
