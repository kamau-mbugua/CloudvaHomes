import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isChunkLoadError, reloadOnce } from '../lib/chunkReload';
import { CardSkeleton } from './Loading';

interface Props {
  children: ReactNode;
  /** Where "Go to the start" leads: the shell's home, e.g. `/app` or `/tenant`. */
  homePath: string;
  /** A change (the route) clears a shown error, so the next page gets a fresh try. */
  resetKey: string;
}

interface State {
  error: Error | null;
  /** The resetKey the current state belongs to. */
  key: string;
}

/**
 * Catches a page that fails to render or to load its code, so the shell (menu, top bar)
 * stays usable. A failed code-split import after a deploy reloads the tab once instead.
 * A class component because React has no hook for catching render errors.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  /** Moving to another page clears a shown error (without remounting the page tree). */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { key: props.resetKey, error: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnce(window.sessionStorage, () => window.location.reload())) return;
    console.error('Page crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="es eb" role="alert">
        <p className="es__title">Something went wrong on this page.</p>
        <p className="es__detail">
          Reloading usually fixes it. If it keeps happening, tell us what you were doing and we will look into it.
        </p>
        <div className="es__actions">
          <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <Link className="nx-btn nx-btn--sm" to={this.props.homePath}>Go to the start</Link>
        </div>
      </div>
    );
  }
}

/**
 * A shell's page area: errors stay inside it, and a page still downloading its code shows a
 * skeleton here instead of blanking the whole shell.
 */
export function PageBoundary({ homePath, children }: { homePath: string; children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary homePath={homePath} resetKey={pathname}>
      <Suspense fallback={<CardSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
