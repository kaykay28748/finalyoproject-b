import React from 'react';
import './ErrorBoundary.css';

/**
 * Error Boundary — catches React errors in child components
 * Prevents entire app from crashing when something goes wrong
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    this.setState({
      error,
      errorInfo
    });
    // Could send to error tracking service like Sentry here
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.navigator.vibrate?.(10);
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;

      return (
        <div className="error-boundary-container">
          <div className="error-boundary-card">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title">Something went wrong</h2>
            <p className="error-message">
              The app encountered an unexpected error. Try refreshing the page or check your internet connection.
            </p>

            {isDev && this.state.error && (
              <details className="error-details">
                <summary>Error details (dev only)</summary>
                <pre className="error-stack">
                  <code>{this.state.error.toString()}</code>
                </pre>
                {this.state.errorInfo && (
                  <pre className="error-stack">
                    <code>{this.state.errorInfo.componentStack}</code>
                  </pre>
                )}
              </details>
            )}

            <div className="error-actions">
              <button className="error-btn error-btn--reset" onClick={this.handleReset}>
                Try again
              </button>
              <button className="error-btn error-btn--refresh" onClick={() => { window.navigator.vibrate?.(10); window.location.reload(); }}>
                Refresh page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
