# Local development and Forge installation

## Local demo

```sh
npm ci
npm run setup:hooks
npm run doctor
npm run dev
```

Open [localhost:5173](http://localhost:5173). Local mode uses labelled fictional
fixtures and browser storage. No Atlassian or external model credentials are
needed. Do not append `?mode=live` unless testing in an actual Forge context.

Run `npm run check` for types, unit/adapter tests, production build and the
installed Atlassian manifest validator. `npm run manifest:check` is offline schema
validation; it does not replace authenticated `forge lint` or installation tests.

## Create a developer environment

Create a site using Atlassian's [Forge getting started guide](https://developer.atlassian.com/platform/forge/getting-started/).
Enable Jira and Confluence; Rovo availability depends on the tenant and plan.
Forge CLI 15 requires a supported Node version. This repository pins Node 22.23.4
in `.nvmrc` and as a local development dependency used by npm scripts.

Authenticate interactively on your machine:

```sh
npm run forge -- login
```

Enter your own email and API token in the Forge CLI prompt. Do not paste tokens
into source, browser forms in this demo, or chat. The app runtime uses Forge
managed identity rather than `.env` credentials.

The repository contains the registered Accord app ID. Contributors creating an
independent app should register their own copy; deployment to the existing app
requires contributor access. Registration changes `app.id` in `manifest.yml`:

```sh
npm run forge -- register
npm run build
npm run forge:lint
npm run forge -- deploy
npm run forge -- install
```

The shared TypeScript configuration permits emit because Forge's backend bundler
uses `ts-loader`. Local type-check/build scripts pass `tsc --noEmit` explicitly,
and Vite builds the frontend into `dist/`.

Choose your developer site and Jira as the required app. Then run installation
again for Confluence, the optional app:

```sh
npm run forge -- install --site YOUR-SITE.atlassian.net --product confluence --environment development
```

This sequence has been confirmed with CLI 15 on a developer site. See
[Forge app compatibility](https://developer.atlassian.com/platform/forge/app-compatibility/).
An app installed only in Jira does not automatically gain Confluence access.
Rovo/MCP Preview availability must be checked in your tenant. App compatibility supports one
site; cross-site Confluence sources are not supported.

## Prepare realistic test data

1. Create a Jira project and fixVersion; add at least two work items to it.
2. Create a separate Jira task to hold the review configuration and comments.
3. Create a prerequisite task, initially In progress, which need not be in the
   release. Mark its dependent scope task Done.
4. Use Settings’ contract builder, then create a Confluence decision page containing
   the [JSON contract](contracts.md).
   Use actual created issue keys; the fictional PLAT keys are not automatic seeds.
5. Open **Jira → Apps → Accord → Settings**. Enter the project, version, review
   issue, target date and numeric Confluence page IDs.
6. Inspect the pages and explicitly confirm baseline adoption. The app reads and
   validates them as you, then stores page IDs and versions on the review issue.
7. Publish an edit to a decision page and refresh Review room. Inspect the version
   signal and the independently open prerequisite.

The local demo does not provision data in Atlassian. No script creates tenant data
or changes production issues automatically.

For a complete fixture and expected findings, follow the
[reproducible tenant demo](live-demo.md). It uses explicitly fictional data in a
developer site and the same evaluator as the local demo.

## Verify installation before distribution

- A clean site with Jira and Confluence can install and connect both products.
- Scans return current/historical pages and dependencies as the logged-in user.
- A user lacking page access sees a redacted unknown result, not a cached excerpt.
- Removing access or making the contract invalid never yields a clear result.
- Scope scenarios leave Jira fixVersion, issue status and baseline untouched.
- An explicit confirmed review writes one expected comment as the user.
- Editing a source after opening a review causes the stale comparison to reject
  the comment. Refresh, inspect the new evidence and submit again.
- Agent and MCP calls return the same observed findings as the UI for that user.
- A second reviewer can open the shared baseline using its review issue key.

## Judge installation link

The registered Accord app has a [production installation link](install.md).
Production is deployed and installed in Jira and Confluence on the developer
demo tenant. Its review, source versions and native comment history load through
the authenticated Custom UI. A complete walkthrough on a separate clean tenant
is still pending. Follow the [judge guide](judge-guide.md) after installation.

For independent registrations, follow Atlassian's
[app distribution guide](https://developer.atlassian.com/platform/forge/distribute-your-apps/)
after production deployment. Configure vendor/support/privacy details, enable
sharing and generate a link including Jira and Confluence. Test the actual link
and setup on a separate site before submission.

Do not submit a localhost URL as the Forge installation link. Marketplace listing
and Devpost submission have not been performed.

`npm run doctor -- --require-live` exits unsuccessfully when the app ID is still a
placeholder or Forge login is unavailable. Normal `doctor` also works before
registration and prints next steps without exposing account details or tokens.
