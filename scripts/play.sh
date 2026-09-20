#!/usr/bin/env bash
set -euo pipefail
doom_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$doom_root"
if ! command -v node >/dev/null; then
  printf '%s\n' 'Doom needs Node.js 22 or newer: https://nodejs.org/' >&2
  exit 1
fi
if [[ "$(uname -sm)" != 'Darwin arm64' ]]; then
  printf '%s\n' 'This alpha launcher supports Mac Apple Silicon. Other platforms are not released yet.' >&2
  exit 1
fi
if [[ ! -x native/darwin-arm64/doom-claude && ! -x build/doom-claude ]]; then node scripts/build.mjs; fi
node scripts/runtime.mjs
if [[ "${1:-}" == '--check' ]]; then exit 0; fi
doom_claude="$doom_root/.runtime/node_modules/.bin/claude"
if command -v claude >/dev/null && [[ "$(claude --version)" == '2.1.278 '* ]]; then
  doom_claude="$(command -v claude)"
elif [[ ! -x "$doom_claude" || "$("$doom_claude" --version)" != '2.1.278 '* ]]; then
  if ! command -v npm >/dev/null; then printf '%s\n' 'npm is required to install the tested Claude Code version.' >&2; exit 1; fi
  printf '%s\n' 'Installing project-local Claude Code 2.1.278 for the experimental Mods API…'
  npm install --prefix .runtime --no-audit --no-fund @anthropic-ai/claude-code@2.1.278
fi
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
export CLAUDE_CODE_NO_FLICKER=1
printf '%s\n' 'Enter /doom, then click the keyboard strip to play. Escape returns to Claude.'
exec "$doom_claude" --plugin-dir "$doom_root" "$@"
