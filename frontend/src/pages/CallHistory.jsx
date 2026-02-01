import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

const API_URL = '/api';

// Helper to get auth token
const getToken = () => localStorage.getItem('token');

// Qualification status badge colors
const QUALIFICATION_COLORS = {
  'Qualified': 'bg-green-100 text-green-800',
  'Not Qualified': 'bg-red-100 text-red-800',
  "Couldn't Reach": 'bg-yellow-100 text-yellow-800'
};

// Disposition badge colors
const DISPOSITION_COLORS = {
  'Callback Scheduled': 'bg-blue-100 text-blue-800',
  'Not Interested': 'bg-gray-100 text-gray-800',
  'Wrong Number': 'bg-red-100 text-red-800',
  'Already Sold': 'bg-purple-100 text-purple-800',
  'Voicemail Left': 'bg-yellow-100 text-yellow-800',
  'No Answer': 'bg-orange-100 text-orange-800',
  'Disqualified': 'bg-red-100 text-red-800'
};

// Sentiment badge colors
const SENTIMENT_COLORS = {
  'Very Motivated': 'bg-green-100 text-green-800',
  'Somewhat Motivated': 'bg-lime-100 text-lime-800',
  'Neutral': 'bg-gray-100 text-gray-800',
  'Reluctant': 'bg-orange-100 text-orange-800',
  'Not Interested': 'bg-red-100 text-red-800'
};

// Icons for accessibility (not conveyed by color alone)
const getQualificationIcon = (status) => {
  switch (status) {
    case 'Qualified':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    case 'Not Qualified':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      );
    case "Couldn't Reach":
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      );
    default:
      return null;
  }
};

const getDispositionIcon = (disposition) => {
  switch (disposition) {
    case 'Callback Scheduled':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      );
    case 'Not Interested':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    case 'Wrong Number':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    case 'Already Sold':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      );
    case 'Voicemail Left':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
        </svg>
      );
    case 'No Answer':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
          <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
        </svg>
      );
    case 'Disqualified':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
        </svg>
      );
    default:
      return null;
  }
};

const getSentimentIcon = (sentiment) => {
  switch (sentiment) {
    case 'Very Motivated':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    case 'Somewhat Motivated':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
        </svg>
      );
    case 'Neutral':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    case 'Reluctant':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      );
    case 'Not Interested':
      return (
        <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      );
    default:
      return null;
  }
};

function CallHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = getToken();
  const [calls, setCalls] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({
    qualification_status: '',
    disposition: '',
    search: '',
    date_from: '',
    date_to: ''
  });
  const [showTranscript, setShowTranscript] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [postingToFub, setPostingToFub] = useState(false);
  const [fubPostResult, setFubPostResult] = useState(null);

  // AbortController ref for cancelling ongoing requests on unmount/navigation
  const abortControllerRef = useRef(null);

  useEffect(() => {
    // Cancel any previous request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (id) {
      fetchCallDetail(id, abortController.signal);
    } else {
      fetchCalls(abortController.signal);
    }

    // Cleanup function: abort request when component unmounts or dependencies change
    return () => {
      abortController.abort();
    };
  }, [id, pagination.page, filters]);

  const fetchCalls = async (signal = null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      });

      if (filters.qualification_status) params.append('qualification_status', filters.qualification_status);
      if (filters.disposition) params.append('disposition', filters.disposition);
      if (filters.search) params.append('search', filters.search);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to + 'T23:59:59');

      const response = await fetch(`${API_URL}/calls?${params}`, {
        signal,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to fetch calls');

      setCalls(data.calls);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      setError(err.message);
    } finally {
      // Only update loading state if not aborted
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const fetchCallDetail = async (callId, signal = null) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/calls/${callId}`, {
        signal,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to fetch call');

      setSelectedCall(data);
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      setError(err.message);
    } finally {
      // Only update loading state if not aborted
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ qualification_status: '', disposition: '', search: '', date_from: '', date_to: '' });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const exportToCSV = async () => {
    setExporting(true);
    try {
      // Build query params based on current filters
      const params = new URLSearchParams();
      if (filters.qualification_status) params.append('qualification_status', filters.qualification_status);
      if (filters.disposition) params.append('disposition', filters.disposition);
      if (filters.search) params.append('search', filters.search);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to + 'T23:59:59');

      const response = await fetch(`${API_URL}/calls/export/csv?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to export calls');
      }

      // Get the CSV data as blob
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `call-history-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export calls');
    } finally {
      setExporting(false);
    }
  };

  const postCallToFub = async (callId) => {
    setPostingToFub(true);
    setFubPostResult(null);
    try {
      const response = await fetch(`${API_URL}/calls/${callId}/post-to-fub`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (!response.ok) {
        setFubPostResult({ success: false, error: data.error || 'Failed to post to FUB' });
      } else {
        setFubPostResult({ success: true, message: data.message, details: data });
      }
    } catch (err) {
      setFubPostResult({ success: false, error: err.message });
    } finally {
      setPostingToFub(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  // Parse transcript into structured messages with speaker labels
  const parseTranscript = (transcript) => {
    if (!transcript) return [];

    const lines = transcript.split('\n').filter(line => line.trim());
    const messages = [];

    // Speaker patterns to detect (case insensitive)
    const speakerPatterns = [
      { pattern: /^(user|caller|homeowner|customer|lead):\s*/i, type: 'caller' },
      { pattern: /^(assistant|agent|ai|sarah|maria|property call):\s*/i, type: 'agent' }
    ];

    lines.forEach((line, index) => {
      let speaker = 'unknown';
      let content = line.trim();

      // Try to match speaker patterns
      for (const { pattern, type } of speakerPatterns) {
        const match = content.match(pattern);
        if (match) {
          speaker = type;
          content = content.substring(match[0].length).trim();
          break;
        }
      }

      // If no pattern matched, try to infer from content
      if (speaker === 'unknown') {
        // Check if previous message gives context
        const prevMessage = messages[messages.length - 1];
        if (prevMessage) {
          // Alternate speakers if unclear
          speaker = prevMessage.speaker === 'agent' ? 'caller' : 'agent';
        } else {
          // First message without clear speaker - default to agent (they typically start calls)
          speaker = 'agent';
        }
      }

      if (content) {
        messages.push({
          id: index,
          speaker,
          content,
          // Note: timestamps not currently stored in transcript
          timestamp: null
        });
      }
    });

    return messages;
  };

  // Get display name for speaker type
  const getSpeakerLabel = (speaker) => {
    switch (speaker) {
      case 'caller':
        return 'Caller';
      case 'agent':
        return 'AI Agent';
      default:
        return 'Unknown';
    }
  };

  // Get speaker icon
  const getSpeakerIcon = (speaker) => {
    if (speaker === 'caller') {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  };

  // Render call detail view
  if (id && selectedCall) {
    return (
      <div className="p-6">
          <div className="mb-6">
            <button
              onClick={() => navigate('/calls')}
              className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Call History
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Call Details</h1>

            {/* Lead Info */}
            <div className="mb-6 pb-6 border-b">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Lead Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">{selectedCall.first_name} {selectedCall.last_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Property Address</p>
                  <p className="font-medium">{selectedCall.property_address}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">City, State, ZIP</p>
                  <p className="font-medium">
                    {selectedCall.property_city}, {selectedCall.property_state} {selectedCall.property_zip}
                  </p>
                </div>
              </div>
            </div>

            {/* Call Outcome */}
            <div className="mb-6 pb-6 border-b">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Call Outcome</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Qualification Status</p>
                  {selectedCall.qualification_status ? (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${QUALIFICATION_COLORS[selectedCall.qualification_status] || 'bg-gray-100'}`}>
                      {getQualificationIcon(selectedCall.qualification_status)}
                      {selectedCall.qualification_status}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Disposition</p>
                  {selectedCall.disposition ? (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${DISPOSITION_COLORS[selectedCall.disposition] || 'bg-gray-100'}`}>
                      {getDispositionIcon(selectedCall.disposition)}
                      {selectedCall.disposition}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Sentiment</p>
                  {selectedCall.sentiment ? (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${SENTIMENT_COLORS[selectedCall.sentiment] || 'bg-gray-100'}`}>
                      {getSentimentIcon(selectedCall.sentiment)}
                      {selectedCall.sentiment}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </div>
              </div>
            </div>

            {/* Call Details */}
            <div className="mb-6 pb-6 border-b">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Call Details</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="font-medium capitalize">{selectedCall.status || 'pending'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Duration</p>
                  <p className="font-medium">{formatDuration(selectedCall.duration_seconds)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Started At</p>
                  <p className="font-medium">{formatDate(selectedCall.started_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ended At</p>
                  <p className="font-medium">{formatDate(selectedCall.ended_at)}</p>
                </div>
                {selectedCall.callback_time && (
                  <div>
                    <p className="text-sm text-gray-500">Callback Scheduled</p>
                    <p className="font-medium">{formatDate(selectedCall.callback_time)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Answers */}
            {selectedCall.answers && Object.keys(selectedCall.answers).length > 0 && (
              <div className="mb-6 pb-6 border-b">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Qualifying Answers</h2>
                <div className="bg-gray-50 rounded-lg p-4">
                  <dl className="space-y-2">
                    {Object.entries(selectedCall.answers).map(([question, answer]) => (
                      <div key={question} className="grid grid-cols-2 gap-2">
                        <dt className="text-sm text-gray-600 font-medium">{question.replace(/_/g, ' ')}:</dt>
                        <dd className="text-sm text-gray-900">{String(answer)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}

            {/* AI Summary */}
            {selectedCall.ai_summary && (
              <div className="mb-6 pb-6 border-b">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">AI Summary</h2>
                <p className="text-gray-700 bg-blue-50 p-4 rounded-lg">{selectedCall.ai_summary}</p>
              </div>
            )}

            {/* Transcript */}
            {selectedCall.transcript && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-800">Transcript</h2>
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showTranscript ? "M19 9l-7 7-7-7" : "M9 5l7 7-7 7"} />
                    </svg>
                    {showTranscript ? 'Hide' : 'Show'} Transcript
                  </button>
                </div>
                {showTranscript && (
                  <div className="bg-gray-50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                    {/* Transcript Legend */}
                    <div className="flex gap-4 mb-4 pb-3 border-b border-gray-200 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span>AI Agent</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span>Caller</span>
                      </div>
                    </div>

                    {/* Parsed Transcript Messages */}
                    <div className="space-y-3">
                      {parseTranscript(selectedCall.transcript).map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.speaker === 'caller' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[85%] ${message.speaker === 'caller' ? 'order-1' : 'order-2'}`}>
                            {/* Speaker Label */}
                            <div className={`flex items-center gap-1 mb-1 text-xs ${message.speaker === 'caller' ? 'justify-end text-green-700' : 'justify-start text-blue-700'}`}>
                              {message.speaker !== 'caller' && getSpeakerIcon(message.speaker)}
                              <span className="font-medium">{getSpeakerLabel(message.speaker)}</span>
                              {message.speaker === 'caller' && getSpeakerIcon(message.speaker)}
                            </div>

                            {/* Message Bubble */}
                            <div
                              className={`px-4 py-2 rounded-2xl text-sm ${
                                message.speaker === 'caller'
                                  ? 'bg-green-100 text-green-900 rounded-tr-sm'
                                  : 'bg-blue-100 text-blue-900 rounded-tl-sm'
                              }`}
                            >
                              {message.content}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Note about timestamps */}
                    {parseTranscript(selectedCall.transcript).length > 0 && (
                      <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-400 text-center">
                        Conversation transcript • Timestamps not available
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Recording */}
            {selectedCall.recording_url && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Recording</h2>
                <audio controls className="w-full">
                  <source src={selectedCall.recording_url} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Debug Logs Section */}
            {(selectedCall.signalwire_log || selectedCall.deepgram_log || selectedCall.telnyx_log || selectedCall.fub_log) && (
              <div className="mb-6 pb-6 border-b">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Debug Logs</h2>
                <div className="space-y-4">
                  {selectedCall.signalwire_log && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">SignalWire</h3>
                      <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                        {selectedCall.signalwire_log}
                      </pre>
                    </div>
                  )}
                  {selectedCall.deepgram_log && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Deepgram</h3>
                      <pre className="bg-gray-900 text-blue-400 p-3 rounded-lg text-xs overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                        {selectedCall.deepgram_log}
                      </pre>
                    </div>
                  )}
                  {selectedCall.telnyx_log && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Telnyx</h3>
                      <pre className="bg-gray-900 text-yellow-400 p-3 rounded-lg text-xs overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                        {selectedCall.telnyx_log}
                      </pre>
                    </div>
                  )}
                  {selectedCall.fub_log && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Follow Up Boss</h3>
                      <pre className="bg-gray-900 text-purple-400 p-3 rounded-lg text-xs overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                        {selectedCall.fub_log}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Post to Follow-up Boss (Feature #169) */}
            <div className="mt-6 pt-6 border-t">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Follow-up Boss Integration</h2>
              <p className="text-sm text-gray-600 mb-4">
                Post this call's results (qualification status, recording URL, and transcript summary) to the lead's Follow-up Boss record.
              </p>

              {/* FUB Post Result Message */}
              {fubPostResult && (
                <div className={`mb-4 p-4 rounded-lg ${fubPostResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {fubPostResult.success ? (
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {fubPostResult.message}
                      </p>
                      {fubPostResult.details?.personUpdate?.fieldsUpdated && (
                        <p className="text-sm mt-1">
                          Updated fields: {fubPostResult.details.personUpdate.fieldsUpdated.join(', ')}
                        </p>
                      )}
                      {fubPostResult.details?.noteCreated?.success && (
                        <p className="text-sm mt-1">Note created with call summary</p>
                      )}
                    </div>
                  ) : (
                    <p className="font-medium flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Error: {fubPostResult.error}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={() => postCallToFub(selectedCall.id)}
                disabled={postingToFub || !selectedCall.qualification_status}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                title={!selectedCall.qualification_status ? 'Call must have qualification data to post to FUB' : 'Post call results to Follow-up Boss'}
              >
                {postingToFub ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Posting to FUB...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Post to Follow-up Boss
                  </>
                )}
              </button>
              {!selectedCall.qualification_status && (
                <p className="text-sm text-gray-500 mt-2">
                  This call does not have qualification data yet. Complete the call with qualification status to enable posting to FUB.
                </p>
              )}
            </div>
          </div>
        </div>
    );
  }

  // Call not found
  if (id && !loading && !selectedCall) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Call Not Found</h1>
          <p className="text-gray-600 mb-4">The call you're looking for doesn't exist or has been deleted.</p>
          <Link to="/calls" className="text-blue-600 hover:text-blue-800">
            Back to Call History
          </Link>
        </div>
      </div>
    );
  }

  // Main call history list view
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Call History</h1>

      {error && (
          <div role="alert" aria-live="assertive" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-700 hover:text-red-900" aria-label="Dismiss error">&times;</button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                placeholder="Name, address, phone..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full px-3 py-2 border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qualification Status</label>
              <select
                value={filters.qualification_status}
                onChange={(e) => handleFilterChange('qualification_status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="Qualified">Qualified</option>
                <option value="Not Qualified">Not Qualified</option>
                <option value="Couldn't Reach">Couldn't Reach</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Disposition</label>
              <select
                value={filters.disposition}
                onChange={(e) => handleFilterChange('disposition', e.target.value)}
                className="w-full px-3 py-2 border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Dispositions</option>
                <option value="Callback Scheduled">Callback Scheduled</option>
                <option value="Not Interested">Not Interested</option>
                <option value="Wrong Number">Wrong Number</option>
                <option value="Already Sold">Already Sold</option>
                <option value="Voicemail Left">Voicemail Left</option>
                <option value="No Answer">No Answer</option>
                <option value="Disqualified">Disqualified</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                className="w-full px-3 py-2 border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                className="w-full px-3 py-2 border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                onClick={exportToCSV}
                disabled={exporting || loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {exporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Exporting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Calls Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading calls...</p>
            </div>
          ) : calls.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <p>No calls found</p>
              {(filters.qualification_status || filters.disposition || filters.search || filters.date_from || filters.date_to) && (
                <button onClick={clearFilters} className="mt-2 text-blue-600 hover:text-blue-800">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disposition</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outcome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {calls.map((call) => (
                    <tr key={call.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {call.first_name} {call.last_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {call.phones && call.phones.length > 0
                            ? (call.phones[0].number || call.phones[0])
                            : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {call.property_address || '-'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {call.property_city}, {call.property_state}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {call.disposition ? (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${DISPOSITION_COLORS[call.disposition] || 'bg-gray-100'}`}>
                            {getDispositionIcon(call.disposition)}
                            {call.disposition}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {call.qualification_status ? (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${QUALIFICATION_COLORS[call.qualification_status] || 'bg-gray-100'}`}>
                            {getQualificationIcon(call.qualification_status)}
                            {call.qualification_status}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(call.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          to={`/calls/${call.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} calls
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
    </div>
  );
}

export default CallHistory;
