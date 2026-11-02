import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { isLive } from './client';
import { IssueDecisions, PageCommitments } from './Surfaces';
import './styles.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-800.css';

/** One bundle serves the global page and the contextual Jira/Confluence modules. */
async function chooseView(): Promise<React.ReactNode> {
  if (!isLive) {
    // Local previews of the contextual modules, using the fictional demo data.
    const params = new URLSearchParams(window.location.search);
    if (params.get('surface') === 'page') return <PageCommitments pageId="1001" />;
    if (params.get('surface') === 'issue')
      return <IssueDecisions issueKey={params.get('issue') ?? 'PLAT-142'} />;
    return <App />;
  }
  const { view } = await import('@forge/bridge');
  const context: any = await view.getContext();
  if (context.moduleKey === 'accord-page-commitments' && context.extension?.content?.id)
    return <PageCommitments pageId={String(context.extension.content.id)} />;
  if (context.moduleKey === 'accord-issue-decisions' && context.extension?.issue?.key)
    return <IssueDecisions issueKey={String(context.extension.issue.key)} />;
  return <App />;
}

chooseView().then((node) =>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>{node}</React.StrictMode>,
  ),
);
