# Review Accord on Atlassian

Accord connects explicitly reviewed Confluence commitments to Jira release work.
The central demo shows a Done work item whose source decision changed and whose
required prerequisite remains open outside the release.

## Installation prerequisites

Use an Atlassian Cloud site with Jira and Confluence, and an administrator who can
install Forge apps. Use the [production installation link](install.md).
Connect **both Jira and Confluence on the same site**.
Installation does not create sample work or copy data from another tenant.
Rovo and MCP are optional; the core review workflow works through the Jira app.

For source installation or independent registration, follow [setup.md](setup.md).
The localhost demo is a separate fictional sandbox, not a Forge installation.

## Prepare or open the review

For a fresh site, follow [live-demo.md](live-demo.md), replacing every issue key
and page ID with your site's own values. Create the four in-scope work items,
review anchor, out-of-scope prerequisite and two Confluence JSON contracts. In
**Jira → Apps → Accord → Settings**, connect the release and inspect/adopt the
initial source versions. Publish one security-page edit after adoption.

On the project's developer demo site, an already-authorized reviewer can instead
open **Settings → Open an existing review**, enter `ACD-1` and choose **Load review**.
This uses that review issue's shared configuration; it does not reconfigure it.
The site is not an anonymous public demo. Do not publish shared login credentials.

## Three-minute walkthrough

1. **Review room:** four work items are in release 2.8 and three are Done. Two
   critical signals and one ownership warning remain.
2. Open the security decision. Inspect reviewed/current versions, the source
   rationale and **Compare & review this decision**. A version change asks for
   review; it does not claim semantic contradiction. Close without adopting yet.
3. Inspect the prerequisite signal: the Done session flow depends on `ACD-2`,
   which remains In Progress outside fixVersion 2.8.
4. **What-if lab → Find smallest deferral:** deferring the session item `ACD-4`
   leaves three included work items, zero critical signals and one ownership
   warning. This is an in-memory simulation; Jira fixVersion and statuses remain
   unchanged.
5. **Back to current scope** and refresh. All three signals return.
6. **Review history:** inspect the existing explicitly confirmed `[DEMO VERIFICATION]`
   HOLD record and follow its link to the native Jira comment.

Recording another decision is optional: inspect the preview, provide your own
rationale and explicitly confirm before posting. This creates a real comment on
the review issue. Adopting a source version is also a real configuration change;
it clears only the version signal, leaving the prerequisite and owner findings.

## Inspect the safety behavior

- Compare an open review against a source changed in another tab. A stale
  snapshot must be rejected; refresh before adopting or recording.
- A selected unreadable or malformed source must produce unknown evidence with
  no historical excerpt copied from a different user's session.
- For a second reviewer, grant the Jira issue's normal visibility but restrict a
  source page. This test requires an actual separate account; an administrator
  reading alone does not establish isolation.
- [Rovo/MCP verification](agents.md) uses the same evaluator and caller permissions.
  The manifest's existence is not evidence of a successful agent or tool call.

See [verification.md](verification.md) for completed tests and remaining external
checks, and [privacy.md](privacy.md) for retained data. There are no measured
customer savings, autonomous release approvals or Teamwork Graph API claims.
