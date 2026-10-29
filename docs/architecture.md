# Architecture

Accord checks explicitly adopted Confluence commitments against a Jira release.
It is an advisory review tool. Its useful result is an inspectable evidence trail
and a transparent scope tradeoff, rather than an opaque release score.

## Shared calculation

`assess(snapshot, excludedKeys)` is a pure function used by both UI scenarios and
Forge actions. The snapshot contains visible Jira work, explicitly selected
Confluence pages, their reviewed versions, and coverage information.

| Signal             | Trigger                                                                                  | Meaning                                                               |
| ------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Page changed       | Current page version differs from reviewed version and applies to included work          | A reviewer should inspect the page; semantics are not inferred        |
| Required work open | An applicable `requires_done` issue is not in Jira's Done category                       | The explicit prerequisite is unmet, even if it is outside the release |
| Forbidden label    | Applicable scope work carries a prohibited label                                         | The declared label rule is unmet                                      |
| Missing owner      | Applicable work has no assignee                                                          | A warning requiring ownership review                                  |
| Unknown            | Missing source, invalid contract, unreadable dependency, scan truncation, or empty scope | Evidence cannot establish a clear result                              |

Every finding includes a stable rule identity, applicable issue keys, source
evidence and a next step. No source content is interpreted as an instruction to
the evaluator. A page edit never silently replaces reviewed commitments.

## Source retrieval and permissions

All product requests use `api.asUser()`. Forge supplies the user's authentication;
the browser never receives an API token. The app declares Jira as required and
Confluence as optional, and the installation must connect both for source access.

The shared review configuration is a Jira issue property containing project,
version, source page IDs and reviewed version numbers. **No Confluence page text
or parsed contract is copied into that property.** On each scan, the backend reads
the current and historical page versions as the caller and parses their explicit
contracts. An inaccessible page produces a redacted unknown source. Previously
observed source text is not returned from a cross-user cache.

Jira search is permission filtered. “Complete” means the configured scan exhausted
the visible results within its bound; it cannot prove that no security-restricted
issues exist. Standard Jira visibility and app access rules still apply. A team
must choose a reviewer whose access matches its release review responsibilities.

Source URLs use the tenant supplied by Forge context, or Jira server information
for action calls. They are not arbitrary outbound destinations. The UI renders
source text as React text, never raw HTML. JSON schemas bound input size and keys;
the Forge `route` helper encodes product API paths and values. JQL project and
version values are validated and quoted.

## Counterfactual scope

A scenario only removes work from an in-memory scope. It does not change
fixVersion, complete a dependency, reset a source baseline, or record a release
decision. Out-of-scope prerequisites still apply to any dependent work retained.
An empty scope is unknown.

For up to 15 scope items, an exhaustive search evaluates non-empty remaining
scopes and minimizes the cost of deferred items. Fixture costs are illustrative
effort points; the live adapter deliberately uses cost 1 for every item because a
customer's story point custom field cannot be assumed. Ties prefer fewer deferred
items. Critical and unknown signals must be absent for a qualifying suggestion;
warning-level signals can remain. Larger releases support manual scenarios, not
an undisclosed heuristic.

## Human review and race limits

The UI requires an outcome, at least 20 characters of reasoning and an explicit
review confirmation. It disables recording while a scenario is active. In live
mode the resolver fetches evidence again and compares the full canonical observed
inputs against the reviewed token before posting a Jira comment as the user. An
evidence change or unknown result prevents posting.

The canonical token includes source versions, reviewed contracts, issue statuses,
owners, labels, timestamps, release configuration and coverage. It ignores capture
time and source list order. The short displayed `AC-…` ID is a noncryptographic
human label; the stale comparison uses the full token, not that short ID.

The comment records the outcome, rationale, selected scope, finding titles and
observed time. It intentionally omits Confluence excerpts and contract text.
Comments inherit the review issue's audience; the reviewer should inspect their
own rationale before sharing it. Comments are mutable under Jira permissions.
They are not tamper-proof signatures, an approval policy, or compliance evidence.

Jira and Confluence do not share an atomic transaction with the comment write.
Evidence can change after the final check. Each review request carries a UUID;
the comment and structured metadata are created in one API request. Before a
retry, the backend checks up to 100 recent visible comments for that UUID and
returns an existing matching record. Different content under the same UUID is
rejected. An unreadable or malformed history, or a lookup that reaches its bound,
prevents a new write. The UI keeps the UUID during an open review and disables
repeated submissions while saving. This reduces duplicates after an ambiguous
network response; concurrent requests and eventual consistency still prevent an
exactly-once guarantee across clients. The record
describes what was observed, not a lock on the release.

## Operational bounds

- Up to 10 decision pages, each at most 250,000 JavaScript string units when parsing.
- At most 5 pages of 100 Jira search results; further results make coverage partial.
- Up to 20 rules and 50 explicit applicable issue keys per contract.
- Required dependencies are individually read, including those outside fixVersion.
- No background monitoring, user-independent cache, external LLM or external egress.
- Manual refresh; tenant latency and Forge invocation limits need load testing.

The application is not a Teamwork Graph integration. Rovo/MCP modules reuse the
same product adapters and evaluator; see [agents](agents.md).

## Source re-review and shared history

Source comparison displays changes in title, owner, rationale, explicit issue
applicability and individually identified rules. It does not interpret arbitrary
page prose or label a change semantically safe. Confirmation re-reads the observed
snapshot, adopts only the selected page version and preserves other baselines.
The Jira configuration retains up to 50 adoption metadata entries (IDs, version
numbers, time and caller ID), without source excerpts. Initial reconfiguration
replaces this configuration; these are editable metadata, not an immutable audit.

History follows visible Jira comments in pages of 20. Structured Accord properties
are read through the dedicated comment-property API when not returned inline,
with at most five concurrent reads. A missing property identifies a non-Accord
comment; permission and network failures surface as errors. Comment bodies and
properties are editable under Jira permissions, can be changed independently, and
are not cryptographic attestations. Older comments without Accord metadata do not
appear as structured review records. Refresh again if new comments shift offset
pagination while reading older pages.

API reference: [Jira comments](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/)
and [comment properties](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comment-properties/).
