import { useState, useEffect, useRef, useCallback } from 'react';

// Use relative URLs for Vite proxy
const API_URL = '';
const getWsUrl = () => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}`;
};

export default function LiveMonitor() {
  const [activeCalls, setActiveCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [conversationEvents, setConversationEvents] = useState([]);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [listeningToCallId, setListeningToCallId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.8);
  const wsRef = useRef(null);
  const listenWsRef = useRef(null);
  const audioContextRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const callTimersRef = useRef({});
  const eventsEndRef = useRef(null);

  // Fetch active calls from API
  const fetchActiveCalls = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/calls/active`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch active calls');
      }

      const data = await response.json();
      setActiveCalls(data.calls || []);
      setError('');
    } catch (err) {
      console.error('Error fetching active calls:', err);
      setError('Failed to load active calls');
    } finally {
      setLoading(false);
    }
  }, []);

  // Connect to WebSocket for real-time updates
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      wsRef.current = new WebSocket(`${getWsUrl()}/ws/monitor?token=${token}`);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        setError('');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };

      wsRef.current.onerror = (err) => {
        console.error('WebSocket error:', err);
        setConnected(false);
      };
    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setConnected(false);
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback((message) => {
    const { type, data } = message;

    switch (type) {
      case 'call_started':
        // Add new call to the list
        setActiveCalls(prev => {
          // Check if call already exists
          if (prev.some(c => c.id === data.id)) {
            return prev;
          }
          return [data, ...prev];
        });
        break;

      case 'call_status_update':
      case 'call_answered':
        // Update existing call status
        setActiveCalls(prev =>
          prev.map(call =>
            (call.id === data.id || call.telnyx_call_id === data.telnyx_call_id)
              ? { ...call, ...data }
              : call
          )
        );
        break;

      case 'call_ended':
        // Remove call from list
        setActiveCalls(prev => prev.filter(call => call.id !== data.id));
        // Clean up timer
        if (callTimersRef.current[data.id]) {
          clearInterval(callTimersRef.current[data.id]);
          delete callTimersRef.current[data.id];
        }
        // Add event to log
        setConversationEvents(prev => [...prev.slice(-49), {
          id: Date.now(),
          callId: data.callId || data.id,
          eventType: 'CallEnded',
          timestamp: new Date().toISOString()
        }]);
        break;

      case 'active_calls_sync':
        // Full sync of active calls
        setActiveCalls(data.calls || []);
        break;

      case 'conversation_event':
        // Track conversation events in real-time
        setConversationEvents(prev => [...prev.slice(-49), {
          id: Date.now(),
          callId: data.callId,
          eventType: data.eventType,
          content: data.content,
          timestamp: data.timestamp || new Date().toISOString()
        }]);
        break;

      case 'transcript_update':
        // Track transcript updates as events
        setConversationEvents(prev => [...prev.slice(-49), {
          id: Date.now(),
          callId: data.callId,
          eventType: 'TranscriptUpdate',
          role: data.role,
          content: data.content,
          timestamp: data.timestamp || new Date().toISOString()
        }]);
        break;

      case 'session_started':
        // Track session start
        setConversationEvents(prev => [...prev.slice(-49), {
          id: Date.now(),
          callId: data.callId,
          eventType: 'SessionStarted',
          sessionId: data.sessionId,
          timestamp: new Date().toISOString()
        }]);
        break;

      default:
        console.log('Unknown message type:', type);
    }
  }, []);

  // Update call durations every second
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCalls(prev =>
        prev.map(call => {
          if (call.started_at && call.status === 'in_progress') {
            const startTime = new Date(call.started_at).getTime();
            const now = Date.now();
            const durationSeconds = Math.floor((now - startTime) / 1000);
            return { ...call, live_duration: durationSeconds };
          }
          return call;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Initialize on mount
  useEffect(() => {
    fetchActiveCalls();
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      Object.values(callTimersRef.current).forEach(timer => clearInterval(timer));
    };
  }, [fetchActiveCalls, connectWebSocket]);

  // Format duration for display
  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'in_progress':
        return 'bg-green-100 text-green-800';
      case 'ringing':
        return 'bg-yellow-100 text-yellow-800';
      case 'connecting':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get the primary phone number
  const getPrimaryPhone = (phones) => {
    if (!phones || phones.length === 0) return 'No phone';
    const phone = phones[0];
    return phone.number || phone;
  };

  // Manually refresh active calls
  const handleRefresh = () => {
    setLoading(true);
    fetchActiveCalls();
  };

  // Start listening to a call's audio
  const startListening = useCallback((callId) => {
    // Close any existing listen connection
    if (listenWsRef.current) {
      listenWsRef.current.close();
    }

    // Initialize Web Audio API
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 8000 // Mulaw audio at 8kHz
      });
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    // Connect to the live listening WebSocket
    const listenWs = new WebSocket(`${getWsUrl()}/ws/listen/${callId}`);
    listenWsRef.current = listenWs;

    listenWs.onopen = () => {
      console.log(`[Listen] Connected to call ${callId}`);
      setIsListening(true);
      setListeningToCallId(callId);
    };

    listenWs.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'audio') {
          // Decode and play the audio
          playAudioChunk(message.audio, message.source);
        } else if (message.type === 'listening_started') {
          console.log(`[Listen] Listening started for call ${message.callId}`);
        } else if (message.type === 'error') {
          console.error('[Listen] Error:', message.message);
          setError(message.message);
        }
      } catch (err) {
        console.error('[Listen] Failed to parse message:', err);
      }
    };

    listenWs.onclose = () => {
      console.log(`[Listen] Disconnected from call ${callId}`);
      setIsListening(false);
      setListeningToCallId(null);
    };

    listenWs.onerror = (err) => {
      console.error('[Listen] WebSocket error:', err);
      setIsListening(false);
      setListeningToCallId(null);
    };
  }, []);

  // Stop listening to a call
  const stopListening = useCallback(() => {
    if (listenWsRef.current) {
      listenWsRef.current.close();
      listenWsRef.current = null;
    }
    setIsListening(false);
    setListeningToCallId(null);
  }, []);

  // Play an audio chunk (mulaw to PCM conversion and playback)
  const playAudioChunk = useCallback((base64Audio, source) => {
    if (!audioContextRef.current) return;

    try {
      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert mulaw to linear PCM
      const pcmData = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        pcmData[i] = mulawDecode(bytes[i]) / 32768.0;
      }

      // Create an audio buffer
      const audioBuffer = audioContextRef.current.createBuffer(1, pcmData.length, 8000);
      audioBuffer.getChannelData(0).set(pcmData);

      // Create buffer source and gain node for volume control
      const bufferSource = audioContextRef.current.createBufferSource();
      const gainNode = audioContextRef.current.createGain();

      bufferSource.buffer = audioBuffer;
      gainNode.gain.value = audioVolume;

      bufferSource.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      // Start playback
      bufferSource.start(0);
    } catch (err) {
      console.error('[Audio] Playback error:', err);
    }
  }, [audioVolume]);

  // Mulaw decode lookup table
  const mulawDecode = (mulawByte) => {
    // Invert the byte
    mulawByte = ~mulawByte;

    const sign = (mulawByte & 0x80) ? -1 : 1;
    const exponent = (mulawByte >> 4) & 0x07;
    const mantissa = mulawByte & 0x0F;

    let sample = ((mantissa << 3) + 132) << exponent;
    sample -= 132;

    return sign * sample;
  };

  // Cleanup listen WebSocket on unmount
  useEffect(() => {
    return () => {
      if (listenWsRef.current) {
        listenWsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Get icon and color for event type
  const getEventStyle = (eventType) => {
    switch (eventType) {
      case 'UserStartedSpeaking':
        return { icon: '🎤', color: 'text-blue-600', bg: 'bg-blue-50', label: 'User Speaking' };
      case 'UserStoppedSpeaking':
        return { icon: '🔇', color: 'text-blue-400', bg: 'bg-blue-50', label: 'User Stopped' };
      case 'AgentThinking':
        return { icon: '🤔', color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Agent Thinking' };
      case 'AgentStartedSpeaking':
        return { icon: '🔊', color: 'text-green-600', bg: 'bg-green-50', label: 'Agent Speaking' };
      case 'AgentAudioDone':
        return { icon: '✓', color: 'text-green-400', bg: 'bg-green-50', label: 'Agent Done' };
      case 'TranscriptUpdate':
        return { icon: '📝', color: 'text-purple-600', bg: 'bg-purple-50', label: 'Transcript' };
      case 'SessionStarted':
        return { icon: '🚀', color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Session Started' };
      case 'CallEnded':
        return { icon: '📵', color: 'text-red-600', bg: 'bg-red-50', label: 'Call Ended' };
      default:
        return { icon: '📌', color: 'text-gray-600', bg: 'bg-gray-50', label: eventType };
    }
  };

  // Auto-scroll events log
  useEffect(() => {
    if (eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationEvents]);

  // Clear events for a call when it ends
  const clearEventsForCall = (callId) => {
    setConversationEvents(prev => prev.filter(e => e.callId !== callId));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Monitor</h1>
          <p className="mt-1 text-sm text-gray-600">
            Real-time view of active calls
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                connected ? 'bg-green-500' : 'bg-red-500'
              }`}
              title={connected ? 'Connected' : 'Disconnected'}
            ></span>
            <span className="text-sm text-gray-600">
              {connected ? 'Live' : 'Reconnecting...'}
            </span>
          </div>
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </div>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-green-100 rounded-full">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active Calls</p>
              <p className="text-2xl font-semibold text-gray-900">{activeCalls.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Status</p>
              <p className="text-lg font-semibold text-gray-900">
                {connected ? 'Real-time' : 'Polling'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-purple-100 rounded-full">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Last Update</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Live Listening Panel */}
      {isListening && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-green-100">
                  <svg className="w-6 h-6 text-green-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.465a5 5 0 001.414 1.414M7.05 4.05a9 9 0 00-2.475 9.683m9.193-9.193a5 5 0 11-7.07 7.07" />
                  </svg>
                </span>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-green-800">
                  🎧 Listening to Call #{listeningToCallId}
                </h3>
                <p className="text-sm text-green-600">
                  You are hearing both the caller and the AI agent in real-time.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Volume Control */}
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.465a5 5 0 001.414 1.414M7.05 4.05a9 9 0 00-2.475 9.683m9.193-9.193a5 5 0 11-7.07 7.07" />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={audioVolume}
                  onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                  className="w-24 h-2 bg-green-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-green-700 w-12">{Math.round(audioVolume * 100)}%</span>
              </div>
              {/* Stop Button */}
              <button
                onClick={stopListening}
                className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop Listening
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active calls list */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Active Calls</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : activeCalls.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No active calls</h3>
            <p className="mt-1 text-sm text-gray-500">
              Active calls will appear here in real-time when initiated.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lead
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Started
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium text-sm">
                            {(call.first_name?.[0] || '') + (call.last_name?.[0] || '') || '?'}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {[call.first_name, call.last_name].filter(Boolean).join(' ') || 'Unknown'}
                          </div>
                          <div className="text-sm text-gray-500">
                            Lead #{call.lead_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getPrimaryPhone(call.phones)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {call.property_address || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(call.status)}`}>
                        {call.status === 'in_progress' ? 'In Progress' : call.status === 'ringing' ? 'Ringing' : call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {call.status === 'in_progress' && (
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></span>
                        )}
                        {call.status === 'ringing' && (
                          <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-2"></span>
                        )}
                        <span className="text-sm font-mono text-gray-900">
                          {formatDuration(call.live_duration || call.duration_seconds)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {call.started_at
                        ? new Date(call.started_at).toLocaleTimeString()
                        : '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {listeningToCallId === call.id ? (
                        <button
                          onClick={stopListening}
                          className="inline-flex items-center px-3 py-1.5 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          <svg className="w-4 h-4 mr-1.5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L6.382 6H4a1 1 0 000 2h.268l.437 8.743A2 2 0 006.701 19h6.598a2 2 0 001.996-2.257L15.732 8H16a1 1 0 100-2h-2.382l-1.724-3.447A1 1 0 0011 2H9zm1 4a1 1 0 011 1v6a1 1 0 11-2 0V7a1 1 0 011-1z" clipRule="evenodd" />
                          </svg>
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => startListening(call.id)}
                          disabled={isListening}
                          className="inline-flex items-center px-3 py-1.5 border border-green-300 text-sm font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.465a5 5 0 001.414 1.414M7.05 4.05a9 9 0 00-2.475 9.683m9.193-9.193a5 5 0 11-7.07 7.07" />
                          </svg>
                          Listen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Conversation Events Panel */}
      <div className="mt-6 bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Conversation Events</h2>
            <p className="text-sm text-gray-500">Real-time tracking of call events</p>
          </div>
          {conversationEvents.length > 0 && (
            <button
              onClick={() => setConversationEvents([])}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {conversationEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>No conversation events yet.</p>
              <p className="text-xs mt-1">Events will appear here during active calls.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {conversationEvents.map((event) => {
                const style = getEventStyle(event.eventType);
                return (
                  <div
                    key={event.id}
                    className={`px-4 py-3 ${style.bg} hover:bg-opacity-75 transition-colors`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0">{style.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${style.color}`}>{style.label}</span>
                          <span className="text-xs text-gray-400">
                            Call #{event.callId}
                          </span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        {event.content && (
                          <p className="text-sm text-gray-700 mt-1 truncate">
                            {event.role && <span className="font-medium">{event.role}: </span>}
                            {event.content}
                          </p>
                        )}
                        {event.sessionId && (
                          <p className="text-xs text-gray-500 mt-1">
                            Session: {event.sessionId}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={eventsEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Real-time monitoring
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                This page automatically updates when calls start, change status, or end.
                The connection indicator shows whether you're receiving live updates.
                Conversation events (speaking, thinking, transcripts) appear in the Events panel.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
