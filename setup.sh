#!/usr/bin/env bash
# Wires github-cool-readme into your profile repo (<you>/<you>): token secret, workflow, settings,
# first run, README. Run it again to change settings; it asks before changing anything.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/pedrocatalao/github-cool-readme/v1/setup.sh)
#
# Options: --dry-run  show what would happen, change nothing
# Needs: gh (logged in) and git. Works with the bash that ships with macOS.

set -euo pipefail

TOOL_REPO="pedrocatalao/github-cool-readme"
REF="${COOL_README_REF:-v1}"   # the version of the action the workflow uses
WORKFLOW=".github/workflows/cool-readme.yml"
CONFIG="cool-readme.yml"
OUT="stats"        # where workflows from before the cards branch commit the cards
BRANCH="cards"     # where the workflow publishes them now
SECRET="CARDS_TOKEN"
START="<!-- cool-readme:start -->"
END="<!-- cool-readme:end -->"

DRY_RUN=false
NO_COMMIT=false # for trying setup out: everything up to the commit, then no commit, push or run
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --no-commit) NO_COMMIT=true ;;
    -h|--help) echo "Usage: setup.sh [--dry-run | --no-commit]  (sets up README cards in your profile repo)"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# ------------------------------------------------------------------ output and keys

# Questions are read from the terminal, so this also works when the script comes from a pipe.
# Without a terminal, every question takes its default.
HAVE_TTY=false
if (: < /dev/tty) 2>/dev/null; then HAVE_TTY=true; fi
COLOUR=false
[ -t 1 ] && COLOUR=true
FANCY=false # redraws in place and live timers need both
$HAVE_TTY && $COLOUR && FANCY=true

# The cursor is hidden while the guide runs, shown where you type a line, and always given back:
# on success, on an error, and on Ctrl-C.
cursor() { if $FANCY; then if [ "$1" = on ]; then printf '\033[?25h'; else printf '\033[?25l'; fi; fi; }
WORK=""
# Background jobs (starting and watching the first run) ignore Ctrl-C, so they're stopped here,
# with what they started; the job first, so it doesn't report its child being stopped.
stop_jobs() {
  local job children
  for job in $(jobs -p); do
    children="$(pgrep -P "$job" 2>/dev/null || true)"
    kill "$job" $children 2>/dev/null || true
    wait "$job" 2>/dev/null || true
  done
}
# On the screens that redraw in place, keys typed while they redraw aren't shown, so a quick Enter
# doesn't add a line and the redraw stays where it is.
TTY_SAVED=""
quiet_keys() { # quiet_keys on|off
  if [ "$1" = on ]; then TTY_SAVED="$(stty -g < /dev/tty)"; stty -echo < /dev/tty
  elif [ -n "$TTY_SAVED" ]; then stty "$TTY_SAVED" < /dev/tty; TTY_SAVED=""
  fi
}
cleanup() { stop_jobs; quiet_keys off 2>/dev/null || true; cursor on; [ -z "$WORK" ] || rm -rf "$WORK"; }
trap cleanup EXIT
trap 'echo; exit 130' INT TERM
cursor off

INDENT="            " # under the status column
paint() { if $COLOUR; then printf '\033[%sm%s\033[0m' "$1" "$2"; else printf '%s' "$2"; fi; }
section() { printf '\n%s\n' "$(paint 1 "$1")"; }
# redraw rows text: draws text over the last rows lines in one write, each line cleared to its end
# and what's left below cleared after it, so the screen never shows the lines empty (no flicker).
redraw() {
  local text="$2"
  text="${text//$'\n'/$'\033[K\n'}"
  printf '\033[%sA\r%s\033[K\n\033[J' "$1" "$text"
}
# frame_height text: the lines text takes on screen, a line longer than the terminal is wide taking
# more than one. Characters are counted as UTF-8 whatever the locale: bytes, less continuation bytes.
frame_height() {
  local w
  w="$(stty size < /dev/tty 2>/dev/null | awk '{ print $2 }')"
  [ "${w:-0}" -gt 0 ] 2>/dev/null || w=80
  printf '%s\n' "$1" | sed "s/$ESC\[[0-9;?]*[A-Za-z]//g" | LC_ALL=C tr -d '\200-\277' \
    | LC_ALL=C awk -v w="$w" '{ n = length($0); h += n ? int((n + w - 1) / w) : 1 } END { print h + 0 }'
}
# paint_frame text: draws text, over the frame drawn before it (FRAME_H lines; 0 for none)
FRAME_H=0
paint_frame() {
  if [ "$FRAME_H" -gt 0 ]; then redraw "$FRAME_H" "$1"; else printf '%s\n' "$1"; fi
  FRAME_H="$(frame_height "$1")"
}
note() { printf '%s%s\n' "$INDENT" "$*"; }
report() { # report status text: green for done, yellow for skipped, red for what needs you
  local status
  status="$(printf '%-9s' "$1")"
  case "$1" in
    ok | added | set | updated | created | stored | started | generated | pushed | removed | starred) status="$(paint 32 "$status")" ;;
    skipped | kept | "dry run") status="$(paint 33 "$status")" ;;
    missing | failed | old | differs) status="$(paint 31 "$status")" ;;
  esac
  printf '  %s %s\n' "$status" "$2"
}
framed() { # framed colour line...: the lines in a box
  local tone="$1" text width=0 line
  shift
  for text in "$@"; do [ "${#text}" -gt "$width" ] && width="${#text}"; done
  line="$(printf '%*s' $((width + 2)) '' | sed 's/ /─/g')"
  echo
  paint "$tone" "┌${line}┐"; echo
  for text in "$@"; do paint "$tone" "$(printf '│ %-*s │' "$width" "$text")"; echo; done
  paint "$tone" "└${line}┘"; echo
}
die() { # die what [what to do]: a red line, a hint, and stop
  report failed "$1"
  [ -z "${2:-}" ] || note "$2"
  framed 31 "Stopped: nothing after this step was changed."
  exit 1
}

ESC="$(printf '\033')"
quit() { # Esc: stop here
  echo
  framed 33 "Stopped: nothing after this step was changed."
  exit 1
}
read_key() { # read_key: one key into KEY, "" for Enter, " " for space, UP DOWN LEFT RIGHT for the arrows,
             # SHIFT_UP SHIFT_DOWN with Shift (or Alt). Esc quits;
             # other keys like them (F1, Home, ...) are ignored.
  local saved rest c n
  while :; do
    IFS= read -rsn1 KEY < /dev/tty || { KEY=""; return 0; }
    [ "$KEY" = "$ESC" ] || return 0
    # A key like an arrow sends Esc and more right after it; a lone Esc is the Esc key. The rest is
    # read a byte at a time up to its last one, so keys typed right after it aren't lost.
    saved="$(stty -g < /dev/tty)"
    stty -icanon -echo min 0 time 1 < /dev/tty # wait at most a tenth of a second
    rest="$(dd bs=1 count=1 2>/dev/null < /dev/tty)"
    case "$rest" in
      '[' | O)
        for n in 1 2 3 4 5 6; do # Esc [ 1 ; 5 C and the like: ends on a letter or ~
          c="$(dd bs=1 count=1 2>/dev/null < /dev/tty)"
          rest="$rest$c"
          case "$c" in '' | [A-Za-z~]) break ;; esac
        done ;;
    esac
    stty "$saved" < /dev/tty
    [ -n "$rest" ] || quit
    case "$rest" in
      '[A' | 'OA') KEY=UP; return 0 ;;
      '[B' | 'OB') KEY=DOWN; return 0 ;;
      '[D' | 'OD') KEY=LEFT; return 0 ;;
      '[C' | 'OC') KEY=RIGHT; return 0 ;;
      '[1;2A' | '[1;3A' | '[1;4A') KEY=SHIFT_UP; return 0 ;;
      '[1;2B' | '[1;3B' | '[1;4B') KEY=SHIFT_DOWN; return 0 ;;
    esac
  done
}

choice() { # choice value chosen: the value with its dot, ● in green if it's the chosen one, ○ dim if not
  if [ "$1" = "$2" ]; then paint '1;32' "● $1"; else paint 2 "○ $1"; fi
}
draw_yesno() { # draw_yesno answer hint: yes and no, the answer marked, then the hint if any
  printf '%s%s  %s\n' "$INDENT" "$(choice yes "$1")" "$(choice no "$1")"
  [ -z "$2" ] || printf '%s%s\n' "$INDENT" "$(paint 2 "$2")"
}
# yesno "Question" default(y|n) [d]: returns 0 yes, 1 no, 2 show the diff (with d). With the full
# screen it's a choice like the other screens; otherwise one key, y or n, no Enter.
yesno() {
  local question="$1" def="$2" hint answer
  if [ "$def" = y ]; then hint="Y/n"; else hint="y/N"; fi
  [ -z "${3:-}" ] || hint="$hint, d: show the changes"
  if ! $HAVE_TTY; then
    answer=no; [ "$def" = y ] && answer=yes
    printf '%s%s  [%s]  %s\n' "$INDENT" "$question" "$hint" "$(paint 2 "$answer (no terminal)")"
    [ "$def" = y ]
    return
  fi
  if $FANCY; then # like the other screens: the question, then yes and no; space switches, Enter continues
    printf '%s%s\n' "$INDENT" "$question"
    answer=no; [ "$def" = y ] && answer=yes
    hint="space to change, Enter to continue"
    [ -z "${3:-}" ] || hint="space to change, d to show the changes, Enter to continue"
    quiet_keys on
    FRAME_H=0; paint_frame "$(draw_yesno "$answer" "$hint")"
    while :; do
      read_key
      case "$KEY" in
        '') break ;;
        ' ') if [ "$answer" = yes ]; then answer=no; else answer=yes; fi ;;
        LEFT) answer=yes ;;
        RIGHT) answer=no ;;
        d | D) [ -n "${3:-}" ] && { answer=diff; break; } ;;
      esac
      paint_frame "$(draw_yesno "$answer" "$hint")"
    done
    quiet_keys off
    if [ "$answer" = diff ]; then printf '\033[%sA\r\033[J' "$FRAME_H" # for the diff, the choice and the hint go
    else paint_frame "$(draw_yesno "$answer" "")"; fi # the choice stays, the hint goes
    case "$answer" in yes) return 0 ;; no) return 1 ;; *) return 2 ;; esac
  fi
  printf '%s%s  %s  ' "$INDENT" "$question" "$(paint 2 "[$hint]")"
  while :; do
    read_key
    case "$KEY" in
      y | Y) answer=yes; break ;;
      n | N) answer=no; break ;;
      '') answer=no; [ "$def" = y ] && answer=yes; break ;;
      d | D) [ -n "${3:-}" ] && { answer=diff; break; } ;;
    esac
  done
  if [ "$answer" = diff ]; then echo; else paint 1 "$answer"; echo; fi
  case "$answer" in yes) return 0 ;; no) return 1 ;; *) return 2 ;; esac
}

run() { # run a command that changes something, or just say so in a dry run
  if $DRY_RUN; then report "dry run" "would run: $*"; else "$@"; fi
}

# ------------------------------------------------------------------ settings in cool-readme.yml

# A top-level key, or "parent.child" one level down.
yaml_get() { # yaml_get file key -> value, empty if not set
  awk -v key="$2" '
    BEGIN { n = split(key, k, ".") }
    n == 1 && $0 ~ "^" k[1] ":" { sub("^" k[1] ":[[:space:]]*", ""); print uncomment($0); exit }
    n == 2 && /^[^[:space:]#]/ { in_parent = ($0 ~ "^" k[1] ":") }
    n == 2 && in_parent && $0 ~ "^[[:space:]]+" k[2] ":" { sub("^[[:space:]]+" k[2] ":[[:space:]]*", ""); print uncomment($0); exit }
    function uncomment(s) { sub(/^#.*$/, "", s); sub(/[[:space:]]+#.*$/, "", s); return s } # a comment needs a space before it: "#030506" is a value
  ' "$1"
}

yaml_set() { # yaml_set file key value: changes only that line, adding it if missing
  local tmp
  tmp="$(mktemp)"
  awk -v key="$2" -v value="$3" '
    BEGIN { n = split(key, k, "."); done = 0 }
    n == 1 && !done && $0 ~ "^" k[1] ":" { print k[1] ": " value; done = 1; next }
    n == 2 && /^[^[:space:]#]/ {
      if (in_parent && !done) { print "  " k[2] ": " value; done = 1 } # the parent block ended without it
      in_parent = ($0 ~ "^" k[1] ":")
    }
    n == 2 && in_parent && !done && $0 ~ "^[[:space:]]+" k[2] ":" {
      match($0, /^[[:space:]]+/); print substr($0, 1, RLENGTH) k[2] ": " value; done = 1; next
    }
    { print }
    END {
      if (done) exit
      if (n == 1) print k[1] ": " value
      else if (in_parent) print "  " k[2] ": " value
      else { print k[1] ":"; print "  " k[2] ": " value }
    }' "$1" > "$tmp" && mv "$tmp" "$1"
}

# Settings from before v1.5, moved to the new layout: the same values, the same look, comments
# kept. Returns 1 when the file is in the new layout already, and 2 when it has something this can't
# move (a languages section written inline with excludeRepos or repoWeights, say): then the file
# stays as it is, and the action still reads it.
migrate_config() { # migrate_config file
  local tmp status=0
  tmp="$(mktemp)"
  awk '
    function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
    function value(s) { sub(/[[:space:]]+#.*$/, "", s); return trim(s) }
    function unq(s) { if (length(s) > 1 && (substr(s, 1, 1) == "\"" || substr(s, 1, 1) == Q) && substr(s, length(s)) == substr(s, 1, 1)) s = substr(s, 2, length(s) - 2); return s }
    function rest(s) { sub(/^[^:]*:/, "", s); return value(s) } # what follows "key:"
    function indent(s) { match(s, /^[[:space:]]*/); return substr(s, 1, RLENGTH) }
    function items(s, out,   n, i, parts) { # the items of a flow list or map, trimmed; how many
      s = trim(s); s = substr(s, 2, length(s) - 2)
      n = split(s, parts, ",")
      for (i = 1; i <= n; i++) out[i] = trim(parts[i])
      return n
    }
    function emit(s) { print s }
    BEGIN {
      Q = sprintf("%c", 39)
      split("style matrix color background transparent include theme summary languages contributions weekly streaks about", o, " ")
      for (i in o) OLD[o[i]] = 1
      split("show count look", nw, " ")
      for (i in nw) NEW[nw[i]] = 1
      split("summary languages contributions weekly streaks about", cc, " ")
      for (i in cc) CARD[cc[i]] = 1
    }
    { line[++L] = $0 }
    END {
      # Blocks: a top-level key, its lines, and the comments and blank lines just before it.
      b = 0; pending = 0
      for (i = 1; i <= L; i++) {
        s = line[i]
        if (s ~ /^[A-Za-z_][A-Za-z0-9_]*:/) {
          b++; k = s; sub(/:.*/, "", k); key[b] = k; head[b] = s; nbody[b] = 0
          npre[b] = 0
          for (j = 1; j <= pending; j++) pre[b, ++npre[b]] = pend[j]
          pending = 0; at[k] = b
        } else if (b == 0) header[++nheader] = s
        else if (s ~ /^[[:space:]]+[^[:space:]]/ && s !~ /^[[:space:]]+#/) {
          for (j = 1; j <= pending; j++) body[b, ++nbody[b]] = pend[j]
          pending = 0; body[b, ++nbody[b]] = s
        } else pend[++pending] = s
      }
      old = 0; new = 0
      for (i = 1; i <= b; i++) {
        if (key[i] in OLD) old = 1
        if (key[i] in NEW) new = 1
        if (key[i] == "cards") {
          v = rest(head[i])
          if (v ~ /^\[/ || (v == "" && nbody[i] && trim(body[i, 1]) ~ /^-/)) old = 1; else new = 1
        }
      }
      if (!old) exit 1
      if (new) exit 2

      # The look, from the keys it was spread over.
      style = ("style" in at) ? unq(rest(head[at["style"]])) : "classic"
      if (style != "classic" && style != "oled") exit 2
      matrix = ("matrix" in at) ? unq(rest(head[at["matrix"]])) : "true"
      color = ("color" in at) ? unq(rest(head[at["color"]])) : ""
      transparent = ("transparent" in at) ? unq(rest(head[at["transparent"]])) : "true"
      if ("theme" in at) {
        t = at["theme"]; v = rest(head[t])
        if (v ~ /^\{/) { n = items(v, it); for (j = 1; j <= n; j++) { split(it[j], kv, ":"); theme[trim(kv[1])] = unq(trim(kv[2])) } }
        for (j = 1; j <= nbody[t]; j++) {
          s = trim(body[t, j]); if (s ~ /^#/ || s == "") continue
          k = s; sub(/:.*/, "", k); theme[k] = unq(rest(s))
        }
      }
      newstyle = style == "oled" ? (matrix == "false" ? "oled" : "dotmatrix") : "classic"
      if (color == "theme") color = "github"
      if (color == "") color = style == "oled" ? "amber" : "github"
      if ("background" in at) bg = rest(head[at["background"]])
      else if (style == "oled" && transparent == "false") bg = color == "amber" ? "0d0b07" : color == "green" ? "070d09" : "none"
      else bg = "none"

      for (i = 1; i <= nheader; i++) emit(header[i])
      if ("user" in at) block(at["user"], "", "")
      if ("cards" in at) block(at["cards"], "", "show")
      if ("include" in at) block(at["include"], "", "count")
      emit("look:")
      emit("  style: " newstyle)
      emit("  color: " color)
      emit("  background: " bg)
      if ("animations" in theme) emit("  animations: " theme["animations"])
      if ("border" in theme) emit("  border: " theme["border"])
      cards = 0
      for (i = 1; i <= b; i++) if (key[i] in CARD) {
        if (!cards++) emit("cards:")
        if (key[i] == "languages") languages(i); else block(i, "  ", "")
      }
      for (i = 1; i <= b; i++) if (!(key[i] in OLD) && key[i] != "user" && key[i] != "cards") block(i, "", "")
      for (j = 1; j <= pending; j++) emit(pend[j])
    }
    function block(i, ind, rename,   j, h) { # a block as it was, indented, perhaps under another name
      for (j = 1; j <= npre[i]; j++) emit(pre[i, j] == "" ? "" : ind pre[i, j])
      h = head[i]
      if (rename != "") sub(/^[A-Za-z_][A-Za-z0-9_]*:/, rename ":", h)
      if (key[i] == "contributions") gsub(/includeOpen:/, "open:", h)
      emit(ind h)
      for (j = 1; j <= nbody[i]; j++) {
        h = body[i, j]
        if (key[i] == "contributions") gsub(/includeOpen:/, "open:", h)
        emit(h == "" ? "" : ind h)
      }
    }
    function languages(i,   j, s, ci, k, v, n, it, kv, x, done, nw, wk, wv, ne, ex, seen) {
      # exclude becomes hide; excludeRepos and repoWeights become repos, left out being a weight of 0.
      v = rest(head[i])
      if (v ~ /^\{/) {
        if (v ~ /excludeRepos|repoWeights/) exit 2
        s = head[i]; gsub(/exclude:/, "hide:", s); head[i] = s
        block(i, "  ", ""); return
      }
      ci = ""
      for (j = 1; j <= nbody[i]; j++) if (trim(body[i, j]) != "" && trim(body[i, j]) !~ /^#/) { ci = indent(body[i, j]); break }
      ne = 0; nw = 0
      for (j = 1; j <= nbody[i]; j++) { # first, what the repos are
        s = body[i, j]
        if (indent(s) != ci) continue
        k = trim(s); sub(/:.*/, "", k)
        if (k != "excludeRepos" && k != "repoWeights") continue
        v = rest(s)
        if (v ~ /^[\[{]/) {
          n = items(v, it)
          for (x = 1; x <= n; x++) if (it[x] != "") {
            if (k == "excludeRepos") ex[++ne] = it[x]
            else { split(it[x], kv, ":"); wk[++nw] = trim(kv[1]); wv[nw] = trim(kv[2]) }
          }
        } else if (v == "") {
          while (j < nbody[i] && length(indent(body[i, j + 1])) > length(ci)) {
            s = trim(body[i, ++j]); if (s ~ /^#/ || s == "") continue
            if (k == "excludeRepos") { sub(/^-[[:space:]]*/, "", s); ex[++ne] = value(s) }
            else { split(s, kv, ":"); wk[++nw] = trim(kv[1]); wv[nw] = value(kv[2]) }
          }
        } else exit 2
      }
      for (x = 1; x <= ne; x++) seen[tolower(unq(ex[x]))] = 1
      for (j = 1; j <= npre[i]; j++) emit(pre[i, j] == "" ? "" : "  " pre[i, j])
      emit("  " head[i])
      done = 0
      for (j = 1; j <= nbody[i]; j++) {
        s = body[i, j]
        k = trim(s); sub(/:.*/, "", k)
        if (indent(s) == ci && (k == "excludeRepos" || k == "repoWeights")) {
          if (!done++) {
            emit("  " ci "repos:")
            for (x = 1; x <= nw; x++) if (!(tolower(unq(wk[x])) in seen)) emit("  " ci ci wk[x] ": " wv[x])
            for (x = 1; x <= ne; x++) emit("  " ci ci ex[x] ": 0")
          }
          if (rest(s) == "") while (j < nbody[i] && length(indent(body[i, j + 1])) > length(ci)) j++
          continue
        }
        if (indent(s) == ci && k == "exclude") sub(/exclude:/, "hide:", s)
        emit(s == "" ? "" : "  " s)
      }
    }' "$1" > "$tmp" || status=$?
  if [ "$status" = 0 ]; then mv "$tmp" "$1"; else rm -f "$tmp"; fi
  return "$status"
}

# The settings screen: one row per setting; its number cycles the value, Enter continues.
# Values are kept in S_PRIVATE, S_ORGS, S_STYLE, S_COLOR and S_BG: none, dark (the colour's own dark
# panel), or a colour of your own from cool-readme.yml (S_BG_OWN), shown as it is.
rows() { echo "private orgs style color background"; }
row_name() { case "$1" in color) echo colour ;; private) echo "private repos" ;; orgs) echo "org repos" ;; *) echo "$1" ;; esac; }
row_values() {
  case "$1" in
    style) echo "classic oled dotmatrix" ;; color) echo "github amber green purple cyan red blue" ;;
    background) echo "none ${S_BG_OWN:+$S_BG_OWN }dark" ;; *) echo "true false" ;;
  esac
}
row_label() { # row_label row value: what the value is called on screen
  case "$1:$2" in
    background:none) echo transparent ;;
    private:true | orgs:true) echo counted ;; private:false | orgs:false) echo "not counted" ;;
    *) echo "$2" ;;
  esac
}
get_row() { case "$1" in style) echo "$S_STYLE" ;; color) echo "$S_COLOR" ;; background) echo "$S_BG" ;; private) echo "$S_PRIVATE" ;; orgs) echo "$S_ORGS" ;; esac; }
set_row() { case "$1" in style) S_STYLE="$2" ;; color) S_COLOR="$2" ;; background) S_BG="$2" ;; private) S_PRIVATE="$2" ;; orgs) S_ORGS="$2" ;; esac; }
panel() { case "$1" in amber) echo 0d0b07 ;; green) echo 070d09 ;; purple) echo 0c0710 ;; cyan) echo 050c0d ;; red) echo 0d0606 ;; blue) echo 05080d ;; *) echo 0d1117 ;; esac; } # panel color: the dark background
bg_value() { case "$S_BG" in dark) panel "$S_COLOR" ;; *) echo "$S_BG" ;; esac; } # what background: says
cycle_row() { # cycle_row row [back]: the next value of a row, or the one before, wrapping around
  local cur v prev="" first="" last="" next="" found=false
  cur="$(get_row "$1")"
  for v in $(row_values "$1"); do
    [ -n "$first" ] || first="$v"
    if $found && [ -z "$next" ]; then next="$v"; fi
    [ "$v" = "$cur" ] && { found=true; [ -n "$last" ] && prev="$last"; }
    last="$v"
  done
  if [ "${2:-}" = back ]; then set_row "$1" "${prev:-$last}"; else set_row "$1" "${next:-$first}"; fi
}
SROW=1   # the row ▸ is on
draw_settings() { paint_frame "$(settings_frame "${1:-}")"; } # draw_settings [done]: the settings screen
settings_frame() { # settings_frame [done]: the settings screen's lines
  local n=1 row v line mark
  for row in $(rows); do
    line=""
    for v in $(row_values "$row"); do
      if [ "$v" = "$(get_row "$row")" ]; then line="$line  $(paint '1;32' "● $(row_label "$row" "$v")")"
      else line="$line  $(paint 2 "○ $(row_label "$row" "$v")")"
      fi
    done
    mark="  "; [ "${1:-}" != done ] && [ "$n" = "$SROW" ] && mark="$(paint 1 '▸') "
    printf '%s%s%s%s\n' "${INDENT%  }" "$mark" "$(printf '%-13s' "$(row_name "$row")")" "$line"
    n=$((n + 1))
  done
  [ "${1:-}" = done ] || printf '%s%s\n' "$INDENT" "$(paint 2 "↑↓ to choose, space to change, Enter to continue")"
}
settings_screen() {
  local row n count
  if ! $FANCY; then
    for row in $(rows); do note "$(printf '%-13s %s' "$(row_name "$row")" "$(row_label "$row" "$(get_row "$row")")")"; done
    return
  fi
  count="$(set -- $(rows); echo $#)"
  quiet_keys on
  FRAME_H=0; draw_settings
  while :; do
    read_key
    [ -n "$KEY" ] || break
    row="$(set -- $(rows); eval "echo \${$SROW}")"
    case "$KEY" in
      UP) [ "$SROW" -gt 1 ] && SROW=$((SROW - 1)) ;;
      DOWN) [ "$SROW" -lt "$count" ] && SROW=$((SROW + 1)) ;;
      ' ' | RIGHT) cycle_row "$row" ;;
      LEFT) cycle_row "$row" back ;;
    esac
    draw_settings
  done
  quiet_keys off
  draw_settings done # the settings stay, the hint goes
}

# ------------------------------------------------------------------ the about card's text

about_empty() { # about_empty file: true when the about card has no text yet (no section, or only empty values)
  awk '
    /^[^[:space:]#]/ { in_cards = ($0 ~ /^cards:/); in_about = 0; next }
    in_cards && /^[[:space:]]+about:/ {
      match($0, /^[[:space:]]+/); ai = RLENGTH; in_about = 1
      v = $0; sub(/^[[:space:]]+about:/, "", v); sub(/[[:space:]]*#.*$/, "", v); sub(/^[[:space:]]+/, "", v)
      if (v != "" && v != "{}") content = 1
      next
    }
    in_about {
      if ($0 ~ /^[[:space:]]*$/ || $0 ~ /^[[:space:]]*#/) next
      match($0, /^[[:space:]]*/); if (RLENGTH <= ai) { in_about = 0; next }
      s = $0; sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+#.*$/, "", s)
      if (s ~ /^(headline:[[:space:]]*(null|~)?|lines:[[:space:]]*(\[\])?|facts:[[:space:]]*(\{\})?|title:.*)$/) next
      content = 1
    }
    END { exit content }' "$1"
}
about_set() { # about_set file block: the about section under cards: replaced by block (lines indented by 4)
  local block tmp
  block="$(mktemp)"; tmp="$(mktemp)"
  { echo "  about:"; printf '%s\n' "$2"; } > "$block"
  awk -v about="$block" '
    function insert(  l) { while ((getline l < about) > 0) print l; done = 1 }
    /^[^[:space:]#]/ { skip = 0; in_cards = ($0 ~ /^cards:/); print; if (in_cards && !done) insert(); next }
    in_cards && /^[[:space:]]+about:/ { match($0, /^[[:space:]]+/); ai = RLENGTH; skip = 1; next }
    skip { match($0, /^[[:space:]]*/); if ($0 ~ /^[[:space:]]*$/ || RLENGTH > ai) next; skip = 0 }
    { print }
    END { if (!done) { print "cards:"; insert() } }' "$1" > "$tmp" && mv "$tmp" "$1"
  rm -f "$block"
}
about_placeholder() {
  echo "    headline: null        # shown large, e.g. \"Hi, I'm *$LOGIN*\"; *words* in the accent colour"
  echo "    lines: []             # a line each, e.g. [\"I build developer tools.\"]"
  echo "    facts: {}             # label: text, e.g. { Focus: Rust, Based in: Lisbon }"
}
quoted() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '"%s"' "$s"; } # as a YAML string
trimmed() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }
ask_text() { # ask_text prompt: a line you type, into ANSWER
  cursor on
  printf '%s%s ' "$INDENT" "$1"
  IFS= read -r ANSWER < /dev/tty || ANSWER=""
  cursor off
  ANSWER="$(trimmed "$ANSWER")"
}
write_about() { # asks for the headline, lines and facts, and writes them under cards: about:
  local name hello headline block="" n label text
  name="$(gh api user --jq '.name // empty' 2>/dev/null || true)"
  name="${name%% *}"; name="${name:-$LOGIN}"
  hello="Hi, I'm *$name*"
  note "$(paint 2 "words between asterisks, like *$name*, are in the accent colour")"
  ask_text "headline, shown large $(paint 2 "[$hello; - for none]"):"
  headline="${ANSWER:-$hello}"
  [ "$headline" = "-" ] || block="    headline: $(quoted "$headline")"
  note "$(paint 2 "lines, one at a time; Enter on an empty one when done")"
  n=1
  while :; do
    ask_text "line $n:"
    [ -n "$ANSWER" ] || break
    [ "$n" = 1 ] && block="${block:+$block$'\n'}    lines:"
    block="$block"$'\n'"      - $(quoted "$ANSWER")"
    n=$((n + 1))
  done
  note "$(paint 2 "facts, as label: text (Based in: Lisbon); Enter on an empty one when done")"
  n=1
  while :; do
    ask_text "fact $n:"
    [ -n "$ANSWER" ] || break
    case "$ANSWER" in
      *:*) label="$(trimmed "${ANSWER%%:*}")"; text="$(trimmed "${ANSWER#*:}")" ;;
      *) label=""; text="" ;;
    esac
    if [ -z "$label" ] || [ -z "$text" ]; then note "$(paint 33 "write it as label: text, like Based in: Lisbon")"; continue; fi
    [ "$n" = 1 ] && block="${block:+$block$'\n'}    facts:"
    block="$block"$'\n'"      $(quoted "$label"): $(quoted "$text")"
    n=$((n + 1))
  done
  if [ -z "$block" ]; then
    about_set "$CONFIG" "$(about_placeholder)"
    report added "an empty about section under cards: in $CONFIG; write the about card's text there"
  else
    about_set "$CONFIG" "$block"
    report added "the about card's text to $CONFIG"
  fi
}

# ------------------------------------------------------------------ banner

# A star sits beside the title. If you haven't starred the repo, it's lit and space turns it off and on;
# setup goes on by itself after a few seconds, or on Enter, and stars the repo if the star is still
# lit. The star needs a terminal wide enough for the whole title (44 columns), as it's put in place
# with the cursor.
TITLE_ART=( # COOL, 26 wide and 6 rows, the star to its right; under it README, 42 wide and 5 rows: 42 wide in all
  $'\033[0;37m▄\033[0;90;47m▒▒▒▒▒\033[0;37m \033[0;90m▄\033[0;90;47m▒▒▒▒\033[0;90m▄\033[0;37m \033[0;90m▄\033[0;90;47m▒▒▒▒\033[0;90m▄\033[0;37m \033[0;90;47m▒▒\033[0;37m   \033[0m'
  $'\033[0;90;47m▓▓\033[0;37m  \033[0;90;47m▓▓\033[0;37m \033[0;90;47m▓▓\033[0;37m  \033[0;90;47m▓▓\033[0;37m \033[0;90;47m▓▓\033[0;37m  \033[0;90;47m▓▓\033[0;37m \033[0;90;47m▓▓\033[0;37m   \033[0m'
  $'\033[0;90m▀▀\033[0;37m     \033[0;90m▀▀\033[0;37m \033[0;30m┘\033[0;90m▀▀\033[0;37m \033[0;90m▀▀\033[0;37m \033[0;30m┘\033[0;90m▀▀\033[0;37m \033[0;90m▀▀\033[0;30m┘┘┘\033[0m'
  $'\033[0;97;47m▓▓\033[0;37m     \033[0;97;47m▓▓\033[0;37m  \033[0;97;47m▓▓\033[0;37m \033[0;97;47m▓▓\033[0;37m  \033[0;97;47m▓▓\033[0;37m \033[0;97;47m▓▓\033[0;37m   \033[0m'
  $'\033[0;97;47m▒▒\033[0;37m  \033[0;97;47m▒▒\033[0;37m \033[0;97;47m▒▒\033[0;37m  \033[0;97;47m▒▒\033[0;37m \033[0;97;47m▒▒\033[0;37m  \033[0;97;47m▒▒\033[0;37m \033[0;97;47m▒▒\033[0;37m   \033[0m'
  $'\033[0;97m▀\033[0;97;47m░░░░░\033[0;37m \033[0;97m▀\033[0;97;47m░░░░\033[0;97m▀\033[0;37m \033[0;97m▀\033[0;97;47m░░░░\033[0;97m▀\033[0;37m \033[0;97;47m░░░░░\033[0m'
  $'\033[0;97m▄▄▄▄▄▄\033[0;37m \033[0;97m▄▄▄▄▄▄\033[0;37m \033[0;97m▄▄▄▄▄▄\033[0;37m \033[0;97m▄▄▄▄▄\033[0;37m  \033[0;97m▄▄▄▄\033[0;37m \033[0;97m▄▄\033[0;37m \033[0;97m▄▄▄▄▄▄\033[0m'
  $'\033[0;37m▄▄▄  \033[0;97m█\033[0;37m ▄▄▄  \033[0;97m▀\033[0;37m ▄▄▄  \033[0;97m█\033[0;37m ▄▄▄  \033[0;97m█\033[0;37m ▄▄▄ \033[0;97m█\033[0;37m \033[0;97m█\033[0;37m ▄▄▄  \033[0;97m▀\033[0m'
  $'\033[0;97;47m░░▒\033[0;97m▄▄▀\033[0;37m \033[0;97;47m░░▒\033[0;97m▄\033[0;37m   \033[0;97;47m░░▒\033[0;97m▄▄█\033[0;37m \033[0;97;47m░░▒\033[0;37m  \033[0;97m█\033[0;37m \033[0;97;47m░░▒\033[0;37m \033[0;97m█\033[0;37m \033[0;97m█\033[0;37m \033[0;97;47m░░▒\033[0;97m▄\033[0;37m  \033[0m'
  $'\033[0;97;47m▒▒▓\033[0;37m  \033[0;97m█\033[0;37m \033[0;97;47m▒▒▓\033[0;37m    \033[0;97;47m▒▒▓\033[0;37m  \033[0;97m█\033[0;37m \033[0;97;47m▒▒▓\033[0;37m  \033[0;97m█\033[0;37m \033[0;97;47m▒▒▓\033[0;37m \033[0;97m█\033[0;37m \033[0;97m█\033[0;37m \033[0;97;47m▒▒▓\033[0;37m   \033[0m'
  $'\033[0;97;47m▓▓\033[0;97m█\033[0;37m  \033[0;97m█\033[0;37m \033[0;97;47m▓▓█\033[0;97m▄▄█\033[0;37m \033[0;97;47m▓▓\033[0;97m█\033[0;37m  \033[0;97m█\033[0;37m \033[0;97;47m▓▓\033[0;97m█▄▄▀\033[0;37m \033[0;97;47m▓▓\033[0;97m█\033[0;37m   \033[0;97m█\033[0;37m \033[0;97;47m▓▓█\033[0;97m▄▄█\033[0m'
)
STAR_ART=( # 7 wide, 3 rows
  '  ▗█▖  '
  '▀█████▀'
  ' ▟▀ ▀▙ '
)
TAGLINE="animated cards for your GitHub profile README"
cols=0
$HAVE_TTY && cols="$(stty size < /dev/tty 2>/dev/null | awk '{print $2}')"

# The star shows with the full screen, wide enough for the big title it sits beside; it asks when
# GitHub says you haven't starred the repo.
SHOW_STAR=false; ASK_STAR=false
$FANCY && [ "${cols:-0}" -ge 44 ] && SHOW_STAR=true
if $SHOW_STAR && command -v gh >/dev/null; then
  star_err="$(gh api "user/starred/$TOOL_REPO" --silent 2>&1 >/dev/null)" \
    || case "$star_err" in *"HTTP 404"*) ASK_STAR=true ;; esac
fi

TITLE=()
for line in "${TITLE_ART[@]}"; do
  $COLOUR || line="$(printf '%s' "$line" | sed "s/$ESC\[[0-9;]*m//g")"
  TITLE+=("$line")
done
STAR_TOP=1  # centred in the space right of COOL, up to README's right edge
STAR_COL=34

STAR=on
draw_banner() { # draw_banner ask|done: the title with the star beside it; with ask, what the star does
  local i s tone=2
  [ "$STAR" = on ] && tone='1;33'
  for i in "${!TITLE[@]}"; do
    s=$((i - STAR_TOP))
    if [ "$s" -ge 0 ] && [ "$s" -lt "${#STAR_ART[@]}" ]; then printf '  %s\033[%dG%s\033[K\n' "${TITLE[$i]}" "$STAR_COL" "$(paint "$tone" "${STAR_ART[$s]}")"
    else printf '  %s\033[K\n' "${TITLE[$i]}"; fi
  done
  printf '  %s\033[K\n' "$(paint 2 "$TAGLINE")"
  if [ "$1" = ask ]; then
    if [ "$STAR" = on ]; then printf '  %s' "$(paint 33 "star the repo to support the author")"
    else printf '  %s' "$(paint 2 "star the repo to support the author")"; fi
    printf '%s\033[K\n' "$(paint 2 ", space to change")"
  fi
}

echo
if $ASK_STAR; then
  frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  enter_hint="$(paint 2 'Enter to continue')"
  frame="$(draw_banner ask)"
  printf '%s\n' "$frame"
  UP="$(frame_height "$frame")" # the banner's rows above the countdown line, wrapped ones too
  doing="setting up github-cool-readme..."
  [ "$(stty size < /dev/tty 2>/dev/null | awk '{ print $2 }')" -ge 60 ] 2>/dev/null || doing="setting up..." # one line
  quiet_keys on
  stty -icanon min 0 time 1 < /dev/tty # a key, or nothing after a tenth of a second
  ticks=40 i=0                         # 4 seconds
  while [ "$ticks" -gt 0 ]; do
    printf '\r  \033[36m%s\033[0m %s %d   %s\033[K' \
      "${frames[$((i % 10))]}" "$doing" $(((ticks + 9) / 10)) "$enter_hint"
    i=$((i + 1))
    k="$(dd bs=16 count=1 2>/dev/null < /dev/tty; echo .)"
    k="${k%.}"
    case "$k" in
      '') ticks=$((ticks - 1)) ;;
      "$ESC") quit ;;
      ' '*)
        if [ "$STAR" = on ]; then STAR=off; else STAR=on; fi
        frame="$(draw_banner ask)" # its lines clear to their end; the countdown line below stays
        printf '\r\033[%dA%s\n' "$UP" "$frame" ;;
    esac
    case "$k" in *$'\n'* | *$'\r'*) break ;; esac
  done
  quiet_keys off
  printf '\r\033[%dA' "$UP" # the title and the star as you left it, without the key and the countdown
  draw_banner done
  printf '\033[J'
  if [ "$STAR" = on ]; then
    if $DRY_RUN; then report "dry run" "would star $TOOL_REPO"
    elif gh api -X PUT "user/starred/$TOOL_REPO" --silent >/dev/null 2>&1; then report starred "$TOOL_REPO, thank you"
    else report failed "starring $TOOL_REPO; you can star it at https://github.com/$TOOL_REPO"
    fi
  fi
elif $SHOW_STAR; then
  draw_banner done # starred already: the star, lit, and nothing to ask
else
  for line in "${TITLE[@]}"; do printf '  %s\n' "$line"; done
  printf '  %s\n' "$(paint 2 "$TAGLINE")"
fi
echo

# ------------------------------------------------------------------ prerequisites

$DRY_RUN && note "$(paint 33 'dry run: nothing will be changed')"
$NO_COMMIT && note "$(paint 33 'no commit: nothing will be committed, pushed or run')"
$HAVE_TTY && note "$(paint 2 'Esc quits at any question')"

command -v gh >/dev/null || die "the GitHub CLI (gh) is not installed" "install it from https://cli.github.com"
command -v git >/dev/null || die "git is not installed"
gh auth status >/dev/null 2>&1 || die "gh is not logged in" "run: gh auth login"
LOGIN="$(gh api user --jq .login)"
PROFILE="$LOGIN/$LOGIN"
report ok "gh, logged in as $LOGIN"

# Pushing a workflow file over HTTPS needs the "workflow" scope; over SSH it doesn't.
PROTOCOL="$(gh config get git_protocol -h github.com 2>/dev/null || echo https)"
if [ "$PROTOCOL" = ssh ]; then
  report ok "git, over SSH"
else
  SCOPES="$(gh api -i user 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="x-oauth-scopes"{print $2}')"
  case ", $SCOPES," in
    *", workflow,"*) report ok "git, over HTTPS with the workflow scope" ;;
    *)
      if [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
        die "gh uses GH_TOKEN/GITHUB_TOKEN, which lacks the \"workflow\" scope needed to add a workflow" \
          "unset it to use your gh login, or use a token with that scope"
      fi
      report missing "the \"workflow\" scope on your gh login, needed to add a workflow over HTTPS"
      yesno "Grant it now? (opens the browser)" y || die "cannot add the workflow without it"
      cursor on; gh auth refresh -h github.com -s workflow; cursor off
      report added "the workflow scope"
      ;;
  esac
fi

# ------------------------------------------------------------------ profile repo

section "Profile repo"
if gh repo view "$PROFILE" >/dev/null 2>&1; then
  report ok "$PROFILE"
else
  report missing "$PROFILE: its README is what GitHub shows on your profile page"
  yesno "Create it as a public repo?" y || die "nothing to set up without a profile repo"
  run gh repo create "$PROFILE" --public --add-readme --description "My GitHub profile"
  if $DRY_RUN; then framed 33 "Dry run: stopping here, the rest needs the repo to exist."; exit 0; fi
  report created "$PROFILE"
fi

# ------------------------------------------------------------------ token

ask_token() { # ask_token: a new classic token, checked, then stored as the secret
  local url headers status scopes
  $HAVE_TTY || die "pasting the token needs a terminal" "run this script in one"
  url="https://github.com/settings/tokens/new?scopes=repo,read:org,read:user&description=README%20cards%20($PROFILE)"
  note "Create one here; the scopes are filled in, pick an expiry, then Generate token:"
  note "$(paint 4 "$url")"
  if command -v open >/dev/null; then open "$url"; elif command -v xdg-open >/dev/null; then xdg-open "$url" >/dev/null 2>&1 || true; fi
  while :; do
    printf '%s%s ' "$INDENT" "Paste the token (hidden), then Enter:"
    # A key at a time, so Esc quits here too; Backspace works, nothing is shown.
    TOKEN=""
    cursor on
    quiet_keys on # a paste comes in one go; without this, what lands between two reads is shown
    while read_key && [ -n "$KEY" ]; do
      case "$KEY" in $'\177' | $'\b') TOKEN="${TOKEN%?}" ;; UP | DOWN | LEFT | RIGHT | SHIFT_UP | SHIFT_DOWN) ;; *) TOKEN="$TOKEN$KEY" ;; esac
    done
    quiet_keys off
    cursor off; echo
    [ -n "$TOKEN" ] || continue
    headers="$(curl -sS -o /dev/null -D - -H "Authorization: token $TOKEN" https://api.github.com/user | tr -d '\r')"
    status="$(printf '%s\n' "$headers" | awk 'NR==1{print $2}')"
    scopes="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1)=="x-oauth-scopes"{print $2}')"
    if [ "$status" != 200 ]; then report failed "GitHub rejected that token (HTTP $status); try again"; continue; fi
    case "$TOKEN" in
      github_pat_*)
        report differs "that's a fine-grained token; only classic ones are tested, organization work may be missed"
        yesno "Use it anyway?" n || continue ;;
      *)
        case ", $scopes," in
          *", repo,"*) ;;
          *) report missing "the repo scope (the token has: ${scopes:-none}); try again"; continue ;;
        esac
        case ", $scopes," in
          *", read:user,"*|*", user,"*) ;;
          *) report missing "the read:user scope; without it GitHub hides your private work; try again"; continue ;;
        esac
        case ", $scopes," in
          *", read:org,"*|*", admin:org,"*|*", write:org,"*) ;;
          *) report missing "the read:org scope; organization work may be missed"; yesno "Use it anyway?" n || continue ;;
        esac ;;
    esac
    break
  done
  printf '%s' "$TOKEN" | gh secret set "$SECRET" -R "$PROFILE"
  unset TOKEN
  report stored "the token as $SECRET"
}
token_rejected() { # token_rejected run_id: did that run fail on the token?
  gh run view "$1" -R "$PROFILE" --log-failed 2>/dev/null \
    | grep -Eq 'the token was rejected|set GITHUB_TOKEN|not been granted the required scopes'
}

# A secret can't be read back, so a token that's set isn't asked about: the first run uses it, and
# asks for a new one if it fails on it.
section "Token"
if gh secret list -R "$PROFILE" 2>/dev/null | awk '{print $1}' | grep -qx "$SECRET"; then
  report ok "your token is set"
else
  report missing "$SECRET: a classic token with the repo, read:org and read:user scopes"
  note "it lets the cards count your private and organization work"
  if $DRY_RUN; then report "dry run" "would ask for a token and store it as $SECRET"; else ask_token; fi
fi

# ------------------------------------------------------------------ settings and workflow

WORK="$(mktemp -d)"
gh repo clone "$PROFILE" "$WORK/repo" -- --quiet --depth 1
cd "$WORK/repo"

# ------------------------------------------------------------------ cards

CARD_NAMES="summary languages contributions weekly streaks about"
DEFAULT_CARDS="summary languages contributions weekly" # on unless cool-readme.yml says otherwise
LIST=show # the key of the list of cards: cards before v1.5, in a file setup couldn't move
cards_get() { # cards_get file: the cards it lists, as a flow list or a block list; empty if none
  [ -f "$1" ] || return 0
  awk -v key="$LIST" '
    $0 ~ "^" key ":" {
      line = $0; sub("^" key ":[[:space:]]*", "", line); sub(/[[:space:]]*#.*$/, "", line)
      if (line != "") { gsub(/[][,]/, " ", line); print line; exit }
      block = 1; next
    }
    block && /^[[:space:]]*-/ { item = $0; sub(/^[[:space:]]*-[[:space:]]*/, "", item); sub(/[[:space:]]*#.*$/, "", item); out = out " " item; next }
    block { exit }
    END { if (block) print out }' "$1" | tr -d "\"'" | tr -s ' \t' '  ' | sed 's/^ *//; s/ *$//'
}
cards_set() { # cards_set file "card card": writes "show: [card, card]" in place of what was there
  local tmp
  tmp="$(mktemp)"
  awk -v key="$LIST" -v value="[$(printf '%s' "$2" | sed 's/ /, /g')]" '
    $0 ~ "^" key ":" { print key ": " value; done = 1; skip = 1; next }
    skip && /^[[:space:]]*-/ { next }
    { skip = 0; print }
    END { if (!done) print key ": " value }' "$1" > "$tmp" && mv "$tmp" "$1"
}
card_on() { case " $S_CARDS " in *" $1 "*) return 0 ;; esac; return 1; }
known() { # known "card card": the known cards among them, each once, in the order given
  local card out=""
  for card in $1; do
    case " $CARD_NAMES " in *" $card "*) ;; *) continue ;; esac
    case " $out " in *" $card "*) ;; *) out="${out:+$out }$card" ;; esac
  done
  echo "$out"
}
# The cards screen: one row per card, the ones that are on (S_CARDS, in README order) at the top,
# ● in green, the ones that are off (OFF) below them, ○ dim. Up and down move the ▸ (SEL); space
# turns its card off (it goes to the top of the off ones, and the ▸ stays on its row) or on (it
# goes to the bottom of the on ones, and the ▸ goes with it); Shift with up or down moves a card
# that's on among the others.
without() { printf ' %s ' "$1" | sed "s/ $2 / /; s/^ *//; s/ *$//"; } # without "list" card
move_card() { # move_card up|down: SEL one place up or down among the cards that are on
  local a i j t
  a=($S_CARDS)
  for ((i = 0; i < ${#a[@]}; i++)); do [ "${a[$i]}" = "$SEL" ] && break; done
  if [ "$1" = up ]; then j=$((i - 1)); else j=$((i + 1)); fi
  { [ "$i" -lt "${#a[@]}" ] && [ "$j" -ge 0 ] && [ "$j" -lt "${#a[@]}" ]; } || return 0
  t="${a[$i]}"; a[$i]="${a[$j]}"; a[$j]="$t"
  S_CARDS="${a[*]}"
}
draw_cards() { # draw_cards hint: a row per card, ● on or ○ off, the selected one marked; then the hint if any
  local card mark name
  for card in $S_CARDS $OFF; do
    mark="  "; [ -n "$1" ] && [ "$card" = "$SEL" ] && mark="$(paint 1 '▸') "
    if card_on "$card"; then name="$(paint '1;32' "● $card")"; else name="$(paint 2 "○ $card")"; fi
    printf '%s%s%s\n' "${INDENT%  }" "$mark" "$name"
  done
  [ -z "$1" ] || printf '%s%s\n' "$INDENT" "$(paint 2 "$1")"
}

# Settings from before v1.5 move to the new layout first, so the rest of setup reads and writes that.
MOVED=false; OLD_KEPT=false
if [ -f "$CONFIG" ]; then
  moved=0; migrate_config "$CONFIG" || moved=$?
  case "$moved" in 0) MOVED=true ;; 2) OLD_KEPT=true; LIST=cards ;; esac
fi

section "Cards"
# With every card off ("show: []") the cards are off: out of the README, and the workflow runs
# only when you start it. The marked block stays in the README, so they come back in the same place.
WAS_OFF=false
[ -f "$CONFIG" ] && grep -Eq "^$LIST:[[:space:]]*\[[[:space:]]*\]" "$CONFIG" && WAS_OFF=true
cur_cards="$(known "$(cards_get "$CONFIG")")" # in the order they're listed: the README's
$WAS_OFF || cur_cards="${cur_cards:-$DEFAULT_CARDS}"
S_CARDS="$cur_cards"
OFF=""
for card in $CARD_NAMES; do card_on "$card" || OFF="${OFF:+$OFF }$card"; done
SEL="$(set -- $S_CARDS $OFF; echo "$1")"
ROWS="$(set -- $CARD_NAMES; echo $#)"
cards_hint() {
  if [ -n "$S_CARDS" ]; then echo "↑↓ to choose, space for on/off, shift ↑↓ to move, Enter to continue"
  else echo "all off: out of your README, no schedule; space for on/off, Enter to continue"; fi
}
move_sel() { # move_sel up|down: the ▸ to the row above or below
  local a i
  a=($S_CARDS $OFF)
  for ((i = 0; i < ${#a[@]}; i++)); do [ "${a[$i]}" = "$SEL" ] && break; done
  if [ "$1" = up ] && [ "$i" -gt 0 ]; then SEL="${a[$((i - 1))]}"; fi
  if [ "$1" = down ] && [ "$((i + 1))" -lt "${#a[@]}" ]; then SEL="${a[$((i + 1))]}"; fi
  return 0
}
if $FANCY; then
  quiet_keys on
  FRAME_H=0; paint_frame "$(draw_cards "$(cards_hint)")"
  while :; do
    read_key
    [ -n "$KEY" ] || break
    case "$KEY" in
      UP) move_sel up ;;
      DOWN) move_sel down ;;
      SHIFT_UP) card_on "$SEL" && move_card up ;;
      SHIFT_DOWN) card_on "$SEL" && move_card down ;;
      ' ')
        if card_on "$SEL"; then # the ▸ stays on its row, on the card that takes the place of this one
          row="$(set -- $S_CARDS $OFF; i=1; for c; do [ "$c" = "$SEL" ] && break; i=$((i + 1)); done; echo "$i")"
          S_CARDS="$(without "$S_CARDS" "$SEL")"; OFF="$SEL${OFF:+ $OFF}"
          SEL="$(set -- $S_CARDS $OFF; eval "echo \${$row}")"
        else OFF="$(without "$OFF" "$SEL")"; S_CARDS="${S_CARDS:+$S_CARDS }$SEL"; fi ;;
    esac
    paint_frame "$(draw_cards "$(cards_hint)")"
  done
  quiet_keys off
  paint_frame "$(draw_cards "")" # the cards stay, the hint and the ▸ go
elif [ -n "$S_CARDS" ]; then
  report ok "cards: $(printf '%s' "$S_CARDS" | sed 's/ /, /g')"
else
  report ok "cards: off"
fi
CARDS_OFF=false
[ -n "$S_CARDS" ] || CARDS_OFF=true

if $CARDS_OFF; then
  # With the cards off the other settings don't matter: they're not asked, and stay as they are
  # for when the cards are back.
  $MOVED && report updated "$CONFIG: moved to the settings layout of v1.5, the same settings"
  if [ ! -f "$CONFIG" ]; then
    printf '# Settings: https://github.com/%s#settings\nuser: %s\nshow: []\n' "$TOOL_REPO" "$LOGIN" > "$CONFIG"
    report added "$CONFIG, with the cards off"
  elif [ "$S_CARDS" != "$cur_cards" ]; then
    cards_set "$CONFIG" ""
    report updated "$CONFIG: cards off"
  else
    report ok "$CONFIG: cards off"
  fi
else
  section "Settings"
  $MOVED && report updated "$CONFIG: moved to the settings layout of v1.5, the same settings"
  if $OLD_KEPT; then
    # Something setup can't move: the file stays as it is (the action still reads it), and only the cards change.
    if [ "$S_CARDS" != "$cur_cards" ]; then cards_set "$CONFIG" "$S_CARDS"; report updated "cards: $(printf '%s' "$S_CARDS" | sed 's/ /, /g')"; fi
    note "$(paint 2 "$CONFIG is in the settings layout from before v1.5, and setup couldn't move it: it still works;")"
    note "$(paint 2 "to change the look, move it by hand: see github.com/$TOOL_REPO#settings")"
  else
  if [ -f "$CONFIG" ]; then
    cur_private="$(yaml_get "$CONFIG" count.private)"; cur_orgs="$(yaml_get "$CONFIG" count.orgs)"
    cur_style="$(yaml_get "$CONFIG" look.style)"; cur_color="$(yaml_get "$CONFIG" look.color)"
    cur_bg="$(yaml_get "$CONFIG" look.background | tr -d "\"'#" | tr 'A-F' 'a-f')"
  else
    cur_private=""; cur_orgs=""; cur_style=""; cur_color=""; cur_bg=""
  fi
  cur_bg="${cur_bg:-none}"
  S_PRIVATE="${cur_private:-true}"; S_ORGS="${cur_orgs:-true}"; S_STYLE="${cur_style:-classic}"; S_COLOR="${cur_color:-github}"
  S_BG_OWN=""
  case "$cur_bg" in
    none) S_BG=none ;;
    "$(panel "$S_COLOR")") S_BG=dark ;;
    *) S_BG="$cur_bg"; S_BG_OWN="$cur_bg" ;;
  esac
  settings_screen

  changes=""
  change() { # change key current new label: write the setting if it changed, and note it
    if [ "$3" != "$2" ]; then
      yaml_set "$CONFIG" "$1" "$3"
      changes="${changes:+$changes, }$4: $(row_label "${1#*.}" "$3")"
    fi
  }
  if [ -f "$CONFIG" ]; then
    change count.private "${cur_private:-true}" "$S_PRIVATE" "private repos"
    change count.orgs "${cur_orgs:-true}" "$S_ORGS" "org repos"
    change look.style "${cur_style:-classic}" "$S_STYLE" style
    change look.color "${cur_color:-github}" "$S_COLOR" colour
    if [ "$(bg_value)" != "$cur_bg" ]; then
      yaml_set "$CONFIG" look.background "$(bg_value)"
      changes="${changes:+$changes, }background: $(row_label background "$S_BG")"
    fi
    if [ "$S_CARDS" != "$cur_cards" ]; then
      cards_set "$CONFIG" "$S_CARDS"
      changes="${changes:+$changes, }cards: $(printf '%s' "$S_CARDS" | sed 's/ /, /g')"
    fi
    if [ -n "$changes" ]; then report updated "$changes"; elif ! $MOVED; then report ok "$CONFIG unchanged"; fi
  else
    {
      echo "# Settings: https://github.com/$TOOL_REPO#settings"
      echo "user: $LOGIN"
      [ "$S_CARDS" = "$DEFAULT_CARDS" ] || echo "show: [$(printf '%s' "$S_CARDS" | sed 's/ /, /g')]"
      echo "count:"
      echo "  private: $S_PRIVATE"
      echo "  orgs: $S_ORGS"
      echo "look:"
      echo "  style: $S_STYLE"
      echo "  color: $S_COLOR"
      echo "  background: $(bg_value)"
    } > "$CONFIG"
    report added "$CONFIG"
  fi
  fi
  # The about card's text is yours to write: an empty section to fill in, the first time it's on.
  if card_on about && $OLD_KEPT && ! grep -q '^about:' "$CONFIG"; then
    {
      echo "about:                  # the about card's text"
      echo "  headline: null        # shown large, e.g. \"Hi, I'm *$LOGIN*\"; *words* in the accent colour"
      echo "  lines: []             # a line each, e.g. [\"I build developer tools.\"]"
      echo "  facts: {}             # label: text, e.g. { Focus: Rust, Based in: Lisbon }"
    } >> "$CONFIG"
    report added "an about: section to $CONFIG; write the about card's text there"
  fi
  note "$(paint 2 "more settings (languages, titles, ...): edit $CONFIG; see github.com/$TOOL_REPO#settings")"

  # A card that's nothing without your settings: the about card is empty until it has your text.
  if card_on about && ! $OLD_KEPT && about_empty "$CONFIG"; then
    section "About card"
    note "it's empty: it shows a headline, lines and facts of your own"
    if $HAVE_TTY && yesno "Write them now?" y; then
      write_about
    elif awk '/^[^[:space:]#]/ { c = ($0 ~ /^cards:/) } c && /^[[:space:]]+about:/ { f = 1 } END { exit !f }' "$CONFIG"; then
      report skipped "write the about card's text under cards: about: in $CONFIG"
    else
      about_set "$CONFIG" "$(about_placeholder)"
      report added "an empty about section under cards: in $CONFIG; write the about card's text there"
    fi
  fi
fi
# Every card is shown 400 wide, so two fit a row: classic ones are that size, OLED ones are scaled.
WIDTH=400

section "Workflow"
# The template runs on a schedule and on demand; with the cards off, the schedule comes out.
scheduled="$(mktemp)"; unscheduled="$(mktemp)"
gh api "repos/$TOOL_REPO/contents/examples/profile-workflow.yml?ref=$REF" -H "Accept: application/vnd.github.raw" \
  | sed "s#$TOOL_REPO@[A-Za-z0-9._-]*#$TOOL_REPO@$REF#" > "$scheduled"
awk '/^  schedule:/ { print "  # No schedule: the cards are off. Turn one on with setup to bring it back."; next }
  /^    - cron:/ { next } { print }' "$scheduled" > "$unscheduled"
if $CARDS_OFF; then wanted="$unscheduled" other="$scheduled" runs_when="runs only when you start it, the cards are off"
else wanted="$scheduled" other="$unscheduled" runs_when="runs every 2 hours, and on demand"; fi
mkdir -p "$(dirname "$WORKFLOW")"
NEW_SETUP=false
if [ ! -f "$WORKFLOW" ]; then
  NEW_SETUP=true
  cp "$wanted" "$WORKFLOW"
  report added "$WORKFLOW, on $REF: $runs_when"
elif cmp -s "$wanted" "$WORKFLOW"; then
  report ok "$WORKFLOW, on $REF"
elif cmp -s "$other" "$WORKFLOW"; then # the cards were turned on or off: the schedule follows
  cp "$wanted" "$WORKFLOW"
  report updated "$WORKFLOW: $runs_when"
else
  report differs "$WORKFLOW differs from the template for $REF"
  if yesno "Update it?" y; then cp "$wanted" "$WORKFLOW"; report updated "$WORKFLOW, on $REF"; else report kept "your $WORKFLOW"; fi
fi

# ------------------------------------------------------------------ README

# Prepared here, before the commit, so every question is answered before the long wait for the
# first run. Until the cards exist the README would show broken images, so on a new setup the
# README is committed by itself once the first run has made them.
section "Update"
# The workflow publishes the cards on their own branch; one kept from before commits them to stats/.
ON_BRANCH=false
grep -q "origin $BRANCH" "$WORKFLOW" && ON_BRANCH=true
if $ON_BRANCH; then
  BASE="https://raw.githubusercontent.com/$PROFILE/$BRANCH"
  git fetch --quiet --depth 1 origin "$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null || true
  made() { git cat-file -e "refs/remotes/origin/$BRANCH:$1" 2>/dev/null; } # made file: on the branch?
else
  BASE="$OUT"
  made() { [ -f "$OUT/$1" ]; }
fi
picture() { # picture card width alt
  printf '<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="%s/%s-dark.svg">\n  <img src="%s/%s-light.svg" width="%s" alt="%s">\n</picture>\n' \
    "$BASE" "$1" "$BASE" "$1" "$2" "$3"
}
card_picture() { # card_picture card
  case "$1" in
    summary) picture summary "$WIDTH" "GitHub stats" ;;
    languages) picture languages "$WIDTH" "Most used languages" ;;
    contributions) picture contributions "$WIDTH" "Notable contributions" ;;
    weekly) picture weekly "$WIDTH" "Weekly rhythm" ;;
    streaks) picture streaks "$WIDTH" "Streaks" ;;
    about) picture about "$WIDTH" "About" ;;
  esac
}
block="$(mktemp)"
{
  echo "$START"
  echo "<!-- Cards by github-cool-readme: https://github.com/$TOOL_REPO -->" # in the source only, not shown
  n=0
  for card in $S_CARDS; do # two cards per row
    [ $((n % 2)) = 0 ] && echo '<p align="center">'
    card_picture "$card"
    [ $((n % 2)) = 1 ] && echo '</p>'
    n=$((n + 1))
  done
  [ $((n % 2)) = 1 ] && echo '</p>'
  echo "$END"
} > "$block"
size="$WIDTH wide"
shown="the cards"; $CARDS_OFF && shown="no cards (they're off)"
missing_cards=false # a card that's on but not made yet: the README waits for the first run
for card in $S_CARDS; do made "$card-light.svg" || missing_cards=true; done

HAD_README=false
[ -f README.md ] && HAD_README=true
touch README.md
if grep -qF "$START" README.md && grep -qF "$END" README.md; then
  # Replace only what's between the markers.
  awk -v start="$START" -v end="$END" -v block="$block" '
    $0 == start { while ((getline line < block) > 0) print line; skip = 1; next }
    $0 == end { skip = 0; next }
    !skip { print }' README.md > README.md.new
  mv README.md.new README.md
  where="between the cool-readme markers"
else
  { [ -s README.md ] && echo; cat "$block"; } >> README.md
  where="at the end; move the marked block wherever you like"
fi
git add -N README.md # so a new README shows in the diff too
# With the cards on their branch, the stats/ folder of before is no longer used once the README
# points at the branch: it goes with the README change.
OLD_STATS=false
$ON_BRANCH && [ -n "$(git ls-files "$OUT")" ] && OLD_STATS=true
README_LATER=false # true: the README change waits for the first run's cards
if git diff --quiet README.md && ! $OLD_STATS; then
  report ok "$shown $where"
elif $CARDS_OFF; then
  if [ "$where" = "between the cool-readme markers" ]; then
    git diff --quiet README.md || report updated "the cards taken out; the markers stay, so they come back in the same place"
  else
    report added "the cool-readme markers $where; the cards go there when you turn them on"
  fi
  if $OLD_STATS; then git rm -r --quiet "$OUT"; report removed "$OUT/: no longer used"; fi
elif ! $missing_cards; then
  git diff --quiet README.md || report updated "the cards $where, $size"
  if $OLD_STATS; then git rm -r --quiet "$OUT"; report removed "$OUT/: the cards are on the $BRANCH branch now"; fi
else
  README_LATER=true
  git --no-pager -c color.ui="$($COLOUR && echo always || echo never)" diff README.md > "$WORK/readme.diff"
  cp README.md "$WORK/README.next"
  git reset --quiet README.md
  if $HAD_README; then git checkout --quiet -- README.md; else rm -f README.md; fi
  report updated "the cards $where, $size"
  if $OLD_STATS; then
    report removed "$OUT/: the cards will be on the $BRANCH branch"
    printf '%s\n' "and $OUT/ is removed ($(git ls-files "$OUT" | wc -l | tr -d ' ') files)" >> "$WORK/readme.diff"
  fi
  note "$(paint 2 'committed by itself once the first run has made the cards')"
fi
if grep -q 'github-readme-stats' README.md "$WORK/README.next" 2>/dev/null; then
  note "$(paint 33 'README.md still has github-readme-stats images; remove them if these cards replace them')"
fi

# ------------------------------------------------------------------ commit

commit_and_push() { # commit_and_push "message": asks first; d shows exactly what would be committed
  local answer question
  git add -A
  git diff --cached --quiet && ! $README_LATER && return 1
  if $DRY_RUN; then
    git --no-pager diff --cached --stat | sed "s/^/$INDENT/"
    git --no-pager diff --cached
    $README_LATER && cat "$WORK/readme.diff"
    report "dry run" "would commit \"$1\" and push"
    $README_LATER && report "dry run" "would commit the README once the cards exist"
    return 0
  fi
  if $NO_COMMIT; then
    git --no-pager diff --cached --stat | sed "s/^/$INDENT/"
    report skipped "commit \"$1\" and push (--no-commit)"
    return 0
  fi
  question="Commit \"$1\" and push?"
  if $README_LATER; then
    question="Commit \"$1\" and push, and the README once the cards exist?"
    git diff --cached --quiet && question="Commit the README once the cards exist?"
  fi
  while :; do
    answer=0
    yesno "$question" y d || answer=$?
    [ "$answer" = 2 ] || break
    git --no-pager -c color.ui="$($COLOUR && echo always || echo never)" diff --cached
    $README_LATER && cat "$WORK/readme.diff"
  done
  [ "$answer" = 0 ] || die "nothing was pushed" "run this again when you're ready"
  if ! git diff --cached --quiet; then
    git commit --quiet -m "$1"
    git push --quiet
    report pushed "$1"
  fi
}
# The message names what changed.
git add -A
parts=""
for f in "$WORKFLOW:workflow" "$CONFIG:settings" "README.md:README"; do
  git diff --cached --quiet -- "${f%%:*}" || parts="${parts:+$parts, }${f##*:}"
done
parts="$(printf '%s' "$parts" | sed 's/\(.*\), /\1 and /')"
if $NEW_SETUP; then msg="Add README cards: $parts"; else msg="Update README cards: $parts"; fi
$CARDS_OFF && ! $WAS_OFF && msg="Turn README cards off: $parts"
$WAS_OFF && ! $CARDS_OFF && msg="Turn README cards on: $parts"
if ! git diff --cached --quiet -- "$OUT"; then
  if [ -n "$parts" ]; then msg="$msg; the cards are on the $BRANCH branch now"; else msg="Remove $OUT/: the README cards are on the $BRANCH branch now"; fi
fi
commit_and_push "$msg" || true

# ------------------------------------------------------------------ first run

if ! $CARDS_OFF; then if $NEW_SETUP; then section "First run"; else section "Run"; fi; fi # with the cards off there is nothing to run
wait_with_timer() { # wait_with_timer pid label: a spinner and the time taken, until pid ends; its exit status
  local pid="$1" start="$SECONDS" i=0 s
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  if $FANCY; then
    while kill -0 "$pid" 2>/dev/null; do
      s=$((SECONDS - start))
      printf '\r  %s %s %d:%02d\033[K' "$(paint 36 "${frames[$((i % 10))]}")" "$2" $((s / 60)) $((s % 60))
      i=$((i + 1))
      sleep 0.2
    done
    printf '\r\033[K'
  fi
  wait "$pid"
}
if $CARDS_OFF; then
  :
elif $DRY_RUN; then
  report "dry run" "would run the workflow and wait for the cards"
elif $NO_COMMIT; then
  report skipped "the first run (--no-commit)"
else
  wf="$(basename "$WORKFLOW")"
  runs() { gh run list -R "$PROFILE" -w "$wf" -L 20 --json databaseId --jq '.[].databaseId' 2>/dev/null || true; }
  start_run() {
    # GitHub needs a moment to register a new workflow before it can be started; the run, to show up.
    local id
    for _ in 1 2 3 4 5 6; do gh workflow run "$wf" -R "$PROFILE" >/dev/null 2>&1 && break; sleep 5; done
    for _ in $(seq 1 20); do
      sleep 3
      for id in $(runs); do printf '%s\n' "$before" | grep -qx "$id" || { echo "$id" > "$WORK/run"; return 0; }; done
    done
    return 1
  }
  while :; do # again with a new token, if the run fails on the one that's set
    before="$(runs)" # earlier runs, so the one started below can be told apart from them
    start_run & pid=$!
    wait_with_timer "$pid" "starting the workflow" \
      || die "the workflow didn't start" "start it from the Actions tab of $PROFILE"
    run_id="$(cat "$WORK/run")"
    report started "the workflow"
    gh run watch "$run_id" -R "$PROFILE" --exit-status >/dev/null 2>&1 & pid=$!
    wait_with_timer "$pid" "generating the cards, usually 30-60 seconds" && break
    token_rejected "$run_id" || die "the workflow failed" "see: gh run view $run_id -R $PROFILE --log-failed"
    report failed "the workflow couldn't use your token: it expired, was revoked or lacks a scope"
    yesno "Replace it?" y || die "the cards can't be made with that token" "run this again when you have a new one"
    ask_token
  done
  git pull --quiet
  if $ON_BRANCH; then report generated "the cards, on the $BRANCH branch"; else report generated "the cards, in $OUT/"; fi
  if $README_LATER; then
    # Already agreed to above: the cards exist now, so the README can show them.
    cp "$WORK/README.next" README.md
    git add README.md
    later="Show README cards"
    if $OLD_STATS; then git rm -r --quiet "$OUT"; later="Show README cards from the $BRANCH branch, remove $OUT/"; fi
    git commit --quiet -m "$later"
    git push --quiet
    report pushed "$later"
  fi
fi

# ------------------------------------------------------------------ done

if $DRY_RUN; then
  framed 33 "Dry run: nothing was changed."
elif $NO_COMMIT; then
  framed 33 "No commit: nothing was committed, pushed or run."
elif $CARDS_OFF; then
  framed 32 "Done: the cards are off" \
    "They're out of your README, and the workflow runs only when you start it." \
    "To bring them back: run this again and turn a card on."
else
  framed 32 "Done: https://github.com/$LOGIN" \
    "The cards update every 2 hours; run this again to change the settings." \
    "To refresh now: gh workflow run $(basename "$WORKFLOW") -R $PROFILE"
fi
