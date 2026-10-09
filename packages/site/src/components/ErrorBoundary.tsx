import { Component, type ErrorInfo, type ReactNode } from "react";
import { href } from "../lib/router";

interface Props {
  children: ReactNode;
  /** A new key starts the boundary again, for example after a change of the page. */
  resetKey: string;
}

interface State {
  error: Error | null;
  key: string;
}

/**
 * The boundary shows a message instead of a white page when a page throws while it renders
 * (deep dive SITE-6: a link with 3000 nested lists overflowed the stack).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("The page stopped with an error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel error-panel" role="alert">
        <h1>This page stopped with an error</h1>
        <p>
          <code>{this.state.error.message}</code>
        </p>
        <p>A link can hold a program that is too large for the page. Open an empty Composer, or go to the home page.</p>
        <p className="hero-actions">
          <a className="primary" href={href("composer", undefined, { example: "nested" })}>
            Open the Composer
          </a>
          <a className="secondary" href={href("")}>
            Home page
          </a>
        </p>
      </section>
    );
  }
}
