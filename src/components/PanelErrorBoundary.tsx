import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  panelName?: string;
}

interface State {
  hasError: boolean;
}

export class PanelErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PanelErrorBoundary] ${this.props.panelName ?? 'Panel'} crashed:`, error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="card glass"
          role="alert"
          style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <span style={{ fontSize: '11px', color: 'var(--danger)', fontFamily: 'var(--mono)', letterSpacing: '.06em' }}>
            PANEL ERROR
          </span>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
            {this.props.panelName ?? 'This panel'} encountered an error and has been isolated.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{ alignSelf: 'flex-start', fontSize: '11px', padding: '4px 10px' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
