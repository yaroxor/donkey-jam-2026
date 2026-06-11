# slick_hand_joe gate checks. Run by the CI gate (forge runner, `runs-on: gate`)
# and by hand: `just ci`. Each recipe is one objective check; any non-zero exit
# fails the gate. The gate is the ONE quality system for this repo -- the local
# pre-commit hook was removed (2026-06-11) in its favor.
#
# Still manual: `bunx playwright test` (browsers aren't in the runner image);
# run it before handing scene-coupled changes back for playtest.

# Run every gate check (this is what the workflow invokes). Tripwire first,
# cheap prose checks next, the dependency-installing TS checks last.
ci: secrets format spell commit-msg typecheck lint test

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
# (en_us + ru -- TODOS and code comments carry Russian design notes). Project
# vocabulary lives in codebook.toml; add legit names/jargon there, FIX typos.
spell:
    codebook-lsp lint .

# Commit messages: cocogitto verifies Conventional Commits. `--from-latest-tag`
# because the jam-era history predates the convention -- tag v1.4.0 is the
# baseline; everything after it is checked. Needs full history + tags, so the
# workflow checkout uses fetch-depth: 0.
commit-msg:
    cog check --from-latest-tag --ignore-merge-commits

# Dev dependencies for the three checks below. just dedupes shared dependencies
# within one invocation, so `just ci` installs once. The runner image carries
# bun (pinned 1.3.14) + Node 24; tsc / eslint / vitest execute from the repo's
# own node_modules per bun.lock -- NOT from the image's npm globals.
install:
    bun install --frozen-lockfile

# Types: tsc over src + e2e (tsconfig include covers both).
typecheck: install
    bun run typecheck

# Lint: eslint flat config with typescript-eslint, resolved from local
# node_modules (the runner's global eslint is not used).
lint: install
    bun run lint

# Tests: vitest one-shot.
test: install
    bun run test
