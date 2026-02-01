import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

const API_BASE = '/api';

function Configuration() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('questions');
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Voice selection state
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [voicesLoading, setVoicesLoading] = useState(false);

  // LLM model selection state
  const [llmModels, setLlmModels] = useState([]);
  const [selectedLLMModel, setSelectedLLMModel] = useState('gpt-4.1-mini');
  const [llmModelsLoading, setLlmModelsLoading] = useState(false);

  // Prompts state
  const [prompts, setPrompts] = useState({
    system: '',
    greeting: '',
    goodbye: '',
    voicemail: ''
  });
  const [originalPrompts, setOriginalPrompts] = useState({
    system: '',
    greeting: '',
    goodbye: '',
    voicemail: ''
  });
  const [promptsUpdatedAt, setPromptsUpdatedAt] = useState({
    system: null,
    greeting: null,
    goodbye: null,
    voicemail: null
  });
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Conflict modal state
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [conflictType, setConflictType] = useState(null); // 'prompts' or 'callSettings'
  const [pendingForceAction, setPendingForceAction] = useState(null);

  // Call settings state
  const [callSettings, setCallSettings] = useState({
    max_attempts: 3,
    retry_interval_days: 1,
    start_time: '09:00',
    end_time: '19:00',
    timezone: 'America/New_York'
  });
  const [callSettingsDefaults, setCallSettingsDefaults] = useState({});
  const [callSettingsLoading, setCallSettingsLoading] = useState(false);
  const [callSettingsUpdatedAt, setCallSettingsUpdatedAt] = useState(null);

  // Reset to defaults state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Navigation state for unsaved changes warning
  const [showNavigationWarning, setShowNavigationWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const navigate = useNavigate();

  // Disqualifying triggers state
  const [triggers, setTriggers] = useState([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState('');
  const [newTriggerAction, setNewTriggerAction] = useState('mark_disqualified');
  const [editingTrigger, setEditingTrigger] = useState(null);
  const [triggersLoading, setTriggersLoading] = useState(false);

  // Test call state
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testFirstName, setTestFirstName] = useState('');
  const [testLastName, setTestLastName] = useState('');
  const [testStreet, setTestStreet] = useState('');
  const [testCity, setTestCity] = useState('');
  const [testState, setTestState] = useState('');
  const [testCallLoading, setTestCallLoading] = useState(false);
  const [testCallError, setTestCallError] = useState(null);
  const [testCallErrorDetails, setTestCallErrorDetails] = useState(null); // Feature #229: Detailed API integration error info
  const [testCallResult, setTestCallResult] = useState(null);
  const [testCallStatus, setTestCallStatus] = useState(null); // 'dialing', 'ringing', 'connected', 'ended'
  const [testCallTranscript, setTestCallTranscript] = useState([]); // Array of {speaker: 'AI'|'Caller', text: string, timestamp: string}
  const [testCallExtractedData, setTestCallExtractedData] = useState(null); // {qualification: string, sentiment: string, answers: [], summary: string}
  const [testCallRecordingUrl, setTestCallRecordingUrl] = useState(null); // Feature #227: Recording URL for playback
  const [endCallLoading, setEndCallLoading] = useState(false); // Feature #230: End call loading state

  // WebSocket ref for live transcript monitoring
  const monitorWsRef = useRef(null);
  const currentCallIdRef = useRef(null);

  // Refs to track trigger elements for focus return
  const resetButtonRef = useRef(null);
  const navigationTriggerRef = useRef(null);

  // Handle navigation with unsaved changes check
  const handleNavigation = (path, triggerElement = null) => {
    if (isDirty) {
      navigationTriggerRef.current = triggerElement || document.activeElement;
      setPendingNavigation(path);
      setShowNavigationWarning(true);
    } else {
      navigate(path);
    }
  };

  // Confirm leaving the page
  const confirmNavigation = () => {
    setShowNavigationWarning(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
    navigationTriggerRef.current = null;
  };

  // Cancel navigation, stay on page
  const cancelNavigation = () => {
    setShowNavigationWarning(false);
    setPendingNavigation(null);
    // Return focus to the trigger element
    if (navigationTriggerRef.current) {
      navigationTriggerRef.current.focus();
      navigationTriggerRef.current = null;
    }
  };

  // Close reset modal and return focus
  const closeResetModal = () => {
    if (!resetting) {
      setShowResetModal(false);
      // Return focus to the trigger element
      if (resetButtonRef.current) {
        resetButtonRef.current.focus();
      }
    }
  };

  // Escape key handler for modals
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        if (showNavigationWarning) {
          cancelNavigation();
        } else if (showResetModal && !resetting) {
          closeResetModal();
        }
      }
    };

    if (showResetModal || showNavigationWarning) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [showResetModal, showNavigationWarning, resetting]);

  const getAuthToken = () => {
    return localStorage.getItem('token');
  };

  const fetchQuestions = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/questions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }

      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch questions');
    } finally {
      setLoading(false);
    }
  };

  const fetchTriggers = async () => {
    setTriggersLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/disqualifiers`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch disqualifying triggers');
      }

      const data = await response.json();
      setTriggers(data.triggers || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch disqualifying triggers');
    } finally {
      setTriggersLoading(false);
    }
  };

  const fetchVoices = async () => {
    setVoicesLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/voices`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch voices');
      }

      const data = await response.json();
      setVoices(data.voices || []);
      setSelectedVoice(data.selectedVoice || '');
    } catch (err) {
      setError(err.message || 'Failed to fetch voices');
    } finally {
      setVoicesLoading(false);
    }
  };

  const handleSelectVoice = async (voiceId) => {
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/voices/selected`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ voice_id: voiceId })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update voice selection');
      }

      const data = await response.json();
      setSelectedVoice(data.selectedVoice);
      setSuccess(`Voice changed to ${data.voice?.name || voiceId}`);
      toast.success(`Voice changed to ${data.voice?.name || voiceId}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update voice selection');
      toast.error(err.message || 'Failed to update voice selection');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchLLMModels = async () => {
    setLlmModelsLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/llm-models`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch LLM models');
      }

      const data = await response.json();
      setLlmModels(data.models || []);
      setSelectedLLMModel(data.selectedModel || 'gpt-4.1-mini');
    } catch (err) {
      console.error('Error fetching LLM models:', err);
      // Don't show error to user, just use defaults
    } finally {
      setLlmModelsLoading(false);
    }
  };

  const handleSelectLLMModel = async (modelId) => {
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/llm-models/selected`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ model_id: modelId })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update LLM model');
      }

      const data = await response.json();
      setSelectedLLMModel(data.selectedModel);
      setSuccess(`LLM model changed to ${data.model?.name || modelId}`);
      toast.success(`LLM model changed to ${data.model?.name || modelId}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update LLM model');
      toast.error(err.message || 'Failed to update LLM model');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchPrompts = async () => {
    setPromptsLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/prompts`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch prompts');
      }

      const data = await response.json();
      const promptsData = {
        system: data.prompts?.system?.content || '',
        greeting: data.prompts?.greeting?.content || '',
        goodbye: data.prompts?.goodbye?.content || '',
        voicemail: data.prompts?.voicemail?.content || ''
      };
      const promptsTimestamps = {
        system: data.prompts?.system?.updated_at || null,
        greeting: data.prompts?.greeting?.updated_at || null,
        goodbye: data.prompts?.goodbye?.updated_at || null,
        voicemail: data.prompts?.voicemail?.updated_at || null
      };
      setPrompts(promptsData);
      setOriginalPrompts(promptsData);
      setPromptsUpdatedAt(promptsTimestamps);
      setIsDirty(false);
    } catch (err) {
      setError(err.message || 'Failed to fetch prompts');
    } finally {
      setPromptsLoading(false);
    }
  };

  const handlePromptChange = (type, value) => {
    const newPrompts = { ...prompts, [type]: value };
    setPrompts(newPrompts);

    // Check if any prompt has changed from original
    const hasChanges = Object.keys(newPrompts).some(
      key => newPrompts[key] !== originalPrompts[key]
    );
    setIsDirty(hasChanges);
  };

  const handleSavePrompts = async (forceOverwrite = false) => {
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAuthToken();

      // Save each changed prompt
      const changedPrompts = Object.keys(prompts).filter(
        key => prompts[key] !== originalPrompts[key]
      );

      const newTimestamps = { ...promptsUpdatedAt };

      for (const type of changedPrompts) {
        const requestBody = { content: prompts[type] };

        // Include expected_updated_at for conflict detection (unless force overwriting)
        if (!forceOverwrite && promptsUpdatedAt[type]) {
          requestBody.expected_updated_at = promptsUpdatedAt[type];
        }

        const response = await fetch(`${API_BASE}/config/prompts/${type}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
          // Handle conflict (409)
          if (response.status === 409 && data.conflict) {
            setConflictMessage(data.message || 'This configuration was modified in another session.');
            setConflictType('prompts');
            setPendingForceAction(() => () => handleSavePrompts(true));
            setShowConflictModal(true);
            setSubmitting(false);
            return;
          }
          throw new Error(data.error || `Failed to save ${type} prompt`);
        }

        // Update timestamp from response
        if (data.prompt?.updated_at) {
          newTimestamps[type] = data.prompt.updated_at;
        }
      }

      setPromptsUpdatedAt(newTimestamps);
      setOriginalPrompts({ ...prompts });
      setIsDirty(false);
      setSuccess('Prompts saved successfully');
      toast.success('Prompts saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save prompts');
      toast.error(err.message || 'Failed to save prompts');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPrompts = () => {
    setPrompts({ ...originalPrompts });
    setIsDirty(false);
  };

  // Beforeunload event to warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchCallSettings = async () => {
    setCallSettingsLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/call-settings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch call settings');
      }

      const data = await response.json();
      setCallSettings(data.settings || {});
      setCallSettingsDefaults(data.defaults || {});
      setCallSettingsUpdatedAt(data.updated_at || null);
    } catch (err) {
      setError(err.message || 'Failed to fetch call settings');
    } finally {
      setCallSettingsLoading(false);
    }
  };

  const handleSaveCallSettings = async (forceOverwrite = false) => {
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAuthToken();
      const requestBody = { ...callSettings };

      // Include expected_updated_at for conflict detection (unless force overwriting)
      if (!forceOverwrite && callSettingsUpdatedAt) {
        requestBody.expected_updated_at = callSettingsUpdatedAt;
      }

      const response = await fetch(`${API_BASE}/config/call-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle conflict (409)
        if (response.status === 409 && data.conflict) {
          setConflictMessage(data.message || 'Call settings were modified in another session.');
          setConflictType('callSettings');
          setPendingForceAction(() => () => handleSaveCallSettings(true));
          setShowConflictModal(true);
          setSubmitting(false);
          return;
        }
        throw new Error(data.error || 'Failed to save call settings');
      }

      setCallSettings(data.settings);
      setCallSettingsUpdatedAt(data.updated_at);
      setSuccess('Call settings saved successfully');
      toast.success('Call settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save call settings');
      toast.error(err.message || 'Failed to save call settings');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset all configuration to defaults
  const handleResetToDefaults = async () => {
    if (resetting) return;

    setResetting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/reset-defaults`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset configuration');
      }

      const data = await response.json();

      // Update local state with reset data
      if (data.config.questions) {
        setQuestions(data.config.questions);
      }
      if (data.config.prompts) {
        const promptsData = {
          system: data.config.prompts.system?.content || '',
          greeting: data.config.prompts.greeting?.content || '',
          goodbye: data.config.prompts.goodbye?.content || '',
          voicemail: data.config.prompts.voicemail?.content || ''
        };
        setPrompts(promptsData);
        setOriginalPrompts(promptsData);
        setIsDirty(false);
      }
      if (data.config.voice) {
        setSelectedVoice(data.config.voice);
      }
      if (data.config.callSettings) {
        setCallSettings(data.config.callSettings);
      }

      setShowResetModal(false);
      setSuccess('All configuration has been reset to defaults');
      toast.success('All configuration has been reset to defaults');
      setTimeout(() => setSuccess(null), 5000);
      // Return focus to the trigger element
      if (resetButtonRef.current) {
        resetButtonRef.current.focus();
      }
    } catch (err) {
      setError(err.message || 'Failed to reset configuration');
      toast.error(err.message || 'Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'voice') {
      fetchVoices();
      fetchLLMModels();
    } else if (activeTab === 'prompts') {
      fetchPrompts();
    } else if (activeTab === 'callSettings') {
      fetchCallSettings();
    } else if (activeTab === 'disqualifiers') {
      fetchTriggers();
    }
  }, [activeTab]);

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!newQuestion.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: newQuestion })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add question');
      }

      const data = await response.json();
      setQuestions([...questions, data.question]);
      setNewQuestion('');
      setSuccess('Question added successfully');
      toast.success('Question added successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to add question');
      toast.error(err.message || 'Failed to add question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateQuestion = async (id, questionText) => {
    if (!questionText.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/questions/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: questionText })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update question');
      }

      const data = await response.json();
      setQuestions(questions.map(q => q.id === id ? data.question : q));
      setEditingQuestion(null);
      setSuccess('Question updated successfully');
      toast.success('Question updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update question');
      toast.error(err.message || 'Failed to update question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (id) => {
    const questionToDelete = questions.find(q => q.id === id);
    if (!confirm(`Are you sure you want to delete this question?\n\n"${questionToDelete?.question}"`)) {
      return;
    }

    setError(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/questions/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete question');
      }

      setQuestions(questions.filter(q => q.id !== id));
      setSuccess('Question deleted successfully');
      toast.success('Question deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete question');
      toast.error(err.message || 'Failed to delete question');
    }
  };

  const handleMoveQuestion = async (id, direction) => {
    if (submitting) return;

    const currentIndex = questions.findIndex(q => q.id === id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Don't move if already at the boundary
    if (newIndex < 0 || newIndex >= questions.length) return;

    // Create new array with swapped positions
    const newQuestions = [...questions];
    [newQuestions[currentIndex], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[currentIndex]];

    // Optimistically update UI
    setQuestions(newQuestions);
    setSubmitting(true);
    setError(null);

    try {
      const token = getAuthToken();
      const questionIds = newQuestions.map(q => q.id);

      const response = await fetch(`${API_BASE}/config/questions/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ questionIds })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reorder questions');
      }

      const data = await response.json();
      setQuestions(data.questions);
      toast.success('Question order updated');
    } catch (err) {
      // Revert on error
      setQuestions(questions);
      setError(err.message || 'Failed to reorder questions');
      toast.error(err.message || 'Failed to reorder questions');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTrigger = async (e) => {
    e.preventDefault();
    if (!newTriggerPhrase.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/disqualifiers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          trigger_phrase: newTriggerPhrase,
          action: newTriggerAction
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add trigger');
      }

      const data = await response.json();
      setTriggers([...triggers, data.trigger]);
      setNewTriggerPhrase('');
      setNewTriggerAction('mark_disqualified');
      setSuccess('Trigger added successfully');
      toast.success('Trigger added successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to add trigger');
      toast.error(err.message || 'Failed to add trigger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTrigger = async (id, triggerPhrase, action) => {
    if (!triggerPhrase.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/disqualifiers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          trigger_phrase: triggerPhrase,
          action: action
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update trigger');
      }

      const data = await response.json();
      setTriggers(triggers.map(t => t.id === id ? data.trigger : t));
      setEditingTrigger(null);
      setSuccess('Trigger updated successfully');
      toast.success('Trigger updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update trigger');
      toast.error(err.message || 'Failed to update trigger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTrigger = async (id) => {
    const triggerToDelete = triggers.find(t => t.id === id);
    if (!confirm(`Are you sure you want to delete this trigger?\n\n"${triggerToDelete?.trigger_phrase}"`)) {
      return;
    }

    setError(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/config/disqualifiers/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete trigger');
      }

      setTriggers(triggers.filter(t => t.id !== id));
      setSuccess('Trigger deleted successfully');
      toast.success('Trigger deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete trigger');
      toast.error(err.message || 'Failed to delete trigger');
    }
  };

  // Connect to WebSocket for live monitoring (Feature #224)
  const connectToMonitorWebSocket = (callId) => {
    // Close existing connection if any
    if (monitorWsRef.current) {
      monitorWsRef.current.close();
    }

    currentCallIdRef.current = callId;

    // Connect to the monitor WebSocket (use relative URL for Vite proxy)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/monitor`;
    console.log(`[Test Call] Connecting to WebSocket: ${wsUrl} for call ${callId}`);

    const ws = new WebSocket(wsUrl);
    monitorWsRef.current = ws;

    ws.onopen = () => {
      console.log('[Test Call] WebSocket connected for live monitoring');
      setTestCallStatus('dialing');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[Test Call] WebSocket message:', message);

        // Filter by our call ID
        const messageCallId = message.data?.callId || message.data?.call_id || message.data?.telnyx_call_id;

        // Handle different message types
        switch (message.type) {
          case 'active_calls_sync':
            // Initial sync of active calls - check if our call is in progress
            if (message.data?.calls) {
              const ourCall = message.data.calls.find(c => c.id === callId || c.telnyx_call_id === currentCallIdRef.current);
              if (ourCall) {
                setTestCallStatus(ourCall.status === 'in_progress' ? 'connected' : 'ringing');
              }
            }
            break;

          case 'call_status_update':
            if (messageCallId && (message.data?.status === 'ringing' || message.data?.status === 'in_progress')) {
              setTestCallStatus(message.data.status === 'in_progress' ? 'connected' : 'ringing');
            }
            break;

          case 'call_answered':
            // Call was answered - set status to connected
            setTestCallStatus('connected');
            break;

          case 'transcript_update':
            // Live transcript update from Deepgram via AudioBridge
            if (message.data) {
              const { role, content, timestamp } = message.data;
              // Map 'user' and 'assistant' to 'Caller' and 'AI' for display
              const speaker = role === 'user' ? 'Caller' : 'AI';
              setTestCallTranscript(prev => [...prev, {
                speaker,
                text: content,
                timestamp: timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
              }]);
            }
            break;

          case 'conversation_event':
            // Handle conversation events (speaking indicators, etc.)
            if (message.data?.eventType === 'AgentStartedSpeaking') {
              // Could add visual indicator that AI is speaking
            } else if (message.data?.eventType === 'UserStartedSpeaking') {
              // Could add visual indicator that caller is speaking
            }
            break;

          case 'call_ended':
            // Call has ended
            setTestCallStatus('ended');
            // Log stats if available
            if (message.data?.stats) {
              console.log('[Test Call] Call ended with stats:', message.data.stats);
            }
            // Set extracted data from call_ended event if available (Feature #226)
            if (message.data?.extractedData && message.data.extractedData.qualification_status) {
              const { extractedData } = message.data;
              console.log('[Test Call] Setting extracted data from call_ended:', extractedData);
              setTestCallExtractedData({
                qualification: extractedData.qualification_status,
                sentiment: extractedData.sentiment,
                answers: extractedData.answers || [],
                summary: extractedData.summary || ''
              });
              // Feature #227: Save recording URL from WebSocket event if available
              if (message.data?.recordingUrl) {
                setTestCallRecordingUrl(message.data.recordingUrl);
              }
            } else {
              // Fallback: fetch call data from API after a short delay (Feature #226)
              // This handles cases where the WebSocket event doesn't include extracted data
              const callId = message.data?.callId || testCallResult?.callId;
              if (callId) {
                console.log('[Test Call] Fetching call data from API for call:', callId);
                setTimeout(async () => {
                  try {
                    const token = getAuthToken();
                    const response = await fetch(`${API_BASE}/calls/${callId}`, {
                      headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.ok) {
                      const callData = await response.json();
                      console.log('[Test Call] Fetched call data:', callData);
                      console.log('[Test Call] Extracted fields - qualification:', callData.qualification_status, 'sentiment:', callData.sentiment, 'summary:', callData.ai_summary, 'recording:', callData.recording_url);

                      // Feature #227: Save recording URL
                      if (callData.recording_url) {
                        setTestCallRecordingUrl(callData.recording_url);
                      }

                      if (callData.qualification_status || callData.sentiment || callData.ai_summary) {
                        // Parse answers if they exist
                        let parsedAnswers = [];
                        if (callData.answers) {
                          try {
                            const answersObj = typeof callData.answers === 'string'
                              ? JSON.parse(callData.answers)
                              : callData.answers;
                            parsedAnswers = [
                              { question: 'Motivation to Sell', answer: answersObj.motivation_to_sell },
                              { question: 'Timeline', answer: answersObj.timeline },
                              { question: 'Price Expectations', answer: answersObj.price_expectations }
                            ].filter(a => a.answer);
                          } catch (e) {
                            console.error('[Test Call] Error parsing answers:', e);
                          }
                        }
                        setTestCallExtractedData({
                          qualification: callData.qualification_status,
                          sentiment: callData.sentiment,
                          answers: parsedAnswers,
                          summary: callData.ai_summary || ''
                        });
                      }
                    }
                  } catch (err) {
                    console.error('[Test Call] Error fetching call data:', err);
                  }
                }, 2000); // 2 second delay to allow database to be updated
              }
            }
            break;

          case 'qualification_extracted':
            // AI has extracted qualification data
            if (message.data) {
              setTestCallExtractedData({
                qualification: message.data.qualification_status,
                sentiment: message.data.sentiment,
                answers: message.data.answers || [],
                summary: message.data.motivation_to_sell || ''
              });
            }
            break;

          default:
            // Log unhandled message types for debugging
            console.log('[Test Call] Unhandled message type:', message.type);
        }
      } catch (err) {
        console.error('[Test Call] Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('[Test Call] WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('[Test Call] WebSocket closed:', event.code, event.reason);
      monitorWsRef.current = null;
    };

    return ws;
  };

  // Cleanup WebSocket on component unmount
  useEffect(() => {
    return () => {
      if (monitorWsRef.current) {
        monitorWsRef.current.close();
      }
    };
  }, []);

  // Handle test call initiation (Feature #222)
  // Updated: Feature #229 - Verify API integrations before starting
  const handleStartTestCall = async () => {
    setTestCallLoading(true);
    setTestCallError(null);
    setTestCallErrorDetails(null); // Feature #229: Clear previous error details
    setTestCallResult(null);
    setTestCallTranscript([]); // Clear previous transcript
    setTestCallExtractedData(null); // Clear previous extracted data
    setTestCallRecordingUrl(null); // Feature #227: Clear previous recording URL
    setTestCallStatus('dialing'); // Set initial status

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/calls/test-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          phone_number: testPhoneNumber,
          first_name: testFirstName,
          last_name: testLastName,
          street: testStreet,
          city: testCity,
          state: testState
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Feature #229: Enhanced error handling for API integration errors
        // Store the full error response for detailed display
        const errorMessage = data.message || data.error || 'Failed to initiate test call';
        const error = new Error(errorMessage);
        error.details = data; // Attach full response for detailed error display
        throw error;
      }

      setTestCallResult(data);
      toast.success('Test call initiated! Your phone should ring shortly.');

      // Connect to WebSocket for live transcript updates (Feature #224)
      const callId = data.call_id;
      connectToMonitorWebSocket(callId);

    } catch (err) {
      console.error('Test call error:', err);
      // Feature #229: Handle API integration errors with detailed display
      if (err.details?.missing || err.details?.invalid) {
        // API integration error with specific missing/invalid details
        setTestCallError(err.message);
        setTestCallErrorDetails(err.details); // Store details for enhanced display
      } else {
        setTestCallError(err.message || 'Failed to initiate test call');
        setTestCallErrorDetails(null);
      }
      toast.error(err.message || 'Failed to initiate test call');
      setTestCallStatus(null); // Reset status on error
    } finally {
      setTestCallLoading(false);
    }
  };

  // Handle end call (Feature #230)
  const handleEndCall = async () => {
    if (!testCallResult?.call_id) {
      toast.error('No active call to end');
      return;
    }

    setEndCallLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/calls/${testCallResult.call_id}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to end call');
      }

      toast.success('Call ended successfully');
      setTestCallStatus('ended');

      // Close WebSocket connection
      if (monitorWsRef.current) {
        monitorWsRef.current.close();
        monitorWsRef.current = null;
      }

    } catch (err) {
      console.error('End call error:', err);
      toast.error(err.message || 'Failed to end call');
    } finally {
      setEndCallLoading(false);
    }
  };

  const tabs = [
    { id: 'questions', name: 'Qualifying Questions' },
    { id: 'voice', name: 'Voice Selection' },
    { id: 'prompts', name: 'AI Prompts' },
    { id: 'callSettings', name: 'Call Settings' },
    { id: 'disqualifiers', name: 'Disqualifying Triggers' },
    { id: 'testCall', name: 'Test Call' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Reset to Defaults Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={closeResetModal}
            />

            {/* Modal */}
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3 className="text-base font-semibold leading-6 text-gray-900">
                      Reset All Configuration to Defaults
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 mb-3">
                        This will reset all your configuration settings to their default values:
                      </p>
                      <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                        <li>Qualifying questions (5 default questions)</li>
                        <li>AI prompts (system, greeting, goodbye, voicemail)</li>
                        <li>Voice selection (Asteria - American female)</li>
                        <li>Disqualifying triggers (7 default triggers)</li>
                        <li>Call settings (retry attempts, time restrictions)</li>
                      </ul>
                      <p className="text-sm text-red-600 mt-3 font-medium">
                        This action cannot be undone. Your current configuration will be lost.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  onClick={handleResetToDefaults}
                  disabled={resetting}
                  className="inline-flex w-full justify-center rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed sm:ml-3 sm:w-auto"
                >
                  {resetting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Resetting...
                    </>
                  ) : (
                    'Reset to Defaults'
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeResetModal}
                  disabled={resetting}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 sm:mt-0 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Warning Modal */}
      {showNavigationWarning && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={cancelNavigation}
            />

            {/* Modal */}
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3 className="text-base font-semibold leading-6 text-gray-900">
                      Unsaved Changes
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        You have unsaved changes to your prompts. Are you sure you want to leave this page? Your changes will be lost.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  onClick={confirmNavigation}
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                >
                  Leave Page
                </button>
                <button
                  type="button"
                  onClick={cancelNavigation}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Detection Modal */}
      {showConflictModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setShowConflictModal(false)}
            />

            {/* Modal */}
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3 className="text-base font-semibold leading-6 text-gray-900">
                      Concurrent Edit Detected
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        {conflictMessage}
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        This can happen when the same configuration is open in multiple browser tabs or when another user made changes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowConflictModal(false);
                    if (pendingForceAction) {
                      pendingForceAction();
                    }
                  }}
                  className="inline-flex w-full justify-center rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 sm:ml-3 sm:w-auto"
                >
                  Overwrite Anyway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConflictModal(false);
                    // Refresh the data to get latest version
                    if (conflictType === 'prompts') {
                      fetchPrompts();
                    } else if (conflictType === 'callSettings') {
                      fetchCallSettings();
                    }
                    toast.info('Reloaded latest configuration');
                  }}
                  className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto"
                >
                  Reload Latest
                </button>
                <button
                  type="button"
                  onClick={() => setShowConflictModal(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
              <p className="text-sm text-gray-500 mt-1">Manage AI settings and qualifying criteria</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                ref={resetButtonRef}
                onClick={() => setShowResetModal(true)}
                className="text-orange-600 hover:text-orange-700 flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors"
                title="Reset all configuration to defaults"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset to Defaults
              </button>
              <button
                onClick={() => handleNavigation('/dashboard')}
                className="text-gray-600 hover:text-gray-800 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div role="alert" aria-live="assertive" className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
              aria-label="Dismiss error"
            >
              <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {success}
            <button
              onClick={() => setSuccess(null)}
              className="ml-auto text-green-500 hover:text-green-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'questions' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Qualifying Questions</h2>
              <p className="text-sm text-gray-500 mt-1">
                These questions will be asked by the AI during calls to qualify leads.
              </p>
            </div>

            {/* Add new question form */}
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <form onSubmit={handleAddQuestion} className="flex gap-4">
                <input
                  type="text"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="Enter a new qualifying question..."
                  className="flex-1 px-4 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={submitting}
                />
                <button
                  type="submit"
                  disabled={!newQuestion.trim() || submitting}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Question
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Questions list */}
            <div className="divide-y divide-gray-200">
              {loading ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="animate-spin h-8 w-8 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading questions...
                </div>
              ) : questions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>No qualifying questions yet.</p>
                  <p className="text-sm mt-1">Add your first question above to get started.</p>
                </div>
              ) : (
                questions.map((q, index) => (
                  <div key={q.id} className="p-4 flex items-center gap-4 hover:bg-gray-50">
                    <span className="text-gray-400 font-medium w-8">{index + 1}.</span>

                    {editingQuestion === q.id ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          defaultValue={q.question}
                          id={`edit-question-${q.id}`}
                          className="flex-1 px-3 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateQuestion(q.id, e.target.value);
                            } else if (e.key === 'Escape') {
                              setEditingQuestion(null);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            const input = document.getElementById(`edit-question-${q.id}`);
                            handleUpdateQuestion(q.id, input.value);
                          }}
                          disabled={submitting}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingQuestion(null)}
                          className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-gray-700">{q.question}</span>
                        <div className="flex items-center gap-2">
                          {/* Move Up Button */}
                          <button
                            onClick={() => handleMoveQuestion(q.id, 'up')}
                            disabled={index === 0 || submitting}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                            title="Move up"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          {/* Move Down Button */}
                          <button
                            onClick={() => handleMoveQuestion(q.id, 'down')}
                            disabled={index === questions.length - 1 || submitting}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                            title="Move down"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setEditingQuestion(q.id)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Edit question"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete question"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'voice' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Voice Selection</h2>
              <p className="text-sm text-gray-500 mt-1">
                Choose the AI voice for your outbound calls. Voices are provided by Deepgram Aura-2.
              </p>
            </div>

            {voicesLoading ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="animate-spin h-8 w-8 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading voices...
              </div>
            ) : voices.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <p>No voices available.</p>
                <p className="text-sm mt-1">Configure your Deepgram API key in Settings to load voices.</p>
              </div>
            ) : (
              <div className="p-6">
                {/* Group voices by gender */}
                <div className="space-y-6">
                  {/* Female voices */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Female Voices
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {voices.filter(v => v.gender === 'female').map(voice => (
                        <button
                          key={voice.voice_id}
                          onClick={() => handleSelectVoice(voice.voice_id)}
                          disabled={submitting}
                          className={`p-4 rounded-lg border-2 text-left transition-all ${
                            selectedVoice === voice.voice_id
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          } ${submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">{voice.name}</span>
                            {selectedVoice === voice.voice_id && (
                              <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{voice.description}</p>
                          <span className="inline-block mt-2 px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 capitalize">
                            {voice.accent}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Male voices */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Male Voices
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {voices.filter(v => v.gender === 'male').map(voice => (
                        <button
                          key={voice.voice_id}
                          onClick={() => handleSelectVoice(voice.voice_id)}
                          disabled={submitting}
                          className={`p-4 rounded-lg border-2 text-left transition-all ${
                            selectedVoice === voice.voice_id
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          } ${submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">{voice.name}</span>
                            {selectedVoice === voice.voice_id && (
                              <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{voice.description}</p>
                          <span className="inline-block mt-2 px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 capitalize">
                            {voice.accent}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    <strong>Currently selected:</strong>{' '}
                    {voices.find(v => v.voice_id === selectedVoice)?.name || 'None'}
                    {voices.find(v => v.voice_id === selectedVoice) && (
                      <span className="text-gray-400"> ({selectedVoice})</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* LLM Model Selection */}
            <div className="mt-6 p-6 border-t border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">AI Model Selection</h2>
              <p className="text-sm text-gray-500 mb-4">
                Choose the language model that powers the AI conversation. Models vary in speed, cost, and capabilities.
              </p>

              {llmModelsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="ml-2 text-gray-500">Loading models...</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Group models by provider */}
                    {['open_ai', 'anthropic', 'google'].map(provider => {
                      const providerModels = llmModels.filter(m => m.provider === provider);
                      if (providerModels.length === 0) return null;

                      const providerName = provider === 'open_ai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Google';

                      return providerModels.map(model => (
                        <button
                          key={model.id}
                          onClick={() => handleSelectLLMModel(model.id)}
                          disabled={submitting}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            selectedLLMModel === model.id
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          } ${submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900 text-sm">{model.name}</span>
                            {selectedLLMModel === model.id && (
                              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                            {providerName}
                          </span>
                        </button>
                      ));
                    })}
                  </div>

                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Currently selected:</strong>{' '}
                      {llmModels.find(m => m.id === selectedLLMModel)?.name || selectedLLMModel}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'prompts' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">AI Prompts</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Configure the system prompt, greetings, and voicemail scripts for the AI agent.
                  </p>
                </div>
                {isDirty && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Unsaved changes
                  </span>
                )}
              </div>
            </div>

            {promptsLoading ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="animate-spin h-8 w-8 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading prompts...
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* System Prompt */}
                <div>
                  <label htmlFor="system-prompt" className="block text-sm font-medium text-gray-700 mb-2">
                    System Prompt
                    <span className="ml-2 text-gray-400 font-normal">
                      (Instructions for how the AI agent should behave)
                    </span>
                  </label>
                  <textarea
                    id="system-prompt"
                    rows={6}
                    value={prompts.system}
                    onChange={(e) => handlePromptChange('system', e.target.value)}
                    placeholder="You are a friendly real estate assistant calling to check if the homeowner is interested in selling their property..."
                    className="w-full px-4 py-3 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  />
                </div>

                {/* Greeting */}
                <div>
                  <label htmlFor="greeting-prompt" className="block text-sm font-medium text-gray-700 mb-2">
                    Greeting Message
                    <span className="ml-2 text-gray-400 font-normal">
                      (First message spoken when a human answers)
                    </span>
                  </label>
                  <textarea
                    id="greeting-prompt"
                    rows={3}
                    value={prompts.greeting}
                    onChange={(e) => handlePromptChange('greeting', e.target.value)}
                    placeholder="Hi, this is [Agent Name] calling about the property at [Address]. Is this [Owner Name]?"
                    className="w-full px-4 py-3 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  />
                </div>

                {/* Goodbye */}
                <div>
                  <label htmlFor="goodbye-prompt" className="block text-sm font-medium text-gray-700 mb-2">
                    Goodbye Message
                    <span className="ml-2 text-gray-400 font-normal">
                      (Message spoken when ending the call)
                    </span>
                  </label>
                  <textarea
                    id="goodbye-prompt"
                    rows={2}
                    value={prompts.goodbye}
                    onChange={(e) => handlePromptChange('goodbye', e.target.value)}
                    placeholder="Thank you for your time. Have a great day!"
                    className="w-full px-4 py-3 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  />
                </div>

                {/* Voicemail */}
                <div>
                  <label htmlFor="voicemail-prompt" className="block text-sm font-medium text-gray-700 mb-2">
                    Voicemail Script
                    <span className="ml-2 text-gray-400 font-normal">
                      (Message left when reaching voicemail)
                    </span>
                  </label>
                  <textarea
                    id="voicemail-prompt"
                    rows={3}
                    value={prompts.voicemail}
                    onChange={(e) => handlePromptChange('voicemail', e.target.value)}
                    placeholder="Hi [Owner Name], this is [Agent Name] calling about your property at [Address]. Please call me back at [Phone Number]. Thank you!"
                    className="w-full px-4 py-3 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleResetPrompts}
                    disabled={!isDirty || submitting}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reset Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSavePrompts(false)}
                    disabled={!isDirty || submitting}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save Prompts
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'callSettings' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Call Settings</h2>
              <p className="text-sm text-gray-500 mt-1">
                Configure retry logic and time-of-day restrictions for outbound calls.
              </p>
            </div>

            {callSettingsLoading ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="animate-spin h-8 w-8 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading call settings...
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Retry Settings Section */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry Logic
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="max-attempts" className="block text-sm font-medium text-gray-700 mb-2">
                        Maximum Retry Attempts
                        <span className="ml-2 text-gray-400 font-normal">
                          (Default: {callSettingsDefaults.max_attempts || 3})
                        </span>
                      </label>
                      <input
                        type="number"
                        id="max-attempts"
                        min="1"
                        max="10"
                        value={callSettings.max_attempts}
                        onChange={(e) => setCallSettings({ ...callSettings, max_attempts: parseInt(e.target.value, 10) || 1 })}
                        className="w-full px-4 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">How many times to try calling a lead before giving up (1-10)</p>
                    </div>

                    <div>
                      <label htmlFor="retry-interval" className="block text-sm font-medium text-gray-700 mb-2">
                        Days Between Retries
                        <span className="ml-2 text-gray-400 font-normal">
                          (Default: {callSettingsDefaults.retry_interval_days || 1})
                        </span>
                      </label>
                      <input
                        type="number"
                        id="retry-interval"
                        min="1"
                        max="7"
                        value={callSettings.retry_interval_days}
                        onChange={(e) => setCallSettings({ ...callSettings, retry_interval_days: parseInt(e.target.value, 10) || 1 })}
                        className="w-full px-4 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">How many days to wait between retry attempts (1-7)</p>
                    </div>
                  </div>
                </div>

                {/* Time Restrictions Section */}
                <div className="pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Time-of-Day Restrictions
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Only place calls during these hours to respect leads' time.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label htmlFor="start-time" className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time
                        <span className="ml-2 text-gray-400 font-normal">
                          (Default: {callSettingsDefaults.start_time || '09:00'})
                        </span>
                      </label>
                      <input
                        type="time"
                        id="start-time"
                        value={callSettings.start_time}
                        onChange={(e) => setCallSettings({ ...callSettings, start_time: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">Earliest time to start calling</p>
                    </div>

                    <div>
                      <label htmlFor="end-time" className="block text-sm font-medium text-gray-700 mb-2">
                        End Time
                        <span className="ml-2 text-gray-400 font-normal">
                          (Default: {callSettingsDefaults.end_time || '19:00'})
                        </span>
                      </label>
                      <input
                        type="time"
                        id="end-time"
                        value={callSettings.end_time}
                        onChange={(e) => setCallSettings({ ...callSettings, end_time: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">Latest time to place calls</p>
                    </div>

                    <div>
                      <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                        Timezone
                        <span className="ml-2 text-gray-400 font-normal">
                          (Default: {callSettingsDefaults.timezone || 'America/New_York'})
                        </span>
                      </label>
                      <select
                        id="timezone"
                        value={callSettings.timezone}
                        onChange={(e) => setCallSettings({ ...callSettings, timezone: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="America/New_York">Eastern Time (ET)</option>
                        <option value="America/Chicago">Central Time (CT)</option>
                        <option value="America/Denver">Mountain Time (MT)</option>
                        <option value="America/Los_Angeles">Pacific Time (PT)</option>
                        <option value="America/Anchorage">Alaska Time (AKT)</option>
                        <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500">Lead's timezone for call timing</p>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-end pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => handleSaveCallSettings(false)}
                    disabled={submitting}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save Settings
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'disqualifiers' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Disqualifying Triggers</h2>
              <p className="text-sm text-gray-500 mt-1">
                Define phrases that, when detected during a call, will disqualify the lead.
              </p>
            </div>

            {/* Add new trigger form */}
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <form onSubmit={handleAddTrigger} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label htmlFor="trigger-phrase" className="block text-sm font-medium text-gray-700 mb-2">
                    Trigger Phrase
                  </label>
                  <input
                    type="text"
                    id="trigger-phrase"
                    value={newTriggerPhrase}
                    onChange={(e) => setNewTriggerPhrase(e.target.value)}
                    placeholder="e.g., 'already sold', 'not interested', 'wrong number'"
                    className="w-full px-4 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div className="w-64">
                  <label htmlFor="trigger-action" className="block text-sm font-medium text-gray-700 mb-2">
                    Action
                  </label>
                  <select
                    id="trigger-action"
                    value={newTriggerAction}
                    onChange={(e) => setNewTriggerAction(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  >
                    <option value="mark_disqualified">Mark as Disqualified</option>
                    <option value="end_call">End Call</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={!newTriggerPhrase.trim() || submitting}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Trigger
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Triggers list */}
            <div className="divide-y divide-gray-200">
              {triggersLoading ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="animate-spin h-8 w-8 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading triggers...
                </div>
              ) : triggers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <p>No disqualifying triggers yet.</p>
                  <p className="text-sm mt-1">Add your first trigger above to get started.</p>
                </div>
              ) : (
                triggers.map((t) => (
                  <div key={t.id} className="p-4 flex items-center gap-4 hover:bg-gray-50">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>

                    {editingTrigger === t.id ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          defaultValue={t.trigger_phrase}
                          id={`edit-trigger-phrase-${t.id}`}
                          className="flex-1 px-3 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const input = document.getElementById(`edit-trigger-phrase-${t.id}`);
                              const select = document.getElementById(`edit-trigger-action-${t.id}`);
                              handleUpdateTrigger(t.id, input.value, select.value);
                            } else if (e.key === 'Escape') {
                              setEditingTrigger(null);
                            }
                          }}
                        />
                        <select
                          id={`edit-trigger-action-${t.id}`}
                          defaultValue={t.action}
                          className="px-3 py-2 border border-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="mark_disqualified">Mark as Disqualified</option>
                          <option value="end_call">End Call</option>
                        </select>
                        <button
                          onClick={() => {
                            const input = document.getElementById(`edit-trigger-phrase-${t.id}`);
                            const select = document.getElementById(`edit-trigger-action-${t.id}`);
                            handleUpdateTrigger(t.id, input.value, select.value);
                          }}
                          disabled={submitting}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingTrigger(null)}
                          className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-gray-700">"{t.trigger_phrase}"</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          t.action === 'end_call'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {t.action === 'end_call' ? 'End Call' : 'Mark Disqualified'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingTrigger(t.id)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Edit trigger"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteTrigger(t.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete trigger"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'testCall' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Test Call</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Test your AI voice agent with your configured prompts and settings before making real calls.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                <div className="text-center">
                  <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Test Your Configuration</h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                    Use this feature to simulate a call with your AI agent. Test your greeting, qualifying questions,
                    and voice settings before calling real leads.
                  </p>

                  <div className="space-y-4 max-w-md mx-auto text-left">
                    <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-semibold text-blue-600">1</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Configure your settings</p>
                        <p className="text-xs text-gray-500">Set up your AI prompts, questions, and voice</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-semibold text-blue-600">2</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Enter a test phone number</p>
                        <p className="text-xs text-gray-500">Use your own number to receive the test call</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-semibold text-blue-600">3</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Review and refine</p>
                        <p className="text-xs text-gray-500">Listen to the test call and adjust settings as needed</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="max-w-md mx-auto">
                      {/* Fake Lead Name Fields */}
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Fake Lead Name <span className="text-red-500">*</span>
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                          The AI will use this name during the test conversation (e.g., "Hi John, I'm calling about...")
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="testFirstName" className="sr-only">First Name</label>
                            <input
                              type="text"
                              id="testFirstName"
                              name="testFirstName"
                              value={testFirstName}
                              onChange={(e) => setTestFirstName(e.target.value)}
                              placeholder="First Name"
                              className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                            />
                          </div>
                          <div>
                            <label htmlFor="testLastName" className="sr-only">Last Name</label>
                            <input
                              type="text"
                              id="testLastName"
                              name="testLastName"
                              value={testLastName}
                              onChange={(e) => setTestLastName(e.target.value)}
                              placeholder="Last Name"
                              className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Fake Property Address Fields */}
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Fake Property Address <span className="text-red-500">*</span>
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                          The AI will reference this property address during the test conversation (e.g., "I'm calling about your property at 123 Main St...")
                        </p>
                        <div className="space-y-3">
                          <div>
                            <label htmlFor="testStreet" className="sr-only">Street Address</label>
                            <input
                              type="text"
                              id="testStreet"
                              name="testStreet"
                              value={testStreet}
                              onChange={(e) => setTestStreet(e.target.value)}
                              placeholder="Street Address (e.g., 123 Main St)"
                              className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="testCity" className="sr-only">City</label>
                              <input
                                type="text"
                                id="testCity"
                                name="testCity"
                                value={testCity}
                                onChange={(e) => setTestCity(e.target.value)}
                                placeholder="City"
                                className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                              />
                            </div>
                            <div>
                              <label htmlFor="testState" className="sr-only">State</label>
                              <input
                                type="text"
                                id="testState"
                                name="testState"
                                value={testState}
                                onChange={(e) => setTestState(e.target.value)}
                                placeholder="State (e.g., TX)"
                                className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <label htmlFor="testPhoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
                        Your Phone Number <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                        <input
                          type="tel"
                          id="testPhoneNumber"
                          name="testPhoneNumber"
                          value={testPhoneNumber}
                          onChange={(e) => setTestPhoneNumber(e.target.value)}
                          placeholder="+12025551234"
                          className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                          aria-describedby="phoneFormatHint"
                        />
                      </div>
                      <p id="phoneFormatHint" className="mt-2 text-sm text-gray-500">
                        Enter your phone number in E.164 format (e.g., +12025551234)
                      </p>

                      {/* Button container for Start/End Call buttons */}
                      <div className="mt-4 flex gap-3">
                        {/* Start Test Call button - hide when call is active */}
                        {!testCallStatus || testCallStatus === 'ended' ? (
                          <button
                            type="button"
                            onClick={handleStartTestCall}
                            disabled={!testPhoneNumber || !testFirstName || !testStreet || !testCity || !testState || testCallLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {testCallLoading ? (
                              <>
                                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Initiating Call...</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span>Start Test Call</span>
                              </>
                            )}
                          </button>
                        ) : (
                          /* End Call button - show when call is active (Feature #230) */
                          <button
                            type="button"
                            onClick={handleEndCall}
                            disabled={endCallLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {endCallLoading ? (
                              <>
                                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Ending Call...</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                                </svg>
                                <span>End Call</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Validation message showing missing required fields */}
                      {(!testPhoneNumber || !testFirstName || !testStreet || !testCity || !testState) && !testCallLoading && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm text-amber-800 font-medium mb-1">Please fill in all required fields:</p>
                          <ul className="text-xs text-amber-700 space-y-0.5 ml-4 list-disc">
                            {!testFirstName && <li>First Name is required</li>}
                            {!testStreet && <li>Street Address is required</li>}
                            {!testCity && <li>City is required</li>}
                            {!testState && <li>State is required</li>}
                            {!testPhoneNumber && <li>Phone Number is required</li>}
                          </ul>
                        </div>
                      )}

                      <p className="mt-3 text-xs text-gray-500 text-center">
                        The AI will call your phone using your configured prompts and settings.
                      </p>

                      {/* Test Call Error Display - Feature #229: Enhanced for API integration errors */}
                      {testCallError && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-red-800">
                                {testCallErrorDetails?.missing || testCallErrorDetails?.invalid ? 'API Integration Error' : 'Call Failed'}
                              </h4>
                              <p className="text-sm text-red-700 mt-1">{testCallError}</p>

                              {/* Feature #229: Show specific missing/invalid API keys */}
                              {testCallErrorDetails?.missing?.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-red-800">Missing API Keys:</p>
                                  <ul className="mt-1 text-xs text-red-700 list-disc list-inside">
                                    {testCallErrorDetails.missing.map((service, idx) => (
                                      <li key={idx}>{service}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {testCallErrorDetails?.invalid?.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-red-800">Invalid API Keys:</p>
                                  <ul className="mt-1 text-xs text-red-700 list-disc list-inside">
                                    {testCallErrorDetails.invalid.map((service, idx) => (
                                      <li key={idx}>{service}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Show link to API Keys configuration if there are integration errors */}
                              {(testCallErrorDetails?.missing?.length > 0 || testCallErrorDetails?.invalid?.length > 0) && (
                                <button
                                  onClick={() => navigate('/settings')}
                                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-800 hover:text-red-900 underline"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  Configure API Keys
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Test Call Success Display */}
                      {testCallResult && (
                        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <h4 className="text-sm font-medium text-green-800">Call Initiated!</h4>
                              <p className="text-sm text-green-700 mt-1">Your phone should ring shortly at {testCallResult.to_phone}</p>
                              <p className="text-xs text-green-600 mt-2">Call ID: {testCallResult.call_id}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Live Transcript Area - Always visible with placeholder when no call */}
                      {true && (
                        <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              Live Transcript
                            </h4>
                            {testCallStatus && (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                testCallStatus === 'connected' ? 'bg-green-100 text-green-800' :
                                testCallStatus === 'dialing' ? 'bg-yellow-100 text-yellow-800' :
                                testCallStatus === 'ringing' ? 'bg-blue-100 text-blue-800' :
                                testCallStatus === 'ended' ? 'bg-gray-100 text-gray-800' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {testCallStatus === 'connected' && (
                                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                )}
                                {testCallStatus === 'dialing' && (
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                  </svg>
                                )}
                                {testCallStatus.charAt(0).toUpperCase() + testCallStatus.slice(1)}
                              </span>
                            )}
                          </div>

                          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
                            {testCallTranscript.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-[180px] text-gray-400">
                                <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <p className="text-sm">Transcript will appear here during the call...</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {testCallTranscript.map((entry, index) => (
                                  <div key={index} className={`flex ${entry.speaker === 'AI' ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                      entry.speaker === 'AI'
                                        ? 'bg-purple-100 text-purple-900'
                                        : 'bg-blue-100 text-blue-900'
                                    }`}>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-semibold">
                                          {entry.speaker === 'AI' ? 'AI Agent' : 'Caller'}
                                        </span>
                                        {entry.timestamp && (
                                          <span className="text-xs opacity-60">{entry.timestamp}</span>
                                        )}
                                      </div>
                                      <p className="text-sm">{entry.text}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Extracted Data / Results Section - Always visible with placeholder */}
                      <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                          Call Results
                        </h4>

                        {testCallExtractedData ? (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Qualification Status */}
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Qualification</p>
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                                    testCallExtractedData.qualification === 'Qualified' ? 'bg-green-100 text-green-800' :
                                    testCallExtractedData.qualification === 'Not Qualified' ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {testCallExtractedData.qualification || 'Pending'}
                                  </span>
                                </div>
                              </div>

                              {/* Sentiment */}
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sentiment</p>
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                                    testCallExtractedData.sentiment === 'Positive' ? 'bg-green-100 text-green-800' :
                                    testCallExtractedData.sentiment === 'Negative' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {testCallExtractedData.sentiment || 'Neutral'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Answers to Questions */}
                            {testCallExtractedData.answers && testCallExtractedData.answers.length > 0 && (
                              <div className="mt-4">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Answers to Questions</p>
                                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                                  {testCallExtractedData.answers.map((answer, index) => (
                                    <div key={index} className="p-3">
                                      <p className="text-xs font-medium text-gray-700 mb-1">Q{index + 1}: {answer.question}</p>
                                      <p className="text-sm text-gray-900">{answer.answer || 'No response'}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Summary */}
                            {testCallExtractedData.summary && (
                              <div className="mt-4">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Call Summary</p>
                                <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                                  <p className="text-sm text-gray-700">{testCallExtractedData.summary}</p>
                                </div>
                              </div>
                            )}

                            {/* Recording Player - Feature #227 */}
                            {testCallRecordingUrl && (
                              <div className="mt-4">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Call Recording</p>
                                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                                  <audio
                                    controls
                                    className="w-full"
                                    src={testCallRecordingUrl}
                                  >
                                    Your browser does not support the audio element.
                                  </audio>
                                  <p className="text-xs text-gray-500 mt-2">
                                    <a
                                      href={testCallRecordingUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 hover:underline"
                                    >
                                      Open recording in new tab
                                    </a>
                                  </p>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                            <div className="flex flex-col items-center justify-center text-gray-400">
                              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              <p className="text-sm">Call results will appear here after the test call completes...</p>
                              <p className="text-xs mt-1">Including qualification status, sentiment, and extracted answers</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Configuration;
