import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

const API_BASE = '/api';

// API key format validation rules by service (same as backend)
const apiKeyValidation = {
  telnyx: {
    validate: (key) => {
      if (key.length < 20) return false;
      return /^[A-Za-z0-9_-]+$/.test(key);
    },
    formatHint: 'At least 20 characters (alphanumeric, underscores, hyphens)'
  },
  deepgram: {
    validate: (key) => {
      if (key.length < 20) return false;
      return /^[A-Za-z0-9]+$/.test(key);
    },
    formatHint: 'At least 20 alphanumeric characters'
  },
  followupboss: {
    validate: (key) => {
      // FUB API keys can start with fka_ prefix and contain underscores
      if (key.length < 10) return false;
      return /^[A-Za-z0-9_]+$/.test(key);
    },
    formatHint: 'At least 10 characters (alphanumeric and underscores, e.g., fka_xxx...)'
  },
  openai: {
    validate: (key) => {
      if (!key.startsWith('sk-')) return false;
      if (key.length < 20) return false;
      return /^sk-[A-Za-z0-9_-]+$/.test(key);
    },
    formatHint: 'Must start with "sk-" and be at least 20 characters'
  }
};

// SignalWire credential validation
const signalwireValidation = {
  'project-id': {
    validate: (value) => {
      // Project ID is typically a UUID or at least 10 characters
      if (!value || value.trim().length < 10) return false;
      return /^[A-Za-z0-9-]+$/.test(value);
    },
    formatHint: 'Project ID should be a UUID (e.g., 93a12345-6789-abcd...) or at least 10 characters'
  },
  'api-token': {
    validate: (value) => {
      // API Token is typically alphanumeric, at least 10 characters
      if (!value || value.trim().length < 10) return false;
      return /^[A-Za-z0-9_-]+$/.test(value);
    },
    formatHint: 'API Token should be at least 10 characters (alphanumeric, underscores, hyphens)'
  },
  'space-url': {
    validate: (value) => {
      // Space URL should be a valid domain format
      if (!value || value.trim().length < 5) return false;
      // Basic URL/domain validation
      return /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.trim());
    },
    formatHint: 'Space URL should be a valid domain (e.g., your-space.signalwire.com)'
  }
};

// Provider-specific help content
const providerHelpContent = {
  telnyx: {
    title: 'Telnyx Help',
    description: 'Telnyx provides voice and messaging services for automated calling.',
    gettingStarted: [
      'Sign up at telnyx.com and navigate to the API Keys section',
      'Create a new API key with Voice and Messaging permissions',
      'Copy the API key and paste it in the field above',
      'Purchase a phone number in the Telnyx portal',
      'Configure webhooks for call events (optional)'
    ],
    docLink: 'https://developers.telnyx.com/docs/api/v2/overview',
    docLabel: 'Telnyx API Documentation',
    credentials: {
      apiKey: {
        label: 'Telnyx API Key',
        tooltip: 'Found in your Telnyx dashboard under API Keys. Requires Voice and Messaging permissions.',
        format: 'At least 20 characters (alphanumeric, underscores, hyphens)'
      },
      phoneNumber: {
        label: 'Phone Number',
        tooltip: 'Purchase a phone number in the Telnyx portal. Format: +1XXXXXXXXXX',
        format: 'E.164 format (e.g., +15551234567)'
      }
    }
  },
  signalwire: {
    title: 'SignalWire Help',
    description: 'SignalWire provides voice and messaging services with compatible APIs.',
    gettingStarted: [
      'Sign up at signalwire.com and create a new Space',
      'Navigate to your Space settings to find credentials',
      'Copy the Project ID, API Token, and Space URL',
      'Paste each credential in the corresponding field above',
      'Purchase a phone number in the SignalWire portal'
    ],
    docLink: 'https://signalwire.com/docs',
    docLabel: 'SignalWire Documentation',
    credentials: {
      apiToken: {
        label: 'API Token',
        tooltip: 'Found in your SignalWire Space settings. This token authenticates API requests.',
        format: 'At least 10 characters (alphanumeric, underscores, hyphens)'
      },
      projectId: {
        label: 'Project ID',
        tooltip: 'UUID identifier for your SignalWire Space. Found in Space settings.',
        format: 'UUID format (e.g., 93a12345-6789-abcd-...)'
      },
      spaceUrl: {
        label: 'Space URL',
        tooltip: 'Your SignalWire Space domain name. Used for API and WebSocket connections.',
        format: 'Domain format (e.g., your-space.signalwire.com)'
      }
    }
  }
};

const Settings = () => {
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState({
    telnyx: { configured: false, masked: null },
    deepgram: { configured: false, masked: null },
    followupboss: { configured: false, masked: null },
    openai: { configured: false, masked: null }
  });
  const [signalwireCredentials, setSignalwireCredentials] = useState({
    projectId: { configured: false, masked: null },
    apiToken: { configured: false, masked: null },
    spaceUrl: { configured: false, masked: null }
  });
  const [health, setHealth] = useState({
    telnyx: { status: 'not_configured', message: 'Not checked' },
    deepgram: { status: 'not_configured', message: 'Not checked' },
    followupboss: { status: 'not_configured', message: 'Not checked' },
    openai: { status: 'not_configured', message: 'Not checked' }
  });
  const [telnyxPhone, setTelnyxPhone] = useState('');
  const [telephonyProvider, setTelephonyProvider] = useState('telnyx');
  // Phone numbers from active provider
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [defaultPhoneNumber, setDefaultPhoneNumber] = useState(null);
  const [phoneNumbersLoading, setPhoneNumbersLoading] = useState(false);
  const [phoneNumbersError, setPhoneNumbersError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [providerConnectionStatus, setProviderConnectionStatus] = useState('not_checked'); // 'not_checked', 'connected', 'disconnected', 'checking'
  const [saving, setSaving] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  // Password confirmation modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [pendingSaveService, setPendingSaveService] = useState(null);
  const [pendingSaveKey, setPendingSaveKey] = useState('');
  // SignalWire credentials editing state
  const [editingSignalwireField, setEditingSignalwireField] = useState(null);
  const [newSignalwireValue, setNewSignalwireValue] = useState('');
  const [pendingSaveSignalwireField, setPendingSaveSignalwireField] = useState(null);
  const [pendingSaveSignalwireValue, setPendingSaveSignalwireValue] = useState('');
  // Provider switch confirmation modal state
  const [showProviderSwitchModal, setShowProviderSwitchModal] = useState(false);
  const [pendingProvider, setPendingProvider] = useState(null);
  const [activeCallsCount, setActiveCallsCount] = useState(0);
  const [queuedCallsCount, setQueuedCallsCount] = useState(0);
  const [checkingCalls, setCheckingCalls] = useState(false);

  // AbortController ref for cancelling ongoing requests on unmount/navigation
  const abortControllerRef = useRef(null);

  // Get auth token from localStorage
  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  };

  // Fetch API key statuses
  const fetchApiKeys = async (signal = null) => {
    try {
      const response = await fetch(`${API_BASE}/settings/api-keys`, {
        signal,
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (response.ok) {
        setApiKeys(data.apiKeys);
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch API keys:', err);
    }
  };

  // Fetch Telnyx phone number
  const fetchTelnyxPhone = async (signal = null) => {
    try {
      const response = await fetch(`${API_BASE}/settings/telnyx-phone`, {
        signal,
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (response.ok && data.phoneNumber) {
        setTelnyxPhone(data.phoneNumber);
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch Telnyx phone:', err);
    }
  };

  // Fetch telephony provider selection
  const fetchTelephonyProvider = async (signal = null) => {
    try {
      const response = await fetch(`${API_BASE}/settings/telephony-provider`, {
        signal,
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (response.ok && data.provider) {
        setTelephonyProvider(data.provider);
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch telephony provider:', err);
    }
  };

  // Fetch phone numbers from active provider
  const fetchPhoneNumbers = async (signal = null) => {
    try {
      setPhoneNumbersLoading(true);
      setPhoneNumbersError(null);

      const response = await fetch(`${API_BASE}/settings/phone-numbers`, {
        signal,
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok) {
        setPhoneNumbers(data.phoneNumbers || []);
        setDefaultPhoneNumber(data.defaultPhoneNumber || null);
      } else {
        setPhoneNumbersError(data.error || 'Failed to fetch phone numbers');
        setPhoneNumbers([]);
        setDefaultPhoneNumber(null);
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch phone numbers:', err);
      setPhoneNumbersError('Failed to fetch phone numbers');
      setPhoneNumbers([]);
      setDefaultPhoneNumber(null);
    } finally {
      setPhoneNumbersLoading(false);
    }
  };

  // Save default phone number
  const saveDefaultPhoneNumber = async (phoneNumber) => {
    try {
      setSaving(prev => ({ ...prev, defaultPhoneNumber: true }));
      setError(null);

      const response = await fetch(`${API_BASE}/settings/default-phone-number`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phoneNumber })
      });

      const data = await response.json();

      if (response.ok) {
        setDefaultPhoneNumber(data.phoneNumber);
        setSuccess('Default phone number saved');
        toast.success('Default phone number saved');
      } else {
        const errorMsg = data.error || 'Failed to save default phone number';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Failed to save default phone number:', err);
      setError('Failed to save default phone number');
      toast.error('Failed to save default phone number');
    } finally {
      setSaving(prev => ({ ...prev, defaultPhoneNumber: false }));
    }
  };

  // Fetch SignalWire credentials
  const fetchSignalwireCredentials = async (signal = null) => {
    try {
      const response = await fetch(`${API_BASE}/settings/signalwire-credentials`, {
        signal,
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (response.ok) {
        setSignalwireCredentials(data);
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch SignalWire credentials:', err);
    }
  };

  // Check all health statuses
  const checkHealth = async (signal = null) => {
    setHealthLoading(true);
    try {
      const fetchOptions = {
        headers: getAuthHeaders(),
        ...(signal && { signal })
      };
      const response = await fetch(`${API_BASE}/settings/health`, fetchOptions);
      const data = await response.json();
      if (response.ok) {
        setHealth(data.health);
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Health check failed:', err);
    } finally {
      // Only update loading state if not aborted
      if (!signal?.aborted) {
        setHealthLoading(false);
      }
    }
  };

  // Initial data fetch
  useEffect(() => {
    // Create AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const fetchData = async () => {
      setLoading(true);
      await Promise.all([
        fetchApiKeys(abortController.signal),
        fetchTelnyxPhone(abortController.signal),
        fetchTelephonyProvider(abortController.signal),
        fetchSignalwireCredentials(abortController.signal),
        fetchPhoneNumbers(abortController.signal)
      ]);
      // Only update loading state and check health if not aborted
      if (!abortController.signal.aborted) {
        setLoading(false);
        // Auto-check health after loading
        checkHealth(abortController.signal);
      }
    };
    fetchData();

    // Cleanup function: abort request when component unmounts
    return () => {
      abortController.abort();
    };
  }, []);

  // Fetch phone numbers when telephony provider changes
  useEffect(() => {
    // Only fetch after initial load (not on mount)
    // This prevents double-fetching since we already fetch in the initial useEffect
    if (!loading) {
      const abortController = new AbortController();
      fetchPhoneNumbers(abortController.signal);
      return () => {
        abortController.abort();
      };
    }
  }, [telephonyProvider]);

  // Initiate SignalWire credential save - opens password confirmation modal for sensitive fields
  const saveSignalwireCredential = (field) => {
    const trimmedValue = newSignalwireValue.trim();

    if (!trimmedValue) {
      setError('Credential cannot be empty');
      return;
    }

    // Client-side format validation
    const validationKey = field === 'projectId' ? 'project-id' :
                         field === 'apiToken' ? 'api-token' : 'space-url';
    const validation = signalwireValidation[validationKey];
    if (validation && !validation.validate(trimmedValue)) {
      setError(`Invalid SignalWire ${getFieldLabel(field)} format. ${validation.formatHint}`);
      return;
    }

    // Store pending save info
    // Only require password for sensitive fields (project-id and api-token)
    if (field === 'projectId' || field === 'apiToken') {
      setPendingSaveSignalwireField(field);
      setPendingSaveSignalwireValue(trimmedValue);
      setPasswordConfirmation('');
      setShowPasswordModal(true);
      setError(null);
    } else {
      // Space URL doesn't require password
      confirmSaveSignalwireCredential(field, trimmedValue);
    }
  };

  // Actually save the SignalWire credential after password confirmation (if needed)
  const confirmSaveSignalwireCredential = async (field, value = null) => {
    const actualField = field || pendingSaveSignalwireField;
    const actualValue = value || pendingSaveSignalwireValue;

    if (!actualField || !actualValue) {
      return;
    }

    // Password confirmation is required for sensitive fields
    if ((actualField === 'projectId' || actualField === 'apiToken') && !passwordConfirmation) {
      setError('Password is required to confirm this change');
      return;
    }

    const fieldKey = actualField === 'projectId' ? 'project-id' :
                    actualField === 'apiToken' ? 'api-token' : 'space-url';

    setSaving(prev => ({ ...prev, [actualField]: true }));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/settings/signalwire-credentials/${fieldKey}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          value: actualValue,
          password: (actualField === 'projectId' || actualField === 'apiToken') ? passwordConfirmation : undefined
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSignalwireCredentials(prev => ({
          ...prev,
          [actualField]: { configured: true, masked: data.masked || data.value }
        }));
        setEditingSignalwireField(null);
        setNewSignalwireValue('');
        setShowPasswordModal(false);
        setPasswordConfirmation('');
        setPendingSaveSignalwireField(null);
        setPendingSaveSignalwireValue('');
        setSuccess(`SignalWire ${getFieldLabel(actualField)} saved successfully`);
        toast.success(`SignalWire ${getFieldLabel(actualField)} saved successfully`);
      } else {
        const errorMsg = data.hint ? `${data.error}: ${data.hint}` : (data.error || 'Failed to save credential');
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      setError('Failed to save credential');
      toast.error('Failed to save credential');
    } finally {
      setSaving(prev => ({ ...prev, [actualField]: false }));
    }
  };

  // Delete a SignalWire credential
  const deleteSignalwireCredential = async (field) => {
    const fieldLabel = getFieldLabel(field);
    if (!confirm(`Are you sure you want to remove the SignalWire ${fieldLabel}?`)) {
      return;
    }

    const fieldKey = field === 'projectId' ? 'project-id' :
                    field === 'apiToken' ? 'api-token' : 'space-url';

    setSaving(prev => ({ ...prev, [field]: true }));
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/settings/signalwire-credentials/${fieldKey}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        setSignalwireCredentials(prev => ({
          ...prev,
          [field]: { configured: false, masked: null }
        }));
        setSuccess(`SignalWire ${fieldLabel} removed`);
        toast.success(`SignalWire ${fieldLabel} removed`);
      }
    } catch (err) {
      setError('Failed to remove credential');
      toast.error('Failed to remove credential');
    } finally {
      setSaving(prev => ({ ...prev, [field]: false }));
    }
  };

  // Get display label for SignalWire field
  const getFieldLabel = (field) => {
    const labels = {
      projectId: 'Project ID',
      apiToken: 'API Token',
      spaceUrl: 'Space URL'
    };
    return labels[field] || field;
  };

  // Initiate API key save - opens password confirmation modal
  const saveApiKey = (service) => {
    const trimmedKey = newKeyValue.trim();

    if (!trimmedKey) {
      setError('API key cannot be empty');
      return;
    }

    // Client-side format validation
    const validation = apiKeyValidation[service];
    if (validation && !validation.validate(trimmedKey)) {
      setError(`Invalid ${getServiceName(service)} API key format. ${validation.formatHint}`);
      return;
    }

    // Store pending save info and show password modal
    setPendingSaveService(service);
    setPendingSaveKey(trimmedKey);
    setPasswordConfirmation('');
    setShowPasswordModal(true);
    setError(null);
  };

  // Actually save the API key after password confirmation
  const confirmSaveApiKey = async () => {
    // Check if this is for SignalWire credentials or regular API keys
    if (pendingSaveSignalwireField) {
      await confirmSaveSignalwireCredential();
      return;
    }

    if (!pendingSaveService || !pendingSaveKey) {
      return;
    }

    if (!passwordConfirmation) {
      setError('Password is required to confirm this change');
      return;
    }

    const service = pendingSaveService;
    const trimmedKey = pendingSaveKey;

    setSaving(prev => ({ ...prev, [service]: true }));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/settings/api-keys/${service}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ apiKey: trimmedKey, password: passwordConfirmation })
      });

      const data = await response.json();

      if (response.ok) {
        setApiKeys(prev => ({
          ...prev,
          [service]: { configured: true, masked: data.masked }
        }));
        setEditingKey(null);
        setNewKeyValue('');
        setShowPasswordModal(false);
        setPasswordConfirmation('');
        setPendingSaveService(null);
        setPendingSaveKey('');
        setSuccess(`${getServiceName(service)} API key saved successfully`);
        toast.success(`${getServiceName(service)} API key saved successfully`);
        // Re-check health for this service
        checkHealth();
      } else {
        // Show hint from backend if available
        const errorMsg = data.hint ? `${data.error}: ${data.hint}` : (data.error || 'Failed to save API key');
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      setError('Failed to save API key');
      toast.error('Failed to save API key');
    } finally {
      setSaving(prev => ({ ...prev, [service]: false }));
    }
  };

  // Cancel password confirmation modal
  const cancelPasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordConfirmation('');
    setPendingSaveService(null);
    setPendingSaveKey('');
    setPendingSaveSignalwireField(null);
    setPendingSaveSignalwireValue('');
    setError(null);
  };

  // Delete an API key
  const deleteApiKey = async (service) => {
    if (!confirm(`Are you sure you want to remove the ${getServiceName(service)} API key?`)) {
      return;
    }

    setSaving(prev => ({ ...prev, [service]: true }));
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/settings/api-keys/${service}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        setApiKeys(prev => ({
          ...prev,
          [service]: { configured: false, masked: null }
        }));
        setHealth(prev => ({
          ...prev,
          [service]: { status: 'not_configured', message: 'Not configured' }
        }));
        setSuccess(`${getServiceName(service)} API key removed`);
        toast.success(`${getServiceName(service)} API key removed`);
      }
    } catch (err) {
      setError('Failed to remove API key');
      toast.error('Failed to remove API key');
    } finally {
      setSaving(prev => ({ ...prev, [service]: false }));
    }
  };

  // Save Telnyx phone number
  const saveTelnyxPhone = async () => {
    if (!telnyxPhone.trim()) {
      setError('Phone number cannot be empty');
      return;
    }

    setSaving(prev => ({ ...prev, telnyxPhone: true }));
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/settings/telnyx-phone`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ phoneNumber: telnyxPhone })
      });

      if (response.ok) {
        setSuccess('Telnyx phone number saved');
        toast.success('Telnyx phone number saved');
      } else {
        const data = await response.json();
        const errorMsg = data.error || 'Failed to save phone number';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      setError('Failed to save phone number');
      toast.error('Failed to save phone number');
    } finally {
      setSaving(prev => ({ ...prev, telnyxPhone: false }));
    }
  };

  // Check for active and queued calls before switching provider
  const checkCallsBeforeSwitch = async (newProvider) => {
    setCheckingCalls(true);
    setError(null);

    try {
      // Check for active calls
      const activeResponse = await fetch(`${API_BASE}/calls/active`, {
        headers: getAuthHeaders()
      });
      const activeData = await activeResponse.json();
      const activeCount = activeData.calls ? activeData.calls.length : 0;

      // Check for queued calls
      const queueResponse = await fetch(`${API_BASE}/queue?status=pending&limit=1`, {
        headers: getAuthHeaders()
      });
      const queueData = await queueResponse.json();
      const queuedCount = queueData.total || 0;

      setActiveCallsCount(activeCount);
      setQueuedCallsCount(queuedCount);

      // If there are active or queued calls, show confirmation dialog
      if (activeCount > 0 || queuedCount > 0) {
        setPendingProvider(newProvider);
        setShowProviderSwitchModal(true);
        setCheckingCalls(false);
        return false; // Don't proceed with switch yet
      } else {
        // No calls, proceed with switch
        await executeProviderSwitch(newProvider);
        setCheckingCalls(false);
        return true;
      }
    } catch (err) {
      console.error('Error checking calls:', err);
      setError('Failed to check for active calls');
      toast.error('Failed to check for active calls');
      setCheckingCalls(false);
      return false;
    }
  };

  // Execute the provider switch (after confirmation)
  const executeProviderSwitch = async (newProvider) => {
    setSaving(prev => ({ ...prev, telephonyProvider: true }));
    setError(null);

    try {
      // Pause the queue before switching
      await fetch(`${API_BASE}/queue/pause`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      const response = await fetch(`${API_BASE}/settings/telephony-provider`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ provider: newProvider })
      });

      if (response.ok) {
        setTelephonyProvider(newProvider);
        setProviderConnectionStatus('not_checked'); // Reset status when provider changes
        setSuccess(`Telephony provider changed to ${newProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'}`);
        toast.success(`Telephony provider changed to ${newProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'}`);
      } else {
        const data = await response.json();
        const errorMsg = data.error || 'Failed to save provider selection';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      setError('Failed to save provider selection');
      toast.error('Failed to save provider selection');
    } finally {
      setSaving(prev => ({ ...prev, telephonyProvider: false }));
    }
  };

  // Save telephony provider selection (with confirmation)
  const saveTelephonyProvider = async (newProvider) => {
    // Don't do anything if provider hasn't changed
    if (newProvider === telephonyProvider) {
      return;
    }

    // Check for active and queued calls before switching
    await checkCallsBeforeSwitch(newProvider);
  };

  // Confirm provider switch after warning
  const confirmProviderSwitch = async () => {
    setShowProviderSwitchModal(false);
    await executeProviderSwitch(pendingProvider);
  };

  // Cancel provider switch
  const cancelProviderSwitch = () => {
    setShowProviderSwitchModal(false);
    setPendingProvider(null);
    setActiveCallsCount(0);
    setQueuedCallsCount(0);
  };

  // Test provider connection
  const testProviderConnection = async () => {
    setTestingConnection(true);
    setProviderConnectionStatus('checking');
    setError(null);
    setSuccess(null);

    try {
      const provider = telephonyProvider === 'telnyx' ? 'telnyx' : 'signalwire';
      const response = await fetch(`${API_BASE}/settings/health/${provider}`, {
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok && data.status === 'connected') {
        const message = `Successfully connected to ${telephonyProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'}`;
        if (data.responseTimeMs) {
          setSuccess(`${message} (${data.responseTimeMs}ms)`);
        } else {
          setSuccess(message);
        }
        toast.success(message);
        setProviderConnectionStatus('connected');
      } else if (data.status === 'not_configured') {
        setError(`${telephonyProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'} credentials not configured`);
        toast.error(data.message);
        setProviderConnectionStatus('disconnected');
      } else if (data.status === 'invalid_credentials') {
        setError(`Invalid ${telephonyProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'} credentials`);
        toast.error(data.message);
        setProviderConnectionStatus('disconnected');
      } else {
        const errorMsg = data.message || `Failed to connect to ${telephonyProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'}`;
        setError(errorMsg);
        toast.error(errorMsg);
        setProviderConnectionStatus('disconnected');
      }
    } catch (err) {
      const errorMsg = `Failed to test ${telephonyProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'} connection`;
      setError(errorMsg);
      toast.error(errorMsg);
      setProviderConnectionStatus('disconnected');
    } finally {
      setTestingConnection(false);
    }
  };

  // Get display name for service
  const getServiceName = (service) => {
    const names = {
      telnyx: 'Telnyx',
      deepgram: 'Deepgram',
      followupboss: 'Follow-up Boss',
      openai: 'OpenAI'
    };
    return names[service] || service;
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-800';
      case 'configured':
        return 'bg-blue-100 text-blue-800';
      case 'invalid_credentials':
        return 'bg-red-100 text-red-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'not_configured':
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status display text
  const getStatusText = (status) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'configured':
        return 'Configured';
      case 'invalid_credentials':
        return 'Invalid Credentials';
      case 'error':
        return 'Error';
      case 'not_configured':
      default:
        return 'Not Configured';
    }
  };

  // Get status icon (for accessibility - not conveyed by color alone)
  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'configured':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        );
      case 'invalid_credentials':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'not_configured':
      default:
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500 mt-1">Configure API keys and integrations</p>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="ml-3 text-sm text-green-700">{success}</p>
              <button onClick={() => setSuccess(null)} className="ml-auto text-green-700 hover:text-green-500" aria-label="Dismiss success message">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" aria-live="assertive" className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-red-400" aria-hidden="true" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="ml-3 text-sm text-red-700">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-red-700 hover:text-red-500" aria-label="Dismiss error message">
                <svg className="h-4 w-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Integration Health Status */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Integration Health</h2>
            <button
              onClick={() => checkHealth()}
              disabled={healthLoading}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              {healthLoading ? (
                <>
                  <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Checking...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['deepgram', 'followupboss', 'openai'].map((service) => (
                <div key={service} className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="font-medium text-gray-700 mb-2">{getServiceName(service)}</div>
                  <div className="relative group">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full cursor-help ${getStatusColor(health[service]?.status)}`}
                      title={health[service]?.message || 'Click to see details'}
                    >
                      {getStatusIcon(health[service]?.status)}
                      {getStatusText(health[service]?.status)}
                    </span>
                    {/* Tooltip with full error message - appears on hover */}
                    {health[service]?.message && (
                      <div className="absolute z-10 hidden group-hover:block w-48 p-2 mt-1 text-xs text-left text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg -translate-x-1/2 left-1/2">
                        <div className="font-medium text-gray-900 mb-1">Status Details:</div>
                        <div className="break-words">{health[service].message}</div>
                        {health[service]?.details && (
                          <div className="mt-1 text-gray-500 text-xs">
                            {typeof health[service].details === 'object'
                              ? JSON.stringify(health[service].details, null, 2)
                              : health[service].details}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Show error message directly below badge for error/invalid states */}
                  {(health[service]?.status === 'error' || health[service]?.status === 'invalid_credentials') && health[service]?.message && (
                    <div className="mt-2 text-xs text-red-600 break-words">
                      {health[service].message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* API Keys Configuration */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
            <p className="text-sm text-gray-500 mt-1">Configure your integration credentials</p>
          </div>
          <div className="divide-y">
            {['deepgram', 'followupboss', 'openai'].map((service) => (
              <div key={service} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{getServiceName(service)}</div>
                    <div className="text-sm text-gray-500">
                      {apiKeys[service]?.configured ? (
                        <span className="font-mono">{apiKeys[service].masked}</span>
                      ) : (
                        'Not configured'
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {editingKey === service ? (
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                          <input
                            type="password"
                            value={newKeyValue}
                            onChange={(e) => setNewKeyValue(e.target.value)}
                            placeholder="Enter API key"
                            className={`px-3 py-1.5 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 w-64 ${
                              newKeyValue && !apiKeyValidation[service]?.validate(newKeyValue.trim())
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-300'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => saveApiKey(service)}
                            disabled={saving[service]}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving[service] ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingKey(null); setNewKeyValue(''); setError(null); }}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                        <p className={`mt-1 text-xs ${
                          newKeyValue && !apiKeyValidation[service]?.validate(newKeyValue.trim())
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {apiKeyValidation[service]?.formatHint}
                        </p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingKey(service); setNewKeyValue(''); }}
                          className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                        >
                          {apiKeys[service]?.configured ? 'Update' : 'Configure'}
                        </button>
                        {apiKeys[service]?.configured && (
                          <button
                            onClick={() => deleteApiKey(service)}
                            disabled={saving[service]}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100"
                          >
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Telephony Provider Selection */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Telephony Provider</h2>
            <p className="text-sm text-gray-500 mt-1">Select your telephony service provider</p>
          </div>
          <div className="p-6">
            <div className="flex items-center space-x-4">
              <div className="flex-1 max-w-xs">
                <label htmlFor="provider-select" className="block text-sm font-medium text-gray-700 mb-2">
                  <div className="flex items-center space-x-2">
                    <span>Provider</span>
                    {/* Connection status indicator */}
                    <div className="flex items-center space-x-1">
                      {providerConnectionStatus === 'checking' && (
                        <>
                          <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse"></div>
                          <span className="text-xs text-gray-500">Checking...</span>
                        </>
                      )}
                      {providerConnectionStatus === 'connected' && (
                        <>
                          <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                          <span className="text-xs text-green-600">Connected</span>
                        </>
                      )}
                      {providerConnectionStatus === 'disconnected' && (
                        <>
                          <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                          <span className="text-xs text-red-600">Disconnected</span>
                        </>
                      )}
                      {providerConnectionStatus === 'not_checked' && (
                        <>
                          <div className="w-2.5 h-2.5 bg-gray-300 rounded-full"></div>
                          <span className="text-xs text-gray-400">Not checked</span>
                        </>
                      )}
                    </div>
                  </div>
                </label>
                <select
                  id="provider-select"
                  value={telephonyProvider}
                  onChange={(e) => saveTelephonyProvider(e.target.value)}
                  disabled={saving.telephonyProvider || checkingCalls}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="telnyx">Telnyx</option>
                  <option value="signalwire">SignalWire</option>
                </select>
              </div>
              <div className="flex-1">
                {checkingCalls ? (
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Checking for active calls...
                  </div>
                ) : saving.telephonyProvider ? (
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    {telephonyProvider === 'telnyx'
                      ? 'Using Telnyx for voice calls and messaging'
                      : 'Using SignalWire for voice calls and messaging'}
                  </p>
                )}
              </div>
              <div>
                <button
                  onClick={() => testProviderConnection()}
                  disabled={testingConnection}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingConnection ? (
                    <>
                      <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Testing...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Test Connection
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Provider-specific help section */}
            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-md">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-blue-900">{providerHelpContent[telephonyProvider]?.title}</p>
                    <a
                      href={providerHelpContent[telephonyProvider]?.docLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-medium text-blue-700 hover:text-blue-800 underline"
                    >
                      <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {providerHelpContent[telephonyProvider]?.docLabel}
                    </a>
                  </div>
                  <p className="text-sm text-blue-800 mb-3">{providerHelpContent[telephonyProvider]?.description}</p>
                  <div className="text-sm text-blue-700">
                    <p className="font-medium mb-2">Getting Started:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      {providerHelpContent[telephonyProvider]?.gettingStarted.map((step, index) => (
                        <li key={index} className="text-blue-700">{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Telnyx Credentials */}
        {telephonyProvider === 'telnyx' && (
          <div className="bg-white rounded-lg shadow-sm border mb-6">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Telnyx Credentials</h2>
                <p className="text-sm text-gray-500 mt-1">Configure your Telnyx account credentials</p>
              </div>
              <button
                onClick={testProviderConnection}
                disabled={testingConnection}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50"
              >
                {testingConnection ? (
                  <>
                    <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Testing...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Test Connection
                  </>
                )}
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div>
                    <div className="flex items-center space-x-1">
                      <span className="font-medium text-gray-900">API Key</span>
                      {/* Tooltip icon with hover */}
                      <div className="group relative inline-block">
                        <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {/* Tooltip content */}
                        <div className="absolute z-20 hidden group-hover:block w-64 p-3 mt-2 text-xs text-left bg-gray-900 text-white rounded-lg shadow-xl -left-2 top-4">
                          <div className="font-medium mb-1">{providerHelpContent.telnyx.credentials.apiKey.label}</div>
                          <div className="text-gray-300">{providerHelpContent.telnyx.credentials.apiKey.tooltip}</div>
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <span className="text-gray-400">Format: </span>
                            <span className="text-gray-300">{providerHelpContent.telnyx.credentials.apiKey.format}</span>
                          </div>
                          {/* Arrow */}
                          <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 -top-1 left-3"></div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {apiKeys.telnyx?.configured ? (
                        <span className="font-mono">{apiKeys.telnyx.masked}</span>
                      ) : (
                        'Not configured'
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {editingKey === 'telnyx' ? (
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-2">
                        <input
                          type="password"
                          value={newKeyValue}
                          onChange={(e) => setNewKeyValue(e.target.value)}
                          placeholder="Enter API key"
                          className={`px-3 py-1.5 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 w-64 ${
                            newKeyValue && !apiKeyValidation.telnyx?.validate(newKeyValue.trim())
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-300'
                          }`}
                          autoFocus
                        />
                        <button
                          onClick={() => saveApiKey('telnyx')}
                          disabled={saving.telnyx}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving.telnyx ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditingKey(null); setNewKeyValue(''); setError(null); }}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className={`mt-1 text-xs ${
                        newKeyValue && !apiKeyValidation.telnyx?.validate(newKeyValue.trim())
                          ? 'text-red-600'
                          : 'text-gray-500'
                      }`}>
                        {apiKeyValidation.telnyx?.formatHint}
                      </p>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingKey('telnyx'); setNewKeyValue(''); }}
                        className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                      >
                        {apiKeys.telnyx?.configured ? 'Update' : 'Configure'}
                      </button>
                      {apiKeys.telnyx?.configured && (
                        <button
                          onClick={() => deleteApiKey('telnyx')}
                          disabled={saving.telnyx}
                          className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100"
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SignalWire Credentials */}
        {telephonyProvider === 'signalwire' && (
          <div className="bg-white rounded-lg shadow-sm border mb-6">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">SignalWire Credentials</h2>
                <p className="text-sm text-gray-500 mt-1">Configure your SignalWire account credentials</p>
              </div>
              <button
                onClick={testProviderConnection}
                disabled={testingConnection}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50"
              >
                {testingConnection ? (
                  <>
                    <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Testing...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Test Connection
                  </>
                )}
              </button>
            </div>
            <div className="divide-y">
              {/* Project ID */}
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div>
                      <div className="flex items-center space-x-1">
                        <span className="font-medium text-gray-900">Project ID</span>
                        {/* Tooltip icon with hover */}
                        <div className="group relative inline-block">
                          <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {/* Tooltip content */}
                          <div className="absolute z-20 hidden group-hover:block w-64 p-3 mt-2 text-xs text-left bg-gray-900 text-white rounded-lg shadow-xl -left-2 top-4">
                            <div className="font-medium mb-1">{providerHelpContent.signalwire.credentials.projectId.label}</div>
                            <div className="text-gray-300">{providerHelpContent.signalwire.credentials.projectId.tooltip}</div>
                            <div className="mt-2 pt-2 border-t border-gray-700">
                              <span className="text-gray-400">Format: </span>
                              <span className="text-gray-300">{providerHelpContent.signalwire.credentials.projectId.format}</span>
                            </div>
                            {/* Arrow */}
                            <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 -top-1 left-3"></div>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {signalwireCredentials.projectId?.configured ? (
                          <span className="font-mono">{signalwireCredentials.projectId.masked}</span>
                        ) : (
                          'Not configured'
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {editingSignalwireField === 'projectId' ? (
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={newSignalwireValue}
                            onChange={(e) => setNewSignalwireValue(e.target.value)}
                            placeholder="Enter Project ID (UUID or identifier)"
                            className={`px-3 py-1.5 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 w-80 ${
                              newSignalwireValue && !signalwireValidation['project-id']?.validate(newSignalwireValue.trim())
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-300'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => saveSignalwireCredential('projectId')}
                            disabled={saving.projectId}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving.projectId ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingSignalwireField(null); setNewSignalwireValue(''); setError(null); }}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                        <p className={`mt-1 text-xs ${
                          newSignalwireValue && !signalwireValidation['project-id']?.validate(newSignalwireValue.trim())
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {signalwireValidation['project-id']?.formatHint}
                        </p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingSignalwireField('projectId'); setNewSignalwireValue(''); }}
                          className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                        >
                          {signalwireCredentials.projectId?.configured ? 'Update' : 'Configure'}
                        </button>
                        {signalwireCredentials.projectId?.configured && (
                          <button
                            onClick={() => deleteSignalwireCredential('projectId')}
                            disabled={saving.projectId}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100"
                          >
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* API Token */}
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div>
                      <div className="flex items-center space-x-1">
                        <span className="font-medium text-gray-900">API Token</span>
                        {/* Tooltip icon with hover */}
                        <div className="group relative inline-block">
                          <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {/* Tooltip content */}
                          <div className="absolute z-20 hidden group-hover:block w-64 p-3 mt-2 text-xs text-left bg-gray-900 text-white rounded-lg shadow-xl -left-2 top-4">
                            <div className="font-medium mb-1">{providerHelpContent.signalwire.credentials.apiToken.label}</div>
                            <div className="text-gray-300">{providerHelpContent.signalwire.credentials.apiToken.tooltip}</div>
                            <div className="mt-2 pt-2 border-t border-gray-700">
                              <span className="text-gray-400">Format: </span>
                              <span className="text-gray-300">{providerHelpContent.signalwire.credentials.apiToken.format}</span>
                            </div>
                            {/* Arrow */}
                            <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 -top-1 left-3"></div>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {signalwireCredentials.apiToken?.configured ? (
                          <span className="font-mono">{signalwireCredentials.apiToken.masked}</span>
                        ) : (
                          'Not configured'
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {editingSignalwireField === 'apiToken' ? (
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                          <input
                            type="password"
                            value={newSignalwireValue}
                            onChange={(e) => setNewSignalwireValue(e.target.value)}
                            placeholder="Enter API Token"
                            className={`px-3 py-1.5 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 w-80 ${
                              newSignalwireValue && !signalwireValidation['api-token']?.validate(newSignalwireValue.trim())
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-300'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => saveSignalwireCredential('apiToken')}
                            disabled={saving.apiToken}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving.apiToken ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingSignalwireField(null); setNewSignalwireValue(''); setError(null); }}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                        <p className={`mt-1 text-xs ${
                          newSignalwireValue && !signalwireValidation['api-token']?.validate(newSignalwireValue.trim())
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {signalwireValidation['api-token']?.formatHint}
                        </p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingSignalwireField('apiToken'); setNewSignalwireValue(''); }}
                          className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                        >
                          {signalwireCredentials.apiToken?.configured ? 'Update' : 'Configure'}
                        </button>
                        {signalwireCredentials.apiToken?.configured && (
                          <button
                            onClick={() => deleteSignalwireCredential('apiToken')}
                            disabled={saving.apiToken}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100"
                          >
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Space URL */}
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div>
                      <div className="flex items-center space-x-1">
                        <span className="font-medium text-gray-900">Space URL</span>
                        {/* Tooltip icon with hover */}
                        <div className="group relative inline-block">
                          <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {/* Tooltip content */}
                          <div className="absolute z-20 hidden group-hover:block w-64 p-3 mt-2 text-xs text-left bg-gray-900 text-white rounded-lg shadow-xl -left-2 top-4">
                            <div className="font-medium mb-1">{providerHelpContent.signalwire.credentials.spaceUrl.label}</div>
                            <div className="text-gray-300">{providerHelpContent.signalwire.credentials.spaceUrl.tooltip}</div>
                            <div className="mt-2 pt-2 border-t border-gray-700">
                              <span className="text-gray-400">Format: </span>
                              <span className="text-gray-300">{providerHelpContent.signalwire.credentials.spaceUrl.format}</span>
                            </div>
                            {/* Arrow */}
                            <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 -top-1 left-3"></div>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {signalwireCredentials.spaceUrl?.configured ? (
                          <span className="font-mono">{signalwireCredentials.spaceUrl.masked}</span>
                        ) : (
                          'Not configured'
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {editingSignalwireField === 'spaceUrl' ? (
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={newSignalwireValue}
                            onChange={(e) => setNewSignalwireValue(e.target.value)}
                            placeholder="your-space.signalwire.com"
                            className={`px-3 py-1.5 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 w-80 ${
                              newSignalwireValue && !signalwireValidation['space-url']?.validate(newSignalwireValue.trim())
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-300'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => saveSignalwireCredential('spaceUrl')}
                            disabled={saving.spaceUrl}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving.spaceUrl ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingSignalwireField(null); setNewSignalwireValue(''); setError(null); }}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                        <p className={`mt-1 text-xs ${
                          newSignalwireValue && !signalwireValidation['space-url']?.validate(newSignalwireValue.trim())
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {signalwireValidation['space-url']?.formatHint}
                        </p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingSignalwireField('spaceUrl'); setNewSignalwireValue(''); }}
                          className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                        >
                          {signalwireCredentials.spaceUrl?.configured ? 'Update' : 'Configure'}
                        </button>
                        {signalwireCredentials.spaceUrl?.configured && (
                          <button
                            onClick={() => deleteSignalwireCredential('spaceUrl')}
                            disabled={saving.spaceUrl}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100"
                          >
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phone Numbers - Display numbers from active provider */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              {telephonyProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'} Phone Numbers
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select a phone number to use for outbound calls
            </p>
          </div>
          <div className="p-6">
            {phoneNumbersLoading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-600">Loading phone numbers...</span>
              </div>
            ) : phoneNumbersError ? (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error loading phone numbers</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{phoneNumbersError}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : phoneNumbers.length === 0 ? (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No phone numbers found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Make sure your {telephonyProvider === 'telnyx' ? 'Telnyx' : 'SignalWire'} account has phone numbers configured.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-4">
                  <div className="flex-1 max-w-lg">
                    <label htmlFor="phone-number-select" className="block text-sm font-medium text-gray-700 mb-2">
                      Select Default Outbound Number
                    </label>
                    <select
                      id="phone-number-select"
                      value={defaultPhoneNumber || ''}
                      onChange={(e) => {
                        const selectedNumber = e.target.value;
                        if (selectedNumber) {
                          saveDefaultPhoneNumber(selectedNumber);
                        }
                      }}
                      disabled={saving.defaultPhoneNumber}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">-- Select a phone number --</option>
                      {phoneNumbers.map((number) => (
                        <option key={number.phoneNumber} value={number.phoneNumber}>
                          {number.friendlyName || number.phoneNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  {saving.defaultPhoneNumber && (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  )}
                </div>
                {defaultPhoneNumber && (
                  <div className="mt-4 rounded-md bg-blue-50 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-blue-800">Default phone number configured</h3>
                        <div className="mt-2 text-sm text-blue-700">
                          <p>Calls will be made from: <span className="font-mono font-semibold">{defaultPhoneNumber}</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Available Phone Numbers ({phoneNumbers.length})</h4>
                  <ul className="divide-y divide-gray-200 border rounded-md">
                    {phoneNumbers.map((number) => (
                      <li key={number.phoneNumber} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{number.friendlyName || number.phoneNumber}</p>
                            <p className="text-sm text-gray-500 font-mono">{number.phoneNumber}</p>
                          </div>
                        </div>
                        {number.phoneNumber === defaultPhoneNumber && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Default
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Password Confirmation Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Password</h3>
              <p className="text-sm text-gray-500 mt-1">
                Please enter your password to confirm this sensitive operation.
              </p>
            </div>
            <div className="px-6 py-4">
              <label htmlFor="passwordConfirmation" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="passwordConfirmation"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    confirmSaveApiKey();
                  }
                }}
                placeholder="Enter your password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              {pendingSaveService && (
                <p className="mt-2 text-sm text-gray-500">
                  {pendingSaveSignalwireField
                    ? `Updating SignalWire ${getFieldLabel(pendingSaveSignalwireField)}`
                    : `Updating ${getServiceName(pendingSaveService)} API key`
                  }
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
              <button
                onClick={cancelPasswordModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveApiKey}
                disabled={saving[pendingSaveService]}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving[pendingSaveService] ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider Switch Confirmation Modal */}
      {showProviderSwitchModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Switch Telephony Provider?</h3>
              <p className="text-sm text-gray-500 mt-1">
                Warning: Active or queued calls detected
              </p>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-3">
                {activeCallsCount > 0 && (
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {activeCallsCount} active {activeCallsCount === 1 ? 'call' : 'calls'}
                      </p>
                      <p className="text-sm text-gray-500">
        Switching providers may interrupt these calls.
                      </p>
                    </div>
                  </div>
                )}
                {queuedCallsCount > 0 && (
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {queuedCallsCount} queued {queuedCallsCount === 1 ? 'call' : 'calls'}
                      </p>
                      <p className="text-sm text-gray-500">
                        The call queue will be paused before switching.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  <strong>Recommendation:</strong> Wait for active calls to complete before switching providers.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
              <button
                onClick={cancelProviderSwitch}
                disabled={saving.telephonyProvider}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmProviderSwitch}
                disabled={saving.telephonyProvider}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {saving.telephonyProvider ? 'Switching...' : 'Switch Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
