import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const guard = resolve('scripts/check-staged.mjs');
let repository: string;
function stage(name: string, content: string) {
  const path = join(repository, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  execFileSync('git', ['add', '--', name], { cwd: repository });
}
function runGuard() {
  return spawnSync(process.execPath, [guard], { cwd: repository, encoding: 'utf8' });
}
beforeEach(() => {
  repository = mkdtempSync(join(tmpdir(), 'accord-guard-'));
  execFileSync('git', ['init', '-q'], { cwd: repository });
});
afterEach(() => {
  rmSync(repository, { recursive: true, force: true });
});

describe('public repository guard', () => {
  it('blocks private files even if explicitly staged', () => {
    stage('private/00-strategy.md', 'Internal research');
    expect(runGuard().status).toBe(1);
  });
  it('allows empty environment examples and rejects a single-character value', () => {
    stage('.env.example', 'FORGE_EMAIL=\nAPI_TOKEN=\n');
    expect(runGuard().status).toBe(0);
    stage('.env.example', 'API_TOKEN=x\n');
    expect(runGuard().status).toBe(1);
  });
  it('checks staged blobs even after a working copy is cleaned', () => {
    stage('config.txt', 'ghp_' + 'x'.repeat(40));
    writeFileSync(join(repository, 'config.txt'), 'Now clean');
    expect(runGuard().status).toBe(1);
  });
  it('does not scan unstaged local changes as published content', () => {
    stage('config.txt', 'No credentials');
    writeFileSync(join(repository, 'config.txt'), 'ghp_' + 'x'.repeat(40));
    expect(runGuard().status).toBe(0);
  });
});
