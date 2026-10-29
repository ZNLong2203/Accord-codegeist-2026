import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { maxBuffer: 20 * 1024 * 1024 });
const files = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')
  .toString()
  .split('\0')
  .filter(Boolean);
const patterns = [
  /AIza[0-9A-Za-z_-]{30,}/,
  /sk-(?:ant-)?[A-Za-z0-9_-]{35,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
let blocked = false;
for (const file of files) {
  if (
    /(^|\/)private\//i.test(file) ||
    /\.private\./i.test(file) ||
    (/(^|\/)\.env(?:\..*)?$/.test(file) && !file.endsWith('.env.example'))
  ) {
    console.error(`BLOCKED: ${file} must stay local.`);
    blocked = true;
    continue;
  }
  const bytes = git('show', `:${file}`);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  if (patterns.some((pattern) => pattern.test(text))) {
    console.error(`BLOCKED: ${file} resembles a credential or private key.`);
    blocked = true;
  }
  if (file.endsWith('.env.example') && /^[ \t]*[A-Z][A-Z0-9_]*[ \t]*=[ \t]*\S.*$/m.test(text)) {
    console.error(`BLOCKED: ${file} must contain empty example values.`);
    blocked = true;
  }
}
if (blocked) {
  console.error(
    'No commit was created. Remove private files or credentials from the staged index.',
  );
  process.exitCode = 1;
}
