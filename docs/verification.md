# Verification record

Date: 29 October 2026, Asia/Ho_Chi_Minh.

## Automated checks

`npm run check` runs TypeScript, Vitest, Vite production build and Atlassian's
installed local manifest validators. Tests cover meaningful behavior, including:

The current suite contains **26 passing tests** in four files. The staged-file
guard is also exercised in disposable Git repositories, including a staged secret
whose working copy has already been cleaned.

- Done work still affected by a changed decision page and open prerequisite.
- Scenario isolation and prerequisites outside fixVersion.
- Unknown results for inaccessible sources, missing dependencies and truncation.
- Empty-scope handling, prohibited labels and missing owners.
- Minimum-cost deferral across overlapping decisions and a bounded search.
- Full observed-input comparison before a human decision is recorded.
- Parsing only explicit JSON code blocks, rejecting ambiguous/malformed input.
- Per-user current and historical page reads without `asApp` access.
- No source text copied into Jira configuration properties.
- Rejected stale review without a comment mutation.
- A current explicit review producing the expected Jira comment payload.

Product-adapter tests mock Atlassian HTTP responses. They validate application
logic, not actual Atlassian scopes, network behavior or installation.

## Browser walkthrough

The local interface was exercised through the in-app browser:

| Flow                  | Expected behavior                                                    |
| --------------------- | -------------------------------------------------------------------- |
| Initial review        | 8 scope items, 2 critical signals, 1 ownership warning               |
| Smallest deferral     | PLAT-142 deferred; 7 items and only ownership warning remain         |
| Return to review      | Scenario explicitly labelled; decision recording disabled            |
| Restore current scope | All 3 signals return                                                 |
| Human review          | Explanation and confirmation required before saving                  |
| Review history        | Local record includes actor, rationale, snapshot label and 3 signals |
| Settings controls     | Changes to fictional sources cause rules to recompute                |
| Mobile layout         | Navigation and scope controls remain usable without page overflow    |

See the repository history for the implementation corresponding to this record.
No measured customer savings, model accuracy, adoption or release risk reduction
has been established by these fixtures.

## Outstanding external verification

Authenticated `forge lint` needs a logged-in developer account. This initial
environment has no Forge login or Atlassian development site. Local manifest
validation passes but does not prove deployment. Verify the installation,
product connections, scopes, Forge CSP, Rovo/MCP availability, and clean-tenant
distribution before representing the app as a deployed submission.

Also pending: feedback from release owners, larger real release scans, concurrent
review behavior, network failures during comment posting, and Marketplace review.
