import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Toast context
const ToastContext = createContext(null);

// Generate unique IDs for toasts
let toastId = 0;
const generateId = () => ++toastId;

// Toast types
const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Default durations in milliseconds
const DEFAULT_DURATION = 5000; // 5 seconds

// Maximum number of toasts visible at once
const MAX_TOASTS = 5;

// Toast Provider component
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Remove a toast by ID
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Add a toast
  const addToast = useCallback((message, type = TOAST_TYPES.INFO, duration = DEFAULT_DURATION) => {
    const id = generateId();
    const newToast = {
      id,
      message,
      type,
      duration,
      createdAt: Date.now()
    };

    setToasts((prev) => {
      // Limit the number of toasts
      const currentToasts = prev.length >= MAX_TOASTS ? prev.slice(1) : prev;
      return [...currentToasts, newToast];
    });

    // Auto-dismiss if duration > 0
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast]);

  // Convenience methods
  const success = useCallback((message, duration) => {
    return addToast(message, TOAST_TYPES.SUCCESS, duration);
  }, [addToast]);

  const error = useCallback((message, duration) => {
    return addToast(message, TOAST_TYPES.ERROR, duration);
  }, [addToast]);

  const warning = useCallback((message, duration) => {
    return addToast(message, TOAST_TYPES.WARNING, duration);
  }, [addToast]);

  const info = useCallback((message, duration) => {
    return addToast(message, TOAST_TYPES.INFO, duration);
  }, [addToast]);

  // Clear all toasts
  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value = {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
    clearAll
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

// Toast Container component - renders all toasts stacked
function ToastContainer({ toasts, removeToast }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-3 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
          index={index}
        />
      ))}
    </div>
  );
}

// Individual Toast component
function Toast({ toast, onDismiss, index }) {
  const [isExiting, setIsExiting] = useState(false);

  // Handle dismiss with animation
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 200); // Match animation duration
  }, [onDismiss]);

  // Get styles based on toast type
  const getStyles = () => {
    switch (toast.type) {
      case TOAST_TYPES.SUCCESS:
        return {
          container: 'bg-green-50 border-green-200 text-green-800',
          icon: (
            <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ),
          closeBtn: 'text-green-500 hover:text-green-700 hover:bg-green-100'
        };
      case TOAST_TYPES.ERROR:
        return {
          container: 'bg-red-50 border-red-200 text-red-800',
          icon: (
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ),
          closeBtn: 'text-red-500 hover:text-red-700 hover:bg-red-100'
        };
      case TOAST_TYPES.WARNING:
        return {
          container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
          icon: (
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ),
          closeBtn: 'text-yellow-500 hover:text-yellow-700 hover:bg-yellow-100'
        };
      case TOAST_TYPES.INFO:
      default:
        return {
          container: 'bg-blue-50 border-blue-200 text-blue-800',
          icon: (
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          ),
          closeBtn: 'text-blue-500 hover:text-blue-700 hover:bg-blue-100'
        };
    }
  };

  const styles = getStyles();

  return (
    <div
      role="alert"
      className={`
        pointer-events-auto
        min-w-[320px] max-w-md
        flex items-start gap-3
        px-4 py-3
        bg-white border rounded-lg shadow-lg
        transform transition-all duration-200 ease-out
        ${styles.container}
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
      `}
      style={{
        animation: !isExiting ? 'slideIn 0.2s ease-out' : undefined
      }}
    >
      <style>
        {`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(1rem);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}
      </style>

      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {styles.icon}
      </div>

      {/* Message */}
      <div className="flex-1 text-sm font-medium">
        {toast.message}
      </div>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className={`flex-shrink-0 p-1 rounded-md transition-colors ${styles.closeBtn}`}
        aria-label="Dismiss notification"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Custom hook to use toast
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default ToastContext;
