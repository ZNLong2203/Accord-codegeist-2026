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

The external endpoint for this app is
`https://mcp.atlassian.com/forge/f75a1254-6dee-42d5-9902-76d221db15cc`.
An administrator must enable **Expose tools to MCP-compatible apps** under
**Apps → Sites → the site → Connected apps → Accord → Tools**. Exposure is
disabled by default. Users still authorize the external client through Atlassian
OAuth; enabling the switch alone is not a successful tool invocation.

For a direct smoke test without an external LLM:

```sh
npm run verify:mcp -- ACD-1 327681
```

Substitute a configured review issue and a selected page ID on your own site.
The script uses the official TypeScript MCP client, an ephemeral loopback OAuth
callback, state validation and PKCE. Tokens and registration details stay in
memory and disappear on exit. It lists the tools and calls only the four expected
read-only actions. OAuth explicitly requests only `read:jira-work` and
`read:page:confluence`; broader scope challenges fail rather than silently widen
consent. The script requests no refresh token. It does not automatically grant consent, write Jira, or change
Codex/Claude configuration. Tool responses can contain tenant content; do not
publish terminal output. Compare findings and snapshot labels with the UI under
the same user and unchanged evidence. The endpoint does not select the site:
select the intended site during OAuth consent.

**Current verification:** Forge installation and cross-product reads through the
Custom UI have been tested on a developer tenant. Manifest validation and mocked
shared backend tests pass. Rovo agent invocation and MCP client discovery/calls
still require tenant verification. Local screens do not imitate AI responses.

On the developer demo tenant, administrators have enabled MCP exposure for both
development and production. Discovery and dynamic registration reach the
Atlassian OAuth consent page with the intended site and Read/Search permissions.
After the human explicitly authorized permissions and terms, accepting consent
returned `invalid_request — Incorrect request parameters` before the loopback
callback. No authorization code or token was received, so tool discovery and
calls have **not** passed tenant verification. Rovo Studio also currently presents
no selectable site in the admin flow; its agent has not been invoked.

### Consent troubleshooting record

On 30 October 2026, a fresh client registration, explicit `audience` and
`prompt=consent`, and an exact loopback callback allowlist entry reproduced the
same pre-callback error. The organization allowed supported domains and
Read/Search toolsets. The temporary exact callback entry was removed after the
test; the prior supported-domain policy was retained. No scopes were widened and
no API-token fallback was used. These observations do not prove which provider
parameter or tenant condition caused the rejection.

The client follows the resource's path-scoped authorization-server discovery,
not a guessed legacy registration URL. It supplies Atlassian's explicit
[authorization parameters](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#1-direct-the-user-to-the-authorization-url-to-get-an-authorization-code).
Atlassian documents
[callback-domain and backend-configuration troubleshooting](https://support.atlassian.com/rovo/kb/fix-oauth-consent-block-for-atlassian-rovo-mcp-server-in-atlassian-cloud/).
If an administrator needs a fixed callback for a narrowly scoped allowlist:

```sh
MCP_CALLBACK_PORT=55586 npm run verify:mcp -- ACD-1 327681
```

The listener binds only `127.0.0.1`; the default is an ephemeral port.
Do not publish authorization URLs, callback codes, tokens, client
secrets or tenant content in a support ticket. Include sanitized parameter names,
discovery endpoints, error text and timestamps, then request provider-side
diagnostics rather than widening consent by trial and error.
