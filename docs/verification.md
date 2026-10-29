# Verification record

Date: 29 October 2026, Asia/Ho_Chi_Minh.

## Automated checks

`npm run check` runs TypeScript, Vitest, Vite production build and Atlassian's
installed local manifest validators. The current suite contains **44 passing tests** in six files. The staged-file
guard is also exercised in disposable Git repositories, including a staged secret
whose working copy has already been cleaned. Coverage includes:

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
- Dedicated comment-property reads, shared history pagination and retry recovery.
- Rejected reuse of a request ID with changed content; bounded, fail-closed lookups.
- Source-field diffs and adoption leaving unrelated signals open.
- Read-only agent change inspection rejecting inaccessible/unselected pages.
- Code-block generation and parsing with literal CDATA terminators.

Product-adapter tests mock Atlassian HTTP responses. They validate application
logic, not actual Atlassian scopes, network behavior or installation.

## Browser walkthrough

The local interface was exercised through the in-app browser:

Captured screens: [review room](images/accord-review.jpg),
[contract builder](images/accord-contract-builder.jpg), and
[source re-review](images/accord-source-review.jpg).

| Flow                  | Expected behavior                                                              |
| --------------------- | ------------------------------------------------------------------------------ |
| Initial review        | 8 scope items, 2 critical signals, 1 ownership warning                         |
| Smallest deferral     | PLAT-142 deferred; 7 items and only ownership warning remain                   |
| Return to review      | Scenario explicitly labelled; decision recording disabled                      |
| Restore current scope | All 3 signals return                                                           |
| Human review          | Explanation and confirmation required before saving                            |
| Review history        | Local record includes actor, rationale, snapshot label and 3 signals           |
| Settings controls     | New fictional source versions and issue changes recompute rules                |
| Contract builder      | A filled template creates validated JSON and a working demo-library entry      |
| Source re-review      | Adoption clears the version signal while prerequisite and owner signals remain |
| Larger typography     | Main text and metadata use larger sizes; light-surface contrast increased      |
| Mobile layout         | Navigation and scope controls remain usable without page overflow              |

See the repository history for the implementation corresponding to this record.
No measured customer savings, model accuracy, adoption or release risk reduction
has been established by these fixtures.

## Outstanding external verification

App registration, authenticated `forge lint` and a development deployment have
passed. The first backend
bundle exposed a TypeScript `noEmit` conflict with Forge's `ts-loader`; the shared
configuration now permits emit while local type checks explicitly disable it.
CLI 15 subsequently confirmed successful installations in Jira and Confluence
on the same developer site. This confirms deployment and installation, not live
workflow correctness. Browser verification requires an authenticated tenant
session. Verify per-user scopes, Forge CSP, Rovo/MCP availability, and clean-tenant
distribution before representing the app as a deployed submission.

Also pending: feedback from release owners, larger real release scans, concurrent
review behavior, network failures during comment posting, and Marketplace review.
