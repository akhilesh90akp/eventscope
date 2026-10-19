/**
 * Main Entry Point - Application bootstrap
 *
 * Mounts the React application to the DOM root element.
 * Wraps the app in StrictMode for development warnings
 * and ErrorBoundary to prevent blank white screens on crashes, and
 * ConfirmProvider for the app's own confirmation pop-ups (useConfirm).
 */

// ============================================================
// IMPORTS
// ============================================================
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ConfirmProvider } from './components/ConfirmDialog'

// ============================================================
// MOUNT — the #root element in index.html
// ============================================================
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ErrorBoundary>
  </StrictMode>,
)
