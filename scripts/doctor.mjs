import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validate } from '@forge/manifest';

const manifest = readFileSync('manifest.yml', 'utf8');
const registered = !manifest.includes('00000000-0000-4000-8000-000000000000');
const result = await validate();
const login = spawnSync(process.execPath, ['node_modules/@forge/cli/out/bin/cli.js', 'whoami'], {
  encoding: 'utf8',
  env: { ...process.env, FORGE_DISABLE_ANALYTICS: '1' },
  timeout: 20000,
});
// Do not print CLI account details, tokens, or environment values.
console.log(`Local manifest: ${result.success ? 'PASS' : 'NEEDS ATTENTION'}`);
console.log(
  `Forge app ID: ${registered ? 'registered value present' : 'placeholder; run npm run forge -- register'}`,
);
console.log(
  `Forge login: ${login.status === 0 ? 'available' : 'unavailable; run npm run forge -- login on your machine'}`,
);
console.log('Local demo: npm run dev (no credentials needed)');
console.log(
  'Tenant verification: npm run forge:lint, deploy, install, connect Confluence, then follow docs/setup.md.',
);
if (!result.success) {
  for (const issue of result.errors ?? []) console.error(issue.message);
  process.exitCode = 1;
}
if (process.argv.includes('--require-live') && (!registered || login.status !== 0))
  process.exitCode = 1;
