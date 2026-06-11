# slick_hand_joe gate checks. Run by the CI gate (forge runner, `runs-on: gate`)
# and by hand: `just ci`. Each recipe is one objective check; any non-zero exit
# fails the gate. Mirrors the forge template, narrowed to this repo's stack.
#
# Deliberately ABSENT from the gate: lint (typescript-eslint), typecheck (tsc),
# and tests (vitest) -- all three need node_modules, which the runner image does
# not install (no bun there, by design). They are enforced instead by the local
# pre-commit hook (simple-git-hooks: typecheck + lint + vitest), which cannot be
# missed. The gate covers what pre-commit does not: prose checks over the full
# tree and commit-message conformance.

# Run every gate check (this is what the workflow invokes). Tripwire first.
ci: secrets format spell commit-msg

# Secrets: trufflehog scans the working tree. `--fail` exits non-zero on any
# finding; `--no-update` skips the self-update check. Kept first -- a leak is
# irreversible once pushed.
secrets:
    trufflehog filesystem . --no-update --fail

# Formatting: prettier must agree the markdown/YAML is already formatted.
# `--check` writes nothing, exits non-zero if anything isn't formatted.
# TS/JSON stay out: prettier was never the source's formatter and a wholesale
# reformat would churn every file; revisit if a TS formatter is ever adopted.
format:
    prettier --check "**/*.{md,yml,yaml}"

# Spelling: codebook is code-aware (understands identifiers) and bilingual here
# (en_us + ru -- DESDOC/TODOS carry Russian design notes). Project vocabulary
# lives in codebook.toml; add legit names/jargon there, FIX real typos.
spell:
    codebook-lsp lint .

# Commit messages: cocogitto verifies Conventional Commits. `--from-latest-tag`
# because the jam-era history predates the convention -- tag v1.4.0 is the
# baseline; everything after it is checked. Needs full history + tags, so the
# workflow checkout uses fetch-depth: 0.
commit-msg:
    cog check --from-latest-tag --ignore-merge-commits
