# Contributing

Use a current Node runtime, install with `npm ci`, and enable hooks with
`npm run setup:hooks`. Run `npm run check` before submitting changes.

Keep source integrations in `src/forge`, product-independent evaluation in
`src/domain`, and user interface code in `src/web`. Tests should exercise outcomes
and failure boundaries, rather than duplicate implementation details.

Public documentation is English. Local strategy, competition analysis, recording
scripts and submission drafts belong in gitignored `private/` and must not be
staged, including with `git add -f`.

Commit subjects follow Conventional Commits and fit in 72 characters:

```text
feat(review): trace changed decisions to release work

Show the reviewed and current source versions beside affected Jira items.
Keep incomplete evidence visible so a reviewer can make an informed call.
```

Use explanatory bodies and truthful co-author attribution where applicable. The
commit-message hook checks subject shape and length. The staged-content hook
blocks private paths, non-example environment files, populated example values,
and common provider credential/private-key patterns. It is a useful guard, not
proof that every possible secret has been detected. Inspect the staged diff.
