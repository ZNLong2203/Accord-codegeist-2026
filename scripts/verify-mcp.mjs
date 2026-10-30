import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { Client, StreamableHTTPClientTransport, auth } from '@modelcontextprotocol/client';

// Read-only, interactive tenant smoke test. Never reuse Forge CLI credentials.
const args = process.argv.slice(2);
if (args.includes('--help') || args.length < 1 || args.length > 2) {
  console.log('Usage: npm run verify:mcp -- REVIEW-ISSUE [SELECTED-PAGE-ID]');
  console.log('Lists Accord tools and calls the four read-only actions after OAuth consent.');
  console.log(
    'Credentials stay in memory. Tool output can contain tenant data; do not publish it.',
  );
  process.exit(args.includes('--help') ? 0 : 1);
}
const [anchorIssue, pageId] = args;
if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(anchorIssue) || (pageId && !/^\d+$/.test(pageId)))
  throw new Error('Provide a Jira issue key and, optionally, a numeric selected page ID.');

const endpoint = new URL('https://mcp.atlassian.com/forge/f75a1254-6dee-42d5-9902-76d221db15cc');
const expectedTools = ['inspect-release', 'simulate-scope', 'suggest-scope', 'decision-change'];
const readScopes = ['read:jira-work', 'read:page:confluence'];
const state = randomBytes(32).toString('base64url');
const callbackPort = Number(process.env.MCP_CALLBACK_PORT ?? 0);
if (
  !Number.isInteger(callbackPort) ||
  (callbackPort !== 0 && (callbackPort < 1024 || callbackPort > 65535))
)
  throw new Error('MCP_CALLBACK_PORT must be 0 or an integer from 1024 to 65535.');
let clientInfo, tokenSet, verifier, discoveryState, resolveCallback, rejectCallback;
const callback = new Promise((resolve, reject) => {
  resolveCallback = resolve;
  rejectCallback = reject;
});
// The callback may fail before the initial connection rejects for missing auth.
callback.catch(() => {});
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/callback' || request.method !== 'GET') {
    response.writeHead(404).end();
    return;
  }
  const incoming = Buffer.from(url.searchParams.get('state') ?? '');
  const expected = Buffer.from(state);
  if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
    response.writeHead(400).end('Invalid OAuth state.');
    return;
  }
  if (url.searchParams.has('error') || !url.searchParams.get('code')) {
    response.writeHead(400).end('Authorization was not completed.');
    rejectCallback(new Error('Authorization was denied or incomplete.'));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
  response.end('Consent received. Return to the terminal for the verification result.');
  console.log('OAuth callback state validated; exchanging the code without logging it.');
  resolveCallback(url.searchParams);
});
server.listen(callbackPort, '127.0.0.1');
await once(server, 'listening');
const redirectUrl = `http://127.0.0.1:${server.address().port}/callback`;
const authProvider = {
  redirectUrl,
  clientMetadata: {
    client_name: 'Accord read-only verification',
    redirect_uris: [redirectUrl],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: readScopes.join(' '),
  },
  state: () => state,
  clientInformation: () => clientInfo,
  discoveryState: () => discoveryState,
  saveDiscoveryState: (value) => {
    discoveryState = value;
  },
  saveClientInformation: (value) => {
    clientInfo = value;
  },
  tokens: () => tokenSet,
  saveTokens: (value) => {
    tokenSet = value;
    console.log('OAuth token received in memory; no credentials written to disk.');
  },
  codeVerifier: () => verifier,
  saveCodeVerifier: (value) => {
    verifier = value;
  },
  redirectToAuthorization: (url) => {
    if (url.protocol !== 'https:' || url.hostname !== 'auth.atlassian.com')
      throw new Error('Unexpected authorization destination.');
    const requested = (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean);
    if (!requested.length || requested.some((scope) => !readScopes.includes(scope)))
      throw new Error('Authorization requested permissions beyond the read-only allowlist.');
    // Keep consent explicit without requesting offline access. Resource selection
    // follows MCP discovery; do not add a proprietary 3LO audience parameter.
    url.searchParams.set('prompt', 'consent');
    console.log('Open this Atlassian consent URL in your browser:');
    console.log(url.href);
  },
};
const transport = new StreamableHTTPClientTransport(endpoint, {
  authProvider,
  onInsufficientScope: 'throw',
});
const client = new Client({ name: 'accord-read-only-verification', version: '1.0.0' });
const deadline = setTimeout(
  () => {
    rejectCallback(new Error('Consent timed out. Run the command again.'));
    server.close();
  },
  10 * 60 * 1000,
);
const timeout = { timeout: 30_000 };
try {
  // Explicit scope selection avoids adopting the server's broad advertised
  // scope union (which includes unrelated write capabilities).
  const authOptions = { serverUrl: endpoint, scope: readScopes.join(' ') };
  if ((await auth(authProvider, authOptions)) === 'REDIRECT') {
    const params = await callback;
    if (
      (await auth(authProvider, {
        ...authOptions,
        authorizationCode: params.get('code'),
        ...(params.get('iss') ? { iss: params.get('iss') } : {}),
      })) !== 'AUTHORIZED'
    )
      throw new Error('Authorization did not finish.');
  }
  await client.connect(transport);
  let cursor;
  const tools = [];
  for (let page = 0; page < 10; page++) {
    const listing = await client.listTools(cursor ? { cursor } : undefined, timeout);
    tools.push(...listing.tools);
    cursor = listing.nextCursor;
    if (!cursor) break;
  }
  if (cursor) throw new Error('Tool listing exceeded its pagination bound.');
  console.log('Discovered tools:', tools.map((tool) => tool.name).join(', '));
  // Do not guess tool names or call unrelated tools from a shared endpoint.
  for (const name of expectedTools) {
    if (!tools.some((tool) => tool.name === name))
      throw new Error(
        `Expected tool ${name} was not discovered. Check the site/environment and admin settings.`,
      );
  }
  const call = async (name, input) => {
    if (!expectedTools.includes(name)) throw new Error('Tool is outside the read-only allowlist.');
    const result = await client.callTool({ name, arguments: input }, undefined, timeout);
    if (result.isError)
      throw new Error(`${name} returned a tool error. Inspect the app on the selected site.`);
    console.log(`\n${name}:`);
    console.log(JSON.stringify(result, null, 2));
    return result;
  };
  await call('inspect-release', { anchorIssue });
  await call('suggest-scope', { anchorIssue });
  // An empty exclusion list exercises simulation without choosing a real deferral.
  await call('simulate-scope', { anchorIssue, excludedKeys: '' });
  if (pageId) await call('decision-change', { anchorIssue, pageId });
  console.log('\nRead-only calls completed. Compare findings and snapshot labels with the UI.');
} catch (error) {
  // SDK/network errors can include request details. Print only their class here.
  console.error(`MCP verification did not complete (${error?.constructor?.name ?? 'Error'}).`);
  if (!tokenSet)
    console.error('No OAuth token received. See docs/agents.md for consent troubleshooting.');
  if (error?.message?.startsWith('Expected tool ') || error?.message?.includes('timed out'))
    console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await client.close().catch(() => {});
  server.closeAllConnections();
  server.close();
  tokenSet = clientInfo = verifier = discoveryState = undefined;
}
