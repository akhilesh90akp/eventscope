/**
 * Main Entry Point - Application bootstrap
 *
 * Mounts the React application to the DOM root element.
 * Wraps the app in StrictMode for development warnings
 * and ErrorBoundary to prevent blank white screens on crashes.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// Mount the app to the #root element in index.html
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
