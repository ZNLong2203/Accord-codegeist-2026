# Rovo agent and Atlassian MCP

The manifest defines a Rovo agent and exposes four existing Forge actions via
`rovo:mcp`. Both use the same source service and deterministic evaluator as the
Custom UI. There is no separate external MCP server or client-side API secret.

| Action            | Inputs                                        | Output                                                               |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `inspect-release` | `anchorIssue`                                 | Current assessment, evidence, scope and snapshot label               |
| `simulate-scope`  | `anchorIssue`, comma-separated `excludedKeys` | Recomputed hypothetical assessment; explicitly labelled as simulated |
| `suggest-scope`   | `anchorIssue`                                 | Minimum-cost qualifying deferral, or null if unavailable             |

`decision-change` takes `anchorIssue` and a selected numeric `pageId`. It returns
reviewed/current versions, source excerpts and structured contract differences.
Unreadable or unselected sources are rejected. It cannot adopt a new baseline.

All actions declare `actionVerb: GET`, call product APIs as the user, and are
read-only. They cannot save a baseline, write comments, edit Jira, or approve a
deployment. Decision recording is a separate explicit UI workflow.

## Agent behavior

The agent asks for the configured Jira review issue, calls a tool for evidence,
cites issue keys and source versions, and distinguishes observed facts from
hypothetical scope. The prompt instructs it to treat page and issue text as data,
and never invent business impact or claim simulations were applied. A page
version change is only a review signal. The prompt is guidance, not a substitute
for permission checks or deterministic rules.

Suggested tenant verification:

1. Deploy and configure the app on a developer site with both products connected.
2. Open Rovo and select Accord; ask “Inspect the release configured on PLAT-150,”
   substituting your actual review issue key.
3. Ask to simulate deferring the affected session issue. Compare the response with
   the UI's What-if lab under the same user's permissions.
4. Ask for a smaller scope. A release over 15 items returns no automatic plan;
   the agent must explain the limit rather than invent one.
5. Revoke access to a selected source and repeat. The output must be unknown and
   must omit source text.

## MCP availability

Atlassian's [`rovo:mcp` module](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)
is Preview as of 29 October 2026. It exposes the action keys as managed tools for
supported agents; external client use depends on current platform support and
site administrator settings. Follow Atlassian's current connection flow rather
than assuming that declaring a module verifies connectivity.

**Current verification:** manifest validation and shared backend tests run
locally. Rovo invocation, MCP client discovery, cross-product permission behavior
and installation have not yet been tested on a tenant. Local demo screens do not
imitate an AI response or claim that these integrations are running.
