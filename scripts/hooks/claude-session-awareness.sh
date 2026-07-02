#!/usr/bin/env bash
# Cross-session awareness for parallel Claude Code sessions.
#
# A single Claude session cannot otherwise see that other sessions or worktrees
# are mid-edit — the per-session guard hook only inspects its own working tree.
# This script leaves a heartbeat breadcrumb and, at session start, warns when
# other live sessions or dirty worktrees are detected (an implicit parallel path).
#
# Modes (arg 1):
#   start  (default) — refresh own heartbeat, then scan + warn via additionalContext
#   beat            — refresh own heartbeat only (called from PreToolUse), silent
#
# Reads the hook event JSON on stdin. Never blocks: always exits 0.

mode="${1:-start}"
payload="$(cat 2>/dev/null)"
repo="$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)"
[ -z "$repo" ] && exit 0

sid="$(printf '%s' "$payload" | jq -r '.session_id // "unknown"' 2>/dev/null | tr -cd 'A-Za-z0-9_-')"
[ -z "$sid" ] && sid="unknown"
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$cwd" ] && cwd="$repo"

dir="$repo/.claude/active-sessions"
mkdir -p "$dir" 2>/dev/null
now="$(date +%s)"

# Refresh our own heartbeat: "<epoch>\t<worktree>"
printf '%s\t%s\n' "$now" "$cwd" > "$dir/$sid" 2>/dev/null

[ "$mode" = "beat" ] && exit 0

TTL=1800   # a heartbeat older than 30 min is treated as dead and pruned
warn=""

# --- other live sessions (fresh heartbeats from a different session id) ---
others=""
for f in "$dir"/*; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  [ "$base" = "$sid" ] && continue
  ts="$(cut -f1 "$f" 2>/dev/null)"
  wt="$(cut -f2 "$f" 2>/dev/null)"
  case "$ts" in ''|*[!0-9]*) rm -f "$f" 2>/dev/null; continue;; esac
  if [ $((now - ts)) -gt "$TTL" ]; then rm -f "$f" 2>/dev/null; continue; fi
  others="${others}\n  - session ${base} active in ${wt}"
done
[ -n "$others" ] && warn="${warn}\nOther live Claude sessions detected (you are not alone — coordinate before committing/pushing):${others}"

# --- other worktrees holding uncommitted WIP ---
wt_warn=""
while IFS= read -r line; do
  case "$line" in worktree\ *) wtp="${line#worktree }";; *) continue;; esac
  [ "$wtp" = "$cwd" ] && continue
  n="$(git -C "$wtp" status --porcelain 2>/dev/null | grep -c . )"
  [ "$n" -gt 0 ] 2>/dev/null || continue
  br="$(git -C "$wtp" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  wt_warn="${wt_warn}\n  - ${wtp} [${br}] — ${n} uncommitted file(s)"
done < <(git -C "$cwd" worktree list --porcelain 2>/dev/null)
[ -n "$wt_warn" ] && warn="${warn}\nOther worktrees hold uncommitted WIP (parallel development paths — do not assume they are idle, and never reset/rebase across them without a checkpoint):${wt_warn}"

[ -z "$warn" ] && exit 0

msg="Concurrent-development check:${warn}\n\nBefore committing, rebasing, merging, or pushing, re-read CLAUDE.md > \"Concurrent Development & Working-Tree Safety\". Another session or worktree may be mid-edit; checkpoint your own WIP first."
jq -cn --arg m "$(printf '%b' "$msg")" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$m}}' 2>/dev/null
exit 0
