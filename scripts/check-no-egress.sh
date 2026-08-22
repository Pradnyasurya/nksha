#!/usr/bin/env bash
# Privacy gate for nksha.
#
# Enforces the zero-egress invariant (docs/adr/0002): shipped browser-facing
# code must contain no absolute network endpoints. Any http(s)/ws(s) URL found
# in src/, public/, or index.html fails this check unless the matching line is
# explicitly allowed by scripts/egress-allowlist.txt (which requires an ADR).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOWLIST="$ROOT/scripts/egress-allowlist.txt"
PATTERN='(https?|wss?)://'

TARGETS=()
for target in "$ROOT/src" "$ROOT/public" "$ROOT/index.html"; do
  [[ -e "$target" ]] && TARGETS+=("$target")
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "check-no-egress: no browser-facing sources yet; nothing to scan."
  exit 0
fi

MATCHES="$(grep -RInE --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.jsx' --include='*.mjs' --include='*.cjs' --include='*.css' \
  --include='*.html' -e "$PATTERN" "${TARGETS[@]}" || true)"

if [[ -z "$MATCHES" ]]; then
  echo "check-no-egress: clean."
  exit 0
fi

VIOLATIONS=""
while IFS= read -r match; do
  [[ -z "$match" ]] && continue
  match="${match#"$ROOT"/}"
  if [[ -f "$ALLOWLIST" ]]; then
    allowed=0
    while IFS= read -r entry; do
      [[ -z "$entry" || "$entry" == \#* ]] && continue
      if grep -qE -- "$entry" <<<"$match"; then
        allowed=1
        break
      fi
    done <"$ALLOWLIST"
    [[ $allowed -eq 1 ]] && continue
  fi
  VIOLATIONS+="${match}"$'\n'
done <<<"$MATCHES"

if [[ -z "$VIOLATIONS" ]]; then
  echo "check-no-egress: all matches allowlisted."
  exit 0
fi

echo "check-no-egress: absolute network endpoints are forbidden (ADR-0002):" >&2
while IFS= read -r violation; do
  [[ -z "$violation" ]] && continue
  if [[ "$violation" =~ ^([^:]+):([0-9]+):(.*)$ ]]; then
    file="${BASH_REMATCH[1]}"
    line="${BASH_REMATCH[2]}"
    text="${BASH_REMATCH[3]}"
    echo "::error file=$file,line=$line::network endpoint forbidden by ADR-0002: $text" >&2
  else
    echo "::error::$violation" >&2
  fi
done <<<"$VIOLATIONS"

echo "If this is a justified exception: record an ADR first, then add a regex to scripts/egress-allowlist.txt." >&2
exit 1
