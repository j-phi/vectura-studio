# Claude / Tailscale / Termius Cheatsheet

Quick reference for running Claude Code on your Mac and reaching it from your iPad.

---

## Current Setup

- **Tailscale** runs on Mac and iPad — gives the Mac a stable IP reachable from anywhere.
- **Termius on iPad** SSHes into the Mac via that Tailscale IP.
- **tmux** runs on the Mac and owns long-lived shell sessions. Mac terminals and the iPad SSH session are both *clients* of the same tmux server.
- **`~/.zshrc`** has a `work` function that creates or reattaches a tmux session and auto-launches Claude inside it.

Mental model: tmux lives only on the Mac. Your iPad is just a viewer.

---

## Daily Workflow on the Mac

```bash
work                          # new auto-named session (claude-1, claude-2, ...) in vectura-studio
work feature-auth             # session named "feature-auth" in vectura-studio
work bugfix ~/code/other      # session named "bugfix" in ~/code/other
```

Each invocation either creates a new tmux session with Claude already running, or reattaches if the named session exists. Open as many Mac terminal tabs as you want — each running its own session, all visible side-by-side.

To leave a session running and disappear from view: `Ctrl+B D` (detach).

---

## Connecting from iPad

1. Open Termius on iPad.
2. Connect to the host configured with your Mac's **Tailscale IP**.
3. After login, the shell prints a list of active tmux sessions.
4. Attach to whichever you want:
   ```bash
   tmux a -t claude-1
   ```

Once attached, you're seeing exactly what's on the Mac. Type freely — your input goes to Claude on the Mac.

---

## ⭐ The Single Most Useful Key on iPad: `Ctrl+B S`

While inside any tmux session, press **`Ctrl+B`** then **`S`**.

This pops up a **visual list of every tmux session** on the Mac. Arrow up/down to highlight, Enter to switch. No need to detach, no need to remember session names.

This is your panic button when you can't remember what you have running.

---

## Essential tmux Keys

All of these start with the **prefix**: `Ctrl+B`, then the key.

| Action | Keys |
|---|---|
| **List & switch sessions** ⭐ | `Ctrl+B` `S` |
| Detach (leave running) | `Ctrl+B` `D` |
| New window | `Ctrl+B` `C` |
| Switch to window N | `Ctrl+B` `0` … `9` |
| Next / previous window | `Ctrl+B` `N` / `Ctrl+B` `P` |
| List windows visually | `Ctrl+B` `W` |
| Last-used window (toggle) | `Ctrl+B` `L` |
| Rename current window | `Ctrl+B` `,` |
| Kill current window | `Ctrl+B` `&` |

A *session* is a workspace. *Windows* are tabs inside the workspace.

---

## `~/.zshrc` Setup

If you're setting up a new Mac (or want to verify your existing `~/.zshrc`), append the block below to the end of `~/.zshrc`, save, then run `source ~/.zshrc` (or `szsh` once the alias is loaded).

```bash
# ═════════════════════════════════════════════════════════════════════
# Claude + tmux helpers
# ─────────────────────────────────────────────────────────────────────
# Append this block to the end of ~/.zshrc.
# Reload with `source ~/.zshrc` (or `szsh` after the alias is loaded).
# ═════════════════════════════════════════════════════════════════════


# ── Aliases ──────────────────────────────────────────────────────────
alias czsh='code ~/.zshrc'      # open ~/.zshrc in VS Code
alias szsh='source ~/.zshrc'    # reload ~/.zshrc into the current shell


# ── work: launch (or reattach) a Claude session in tmux ──────────────
#
# Usage:
#   work                       New auto-named session ("claude-1",
#                              "claude-2", …) rooted in
#                              ~/Documents/github/vectura-studio.
#
#   work feature-x             Session named "feature-x" in vectura-studio.
#                              If "feature-x" already exists, just
#                              reattaches — Claude keeps running.
#
#   work feature-x ~/code/foo  Session "feature-x" rooted in ~/code/foo.
#
# Behavior: a brand-new session is created detached, then "claude" is
# typed into it as if you'd pressed Enter, and finally the session is
# attached. Closing the terminal tab leaves the session running on the
# Mac; running `work <same-name>` later picks up exactly where you left
# off.
function work() {
    local name="$1"
    local dir="${2:-$HOME/Documents/github/vectura-studio}"
    dir="${dir/#\~/$HOME}"   # expand a leading "~" if the caller passed one as a string

    # No name supplied → find the next free claude-N slot.
    if [[ -z "$name" ]]; then
        local i=1
        while tmux has-session -t "claude-$i" 2>/dev/null; do
            i=$((i + 1))
        done
        name="claude-$i"
    fi

    # First time we've seen this name → create the session and start Claude in it.
    if ! tmux has-session -t "$name" 2>/dev/null; then
        tmux new-session -d -s "$name" -c "$dir"     # -d = detached, -c = working dir
        tmux send-keys -t "$name" "claude" Enter      # type "claude" + Enter into the session
    fi
    tmux attach -t "$name"
}


# ── tm: interactive tmux session picker ──────────────────────────────
#
# Prints a numbered list of every active tmux session and lets you pick
# one to attach to (or create a new one). Built on zsh's `select`
# builtin, so navigation is just typing the number + Enter — handy on
# iPad where typing full session names through the on-screen keyboard
# is painful.
#
# Run `tm` any time after SSH login, or rely on the auto-run block
# below which fires it for you.
tm() {
    local -a sessions
    # ${(@f)…} splits the command output on newlines into a zsh array.
    sessions=("${(@f)$(tmux list-sessions -F '#S' 2>/dev/null)}")

    # No sessions yet → just spawn a fresh one.
    if [ ${#sessions[@]} -eq 0 ]; then
        echo "No tmux sessions found."
        tmux new-session
        return
    fi

    # Numbered menu. "Create new session" is appended as the last option.
    select sel in "${sessions[@]}" "Create new session"; do
        if [[ -n "$sel" ]]; then
            if [[ "$sel" == "Create new session" ]]; then
                tmux new-session
            else
                tmux attach -t "$sel"
            fi
            break
        else
            echo "Invalid selection."
        fi
    done
}


# ── Auto-run on SSH login (e.g. from iPad Termius) ───────────────────
#
# $SSH_CONNECTION is set whenever this shell was started by an incoming
# SSH connection. $TMUX is set when we're already inside tmux. We only
# run the picker when both conditions say "fresh remote shell, not yet
# attached" — otherwise we'd nest tmux or interrupt local terminals.
if [[ -n "$SSH_CONNECTION" ]] && [[ -z "$TMUX" ]]; then
    # Only show the picker if there's actually something to pick.
    if tmux ls 2>/dev/null | grep -q .; then
        echo ""
        echo "Attach most recent: tmux a   |   Attach by name: tmux a -t <name>   |   Inside tmux: Ctrl+B S"
        echo ""
        tm
    fi
fi
# ═════════════════════════════════════════════════════════════════════
```

Reload after saving:

```bash
source ~/.zshrc       # or just: szsh
```

Quick edit later:

```bash
czsh                  # opens ~/.zshrc in VS Code
```

---

## Troubleshooting

### "sessions should be nested with care, unset $TMUX to force"

You're already inside tmux and tried to `tmux a -t <name>` from within it. tmux refuses to nest.

**Fix:** Don't attach — *switch*. Use:
- `Ctrl+B` `S` → visual session picker (preferred), or
- `Ctrl+B` `D` to detach first, then `tmux a -t <name>`.

### iPad can't reach the Mac

- Confirm Tailscale is running on both devices and they show each other in the Tailscale admin console.
- Confirm macOS **System Settings → General → Sharing → Remote Login** is ON.
- Try `ssh <username>@<mac-tailscale-ip>` from a Termius tab to test the raw SSH path before bringing tmux into it.

### `Ctrl+B` is awkward on the on-screen keyboard

In Termius iPad: Settings → Keyboard → add `Ctrl` to the key bar. Then tap `Ctrl`, tap `B`, tap the next key. A hardware keyboard makes this far less painful.
