import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-[var(--floor-light)]">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-3">{'\u{1F6A8}'}</div>
            <div className="text-gray-800 font-semibold mb-2">Something went wrong</div>
            <div className="text-gray-500 text-sm mb-4">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
