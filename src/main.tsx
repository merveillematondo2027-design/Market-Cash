import { logService } from './services/logService';
import React, { StrictMode, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Capture global errors
window.addEventListener('error', (event) => {
  logService.critical('SYSTEM', 'JAVASCRIPT_ERROR', event.error || new Error(event.message), {
    route: window.location.pathname,
    metadata: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    }
  });
});

window.addEventListener('unhandledrejection', (event) => {
  logService.critical('SYSTEM', 'UNHANDLED_PROMISE_REJECTION', event.reason, {
    route: window.location.pathname
  });
});


interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Une erreur est survenue.</h1>
          <p className="text-slate-600 mb-6">{this.state.error?.message || "Erreur inattendue"}</p>
          <div className="space-x-4">
            <button 
              onClick={() => window.location.reload()} 
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Réessayer
            </button>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.href = '/login';
              }} 
              className="bg-slate-200 text-slate-800 px-6 py-2 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

