#!/usr/bin/env bash
# Behavioural cases for gate.sh, written from the spec before gate.sh existed. Each case builds
# a throwaway git repository under mktemp, so the only things gate.sh can be judged on are the
# things a caller sees: its exit code, its stdout lines, and the state it leaves the repository
# in. Nothing here reaches into gate.sh; a case that passes proves the contract, not the code.
#
#   bash test_gate.sh          run every case
#   bash test_gate.sh <case>   run one case; an unknown name is a failure, never an ok
#   bash test_gate.sh <path>   an argument naming an existing file runs every case, because
#                              gate.sh replays a visible test by handing this file its own path
#
# The summary line is printed FIRST, before the per-case lines. gate.sh compares only the first
# line the one-file command prints, and a harness that holds many cases has no single per-case
# line that differs between a red run and a green one; the summary does.
#
# The one-file test command handed to gate.sh is a fake runner that appends the sha of the tree
# it was invoked in, and the file it was given, to a log. That log is how a case can tell
# whether the visible test was replayed at the visible sha or merely run where it stood.
#
# Requires: git, bash 3.2 or later. No network.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
gate=$here/gate.sh
# The seam does not exist yet on the pre-implementation commit, so the first line of output is
# the equivalent of an import error; the reviewer expects the assertion-level reds only once
# gate.sh is present.
[ -f "$gate" ] || { echo "import: skills/test-strategy/scripts/gate.sh: No such file or directory"; exit 1; }

# Fixed identity and no signing, so a commit never depends on the developer's global config.
g() { git -c user.name=fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false "$@"; }

failures=0
# Per-case lines are held here so the tail can print the summary before them. Nothing else in
# this file writes to stdout, so the first line a caller sees is always the summary.
buffer=$(mktemp)
say() { printf '%s\n' "$1" >> "$buffer"; }
fail() { say "FAIL $case: $1"; failures=$((failures + 1)); }

# Fixture layout, all under one mktemp directory that is removed when the case ends:
#   repo/tests/test_a.sh        the visible test; prints $1 and exits 1 (the red the strategist recorded)
#   repo/docs/strategy-tests.md the artifact; its red-line cell is $2
#   runner.sh                   the one-file test command; logs "<sha> <file>" then runs the file
#   held-out/                   the held-out directory handed to gate.sh, outside the repository
# Sets: tmp repo visible runner log held artifact
make_fixture() {
    tmp=$(mktemp -d)
    repo=$tmp/repo
    runner=$tmp/runner.sh
    log=$tmp/runner.log
    held=$tmp/held-out
    artifact=docs/strategy-tests.md
    mkdir -p "$repo/tests" "$repo/docs" "$held"

    # The sha is taken from the directory the file lives in, not the cwd, so the log is honest
    # whichever tree gate.sh runs the command from.
    cat > "$runner" <<EOF
#!/usr/bin/env bash
printf '%s %s\n' "\$(git -C "\$(dirname "\$1")" rev-parse HEAD)" "\$(basename "\$1")" >> "$log"
exec bash "\$1"
EOF
    chmod +x "$runner"

    printf '#!/usr/bin/env bash\necho "%s"\nexit 1\n' "$1" > "$repo/tests/test_a.sh"

    # Same shape as reference/strategy-template.md: the `test` cell is <path>::<case>, so the
    # path before :: is a file the strategist authored, and the artifact itself is another.
    cat > "$repo/$artifact" <<EOF
# Test strategy: fixture

## Visible tests, in work order
| # | test | seam | R | excludes this wrong implementation | expected from | rederive | red line |
|---|---|---|---|---|---|---|---|
| 1 | tests/test_a.sh::one | bash tests/test_a.sh | R1 | the fixture | quoted spec C3 | no | $2 |
EOF

    (cd "$repo" && g init -q && g add -A && g commit -qm "visible tests") || fail "fixture: visible commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
}

# The implementer's commit. Extra arguments are paths (relative to the repo) to touch as well,
# so a case can put a strategist file in the diff.
commit_head() {
    local f
    echo 'echo implemented' > "$repo/src_impl.sh"
    for f in "$@"; do echo "# touched by implementer" >> "$repo/$f"; done
    (cd "$repo" && g add -A && g commit -qm "implement") || fail "fixture: head commit"
    head=$(cd "$repo" && git rev-parse HEAD)
}

# A held-out test file: `pass` exits 0, anything else is printed as its failure line.
held_out_test() {
    if [ "$2" = pass ]; then
        printf '#!/usr/bin/env bash\nexit 0\n' > "$held/$1"
    else
        printf '#!/usr/bin/env bash\necho "%s"\nexit 1\n' "$2" > "$held/$1"
    fi
}

# Runs gate.sh from the repository root, the way the reviewer does. Only stdout is the contract;
# stderr goes to a file that is shown when a case fails, so a wrong gate.sh is still debuggable.
run_gate() {
    out=$(cd "$repo" && bash "$gate" "$visible" "$head" "$artifact" "$held" "$runner" 2> "$tmp/stderr")
    rc=$?
}

# One line per assertion, and the first one printed is the red line the artifact records, so
# each is a single claim with the observed value beside the expected one.
expect_rc() { [ "$rc" = "$1" ] || fail "expected exit $1, got $rc; stdout: $(printf '%s' "$out" | head -n 1); stderr: $(head -n 1 "$tmp/stderr")"; }
expect_line() { printf '%s\n' "$out" | grep -qE "$1" || fail "no stdout line matching '$1'; stdout: $(printf '%s' "$out" | head -n 1)"; }
expect_clean_tree() {
    local status
    status=$(cd "$repo" && git status --porcelain)
    [ -z "$status" ] || fail "working tree not clean after the run: $(printf '%s' "$status" | head -n 1)"
}
# Whole-stdout equality. It is one claim where a grep would be several: that the expected finding
# printed, that it printed for every offending row and no other, and that no later check ran.
expect_stdout() {
    [ "$out" = "$1" ] || fail "stdout is not the expected finding and nothing else; expected: $(printf '%s' "$1" | tr '\n' ';'); stdout: $(printf '%s' "$out" | tr '\n' ';')"
}
# A check that reports before the scratch worktree costs nothing to run, and the runner log is
# the only witness of that: no log file means no test was executed by the time the gate exited.
expect_nothing_ran() {
    [ ! -e "$log" ] || fail "a test ran before the artifact check reported; runner log: $(tr '\n' ';' < "$log")"
}

# The visible artifact, rewritten with the rows a rederive case needs and folded into the visible
# commit. The artifact is a strategist file, so a rewrite left standing in the implementer's diff
# would fire check 1 and nothing after it would run. Arguments come in fours:
#   <case name> <expected from cell> <rederive cell> <red line cell>
# Every row names the same test file, which is what the fixture provides, so the rows differ in
# their `::case` part alone and one observed line serves them all.
rederive_artifact() {
    local msg=$1; shift
    {
        printf '# Test strategy: fixture\n\n## Visible tests, in work order\n'
        printf '| # | test | seam | R | excludes this wrong implementation | expected from | rederive | red line |\n'
        printf '|---|---|---|---|---|---|---|---|\n'
        local i=1
        while [ $# -ge 4 ]; do
            printf '| %s | tests/test_a.sh::%s | bash tests/test_a.sh | R1 | the fixture | %s | %s | %s |\n' \
                "$i" "$1" "$2" "$3" "$4"
            i=$((i + 1)); shift 4
        done
    } > "$repo/$artifact"
    (cd "$repo" && g add -A && g commit -qm "$msg") || fail "fixture: artifact commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
}

# The reviewer's re-derivation, written where the gate reads it: one line per row the artifact
# marks `yes`, `<test> | <value> | <derivation>`. The name ends in `.md` and that is load-bearing.
# The gate copies and runs every file in the held-out directory whose name is not markdown, so a
# `rederive.txt` would be copied into the tree, run as a held-out test and counted in
# `held-out=<n>`.
fresh_value() { printf '%s\n' "$1" >> "$held/rederive.md"; }

# C2 / R2. Excludes: a gate that only compares the artifact's red lines and never looks at the
# diff, and one that diffs against the wrong base (head..head is always empty).
case_diff() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head tests/test_a.sh
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_line '^strategist-file-in-diff: tests/test_a\.sh$'
}

# C3 / R3. Excludes: a gate that checks the test is red without reading the line, and one that
# compares against the artifact cell after trimming it to a prefix.
case_red_line() {
    make_fixture "AssertionError: 1 == 3" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_line '^red-line-mismatch: tests/test_a\.sh::one \| artifact: AssertionError: 1 == 2 \| observed: AssertionError: 1 == 3$'
}

# C4 / R4. Excludes: a gate that runs held-out tests but ignores their exit code, and one whose
# cleanup runs only on the success path so the failing copy is left inside the repository.
case_held_out() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_fail.sh "AssertionError: held-out saw 0 == 1"
    run_gate
    expect_rc 1
    expect_line '^held-out-failed: .*h_fail\.sh'
    expect_clean_tree
}

# C5 / R5. Excludes: a gate that prints ok without counting (visible=0), one that reports the
# head sha instead of the visible sha, and one that skips the replay and runs the visible test
# where it stands at head (the log would then carry the head sha for tests/test_a.sh).
case_ok() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 0
    expect_line "^gate: ok \| visible=1 \| held-out=1 \| sha=$visible$"
    grep -q "^$visible test_a.sh$" "$log" || fail "visible test was not run at the visible sha; runner log: $(cat "$log" 2>/dev/null | tr '\n' ';')"
    grep -q "^$head h_pass.sh$" "$log" || fail "held-out test was not run at head; runner log: $(cat "$log" 2>/dev/null | tr '\n' ';')"
    expect_clean_tree
}

# D1 / R4. A dangling symlink already sitting at a held-out destination path. `-e` is false for a
# dangling symlink, so an existence guard written with `-e` alone lets the copy through; `cp` then
# refuses, and a cleanup that removes every path it planned to copy deletes the reviewer's own
# file. Excludes: a guard that tests `-e` without `-L`, and a gate that records a destination as
# copied before the copy succeeded. The exit code does not discriminate here, today's gate already
# exits 2 on this input; the surviving victim is the whole claim.
case_held_out_victim_symlink() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    ln -s no-such-target "$repo/victim.link"
    (cd "$repo" && g add -A && g commit -qm "a file the reviewer already had at that path") \
        || fail "fixture: victim commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
    commit_head
    held_out_test victim.link pass
    run_gate
    expect_rc 2
    [ -L "$repo/victim.link" ] || fail "the gate deleted the pre-existing symlink at victim.link"
    expect_clean_tree
}

# D5 / R4. A held-out directory whose only entry is `strategy.md`, which the held-out convention
# makes a legitimate state: a ticket the strategist judged needs no held-out test still has an
# artifact. Excludes: a gate that feeds an empty `find` into a loop, copies an empty path and
# reports "could not run" for a directory that has nothing to run.
case_held_out_no_runnable_test() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    printf '# Held-out tests: none for this ticket\n' > "$held/strategy.md"
    run_gate
    expect_rc 0
    expect_line "^gate: ok \| visible=1 \| held-out=0 \| sha=$visible$"
    expect_clean_tree
}

# D3 / R4. `NOTES.MD`. Excludes: a gate that excludes markdown with a case-sensitive pattern, so an
# uppercase name is copied into the tree, run, and counted as a held-out test. The file is prose
# whose lines happen to be shell comments, so a gate that runs it sees exit 0 and prints ok; only
# the count and the runner log tell the two behaviours apart.
case_held_out_uppercase_md() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    printf '# Notes for the reviewer, not a test\n' > "$held/NOTES.MD"
    run_gate
    expect_rc 0
    expect_line "^gate: ok \| visible=1 \| held-out=1 \| sha=$visible$"
    ! grep -q ' NOTES\.MD$' "$log" || fail "the gate ran NOTES.MD as a held-out test"
    expect_clean_tree
}

# D4 / R4. A symlink inside the held-out directory, beside a real test so the directory is not
# empty; an entry-less directory is D5's path, not this one. The behaviour specified here is
# refuse and name it, not follow it: a linked source is a strategist mistake, and a gate that
# reports a count it did not run is the failure this ticket exists to remove. Excludes:
# `find -type f` skipping the link and printing `ok` for a suite that ran one file of two.
case_held_out_symlink_source() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/linked_test.sh"
    ln -s "$tmp/linked_test.sh" "$held/h_linked.sh"
    run_gate
    expect_rc 2
    grep -q 'h_linked\.sh' "$tmp/stderr" \
        || fail "the gate did not name the symlinked held-out source; stderr: $(head -n 1 "$tmp/stderr")"
    expect_clean_tree
}

# T07 / R6. The leak check, positive. What is copied is the shape of the artifact kept back, a
# table with a `covers` and an `angle` column, which no visible artifact carries. A strategist
# file sits in the diff as well, so this case also fixes the order: the scan runs before check 1
# and nothing else has run when it fires. Excludes: a scan placed after check 1, which would
# print the diff finding instead; one that prints a fixed message rather than the offending line;
# one that stops at the first hit and never names the row under the header.
case_artifact_copies_reviewer_table() {
    local leak_header leak_row
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    leak_header='| # | test | covers | angle |'
    leak_row='| H1 | tests/test_a_held.sh::compose | R1+R2 | composition the visible set never exercises |'
    printf '\n## Kept back\n%s\n|---|---|---|---|\n%s\n' "$leak_header" "$leak_row" >> "$repo/$artifact"
    (cd "$repo" && g add -A && g commit -qm "artifact carrying the copied table") \
        || fail "fixture: artifact commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
    commit_head tests/test_a.sh
    run_gate
    expect_rc 1
    # Whole-stdout equality rather than a grep: it is one claim, and it says at once that both
    # rows are named, in file order, verbatim, and that the diff finding never printed. The
    # separator row is not a row, the same reading gate.sh's own table parser takes.
    [ "$out" = "$(printf 'artifact-mentions-held-out: %s\nartifact-mentions-held-out: %s' "$leak_header" "$leak_row")" ] \
        || fail "stdout is not the two offending lines and nothing else; stdout: $(printf '%s' "$out" | tr '\n' ';')"
    [ ! -e "$log" ] || fail "a test ran before the scan reported the leak; runner log: $(tr '\n' ';' < "$log")"
    expect_clean_tree
}

# T07 / R6. The same copied table, inside an artifact whose title, `test` cell, `excludes` cell
# and `red line` cell all carry the phrase the way the merged T08 artifact does, and whose
# preamble carries the template's placeholder path. Only the copied table is a leak. The red-line
# cell is the one that decides the rule: it is the runner's own output, and check 2 compares it
# byte for byte, so a scan that fired on it would put the two checks in contradiction on any
# ticket whose runner prints that text, and the strategist could not record a truthful red line
# at all. Excludes: any scan that matches the phrase, whole-file, after the preamble, or cell by
# cell; each of those prints the title or a visible row here.
case_artifact_visible_table_is_not_a_leak() {
    local leak_header leak_row
    make_fixture "held-out-failed: h_fail.sh" "held-out-failed: h_fail.sh"
    leak_header='| # | test | covers | angle |'
    leak_row='| H1 | tests/test_a_held.sh::compose | R1+R2 | composition the visible set never exercises |'
    cat > "$repo/$artifact" <<EOF
# Test strategy: fixture, the gate keeps its held-out promises

The table kept back lives at <scratch dir>/<ticket>/held-out/strategy.md, a path this file never
carries.

## Visible tests, in work order
| # | test | seam | R | excludes this wrong implementation | expected from | rederive | red line |
|---|---|---|---|---|---|---|---|
| 1 | tests/test_a.sh::held_out_one | bash tests/test_a.sh | R1 | a gate that counts NOTES.MD as a held-out test | quoted spec C3 | no | held-out-failed: h_fail.sh |

## Kept back
$leak_header
|---|---|---|---|
$leak_row
EOF
    (cd "$repo" && g add -A && g commit -qm "artifact that talks about the mechanism") \
        || fail "fixture: artifact commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
    commit_head
    run_gate
    expect_rc 1
    [ "$out" = "$(printf 'artifact-mentions-held-out: %s\nartifact-mentions-held-out: %s' "$leak_header" "$leak_row")" ] \
        || fail "stdout is not the two offending lines and nothing else; stdout: $(printf '%s' "$out" | tr '\n' ';')"
    expect_clean_tree
}

# T07 / R6. The location leak, in an artifact with no visible table at all. The scan runs before
# the table is parsed, so a leak is reported as a finding rather than as the exit-2 "no rows"
# setup error, and the directory handed to the gate is named `hidden`, so nothing but the path
# itself can match. Excludes: a scan that runs after the row parse; one scoped to tables, which
# has nothing to look at here; one that matches a phrase and not the directory it was handed.
case_artifact_names_the_scratch_directory_without_a_table() {
    local leak
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    held=$tmp/hidden
    mkdir -p "$held"
    leak="The tests kept back are in $held."
    printf '# Test strategy: fixture\n\n%s\n' "$leak" > "$repo/$artifact"
    (cd "$repo" && g add -A && g commit -qm "artifact with no visible table") \
        || fail "fixture: artifact commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
    commit_head
    run_gate
    expect_rc 1
    [ "$out" = "artifact-mentions-held-out: $leak" ] \
        || fail "stdout is not the offending prose line and nothing else; stdout: $(printf '%s' "$out" | tr '\n' ';')"
    expect_clean_tree
}

# T04 / R10. The column is mandatory, so an artifact without it is a finding rather than a
# silently skipped check. Excludes: a gate that validates the cells it happens to find and passes
# an artifact that never grew the column, which is R10 enforced nowhere; and one that reports the
# absence on stderr with exit 2, where it reads as "the gate could not run" and disappears from
# the evidence the reviewer pastes.
case_rederive_column_missing() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    {
        printf '# Test strategy: fixture\n\n## Visible tests, in work order\n'
        printf '| # | test | seam | R | excludes this wrong implementation | expected from | red line |\n'
        printf '|---|---|---|---|---|---|---|\n'
        printf '| 1 | tests/test_a.sh::one | bash tests/test_a.sh | R1 | the fixture | quoted spec C3 | AssertionError: 1 == 2 |\n'
    } > "$repo/$artifact"
    (cd "$repo" && g add -A && g commit -qm "artifact whose visible table predates the column") \
        || fail "fixture: artifact commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "rederive-column-missing: $artifact"
    expect_nothing_ran
    expect_clean_tree
}

# T04 / R10. Excludes: a gate that reads the cell for truthiness or case-insensitively, so `Yes`,
# `y` and `maybe` all pass as a mark; and one that skips a row whose cell it cannot parse, which
# turns a malformed cell into the quietest way to opt out of the check.
case_rederive_cell_malformed() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    rederive_artifact "artifact whose rederive cell is neither yes nor no" \
        one "quoted spec C3" "Yes" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "rederive-cell-malformed: tests/test_a.sh::one | Yes"
    expect_nothing_ran
    expect_clean_tree
}

# T04 / R10. The teeth of R10. Excludes: a gate that validates the column in isolation, under
# which a strategist clears it by writing `no` on every row however the value was arrived at, and
# the requirement has no effect on any artifact. The `expected from` cell here says the value was
# worked out, which is the only thing a script can read; the two-token vocabulary exists so that
# it can.
case_rederive_marked_no_on_a_worked_row() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    rederive_artifact "artifact whose worked value is marked no" \
        one "worked 4.00 = 8.00 * (1 - 0.50)" "no" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "rederive-not-marked: tests/test_a.sh::one"
    expect_nothing_ran
    expect_clean_tree
}

# T04 / R10. The other direction of the same rule, and the one that decides whether it has any
# force. `worked` with `no` is a finding, but a cell carrying neither token would be a finding
# under no clause at all, and marking `no` beside a cell that says neither would then be the
# quiet way out of R10, which is the loophole the mandatory column exists to close. Excludes: a
# check that reads only the `worked ` prefix and treats every other cell as quoted.
case_rederive_source_without_a_token() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    rederive_artifact "artifact whose expected-from cell carries neither token" \
        one "computed 4.00 = 8.00 * (1 - 0.50)" "no" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "rederive-source-malformed: tests/test_a.sh::one | computed 4.00 = 8.00 * (1 - 0.50)"
    expect_nothing_ran
    expect_clean_tree
}

# T04 / R11. Excludes: a gate that takes the reviewer's word that the re-derivation happened and
# prints ok with nothing recorded, which is the prompt-line failure this ticket exists to remove;
# and one that reads the file when it is there and skips the check when it is not, so the check
# disappears in exactly the run that is evading it.
case_rederive_yes_without_fresh_value() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    rederive_artifact "artifact with a worked value and no re-derivation recorded" \
        one "worked 4.00 = 8.00 * (1 - 0.50)" "yes: 4.00" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "rederive-missing-fresh: tests/test_a.sh::one"
    expect_nothing_ran
    expect_clean_tree
}

# T04 / R11. The comparison itself. Excludes: a gate that checks only that a line exists for the
# row; one that compares a prefix or a trimmed value, under which 4.00 and 4.0025 agree; and one
# that reads a verdict word out of the file instead of computing it, which is why the recorded
# line carries the value and the derivation and no verdict for the gate to believe.
case_rederive_fresh_mismatch() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    rederive_artifact "artifact whose worked value the reviewer did not reproduce" \
        one "worked 4.00 = 8.00 * (1 - 0.50)" "yes: 4.00" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    fresh_value "tests/test_a.sh::one | 4.50 | 8.00 - (8.00 * 0.50) rounded up at the cent"
    run_gate
    expect_rc 1
    expect_stdout "rederive-mismatch: tests/test_a.sh::one | artifact: 4.00 | fresh: 4.50"
    expect_nothing_ran
    expect_clean_tree
}

# T04 / R10+R11. The matching row must produce nothing, and asserting that directly would be a
# claim already true of today's gate, which reads no rederive cell at all. So it is asserted
# beside a row that must produce a finding: stdout carrying the malformed row and only it says
# both that every offending row is named and that a row whose fresh value agrees is not one.
# Excludes: a gate that reports the first offending row and stops, which cannot be told from a
# correct one by a single-row case; and one that reports a finding for every `yes` row it checked.
case_rederive_match_produces_no_finding() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    rederive_artifact "artifact with one reproduced value and one malformed cell" \
        one "worked 4.00 = 8.00 * (1 - 0.50)" "yes: 4.00" "AssertionError: 1 == 2" \
        two "quoted spec C3" "Yes" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    fresh_value "tests/test_a.sh::one | 4.00 | half of 8.00 is 4.00, spec R1 worked example"
    run_gate
    expect_rc 1
    expect_stdout "rederive-cell-malformed: tests/test_a.sh::two | Yes"
    expect_nothing_ran
    expect_clean_tree
}

# T04 / R10. Placement, decided by the conductor 2026-09-09: after the table parse, because the
# check needs the parsed column, and before the diff check, because it needs nothing else. Three
# defects are present at once, a strategist file in the diff, a red line the runner contradicts,
# and a malformed cell, so each candidate placement prints a different stdout. Excludes: a check
# placed after check 1, which prints the diff finding; one placed after the replay, which prints
# the red-line mismatch and has paid for a scratch worktree and a test run to do it.
case_rederive_reports_before_the_replay() {
    make_fixture "AssertionError: 1 == 3" "AssertionError: 1 == 2"
    rederive_artifact "artifact with a malformed cell and a red line the runner contradicts" \
        one "quoted spec C3" "Yes" "AssertionError: 1 == 2"
    commit_head tests/test_a.sh
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "rederive-cell-malformed: tests/test_a.sh::one | Yes"
    expect_nothing_ran
    expect_clean_tree
}

# T04 / R6+R10. T07's ordering property, defended against this ticket's own check. The leak scan
# runs before the table is parsed and this check runs after it, so a leak must still win. One run
# cannot show that: with both defects present today's gate prints the leak lines already, and a
# case that only asserted that would be green before the change and prove nothing about it. So the
# case runs twice on the same repository: once with the malformed cell alone, which today's gate
# has no answer for, and then again with the copied table added on top of it, which must hide the
# finding the first run proved is there. Excludes: a rederive check placed above the leak scan,
# which silences a leak the reviewer must see; and one placed above the table parse altogether,
# which would have to guess at the column.
case_leak_scan_still_reports_first() {
    local leak_header leak_row
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    leak_header='| # | test | covers | angle |'
    leak_row='| H1 | tests/test_a_held.sh::compose | R1+R2 | composition the visible set never exercises |'
    rederive_artifact "artifact whose only defect is the malformed cell" \
        one "quoted spec C3" "Yes" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "rederive-cell-malformed: tests/test_a.sh::one | Yes"
    expect_nothing_ran
    expect_clean_tree
    # The same repository with the copied table added and nothing else changed, so the finding
    # the first run just proved is present is the one the leak has to shadow. The commit keeps the
    # tree clean; it lands after the head commit, which the leak scan never looks past.
    printf '\n## Kept back\n%s\n|---|---|---|---|\n%s\n' "$leak_header" "$leak_row" >> "$repo/$artifact"
    (cd "$repo" && g add -A && g commit -qm "the copied table appended to it") || fail "fixture: leak commit"
    run_gate
    expect_rc 1
    expect_stdout "$(printf 'artifact-mentions-held-out: %s\nartifact-mentions-held-out: %s' "$leak_header" "$leak_row")"
    expect_nothing_ran
    expect_clean_tree
}

# Review of #49 / R6. Excludes: a gate that reads "the tree is at the head commit" as "the tree
# is the head commit". An uncommitted edit to a tracked file is what the held-out tests would
# actually run, and the gate would then print the head sha over a result that commit does not
# produce.
case_held_out_dirty_tracked_file() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    echo 'echo edited after the commit' >> "$repo/src_impl.sh"
    run_gate
    expect_rc 2
    [ ! -e "$repo/h_pass.sh" ] || fail "a held-out file was copied into a tree the gate refused"
    ! grep -q ' h_pass.sh$' "$log" 2>/dev/null || fail "a held-out test ran against uncommitted changes"
}

# Review of #49 / R6. The near miss for the case above: the reviewer's tree is the right tree
# precisely because it carries the installed dependencies, and those arrive untracked. Excludes:
# a cleanliness check written as `git status --porcelain`, which refuses every real review tree.
case_held_out_untracked_file_is_not_dirty() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    echo 'a dependency the reviewer installed' > "$repo/untracked.txt"
    run_gate
    expect_rc 0
    expect_line "^gate: ok \| visible=1 \| held-out=1 \| sha=$visible$"
    rm -f "$repo/untracked.txt"
    expect_clean_tree
}

# Review of #49 / R4. Excludes: a gate that takes the held-out list without its status. A
# `find` that cannot read part of the tree prints what it reached and exits non-zero, and the
# partial list then becomes a `gate: ok` carrying a count for tests nobody ran. The case cannot
# be built as root, which ignores the permission it depends on, so it fails there rather than
# reporting a pass it did not earn.
case_held_out_enumeration_failure() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    [ "$(id -u)" != 0 ] || { fail "this case needs a user that an unreadable directory stops; it was run as root"; return; }
    mkdir -p "$held/deeper" && printf '#!/usr/bin/env bash\nexit 0\n' > "$held/deeper/h_two.sh"
    chmod 000 "$held/deeper"
    run_gate
    chmod 755 "$held/deeper"
    expect_rc 2
    [ -z "$out" ] || fail "a setup error was printed on stdout, where it reads as a finding: $(printf '%s' "$out" | head -n 1)"
    expect_clean_tree
}

# Review of #49 / R11. A record that stops after the value. Excludes: a reader that takes the
# whole remainder as the value whenever no second separator is there, which accepts a number
# with no account of where it came from and reports the row as re-derived.
case_rederive_record_without_a_derivation() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    rederive_artifact "artifact with a worked value the record does not account for" \
        one "worked 4.00 = 8.00 * (1 - 0.50)" "yes: 4.00" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    fresh_value "tests/test_a.sh::one | 4.00"
    run_gate
    expect_rc 1
    expect_stdout "rederive-missing-fresh: tests/test_a.sh::one"
    expect_nothing_ran
    expect_clean_tree
}

# Review of #49 / R11. The near miss for the case above: the separator is there and the field
# behind it is blank. Excludes: a reader that only counts separators, under which a trailing
# ` | ` buys the row a pass.
case_rederive_record_with_an_empty_derivation() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    rederive_artifact "artifact with a worked value and a blank derivation recorded" \
        one "worked 4.00 = 8.00 * (1 - 0.50)" "yes: 4.00" "AssertionError: 1 == 2"
    commit_head
    held_out_test h_pass.sh pass
    fresh_value "tests/test_a.sh::one | 4.00 | "
    run_gate
    expect_rc 1
    expect_stdout "rederive-missing-fresh: tests/test_a.sh::one"
    expect_nothing_ran
    expect_clean_tree
}

# Review of #49 / R4. Two held-out files under sibling directories the gate has to create.
# Excludes: a cleanup that walks the recorded directories once, which attempts the parent while
# the second child is still there and never comes back to it. git reports nothing for an empty
# directory, so expect_clean_tree cannot see this one and the case asserts the path itself.
case_held_out_sibling_directories_removed() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    commit_head
    mkdir -p "$held/a/b" "$held/a/c"
    held_out_test a/b/h_one.sh pass
    held_out_test a/c/h_two.sh pass
    run_gate
    expect_rc 0
    expect_line "^gate: ok \| visible=1 \| held-out=2 \| sha=$visible$"
    [ ! -d "$repo/a" ] || fail "the gate left $(cd "$repo" && find a -type d | tr '\n' ' ') behind"
    expect_clean_tree
}

# The visible artifact written row by row, for the two findings whose input is the shape of the
# table rather than the content of a cell. Arguments after the message are whole rows.
raw_artifact() {
    local msg=$1; shift
    {
        printf '# Test strategy: fixture\n\n## Visible tests, in work order\n'
        printf '| # | test | seam | R | excludes this wrong implementation | expected from | rederive | red line |\n'
        printf '|---|---|---|---|---|---|---|---|\n'
        printf '%s\n' "$@"
    } > "$repo/$artifact"
    (cd "$repo" && g add -A && g commit -qm "$msg") || fail "fixture: artifact commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
}

# Review of #49 / R10. The finding #41 added and left without a visible case. Excludes: a parse
# that reads cells by position and takes whatever sits at the rederive index of a short row, so
# a row missing a column is judged on the wrong cell instead of being refused.
case_rederive_row_width() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    raw_artifact "artifact with a row one column short" \
        "| 1 | tests/test_a.sh::one | bash tests/test_a.sh | R1 | the fixture | quoted spec C3 | no |"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "rederive-row-width: tests/test_a.sh::one | cells: 7 | header: 8"
    expect_nothing_ran
    expect_clean_tree
}

# Review of #49 / R10. The other finding #41 added without a visible case, in all three of its
# columns at once, so the case also says each names the column it found empty. Excludes: a parse
# that checks one required cell and not the others, and one that reports the same column
# whichever cell was blank.
case_rederive_cell_empty() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    raw_artifact "artifact with an empty test, citation and mark, one per row" \
        "|  |  | bash tests/test_a.sh | R1 | the fixture | quoted spec C3 | no | AssertionError: 1 == 2 |" \
        "| 2 | tests/test_a.sh::two | bash tests/test_a.sh | R1 | the fixture |  | no | AssertionError: 1 == 2 |" \
        "| 3 | tests/test_a.sh::three | bash tests/test_a.sh | R1 | the fixture | quoted spec C3 |  | AssertionError: 1 == 2 |"
    commit_head
    held_out_test h_pass.sh pass
    run_gate
    expect_rc 1
    expect_stdout "$(printf 'rederive-cell-empty: | test\nrederive-cell-empty: tests/test_a.sh::two | expected from\nrederive-cell-empty: tests/test_a.sh::three | rederive')"
    expect_nothing_ran
    expect_clean_tree
}

# Review of #49 / R4. A held-out path whose parent in the tree is a symlink to a directory
# outside the repository. Excludes: a copy that walks no ancestor, which writes and runs the
# file outside the tree. git reports nothing for a write through a symlinked parent, and the
# cleanup deletes the escaped copy on the way out, so the runner log is the only witness left
# and the case reads it rather than the directory.
case_held_out_symlinked_parent() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    mkdir -p "$tmp/elsewhere"
    ln -s "$tmp/elsewhere" "$repo/outside"
    (cd "$repo" && g add -A && g commit -qm "a symlink to a directory outside the tree") \
        || fail "fixture: symlink commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
    commit_head
    mkdir -p "$held/outside"
    held_out_test outside/h_one.sh pass
    run_gate
    expect_rc 2
    ! grep -q ' h_one.sh$' "$log" 2>/dev/null || fail "a held-out test ran through the symlinked parent"
    expect_clean_tree
}

# Review of #49 / R4. The near miss for held_out_victim_symlink: an ordinary tracked file
# already sitting at a held-out destination, where that case uses a dangling symlink. Excludes:
# an occupancy guard written as -L alone, which overwrites the reviewer own file and then
# deletes it in cleanup.
case_held_out_destination_is_a_tracked_file() {
    make_fixture "AssertionError: 1 == 2" "AssertionError: 1 == 2"
    printf 'the reviewer own file\n' > "$repo/taken.sh"
    (cd "$repo" && g add -A && g commit -qm "a file the reviewer already had at that path") \
        || fail "fixture: occupied destination commit"
    visible=$(cd "$repo" && git rev-parse HEAD)
    commit_head
    held_out_test taken.sh pass
    run_gate
    expect_rc 2
    grep -q 'the reviewer own file' "$repo/taken.sh" 2>/dev/null || fail "the gate overwrote or deleted the file already at taken.sh"
    expect_clean_tree
}

# This harness's own contract, not gate.sh's. Before this ticket an unknown case name printed
# `case_<name>: No such file or directory` to stderr, `ok   <name>` to stdout because the failure
# counter never moved, and then died on an unbound variable. A reviewer who mistyped a case name
# read a pass. Excludes: a harness that reports a case it never ran.
case_harness_unknown_case() {
    local sub_out sub_rc
    sub_out=$(bash "$here/test_gate.sh" definitely_no_such_case 2>&1)
    sub_rc=$?
    [ "$sub_rc" != 0 ] || fail "an unknown case name exited 0"
    ! printf '%s\n' "$sub_out" | grep -q '^ok   definitely_no_such_case$' \
        || fail "an unknown case name printed an ok line"
    printf '%s\n' "$sub_out" | grep -q '^FAIL definitely_no_such_case: no such case' \
        || fail "an unknown case name was not counted as a failure; output: $(printf '%s' "$sub_out" | head -n 1)"
}

# Work order: the four cases the T01 strategist wrote, then the T08 defects, destructive first,
# then T07's scan, positive first and the two exemptions after it, then T04's rederive column,
# shape of the artifact first, the recorded re-derivation second, placement last. The harness's
# own contract stays last of all.
all="diff red_line held_out ok held_out_victim_symlink held_out_no_runnable_test held_out_uppercase_md held_out_symlink_source artifact_copies_reviewer_table artifact_visible_table_is_not_a_leak artifact_names_the_scratch_directory_without_a_table rederive_column_missing rederive_cell_malformed rederive_marked_no_on_a_worked_row rederive_source_without_a_token rederive_yes_without_fresh_value rederive_fresh_mismatch rederive_match_produces_no_finding rederive_reports_before_the_replay leak_scan_still_reports_first held_out_dirty_tracked_file held_out_untracked_file_is_not_dirty held_out_enumeration_failure rederive_record_without_a_derivation rederive_record_with_an_empty_derivation held_out_sibling_directories_removed rederive_row_width rederive_cell_empty held_out_symlinked_parent held_out_destination_is_a_tracked_file harness_unknown_case"

# gate.sh replays a visible test by running `<one-file command> <the path in the artifact's test
# cell>`, and in this ticket that path is this file. A path is not a case name, so it means "run
# every case". Anything else that is not a known case is a typo and must be loud: a harness that
# prints ok for a case it never ran is the same lie the gate exists to catch.
arg=${1:-}
if [ -z "$arg" ] || [ -e "$arg" ]; then cases=$all; else cases=$arg; fi

for case in $cases; do
    if ! declare -f "case_$case" > /dev/null 2>&1; then
        fail "no such case; known cases: $all"
        continue
    fi
    before=$failures
    tmp=
    "case_$case"
    [ "$failures" = "$before" ] && say "ok   $case"
    [ -n "${tmp:-}" ] && rm -rf "$tmp"
done

# Summary first. It is the only line whose text differs between a red run and a green one, so it
# is the line gate.sh's red-line check can replay.
echo "test_gate: $failures failure(s) in $(echo "$cases" | wc -w | tr -d ' ') case(s)"
cat "$buffer"
rm -f "$buffer"
[ "$failures" = 0 ]
