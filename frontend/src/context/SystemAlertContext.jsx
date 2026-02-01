import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

// Context for system-wide critical alerts
const SystemAlertContext = createContext(null);

// Alert types
const ALERT_TYPES = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Generate unique IDs
let alertId = 0;
const generateId = () => ++alertId;

const API_BASE = '/api';

// System Alert Provider
export function SystemAlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [healthStatus, setHealthStatus] = useState(null);
  const healthCheckInterval = useRef(null);
  const lastHealthCheck = useRef(null);

  // Remove an alert by ID
  const removeAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  // Add a persistent alert (does NOT auto-dismiss)
  const addAlert = useCallback((message, type = ALERT_TYPES.ERROR, options = {}) => {
    const id = options.id || generateId();
    const {
      service = null,
      guidance = null,
      dismissible = true
    } = options;

    // Check if an alert with this ID already exists (prevent duplicates)
    setAlerts((prev) => {
      const existingIndex = prev.findIndex(a => a.id === id);
      const newAlert = {
        id,
        message,
        type,
        service,
        guidance,
        dismissible,
        createdAt: Date.now()
      };

      if (existingIndex >= 0) {
        // Update existing alert
        const updated = [...prev];
        updated[existingIndex] = newAlert;
        return updated;
      }

      // Add new alert
      return [...prev, newAlert];
    });

    return id;
  }, []);

  // Remove alerts for a specific service
  const clearServiceAlerts = useCallback((service) => {
    setAlerts((prev) => prev.filter((alert) => alert.service !== service));
  }, []);

  // Clear all alerts
  const clearAll = useCallback(() => {
    setAlerts([]);
  }, []);

  // Check health of all services
  const checkHealth = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        // User not logged in, skip health checks
        return null;
      }

      const response = await fetch(`${API_BASE}/settings/health`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        // API itself is down
        addAlert(
          'Unable to connect to the server. Please check your connection.',
          ALERT_TYPES.ERROR,
          {
            id: 'server-connection',
            service: 'server',
            guidance: 'Try refreshing the page. If the problem persists, the server may be down.',
            dismissible: true
          }
        );
        return null;
      }

      // Clear server connection alert if we got a response
      setAlerts(prev => prev.filter(a => a.id !== 'server-connection'));

      const data = await response.json();
      setHealthStatus(data.health);
      lastHealthCheck.current = Date.now();

      // Process health status and create/update alerts (include queue status)
      processHealthAlerts(data.health, data.queueStatus);

      return data.health;
    } catch (error) {
      console.error('Health check failed:', error);
      addAlert(
        'Unable to connect to the server. Please check your connection.',
        ALERT_TYPES.ERROR,
        {
          id: 'server-connection',
          service: 'server',
          guidance: 'Try refreshing the page. If the problem persists, the server may be down.',
          dismissible: true
        }
      );
      return null;
    }
  }, [addAlert]);

  // Process health data and create/remove alerts as needed
  const processHealthAlerts = useCallback((health, queueStatus) => {
    if (!health) return;

    const serviceGuidance = {
      telnyx: {
        error: 'Check your Telnyx API key in Settings. Make sure your Telnyx account is active.',
        invalid_credentials: 'Your Telnyx API key appears to be invalid. Go to Settings to update it.'
      },
      deepgram: {
        error: 'Check your Deepgram API key in Settings. Make sure your Deepgram account is active.',
        invalid_credentials: 'Your Deepgram API key appears to be invalid. Go to Settings to update it.'
      },
      followupboss: {
        error: 'Check your Follow-up Boss API key in Settings. Make sure your FUB account is active.',
        invalid_credentials: 'Your Follow-up Boss API key appears to be invalid. Go to Settings to update it.'
      },
      openai: {
        error: 'Check your OpenAI API key in Settings. Make sure your OpenAI account is active and has credits.',
        invalid_credentials: 'Your OpenAI API key appears to be invalid. Go to Settings to update it.'
      }
    };

    const serviceNames = {
      telnyx: 'Telnyx',
      deepgram: 'Deepgram',
      followupboss: 'Follow-up Boss',
      openai: 'OpenAI'
    };

    // Check each service and manage alerts
    Object.entries(health).forEach(([service, status]) => {
      const alertId = `service-${service}`;
      const serviceName = serviceNames[service] || service;

      if (status.status === 'error' || status.status === 'invalid_credentials') {
        let guidance = serviceGuidance[service]?.[status.status] ||
          `Go to Settings to check your ${serviceName} configuration.`;

        // Special handling for Follow-up Boss - include queue pause info
        let message = `${serviceName} service is unavailable: ${status.message}`;
        if (service === 'followupboss' && queueStatus?.pausedReason === 'fub_outage') {
          message = `Follow-up Boss is disconnected. Call queue has been automatically paused.`;
          guidance = 'No new calls will be made until Follow-up Boss connection is restored. Check your FUB API key in Settings or wait for the service to come back online.';
        }

        addAlert(
          message,
          ALERT_TYPES.ERROR,
          {
            id: alertId,
            service,
            guidance,
            dismissible: true
          }
        );
      } else {
        // Service is OK, remove any existing alert for it
        setAlerts(prev => prev.filter(a => a.id !== alertId));
      }
    });

    // Handle queue auto-resumed alert
    if (queueStatus?.autoAction === 'resumed') {
      addAlert(
        'Follow-up Boss connection restored. Call queue has been automatically resumed.',
        ALERT_TYPES.INFO,
        {
          id: 'fub-restored',
          service: 'followupboss',
          guidance: 'Calls will continue from where they left off.',
          dismissible: true
        }
      );
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== 'fub-restored'));
      }, 5000);
    }
  }, [addAlert]);

  // Start periodic health checks when user is logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      // Clear any alerts if user logs out
      clearAll();
      return;
    }

    // Initial health check after a short delay
    const initialCheck = setTimeout(() => {
      checkHealth();
    }, 2000);

    // Periodic health check every 60 seconds
    healthCheckInterval.current = setInterval(() => {
      checkHealth();
    }, 60000);

    return () => {
      clearTimeout(initialCheck);
      if (healthCheckInterval.current) {
        clearInterval(healthCheckInterval.current);
      }
    };
  }, [checkHealth, clearAll]);

  const value = {
    alerts,
    healthStatus,
    addAlert,
    removeAlert,
    clearServiceAlerts,
    clearAll,
    checkHealth,
    ALERT_TYPES
  };

  return (
    <SystemAlertContext.Provider value={value}>
      {children}
      <SystemAlertBanner alerts={alerts} removeAlert={removeAlert} />
    </SystemAlertContext.Provider>
  );
}

// System Alert Banner - displays at the top of the viewport
function SystemAlertBanner({ alerts, removeAlert }) {
  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] space-y-1">
      {alerts.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onDismiss={() => removeAlert(alert.id)}
        />
      ))}
    </div>
  );
}

// Individual Alert Item
function AlertItem({ alert, onDismiss }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Styles based on alert type
  const getStyles = () => {
    switch (alert.type) {
      case ALERT_TYPES.ERROR:
        return {
          container: 'bg-red-600 text-white',
          icon: (
            <svg className="h-5 w-5 text-red-200" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ),
          button: 'text-red-200 hover:text-white'
        };
      case ALERT_TYPES.WARNING:
        return {
          container: 'bg-yellow-500 text-yellow-900',
          icon: (
            <svg className="h-5 w-5 text-yellow-900" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ),
          button: 'text-yellow-700 hover:text-yellow-900'
        };
      case ALERT_TYPES.INFO:
      default:
        return {
          container: 'bg-blue-600 text-white',
          icon: (
            <svg className="h-5 w-5 text-blue-200" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          ),
          button: 'text-blue-200 hover:text-white'
        };
    }
  };

  const styles = getStyles();

  return (
    <div
      className={`${styles.container} shadow-lg`}
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              {styles.icon}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">
                {alert.message}
              </p>
              {alert.guidance && (
                <div className="mt-1">
                  {isExpanded ? (
                    <div className="text-sm opacity-90 space-y-2">
                      <p>{alert.guidance}</p>
                      <button
                        onClick={() => setIsExpanded(false)}
                        className={`text-xs underline ${styles.button}`}
                      >
                        Show less
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsExpanded(true)}
                      className={`text-xs underline ${styles.button}`}
                    >
                      What should I do?
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {alert.dismissible && (
            <button
              onClick={onDismiss}
              className={`flex-shrink-0 ml-4 p-1 rounded-md transition-colors ${styles.button}`}
              aria-label="Dismiss alert"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook to use system alerts
export function useSystemAlert() {
  const context = useContext(SystemAlertContext);
  if (!context) {
    throw new Error('useSystemAlert must be used within a SystemAlertProvider');
  }
  return context;
}

export default SystemAlertContext;
