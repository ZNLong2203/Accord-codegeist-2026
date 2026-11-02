import { BookOpen, ExternalLink, GitBranch } from 'lucide-react';
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="m6 25 10-18 10 18M10 18h12" />
      </svg>
    </span>
  );
}

export function SourceIcon({ type }: { type: 'jira' | 'confluence' }) {
  return type === 'jira' ? (
    <span className="source-icon jira">
      <GitBranch size={13} />
    </span>
  ) : (
    <span className="source-icon confluence">
      <BookOpen size={13} />
    </span>
  );
}

export function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function time(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeSourceUrl(url: string) {
  return (
    /^https:\/\/[^/]+\.atlassian\.net\//.test(url) ||
    url.startsWith('/browse/') ||
    url.startsWith('/wiki/')
  );
}
/** Forge Custom UI runs in a sandboxed frame, so links must open through the host router. */
export async function openSource(url: string) {
  try {
    const { router } = await import('@forge/bridge');
    await router.open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function SourceLink({
  url,
  demo,
  children,
}: {
  url?: string;
  demo: boolean;
  children: React.ReactNode;
}) {
  if (!url || demo || !safeSourceUrl(url))
    return (
      <span className="source-label">
        {children}
        {demo && <span className="fixture-label">Demo source</span>}
      </span>
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        event.preventDefault();
        void openSource(url);
      }}
    >
      {children}
      <ExternalLink size={12} />
    </a>
  );
}
