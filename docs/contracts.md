# Explicit decision contracts

Accord does not infer binding commitments from arbitrary page prose. A reviewer
selects a Confluence page with exactly one JSON code block, then explicitly adopts
the current page version as a release baseline. Baseline adoption requires edit
permission on the Jira review issue and read permission on the selected pages.

Use **Settings → Build a decision contract** for an editable template and validated
JSON preview. Copy or download it, then create a normal Confluence **Code block**,
paste the JSON and publish the
page. The parser reads its storage-format CDATA body. Multiple candidate blocks,
invalid JSON, unknown fields, duplicate rule IDs and oversized pages are rejected.

Replace sample issue keys with your actual Jira keys:

```json
{
  "schemaVersion": 1,
  "title": "Session security and token rotation",
  "owner": "Maya Chen",
  "rationale": "Rotate refresh tokens on every use. Regression tests must pass before the session flow ships.",
  "appliesTo": ["PLAT-142"],
  "rules": [
    {
      "id": "rotation-tests",
      "kind": "requires_done",
      "issueKey": "PLAT-139",
      "summary": "Token rotation regression tests must be Done before the session flow ships."
    }
  ]
}
```

`owner` is a human-readable name supplied by the reviewer. It is not verified
against an Atlassian account and grants no permissions.

## Supported rules

| Kind             | Extra fields | Evaluation                                                |
| ---------------- | ------------ | --------------------------------------------------------- |
| `requires_done`  | `issueKey`   | The named dependency must use Jira's Done status category |
| `forbids_label`  | `label`      | No applicable included work can carry that exact label    |
| `requires_owner` | None         | Every applicable included work item must have an assignee |

Every rule requires an `id` and `summary`. Applicability is explicit through the
contract's `appliesTo` keys. Prerequisites can be outside the configured release.
Unknown or inaccessible prerequisites are unknown, not silently successful.

Examples for the additional rule types:

```json
{
  "id": "api-compatibility",
  "kind": "forbids_label",
  "label": "breaking-change",
  "summary": "Do not ship breaking API work under this compatibility promise."
}
```

```json
{
  "id": "rollout-owner",
  "kind": "requires_owner",
  "summary": "Name an accountable owner for the rollout window."
}
```

## Editing and re-review

1. Configure the release and adopt the page at version N in Accord Settings.
2. Edit and publish the Confluence page to version N+1.
3. Refresh Accord. Applicable scope receives a page-changed signal.
4. Inspect the current and reviewed evidence. The app shows explicit contract-field
   differences and rationale excerpts, rather than a full page diff or a semantic verdict.
5. Use **Compare & review this decision** to inspect field changes and explicitly
   adopt the selected page’s new baseline after confirmation. This
   updates only that page’s reviewed version and preserves other baselines; it does not happen when
   a comment is recorded.

The rules for a review come from the **reviewed historical version**. The app does
not silently adopt changes to the latest contract. A small spelling change still
requires page review. Source history must remain readable to the reviewing user.

Version-change signals consider the union of reviewed and current explicit
applicability. This catches new scope keys added by an edit without silently
adopting its unreviewed rules. Rule evaluation still uses the reviewed contract.
Mapping arbitrary new issues from unreviewed prose is outside the supported scope.
