# Verification

What has been checked, how, and what has not. Dates are 2 November 2026.

## Automated checks

`npm run check` runs TypeScript, Vitest (86 tests), the Vite production build and
Atlassian's local manifest validators; `forge lint` passes. Tests cover:

- sentence-level drift, formatting-only edits and negated rewrites that must not
  count as "still stated";
- verification of model-drafted commitments: invented quotes, issue keys and
  labels are rejected, and a page containing an injected instruction cannot add a
  commitment;
- drafting and confirming as the calling user, refusal when the page version moved,
  and commitments never written to Jira;
- prerequisites, forbidden labels and owners; unknown evidence never becoming a pass;
- minimum-cost deferral search and scenario isolation;
- stale-review rejection, idempotent decision records and history recovery;
- the sample release against an in-memory Jira and Confluence.

Adapter tests mock Atlassian HTTP responses: they validate application logic, not
scopes, network behavior or installation.

## Verified on Atlassian

Driven in a browser on a Jira and Confluence site, on development and production,
and on a second site with Rovo. Work items and pages are fictional sample data.

| Capability                    | Result                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Install, Jira global page     | Custom UI loads in Jira with Forge managed identity                                                                                   |
| Sample release                | Created in about ten seconds: a version, five work items, two pages, confirmed commitments, a saved baseline and one post-review edit |
| Sentence drift                | "…was built on a commitment that changed" with the old and new sentences and the Done work                                            |
| Forge LLM drafting            | `claude-sonnet-5` returned grounded proposals in about 4 to 5 seconds; ungrounded ones were discarded                                 |
| "What does this change mean?" | Returned an assessment, labelled as an AI opinion, on development and production                                                      |
| Teamwork Graph                | The decision page's owner was returned and shown with the evidence                                                                    |
| Jira issue panel              | The "Decisions" panel lists the review's signals and the commitments the work was built on                                            |
| Confluence button             | "Accord commitments" shows the page's commitments and the Jira work built on them                                                     |
| View source links             | Open the Jira work item or page in a new tab                                                                                          |
| Rovo agent                    | `@Accord` read its skill, called the inspect tool and answered with quotes and the snapshot ID                                        |
| Earlier 2.x flows             | Baseline adoption, what-if, a confirmed Jira comment and shared history were verified on a developer site                             |

## Not verified

- **External MCP clients.** OAuth consent fails on Atlassian's side before the
  callback, so no MCP tool call from an external client has been demonstrated.
- **Teamwork Graph goals.** `jiraWorkItemGoals` is queried, but the test site has
  no Goals app, so the path has not returned data.
- **Restricted users.** Behavior for a second user with partial access, concurrent
  reviews and stale comment writes under load.
- **A clean third site** through the installation link, and Marketplace review.
- No measured customer savings, model accuracy or release-risk reduction has been
  established; the fixtures are fictional.

## Known limits

- Comparison is exact after normalising case, whitespace and typography; it does
  not judge meaning. The AI assessment is advisory and never changes a signal.
- The Teamwork Graph API and `rovo:mcp` are Preview features and may change.
- `npm audit --omit=dev` reports moderate advisories that are transitive through
  the Forge SDK (`@forge/manifest` to `glob` and `minimatch`) with no upstream fix yet.
