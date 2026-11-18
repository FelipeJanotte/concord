#!/usr/bin/env bash
# The mechanical checks of the test-strategy gate, as a script with an exit code. A
# reviewer agent told to "run these checks" can obey in the transcript and change nothing; a
# script cannot be skipped quietly, and its stdout is evidence a human can read without trusting
# the reviewer. The checks that need judgement (self-comparison, mutation, theatre) stay with
# the reviewer.
#
#   gate.sh <visible-sha> <head-sha> <artifact-path> <held-out-dir> <one-file-test-command>
#
# Run from inside the repository under review, with the ticket head checked out. Only stdout is
# the contract, one line per finding:
#   artifact-mentions-held-out: <line>                                   exit 1
#   rederive-column-missing: <artifact>                                  exit 1
#   rederive-row-width: <test> | cells: <n> | header: <n>                exit 1
#   rederive-cell-empty: <test> | <column>                               exit 1
#   rederive-cell-malformed: <test> | <cell>                             exit 1
#   rederive-source-malformed: <test> | <cell>                           exit 1
#   rederive-not-marked: <test>                                          exit 1
#   rederive-missing-fresh: <test>                                       exit 1
#   rederive-mismatch: <test> | artifact: <v> | fresh: <v>               exit 1
#   strategist-file-in-diff: <path>                                      exit 1
#   red-line-mismatch: <test> | artifact: <line> | observed: <line>      exit 1
#   held-out-failed: <test>                                              exit 1
#   gate: ok | visible=<n> | held-out=<n> | sha=<visible-sha>            exit 0
# Anything the gate cannot judge (bad arguments, a tree that is not at the head sha, a file it
# would have to overwrite) goes to stderr with exit 2, so a reviewer never reads a setup error
# as a passed gate.
#
# Everything repository-specific comes from the caller: the artifact names the visible tests,
# the one-file command is the repository's own wrapper from its contract block, and the shas
# are the ticket's. Requires: git, bash 3.2 or later. No network.
set -uo pipefail

[ $# -eq 5 ] || {
    echo "usage: gate.sh <visible-sha> <head-sha> <artifact-path> <held-out-dir> <one-file-test-command>" >&2
    exit 2
}
visible=$1 head=$2 artifact=$3 cmd=$5
# A trailing slash is the caller's, not the path's, and would make the scan below miss every
# mention written without it. The root directory is the one path that is only a slash.
given=$4
[ "$given" = / ] || given=${given%/}
held=$(cd "$4" 2>/dev/null && pwd) || { echo "no held-out directory at $4" >&2; exit 2; }

# The artifact path is repository-relative by convention, so the script anchors itself at the
# root rather than trusting the caller's cwd; the held-out path was resolved above for the
# same reason.
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "gate.sh must run inside a git repository" >&2; exit 2; }
cd "$root"
[ -f "$artifact" ] || { echo "no artifact at $artifact" >&2; exit 2; }
git rev-parse --verify --quiet "$visible^{commit}" >/dev/null || { echo "unknown visible sha $visible" >&2; exit 2; }
git rev-parse --verify --quiet "$head^{commit}" >/dev/null || { echo "unknown head sha $head" >&2; exit 2; }

# Check 0. The visible artifact must not tell the implementer what was kept back. It runs above
# every other check, and above the table parse, so an artifact that leaks and carries no visible
# table is a finding rather than the setup error the parser below would raise.
#
# Two clauses and no phrase match. A phrase such as `held.out` cannot be one: it fires on the
# titles and the `test` cells of artifacts this repository already merged, and those artifacts
# are the strategist's, which nobody is allowed to edit to accommodate a check. So the scan
# matches only what carries no legitimate reading: the held-out directory itself, however it is
# written, and the kept-back table's own shape, a header carrying both `covers` and `angle`
# with the rows beneath it. The separator is not a row, the reading the parser below also takes.
# What this leaves uncaught, a sentence naming the held-out set in prose, stays a rule the
# strategist holds and is stated as such in reference/held-out-template.md.
#
# The directory is written three ways in practice: as the caller typed it, absolute, and as the
# path from the repository root, which is what a person types and which needs `..` whenever the
# directory sits outside the tree, the layout the contract block asks for. Stripping the root as
# a prefix only produces the third form for a directory inside the repository, and
# `realpath --relative-to` is GNU-only, so the walk below is the portable way to get it. An empty
# needle matches every line, so a form that collapses to nothing falls back to the resolved path.
from=$root
relative=''
while [ "$from" != / ] && [ "$from" != "$held" ] && [ "${held#"$from"/}" = "$held" ]; do
    from=$(dirname -- "$from")
    relative=../$relative
done
if [ "$from" = "$held" ]; then relative=${relative%/}
elif [ "$from" = / ]; then relative=$relative${held#/}
else relative=$relative${held#"$from"/}
fi
[ -n "$relative" ] || relative=$held
[ -n "$given" ] || given=$held

leaks=$(GATE_GIVEN=$given GATE_RESOLVED=$held GATE_RELATIVE=$relative awk '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    BEGIN {
        given = ENVIRON["GATE_GIVEN"]
        resolved = ENVIRON["GATE_RESOLVED"]
        relative = ENVIRON["GATE_RELATIVE"]
    }
    # A carriage return would ride into the finding line, where it corrupts the report a
    # reviewer pastes and hides why two seemingly identical lines differ.
    { sub(/\r$/, "") }
    # The two clauses share one pass and one print, so a line both of them hit is reported once
    # and, more to the point, a path hit inside a copied table does not end the table: the rows
    # under it would then go unreported, and the finding would undercount.
    { hit = (index($0, given) || index($0, resolved) || index($0, relative)) }
    # A table under a bullet or a numbered step is indented and still renders as a table, so the
    # shape clause reads it. The visible-table parser below is anchored at the margin and stays
    # that way: it locates the table this gate replays, which the strategist writes flush left.
    !/^[ \t]*\|/ { if (hit) print; kept = 0; next }
    {
        n = split(trim($0), cell, "|")
        for (i = 1; i <= n; i++) cell[i] = trim(cell[i])
        if (!kept) {
            covers = 0; angle = 0
            for (i = 1; i <= n; i++) { if (cell[i] == "covers") covers = 1; if (cell[i] == "angle") angle = 1 }
            if (covers && angle) { kept = 1; hit = 1 }
        } else if (cell[2] !~ /^:?-+:?$/) hit = 1
        if (hit) print
    }
' "$artifact")
[ -z "$leaks" ] || { printf '%s\n' "$leaks" | sed 's/^/artifact-mentions-held-out: /'; exit 1; }

# Columns are located by header name rather than position, so a template that gains a column
# does not silently shift which cell is read as the red line.
# Only the visible table is read. The held-out table has its own artifact in the scratch
# directory, and its tests are not on the branch, so a table with any other heading here is
# ignored rather than replayed.
rows=$(awk -F'|' '
    /^## / { visible = ($0 ~ /^## Visible tests/) }
    !visible || !/^\|/ { next }
    { for (i = 1; i <= NF; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i) }
    !tcol { for (i = 1; i <= NF; i++) { if ($i == "test") tcol = i; if ($i == "red line") rcol = i }; next }
    $tcol ~ /^-+$/ { next }
    { print $tcol "\t" $rcol }
' "$artifact")
[ -n "$rows" ] || { echo "no rows under '## Visible tests' with 'test' and 'red line' columns in $artifact" >&2; exit 2; }

# A `test` cell is <path>[::<case>]; the one-file command takes only the path, so each file is
# run once however many cases it carries.
paths=$(printf '%s\n' "$rows" | cut -f1 | sed 's/::.*//' | sort -u)

# Check 4. The numbers are identifiers a reviewer's notes and this repository's history cite, so
# a new check takes the next free one rather than renumbering the others; where it runs is a
# separate decision. This one needs the parsed column and nothing else, so it goes as early as it
# can, above the diff and above the scratch worktree, and a rederive finding costs no test run.
#
# A wrong expected value in a visible test becomes the implementer's target: the code is built to
# match the mistake and the suite goes green. The reviewer is the only fresh context in the loop,
# so the re-derivation belongs here rather than in a prompt line. What the script can hold is that
# the step was taken and that the two values agree; that the recorded value came from a context
# which never saw the artifact is not checkable by any file, and reference/reviewer-gate.md says
# so rather than letting this check imply otherwise.
#
# The table is read a second time instead of widening the parse above, so the input to checks 1
# to 3 stays byte for byte what it was: a header this pass mis-reads can only affect this check.
#
# Each record carries its kind in the first field, so a cell this pass refuses cannot reach the
# loop below as data. `#` is the header, `!` a finding line this pass wrote whole, `=` a row
# whose shape is sound. Every field before the last is non-empty by construction, which is what
# keeps `read` with a tab IFS, where a run of tabs is one delimiter, from shifting a row's cells
# along by one and naming the wrong text in a finding.
parsed=$(awk '
    # A carriage return rides into the compared value and into the finding line, and in a header
    # cell it makes the column name match nothing at all.
    { sub(/\r$/, "") }
    /^## / { visible = ($0 ~ /^## Visible tests/) }
    !visible || !/^\|/ { next }
    # `\|` is how markdown writes a literal pipe, and the strategist needs it: a value quoted
    # from a spec can carry one, and refusing the character would change the value being compared
    # on exactly the unusual rows this check is most worth running. It is hidden from the split
    # and put back after it, so such a cell stays one cell and the row keeps the header width.
    {
        line = $0
        gsub(/\\\|/, SUBSEP, line)
        parts = split(line, raw, "|")
        # A leading and a trailing pipe are style, not structure: markdown renders a row without
        # them the same way, so both counts are taken after dropping the empty field each one
        # leaves, and a table written either way is measured against the header above it.
        # Cleared, not overwritten: a narrow row would otherwise read a cell left behind by a
        # wider row and put that text in this finding.
        delete cell
        n = 0
        for (i = (raw[1] == "" ? 2 : 1); i <= (raw[parts] == "" ? parts - 1 : parts); i++) {
            gsub(/^[ \t]+|[ \t]+$/, "", raw[i])
            gsub(SUBSEP, "|", raw[i])
            cell[++n] = raw[i]
        }
    }
    !seen {
        for (i = 1; i <= n; i++) { if (cell[i] == "test") tcol = i; if (cell[i] == "expected from") scol = i; if (cell[i] == "rederive") dcol = i }
        if (!tcol) next
        seen = 1; width = n
        print "#\t" scol "\t" dcol
        next
    }
    # GFM writes an alignment separator as `:--` or `--:`, and reading one as a data row
    # fabricates a finding against valid markdown.
    cell[tcol] ~ /^:?-+:?$/ { next }
    # The header declares the table width, so a row that does not match it is malformed whatever
    # caused it, and saying so costs no reading of any cell. Without this the pipe inside a value
    # truncated both sides of the comparison alike and two different values compared equal, which
    # is a silent pass on the one comparison this check exists to perform.
    n != width { print "!\trederive-row-width: " cell[tcol] " | cells: " n " | header: " width; next }
    # A required cell that is empty has no honest reading, and the row it sits in cannot be
    # judged: an empty `test` names nothing, an empty citation carries no token, an empty mark is
    # no mark. Refused here, so no such value reaches the loop below.
    cell[tcol] == "" { print "!\trederive-cell-empty: | test"; next }
    cell[scol] == "" { print "!\trederive-cell-empty: " cell[tcol] " | expected from"; next }
    cell[dcol] == "" { print "!\trederive-cell-empty: " cell[tcol] " | rederive"; next }
    { print "=\t" cell[scol] "\t" cell[dcol] "\t" cell[tcol] }
' "$artifact")
# `cut` and `awk`, not a sed address, because `\t` in a sed regex is GNU-only and the catalogue's
# skills have to run on the bash and sed a mac ships.
header=$(printf '%s\n' "$parsed" | awk -F'\t' '$1 == "#" { print; exit }')
scol=$(printf '%s\n' "$header" | cut -f2)
dcol=$(printf '%s\n' "$header" | cut -f3)
shape=$(printf '%s\n' "$parsed" | awk -F'\t' '$1 == "!" { print substr($0, 3) }')
marks=$(printf '%s\n' "$parsed" | awk -F'\t' '$1 == "=" { print substr($0, 3) }')

# Mandatory, and a finding rather than a setup error: an artifact that never grew the column
# would otherwise clear a gate that checked nothing, which is the failure mode of a prompt line
# and the reason this check exists. It is reported ahead of the missing-citation refusal below so
# an artifact carrying neither column gets the finding and not the exit 2.
[ -n "$dcol" ] || { echo "rederive-column-missing: $artifact"; exit 1; }
# Without the citation there is nothing to test the mark against, and the check would pass every
# row it read. That is a gate that cannot run, not a strategist finding, so it exits 2.
[ -n "$scol" ] || { echo "visible table has a 'rederive' column but no 'expected from' column in $artifact" >&2; exit 2; }

# One line per `yes` row, `<test> | <value> | <derivation>`, written by the reviewer into the
# held-out directory. The name ends in `.md` so the copy loop below skips it: any other suffix and
# the gate would copy it into the tree, hand it to the one-file command and count it as a
# held-out test. The file is absent on a ticket with no `yes` row, which is not an error.
recorded=''
[ ! -f "$held/rederive.md" ] || recorded=$(cat "$held/rederive.md")
# The first line for a test wins. A second one cannot make a wrong first one right, and the
# reviewer writes the whole file anyway, so there is nothing a duplicate could be protecting.
fresh_for() {
    printf '%s\n' "$recorded" | awk -v t="$1" '
        { sub(/\r$/, "") }
        # The same `\|` the artifact writes, hidden from the field split and put back after it,
        # so a value carrying a pipe is recorded and compared rather than truncated here.
        { line = $0; gsub(/\\\|/, SUBSEP, line) }
        index(line, t " | ") != 1 { next }
        {
            rest = substr(line, length(t) + 4)
            p = index(rest, " | ")
            # R11 asks for the derivation, not only the value. A record that stops after the
            # value, or leaves the third field blank, records a number with no account of
            # where it came from, which is the reviewer being taken at their word again.
            if (p == 0 || substr(rest, p + 3) ~ /^[ \t]*$/) exit
            v = substr(rest, 1, p - 1)
            gsub(SUBSEP, "|", v)
            # The leading 1 distinguishes a recorded empty value from no line at all.
            print "1" v
            exit
        }
    '
}

# One finding per row, the first defect wins: the cell grammar, then the citation's token, then
# the two read together, then the recorded value. A row whose cell cannot be parsed has no mark
# to compare a citation with, and a citation with no token has no reading to compare a mark with,
# so reporting the downstream finding as well would name a defect derived from the first one.
rederive_found=0
# The rows whose shape the parse refused, reported here rather than in the loop, so that a table
# carrying a malformed row and a malformed cell names both and not whichever class came first.
[ -z "$shape" ] || { printf '%s\n' "$shape"; rederive_found=1; }
while IFS=$'\t' read -r src mark test; do
    [ -n "$src" ] || continue
    case $mark in
        no) marked=no ;;
        "yes: "?*) marked=yes; value=${mark#yes: } ;;
        *) echo "rederive-cell-malformed: $test | $mark"; rederive_found=1; continue ;;
    esac
    # No parser can tell a quoted value from a computed one in free prose, so the citation opens
    # with one of two tokens and a cell opening with neither is itself a finding. Without that
    # clause, writing `no` beside an untokened citation is a way out of the rule that nothing
    # reports, which is the loophole the mandatory column exists to close.
    case $src in
        "quoted "?*) source=quoted ;;
        "worked "?*) source=worked ;;
        *) echo "rederive-source-malformed: $test | $src"; rederive_found=1; continue ;;
    esac
    if [ "$source" = worked ] && [ "$marked" = no ]; then
        echo "rederive-not-marked: $test"
        rederive_found=1
        continue
    fi
    [ "$marked" = yes ] || continue
    hit=$(fresh_for "$test")
    if [ -z "$hit" ]; then
        echo "rederive-missing-fresh: $test"
        rederive_found=1
    elif [ "${hit#1}" != "$value" ]; then
        # Byte for byte: a comparison that trimmed or took a prefix would read 4.00 and 4.0025 as
        # agreeing, which is the arithmetic slip this check exists to catch.
        echo "rederive-mismatch: $test | artifact: $value | fresh: ${hit#1}"
        rederive_found=1
    fi
done <<EOF
$marks
EOF
[ $rederive_found -eq 0 ] || exit 1

# Check 1. The implementer is forbidden to touch what the strategist wrote; a host-level deny
# exists on one CLI only, so the diff is the guard that holds everywhere.
# The diff is taken once and handed to grep without a pipe: under pipefail, grep -q closing at
# the first match kills the writer with SIGPIPE, and the pipeline then reports no match at all.
# A pipe from printf has the same failure once the diff outgrows the pipe buffer.
changed=$(git diff --name-only "$visible" "$head")
found=0
for f in $paths "$artifact"; do
    if grep -qxF -- "$f" <<<"$changed"; then
        echo "strategist-file-in-diff: $f"
        found=1
    fi
done
[ $found -eq 0 ] || exit 1

# A wrapper that cannot run would surface as a red-line mismatch or a held-out failure and be
# read as a finding against the implementer, so it is refused here, before any test runs.
set -- $cmd
command -v "$1" >/dev/null 2>&1 || { echo "one-file test command is not runnable: $1" >&2; exit 2; }

scratch=$(mktemp -d)
wt=$scratch/visible
copied=()
made_dirs=()

# One trap for every exit path: a held-out file left in the tree would be committed by the next
# `git add -A`, and a scratch worktree left behind blocks the next `worktree add` of that commit.
cleanup() {
    local f d
    # A copy is named by the strategist, so the terminator is what keeps a name that starts with
    # a dash from being read as options and left behind in the reviewer's tree.
    for f in ${copied[@]+"${copied[@]}"}; do rm -f -- "$f"; done
    # Removal is order-dependent and the recorded order is not the order that works: two
    # held-out files under sibling new directories record a/b, a, a/c, and a is attempted while
    # a/c is still there. Passes repeat until one removes nothing, so a parent gets its turn
    # again after its last child goes. git reports nothing for an empty directory, which is why
    # the leftover was invisible to every clean-tree assertion.
    local again=1
    while [ $again -eq 1 ]; do
        again=0
        for d in ${made_dirs[@]+"${made_dirs[@]}"}; do
            [ -d "$d" ] || continue
            rmdir -- "$d" 2>/dev/null && again=1
        done
    done
    [ -d "$wt" ] && git worktree remove --force "$wt" >/dev/null 2>&1
    rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Check 2. The red line is only meaningful on the commit the strategist recorded it on: a test
# run where it stands at head is green, or red for a reason the implementer introduced. The
# replay therefore happens in a detached worktree at the visible sha, from that worktree's root,
# so the relative paths in the artifact resolve there and not in the caller's tree.
git worktree add --detach --quiet "$wt" "$visible" || { echo "could not check out $visible in a scratch worktree" >&2; exit 2; }

# The command is split on whitespace so a contract value such as `./run.sh test-one` works;
# a wrapper whose path contains spaces must be wrapped in a script. The first output line is
# compared, which is what the strategist copied into the artifact.
# The result goes into a global rather than a substitution, because a refusal from inside
# $(...) would end the subshell and leave the gate running.
first_line() {
    local out
    out=$(cd "$1" && $cmd "$2" 2>&1)
    # 127 is the shell's own "not found", which the check above cannot see when the wrapper
    # execs something that is missing on this machine.
    [ $? -ne 127 ] || { echo "one-file test command could not run $2 (exit 127): $out" >&2; exit 2; }
    line=${out%%$'\n'*}
}

mismatch=0
visible_n=0
observed_for() { printf '%s\n' "$observed" | awk -F'\t' -v p="$1" '$1 == p { print substr($0, length(p) + 2); exit }'; }
observed=''
for p in $paths; do
    first_line "$wt" "$p"
    observed="$observed$p	$line"$'\n'
done
while IFS=$'\t' read -r test red; do
    [ -n "$test" ] || continue
    visible_n=$((visible_n + 1))
    p=${test%%::*}
    seen=$(observed_for "$p")
    if [ "$seen" != "$red" ]; then
        echo "red-line-mismatch: $test | artifact: $red | observed: $seen"
        mismatch=1
    fi
done <<EOF
$rows
EOF
[ $mismatch -eq 0 ] || exit 1

# Check 3. Held-out tests run against the tree the reviewer has, because that tree carries the
# installed dependencies a fresh worktree would lack. That is only the right tree when it is at
# the ticket head, so anything else is refused rather than silently judged.
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$head^{commit}")" ] || {
    echo "working tree is not at $head; check out the ticket head before running the gate" >&2
    exit 2
}
# Being at the head commit is not the same as running the head commit. An uncommitted edit to a
# tracked file is what the held-out tests would actually run, and the gate would then print the
# head sha over a result that commit does not produce. Untracked files are left alone: the
# installed dependencies this tree exists for arrive as untracked paths, and the held-out copies
# below are untracked by construction.
git diff --quiet HEAD -- || {
    echo "tracked files are modified; commit or stash them before running the gate" >&2
    exit 2
}

# The held-out directory mirrors the repository layout, so a test lands where the runner's
# conventions (fixtures, config discovery) find it. Markdown is the strategist's held-out table,
# not a test, and the match is case-insensitive because a name is prose either way. An existing
# path is never overwritten: cleanup removes copies, and removing a tracked file would leave the
# tree dirty.
# A `find` that cannot read part of the tree still prints what it reached and exits non-zero.
# Taking the list without its status is how a partial enumeration becomes a `gate: ok` carrying
# a held-out count for tests nobody ran. `pipefail` is set, so the substitution carries it.
held_files=$(find "$held" \( -type f -o -type l \) ! -iname '*.md' | sort) || {
    echo "could not list the held-out directory $held" >&2
    exit 2
}

# A symlinked source is refused before anything is copied, rather than followed or skipped. It is
# a strategist mistake with no safe reading: the target may sit outside the held-out set or be
# absent, and a gate that reports a count for a file it never ran is the failure this check
# exists to remove.
while IFS= read -r src; do
    [ -n "$src" ] || continue
    [ ! -L "$src" ] || {
        echo "held-out source ${src#"$held"/} is a symlink; put the file itself in the held-out directory" >&2
        exit 2
    }
done <<EOF
$held_files
EOF

held_n=0
failed=0
while IFS= read -r src; do
    # A here-document of an empty command still yields one empty line, and a held-out directory
    # with no test, `strategy.md` alone included, is a legitimate state for a ticket.
    [ -n "$src" ] || continue
    rel=${src#"$held"/}
    # A symlinked parent sends the copy outside the repository, and `git status` reports nothing
    # for a write through one, so the clean-tree assertions downstream cannot see the escape.
    a=$(dirname -- "$rel")
    while [ "$a" != . ] && [ "$a" != / ]; do
        [ ! -L "$a" ] || {
            echo "held-out file $rel has a symlinked parent $a; refusing to copy through it" >&2
            exit 2
        }
        a=$(dirname -- "$a")
    done
    # `-e` is false for a dangling symlink, so `-L` is what keeps one already sitting at the
    # destination out of the copy list the cleanup below deletes.
    { [ ! -e "$rel" ] && [ ! -L "$rel" ]; } || {
        echo "held-out file $rel already exists in the tree; refusing to overwrite it" >&2
        exit 2
    }
    d=$(dirname -- "$rel")
    while [ "$d" != . ] && [ ! -d "$d" ]; do made_dirs+=("$d"); d=$(dirname -- "$d"); done
    mkdir -p -- "$(dirname -- "$rel")"
    # Listed before the copy runs, because a cp that dies part way through leaves a partial
    # destination that only the cleanup list can remove; the guard above already proved the
    # path was free.
    copied+=("$rel")
    cp -- "$src" "$rel" || { echo "could not copy held-out file $rel into the tree" >&2; exit 2; }
    held_n=$((held_n + 1))
    $cmd "$rel" >/dev/null 2>&1
    rc=$?
    [ $rc -ne 127 ] || { echo "one-file test command could not run $rel (exit 127)" >&2; exit 2; }
    if [ $rc -ne 0 ]; then
        echo "held-out-failed: $rel"
        failed=1
    fi
done <<EOF
$held_files
EOF
[ $failed -eq 0 ] || exit 1

echo "gate: ok | visible=$visible_n | held-out=$held_n | sha=$visible"
