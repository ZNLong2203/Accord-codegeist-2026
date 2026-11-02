# Rovo agent and Atlassian MCP

The manifest defines a Rovo agent and exposes four existing Forge actions via
`rovo:mcp`. Both use the same source service and deterministic evaluator as the
Custom UI. There is no separate external MCP server or client-side API secret.

| Action              | Inputs                                        | Output                                                               |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `inspect-release`   | `anchorIssue`                                 | Current assessment, evidence, scope and snapshot label               |
| `simulate-scope`    | `anchorIssue`, comma-separated `excludedKeys` | Recomputed hypothetical assessment; explicitly labelled as simulated |
| `suggest-scope`     | `anchorIssue`                                 | Minimum-cost qualifying deferral, or null if unavailable             |
| `draft-commitments` | `pageId`                                      | Proposed commitments with verbatim quotes, plus discarded proposals  |

`decision-change` takes `anchorIssue` and a selected numeric `pageId`. It returns
reviewed/current versions, source excerpts and structured contract differences.
Unreadable or unselected sources are rejected. It cannot adopt a new baseline.

`draft-commitments` reads one page the caller can read and asks Forge LLM to
propose commitments. Accord verifies each quote against the page before returning
it, so an agent can cite exact sentences. Nothing is confirmed or stored; a human
confirms commitments in the Accord UI. See [decision commitments](contracts.md).

All actions declare `actionVerb: GET`, call product APIs as the user, and are
read-only. They cannot save a baseline, write comments, edit Jira, or approve a
deployment. Decision recording is a separate explicit UI workflow.

## Reusable skill

[`skills/accord-release-review/SKILL.md`](../skills/accord-release-review/SKILL.md)
describes the review workflow: inspect, explain each changed decision, simulate
the smallest deferral and cite the snapshot. The manifest registers it as the
`rovo:skill` module `accord-release-review`, depending on the five actions, and
the Accord agent uses it. Other Rovo agents can reuse it. The same file is an open
skill for third-party agents connected through the Atlassian MCP endpoint: add the
directory to the agent's skills and connect the Accord MCP server.

## Agent behavior

The agent asks for the configured Jira review issue, calls a tool for evidence,
cites issue keys and source versions, and distinguishes observed facts from
hypothetical scope. The prompt instructs it to treat page and issue text as data,
and never invent business impact or claim simulations were applied. A page
version change is only a review signal. The prompt is guidance, not a substitute
for permission checks or deterministic rules.

Verified on Atlassian (2 November 2026, production 3.x on a site with Rovo): `@Accord`
with a review issue key read its skill, called the inspect tool and answered with
the changed page, the old and new sentences, the open prerequisite and the snapshot
ID, then told the user that a person records the decision in the Accord app. The
other four actions share the same evaluator and are covered by tests; see
[verification](verification.md).

## MCP

The app declares a [`rovo:mcp` module](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)
(Preview) that exposes the same five read-only actions as MCP tools. The endpoint is
`https://mcp.atlassian.com/forge/f75a1254-6dee-42d5-9902-76d221db15cc`. A site
administrator must enable **Expose tools to MCP-compatible apps** under
**Apps → Sites → the site → Connected apps → Accord → Tools**; exposure is off by
default, and each user authorizes an external client through Atlassian OAuth with
read-only scopes.

**Status:** an external client's OAuth consent currently fails on Atlassian's side
(`invalid_request` before the callback), so tool calls from an external MCP client
have **not** been demonstrated. The actions run through the Rovo agent. The same
workflow is packaged as an open skill in `skills/accord-release-review/SKILL.md` for
third-party agents.
