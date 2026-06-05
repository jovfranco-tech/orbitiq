import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#0a0a0f',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#ff4444', marginBottom: '1rem' }}>OrbitIQ Encountered an Error</h1>
          <p style={{ maxWidth: '600px', opacity: 0.8, lineHeight: 1.6, marginBottom: '2rem' }}>
            A critical rendering or WebGL initialization error occurred. OrbitIQ has entered a safe fallback state to prevent your browser from freezing.
          </p>
          <div style={{
            backgroundColor: 'rgba(255, 68, 68, 0.1)',
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255, 68, 68, 0.2)',
            maxWidth: '600px',
            width: '100%',
            textAlign: 'left',
            fontFamily: 'monospace',
            overflowX: 'auto'
          }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '2rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ffffff',
              color: '#000000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Reload Command Center
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
