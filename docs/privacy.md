# Accord privacy notice

Effective date: 2 November 2026. Maintainer: ZNLong2203.

Accord is a release review app running on Atlassian Forge. This notice describes
the repository implementation, including its optional local demo. It does not
replace Atlassian's own privacy notice or your organization's data policies.

## Data read and displayed

On a requested scan, Accord reads the configured Jira review issue, visible
release work items and prerequisites, plus selected current and historical
Confluence pages. This can include titles, issue keys, status, labels, assignees,
page text and the human-readable owners in explicit decision contracts. Shared
history reads the native Jira comment author and review rationale. Product APIs
run as the caller; unavailable evidence remains unknown.

## Data retained

The Jira review issue stores an `accord.configuration.v1` entity property with
release settings, page IDs, reviewed versions and bounded adoption metadata
(page IDs, versions and timestamps). Current writes do not copy Confluence text,
contract owners, assignee details or reviewer account IDs into this property.
Updating an older baseline strips legacy copied reviewer IDs.

Confirmed commitments are stored on the Confluence decision page itself, as the
`accord-commitments` content property: the confirmed page version, a timestamp
and the commitments (summary, verbatim source sentence, governed issue keys and
the owner name written on the page). They share the page's visibility and are
not copied into Jira. The property keeps at most five confirmed versions.

A review is stored as a native Jira comment, attributed by Jira to its author.
The visible comment contains the human's rationale, selected issue keys and
finding summaries. The associated `accord.review.v1` property uses schema version
2: request UUID, outcome, rationale line count, snapshot label and finding count.
It does not duplicate the free-text rationale or author. The reader remains
compatible with older version 1 metadata that included rationale text.

Jira entity properties are not a secret store. Jira permissions, installed apps
and product behavior govern access to issue properties and comments. Reviewers
must inspect their rationale before sharing it with the review issue's audience.

The browser retains the selected review issue and interface preferences locally.
The standalone demo also retains fictional edits and review records in browser
storage. Accord has no external database, cross-user source cache, advertising
tracker, third-party analytics SDK or model API outside Atlassian in its runtime.

## Drafting with Forge LLM

Only when a user chooses **Draft commitments** (or a Rovo/MCP client calls the
read-only `draft-commitments` action) does Accord send that page's title and
plain text to an Atlassian-hosted Claude model through
[Forge LLM](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api/).
The page is read as the caller first, so a user cannot draft from a page they
cannot read. Scans, diffs and rule evaluation never call a model. Accord does not
store the prompt or the model response; the user confirms which proposals to keep.
Model processing is governed by Atlassian's Forge LLM terms.

## Sample release

**Create sample release** writes, as the caller and after explicit consent, one
Jira version, five work items labelled `accord-sample`, two Confluence pages and
their commitments, the review configuration and one page edit. Nothing else is
modified. Delete the sample items, version and pages with the normal Jira and
Confluence tools.

## Rovo, MCP and operational logs

Optional Rovo and MCP tools return the same permission-checked evidence to the
calling experience. A site administrator controls MCP tool exposure; each user
must authorize supported external clients. Such a client can receive source
excerpts in tool responses. Review that client's privacy practices before use.
Atlassian operates the Forge runtime, authorization, platform logs and Rovo/MCP
services. Accord does not intentionally log issue/page bodies, rationale or
credentials. Platform diagnostics and administrator-controlled log access remain
subject to Atlassian's policies.

## Control, retention and contact

There is no independent Accord retention database. Jira comments and properties
remain under the site's lifecycle and permissions. Uninstalling the app should
not be assumed to erase native Jira content. An authorized site administrator can
remove comments and Accord issue/comment properties using Jira's supported UI
and APIs. Revoking source access prevents subsequent reads; it does not erase a
review comment already shared in Jira. Clear browser site data to remove local
preferences or fictional demo records.

For support or data-handling questions, use the
[repository issue tracker](https://github.com/ZNLong2203/Accord-codegeist-2026/issues).
It is public: report the issue without credentials, private page text or personal
information. Coordinate tenant-side removal with your Atlassian administrator.
