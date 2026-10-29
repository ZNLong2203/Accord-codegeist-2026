# Reproduce the Forge demo

Use a developer site with Jira and Confluence connected to the same Accord
installation. All content below is fictional test data, including the initial
security promise. It is not a production security policy or a real release
approval. No API tokens are entered into Accord.

## Prepare Jira

Create a software project, an unreleased fixVersion named `2.8`, and six work
items. The keys below identify the verified fixture; use the actual keys returned
by your site when creating your own data.

| Key   | Summary                                    | Status      | Fix version | Assignee   |
| ----- | ------------------------------------------ | ----------- | ----------- | ---------- |
| ACD-1 | [DEMO] Release 2.8 — human decision record | To Do       | None        | Any        |
| ACD-2 | [DEMO] Token rotation regression tests     | In Progress | None        | Any        |
| ACD-3 | [DEMO] Prepare progressive rollout         | To Do       | 2.8         | Unassigned |
| ACD-4 | [DEMO] Ship session refresh flow           | Done        | 2.8         | Any        |
| ACD-5 | [DEMO] Publish compatible API response     | Done        | 2.8         | Any        |
| ACD-6 | [DEMO] Add release observability           | Done        | 2.8         | Any        |

Use Jira statuses whose status categories are respectively new, indeterminate,
and done. Keep the review issue and prerequisite outside the fixVersion. This
demonstrates why checking only the Done items in a release misses context.

## Publish two decision pages

Create normal Confluence pages, with a short explanation that this is fictional
demo data. Insert exactly one **Code snippet / Code block** on each page. Paste
the appropriate JSON into the block and publish the page. Plain paragraph text
containing JSON is not a contract. Note each page's numeric ID from its URL.

Security page:

```json
{
  "schemaVersion": 1,
  "title": "Session security and token rotation",
  "owner": "Accord demo security reviewer",
  "rationale": "Rotate refresh tokens daily. Regression tests must pass before the session refresh flow ships.",
  "appliesTo": ["ACD-4"],
  "rules": [
    {
      "id": "rotation-tests",
      "kind": "requires_done",
      "issueKey": "ACD-2",
      "summary": "Token rotation regression tests must be Done before the session flow ships."
    }
  ]
}
```

Rollout page:

```json
{
  "schemaVersion": 1,
  "title": "Progressive rollout ownership",
  "owner": "Accord demo release reviewer",
  "rationale": "Name one accountable rollout owner before the release window. A missing assignee requires follow-up.",
  "appliesTo": ["ACD-3"],
  "rules": [
    {
      "id": "rollout-owner",
      "kind": "requires_owner",
      "summary": "The progressive rollout work item must have a named assignee."
    }
  ]
}
```

## Run the review

1. In **Jira → Apps → Accord → Settings**, enter project `ACD`, fixVersion `2.8`,
   review issue `ACD-1`, a target date and both numeric page IDs.
2. Inspect the pages and confirm the initial baseline. Review room should show
   four included items, three Done, one critical prerequisite signal, and one
   ownership warning. The dependency is checked even though it is outside 2.8.
3. Edit only the security page's rationale to:
   `Rotate refresh tokens on every use, not once per day. Regression tests must cover token reuse before the session refresh flow ships.`
   Update its explanatory prose to match, then publish the new version.
4. Refresh Accord. Expect three signals: source version changed, open
   prerequisite, and missing owner. Inspect the source and choose
   **Compare & review this decision**. The diff should identify a rationale
   change between the reviewed and current source versions. A version change
   alone does not prove a semantic contradiction.
5. Close the source review without adopting the new version. In **What-if lab**,
   choose **Find smallest deferral**. For this four-item fixture it evaluates 15
   non-empty scopes and defers only `ACD-4`. Three items remain included, with no
   critical signals and the ownership warning still present.
6. Reset the simulation, return to Review room and refresh. All four included
   items and three signals should return. Jira fixVersion and statuses remain
   unchanged.
7. To exercise the write path, prepare a clearly labelled demo **Hold for review**
   record. Inspect its preview and obtain the human reviewer's explicit
   confirmation before **Post Jira comment**. Then verify the comment on the
   Jira review issue and reload **Review history**. Recording does not resolve
   the findings or adopt the edited page.

For a separate baseline re-review, inspect the new source and explicitly adopt
its version. Only the version-change signal should clear; the open prerequisite
and missing owner still require attention. This changes the shared review
configuration, so perform it after capturing the original drift demonstration.

The developer-site browser verification status and remaining checks are recorded
in [verification.md](verification.md). Rovo and MCP availability must be tested
separately on the tenant.
