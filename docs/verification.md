# Verification record

Date: 30 October 2026, Asia/Ho_Chi_Minh.

## Automated checks

`npm run check` runs TypeScript, Vitest, Vite production build and Atlassian's
installed local manifest validators. The current suite contains **51 passing tests** in six files. The staged-file
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
- Rejection of invalid Accord property metadata before any retry write.
- Rejected reuse of a request ID with changed content; bounded, fail-closed lookups.
- Source-field diffs and adoption leaving unrelated signals open.
- Read-only agent change inspection rejecting inaccessible/unselected pages.
- Code-block generation and parsing with literal CDATA terminators.
- Legacy adoption metadata migration without copied reviewer identifiers.
- Version 2 comment metadata without duplicated rationale; multiline native
  comment recovery and fail-closed recovery of missing or structurally edited bodies.

`npm audit --omit=dev` reported zero known vulnerabilities on this date. A
transitive `prosemirror-view` override pins 1.42.3 for
[GHSA-c8x8-7fp4-3x9w](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w).
This audit result covers production dependencies, not the development toolchain
or a guarantee that no vulnerabilities exist.

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

## Authenticated Forge walkthrough

App registration, authenticated `forge lint` and a development deployment have
passed. The first backend
bundle exposed a TypeScript `noEmit` conflict with Forge's `ts-loader`; the shared
configuration now permits emit while local type checks explicitly disable it.
CLI 15 subsequently confirmed successful installations in Jira and Confluence
on the same developer site. An authenticated browser walkthrough then used
fictional Jira and Confluence content, with the following observed results:

| Flow                     | Observed result                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load Custom UI           | Accord renders inside Jira with the Forge indicator                                                                                                        |
| Adopt initial baseline   | Two published Confluence contracts are read and saved on the Jira review issue                                                                             |
| Scan release             | Four included work items, three Done; prerequisite outside fixVersion is still checked                                                                     |
| Initial findings         | One critical prerequisite signal and one ownership warning                                                                                                 |
| Publish source v2        | Refresh shows reviewed v1 and current v2, adding one critical page-change signal                                                                           |
| Inspect source change    | Both historical/current rationales are readable; structured diff identifies one rationale change                                                           |
| Find smallest deferral   | Evaluates 15 non-empty candidate scopes; deferring the affected session item leaves three included items, zero critical signals and one ownership warning  |
| Return to current scope  | Reset and a fresh Forge scan restore four included items and all three signals                                                                             |
| Read shared history      | Jira-backed history loads successfully and is initially empty                                                                                              |
| Record decision          | After explicit human confirmation, one labelled demo HOLD comment is posted with four scope keys, three signals and the snapshot label                     |
| Verify persistence       | The comment is visible in Jira itself; refreshing shared history reads the same record back from Jira                                                      |
| Preview readability      | Comment preview increased from 9px to 14px with darker text; computed styles and wrapping verified locally and after Forge redeployment                    |
| Re-review source v2      | Adopting only the security page clears the version signal while the prerequisite and ownership findings remain                                             |
| Replay-ready state       | A subsequent source edit restores three signals with reviewed v2 and current v3; the earlier Jira comment remains in shared history                        |
| Stale baseline rejection | A source changed from v3 to v4 while a v3 review remained open; adopting the old snapshot was rejected by the backend without changing the baseline        |
| Current re-review        | Refresh and adoption of v4 succeed; prerequisite and ownership signals remain. A later v5 edit restores three signals for replay                           |
| Production app           | Production 2.2.0 deploys and installs in Jira and Confluence; Custom UI loads four work items, reviewed v4/current v5 and the existing native HOLD record  |
| Distribution page        | Sharing is enabled; the generated link opens the Accord install page with expected permissions and a site picker. No separate-tenant install was completed |

The source edit and scope simulation are independent: a simulation does not adopt
a page version, complete a prerequisite, assign an owner or change Jira scope.
The exact fixture and reproduction steps are in [live-demo.md](live-demo.md).

## Outstanding external verification

Single-user reads do not establish isolation for a second user with restricted
access. Verify restricted-user behavior, stale comment writes,
Rovo/MCP invocation, and a complete clean-tenant production walkthrough before treating
those capabilities as tenant-verified.

Also pending: feedback from release owners, larger real release scans, concurrent
review behavior, network failures during comment posting, and Marketplace review.
