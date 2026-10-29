# Accord contributor guide

Accord is a Forge app with a standalone, clearly labelled local demo. Keep domain
rules in `src/domain/` independent of React and Forge. Both the UI and Rovo tools
must use the same evaluator. Never turn an unknown source into a passing check.

- Public documentation in `docs/` and README is English and technical.
- Internal strategy, research, video scripts and submission drafts belong only in
  gitignored `private/`, in numbered Vietnamese files.
- Use Conventional Commits: `type(scope): description`, at most 72 characters,
  with explanatory bodies and a truthful Co-Authored-By trailer when applicable.
- Run `npm run check` and relevant browser checks before committing.
- Source permissions must be checked as the caller. Never cache one user's
  issue/page content and return it to another user.
- What-if plans never mutate Jira. Recording a decision requires explicit human
  confirmation and a fresh snapshot comparison on the backend.
- Do not claim a Forge deployment, Marketplace listing, Rovo verification or
  Teamwork Graph integration until it has actually been tested on Atlassian.
- Do not commit credentials, `private/`, or generated build/test output.
