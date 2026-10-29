// Atlassian's local validator; this does not replace authenticated `forge lint`.
const { validate } = require('@forge/manifest');
validate()
  .then((result) => {
    for (const error of result.errors ?? []) console.error(`${error.reference}: ${error.message}`);
    if (!result.success) process.exitCode = 1;
    else console.log('Forge manifest passes the installed Atlassian schema and local validators.');
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
