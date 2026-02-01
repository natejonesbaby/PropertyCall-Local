import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const API_BASE = '/api';

// Color palette for charts
const CHART_COLORS = {
  // Disposition colors
  'Callback Scheduled': '#10B981', // green
  'Not Interested': '#EF4444', // red
  'Wrong Number': '#F59E0B', // yellow
  'Already Sold': '#6B7280', // gray
  'Voicemail Left': '#8B5CF6', // purple
  'No Answer': '#3B82F6', // blue
  'Disqualified': '#F97316', // orange
  // Qualification colors
  'Qualified': '#10B981', // green
  'Not Qualified': '#EF4444', // red
  "Couldn't Reach": '#F59E0B', // yellow
  // Sentiment colors
  'Very Motivated': '#10B981',
  'Somewhat Motivated': '#34D399',
  'Neutral': '#6B7280',
  'Reluctant': '#F59E0B',
  // Fallback
  'default': '#94A3B8'
};

// Simple Pie Chart Component using SVG
const PieChart = ({ data, title, size = 180 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: size }}>
        <div className="text-gray-400 text-sm">No data available</div>
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: size }}>
        <div className="text-gray-400 text-sm">No calls recorded yet</div>
      </div>
    );
  }

  const radius = size / 2 - 10;
  const centerX = size / 2;
  const centerY = size / 2;

  let currentAngle = -90; // Start from top

  const slices = data.map((item, index) => {
    const percentage = (item.count / total) * 100;
    const angle = (item.count / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    // Calculate arc path
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData = `
      M ${centerX} ${centerY}
      L ${x1} ${y1}
      A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
      Z
    `;

    currentAngle = endAngle;

    const color = CHART_COLORS[item.disposition || item.qualification_status || item.sentiment] || CHART_COLORS.default;
    const label = item.disposition || item.qualification_status || item.sentiment || 'Unknown';

    return {
      pathData,
      color,
      label,
      count: item.count,
      percentage: percentage.toFixed(1)
    };
  });

  return (
    <div className="flex flex-col items-center">
      {title && <h4 className="text-sm font-medium text-gray-700 mb-2">{title}</h4>}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((slice, index) => (
          <path
            key={index}
            d={slice.pathData}
            fill={slice.color}
            stroke="#fff"
            strokeWidth="2"
            className="hover:opacity-80 transition-opacity cursor-pointer"
          >
            <title>{`${slice.label}: ${slice.count} (${slice.percentage}%)`}</title>
          </path>
        ))}
      </svg>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-2 max-w-[250px]">
        {slices.map((slice, index) => (
          <div key={index} className="flex items-center text-xs">
            <div
              className="w-3 h-3 rounded-full mr-1 flex-shrink-0"
              style={{ backgroundColor: slice.color }}
            />
            <span className="text-gray-600 truncate" title={slice.label}>
              {slice.label} ({slice.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple Bar Chart Component using divs
const BarChart = ({ data, title, maxHeight = 150 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: maxHeight }}>
        <div className="text-gray-400 text-sm">No data available</div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map(item => item.count), 1);

  return (
    <div className="w-full">
      {title && <h4 className="text-sm font-medium text-gray-700 mb-3">{title}</h4>}
      <div className="space-y-2">
        {data.map((item, index) => {
          const label = item.disposition || item.qualification_status || item.sentiment || 'Unknown';
          const color = CHART_COLORS[label] || CHART_COLORS.default;
          const widthPercentage = (item.count / maxCount) * 100;

          return (
            <div key={index} className="flex items-center gap-2">
              <div className="w-28 text-xs text-gray-600 text-right truncate" title={label}>
                {label}
              </div>
              <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300 flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(widthPercentage, 8)}%`, backgroundColor: color }}
                >
                  <span className="text-xs text-white font-medium drop-shadow">
                    {item.count}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLeads: 0,
    newLeads: 0,
    calledLeads: 0,
    qualifiedLeads: 0,
    callsToday: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [outcomeData, setOutcomeData] = useState(null);
  const [outcomeLoading, setOutcomeLoading] = useState(true);
  const [pendingCallbacks, setPendingCallbacks] = useState([]);
  const [callbacksLoading, setCallbacksLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [telephonyHealth, setTelephonyHealth] = useState(null);
  const [telephonyHealthLoading, setTelephonyHealthLoading] = useState(true);
  const [telephonyHealthError, setTelephonyHealthError] = useState(null);

  // AbortController ref for cancelling ongoing requests on unmount/navigation
  const abortControllerRef = useRef(null);

  useEffect(() => {
    // Check for user in localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);

    // Create AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Fetch dashboard stats, outcome distribution, pending callbacks, recent activity, and telephony health
    fetchStats(abortController.signal);
    fetchOutcomeDistribution(abortController.signal);
    fetchPendingCallbacks(abortController.signal);
    fetchRecentActivity(abortController.signal);
    fetchTelephonyHealth(abortController.signal);

    // Cleanup function: abort request when component unmounts
    return () => {
      abortController.abort();
    };
  }, []);

  const fetchStats = async (signal = null) => {
    setStatsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/dashboard/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: signal // Pass abort signal to fetch
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      // Ignore abort errors - they're expected when navigating away
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch stats:', error);
    } finally {
      // Only update loading state if not aborted
      if (!signal?.aborted) {
        setStatsLoading(false);
      }
    }
  };

  const fetchOutcomeDistribution = async (signal = null) => {
    setOutcomeLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/dashboard/outcome-distribution`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: signal
      });
      if (response.ok) {
        const data = await response.json();
        setOutcomeData(data);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch outcome distribution:', error);
    } finally {
      if (!signal?.aborted) {
        setOutcomeLoading(false);
      }
    }
  };

  const fetchPendingCallbacks = async (signal = null) => {
    setCallbacksLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/dashboard/pending-callbacks?limit=5`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: signal
      });
      if (response.ok) {
        const data = await response.json();
        setPendingCallbacks(data.callbacks || []);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch pending callbacks:', error);
    } finally {
      if (!signal?.aborted) {
        setCallbacksLoading(false);
      }
    }
  };

  const fetchRecentActivity = async (signal = null) => {
    setActivityLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/dashboard/recent-activity?limit=10`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: signal
      });
      if (response.ok) {
        const data = await response.json();
        setRecentActivity(data.activities || []);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch recent activity:', error);
    } finally {
      if (!signal?.aborted) {
        setActivityLoading(false);
      }
    }
  };

  const fetchTelephonyHealth = async (signal = null) => {
    setTelephonyHealthLoading(true);
    setTelephonyHealthError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/health/telephony`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: signal
      });
      if (response.ok) {
        const data = await response.json();
        setTelephonyHealth({
          ...data,
          lastCheck: new Date().toISOString()
        });
      } else {
        setTelephonyHealthError('Failed to check health');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch telephony health:', error);
      setTelephonyHealthError(error.message || 'Failed to check health');
    } finally {
      if (!signal?.aborted) {
        setTelephonyHealthLoading(false);
      }
    }
  };

  // Helper function to format callback time
  const formatCallbackTime = (dateString) => {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMs < 0) {
      // Past due
      const pastMins = Math.abs(diffMins);
      const pastHours = Math.abs(diffHours);
      if (pastMins < 60) return `${pastMins} min overdue`;
      if (pastHours < 24) return `${pastHours} hr overdue`;
      return 'Past due';
    }

    if (diffMins < 60) return `In ${diffMins} min`;
    if (diffHours < 24) return `In ${diffHours} hr`;
    if (diffDays === 1) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  // Helper function to format activity timestamp
  const formatActivityTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Helper to get activity icon based on type
  const getActivityIcon = (type, icon) => {
    switch (icon || type) {
      case 'upload':
      case 'import':
        return (
          <div className="p-2 rounded-full bg-blue-100">
            <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
        );
      case 'phone':
      case 'call':
        return (
          <div className="p-2 rounded-full bg-purple-100">
            <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
        );
      case 'user':
      case 'lead':
        return (
          <div className="p-2 rounded-full bg-green-100">
            <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="p-2 rounded-full bg-gray-100">
            <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  // Helper to get provider icon
  const getProviderIcon = (provider) => {
    switch (provider?.toLowerCase()) {
      case 'telnyx':
        return (
          <div className="p-3 bg-blue-100 rounded-full">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
        );
      case 'signalwire':
        return (
          <div className="p-3 bg-purple-100 rounded-full">
            <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="p-3 bg-gray-100 rounded-full">
            <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  // Helper to get status color and text
  const getHealthStatusDisplay = (health) => {
    if (!health) {
      return {
        color: 'gray',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-600',
        dotColor: 'bg-gray-400',
        text: 'Unknown'
      };
    }

    switch (health.status) {
      case 'connected':
        return {
          color: 'green',
          bgColor: 'bg-green-100',
          textColor: 'text-green-600',
          dotColor: 'bg-green-500',
          text: 'Connected'
        };
      case 'error':
        return {
          color: 'red',
          bgColor: 'bg-red-100',
          textColor: 'text-red-600',
          dotColor: 'bg-red-500',
          text: 'Disconnected'
        };
      case 'not_configured':
        return {
          color: 'yellow',
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-600',
          dotColor: 'bg-yellow-500',
          text: 'Not Configured'
        };
      default:
        return {
          color: 'gray',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-600',
          dotColor: 'bg-gray-400',
          text: 'Unknown'
        };
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Main Content */}
      <div className="max-w-7xl">
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Dashboard</h2>
          <p className="text-gray-600">Welcome to Property Call. Start by importing leads or monitoring calls.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          {/* Telephony Provider Health Card */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                {getProviderIcon(telephonyHealth?.provider)}
                <div>
                  <p className="text-sm font-medium text-gray-900">Telephony</p>
                  <p className="text-xs text-gray-500">{telephonyHealth?.provider || 'Not configured'}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {(() => {
                  const statusDisplay = getHealthStatusDisplay(telephonyHealth);
                  return (
                    <>
                      <div className={`w-2.5 h-2.5 rounded-full ${statusDisplay.dotColor}`}></div>
                      <span className={`text-sm font-medium ${statusDisplay.textColor}`}>
                        {statusDisplay.text}
                      </span>
                    </>
                  );
                })()}
              </div>
              <button
                onClick={() => fetchTelephonyHealth()}
                disabled={telephonyHealthLoading}
                className={`p-1.5 rounded-lg transition-colors ${
                  telephonyHealthLoading
                    ? 'bg-gray-100 cursor-not-allowed'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
                title="Refresh health status"
              >
                <svg
                  className={`h-4 w-4 text-gray-600 ${telephonyHealthLoading ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            {telephonyHealth?.lastCheck && (
              <p className="text-xs text-gray-400 mt-2">
                Last check: {formatActivityTime(telephonyHealth.lastCheck)}
              </p>
            )}
            {telephonyHealth?.responseTimeMs && (
              <p className="text-xs text-gray-400 mt-1">
                Response time: {telephonyHealth.responseTimeMs}ms
              </p>
            )}
            {telephonyHealth?.lastSuccessfulCall && (
              <p className="text-xs text-gray-400 mt-1">
                Last successful call: {formatActivityTime(telephonyHealth.lastSuccessfulCall)}
              </p>
            )}
            {telephonyHealth?.errorCount !== undefined && telephonyHealth.errorCount > 0 && (
              <p className="text-xs text-red-500 mt-1">
                {telephonyHealth.errorCount} error{telephonyHealth.errorCount > 1 ? 's' : ''} in last 24h
              </p>
            )}
            {telephonyHealth?.errorCount !== undefined && telephonyHealth.errorCount === 0 && (
              <p className="text-xs text-green-500 mt-1">
                No errors in last 24h
              </p>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Leads</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? '...' : stats.totalLeads.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">New Leads</p>
                <p className="text-2xl font-bold text-green-700">
                  {statsLoading ? '...' : stats.newLeads.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Called</p>
                <p className="text-2xl font-bold text-amber-700">
                  {statsLoading ? '...' : stats.calledLeads.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
            </div>
          </div>

          <Link
            to="/qualified-leads"
            className="bg-white p-6 rounded-lg shadow-sm border hover:border-purple-500 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Qualified</p>
                <p className="text-2xl font-bold text-purple-600">
                  {statsLoading ? '...' : stats.qualifiedLeads.toLocaleString()}
                </p>
                <p className="text-xs text-purple-500 mt-1">Click to view</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </Link>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Calls Today</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {statsLoading ? '...' : stats.callsToday.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-full">
                <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Call Outcome Distribution Charts */}
        <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Call Outcome Distribution</h3>
          {outcomeLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : outcomeData && (outcomeData.byDisposition?.length > 0 || outcomeData.byQualification?.length > 0) ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Pie Chart - Disposition */}
              <div className="flex flex-col items-center">
                <PieChart
                  data={outcomeData.byDisposition}
                  title="By Disposition"
                  size={180}
                />
              </div>

              {/* Bar Chart - Disposition */}
              <div className="flex flex-col">
                <BarChart
                  data={outcomeData.byDisposition}
                  title="Call Dispositions"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <svg className="h-12 w-12 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm">No call data available yet</p>
              <p className="text-xs text-gray-400 mt-1">Charts will appear after calls are made</p>
            </div>
          )}

          {/* Additional stats row */}
          {outcomeData && outcomeData.totalCalls > 0 && (
            <div className="mt-6 pt-4 border-t">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{outcomeData.totalCalls}</p>
                  <p className="text-xs text-gray-500">Total Completed Calls</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {outcomeData.byQualification?.find(q => q.qualification_status === 'Qualified')?.count || 0}
                  </p>
                  <p className="text-xs text-gray-500">Qualified Leads</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">
                    {outcomeData.byDisposition?.find(d => d.disposition === 'Callback Scheduled')?.count || 0}
                  </p>
                  <p className="text-xs text-gray-500">Callbacks Scheduled</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pending Callbacks Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <svg className="h-5 w-5 text-orange-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pending Callbacks
            </h3>
            {pendingCallbacks.length > 0 && (
              <Link to="/calls?disposition=Callback%20Scheduled" className="text-sm text-blue-600 hover:text-blue-800">
                View all
              </Link>
            )}
          </div>

          {callbacksLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : pendingCallbacks.length > 0 ? (
            <div className="space-y-3">
              {pendingCallbacks.map((callback) => {
                const leadName = [callback.first_name, callback.last_name].filter(Boolean).join(' ') || 'Unknown';
                const primaryPhone = callback.phones?.[0]?.number || callback.phones?.[0] || 'No phone';
                const timeLabel = formatCallbackTime(callback.callback_time);
                const isOverdue = callback.callback_time && new Date(callback.callback_time) < new Date();

                return (
                  <div
                    key={callback.call_id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isOverdue ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-full ${isOverdue ? 'bg-red-100' : 'bg-orange-100'}`}>
                        <svg className={`h-4 w-4 ${isOverdue ? 'text-red-600' : 'text-orange-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{leadName}</p>
                        <p className="text-sm text-gray-500">{primaryPhone}</p>
                        {callback.property_address && (
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">
                            {callback.property_address}, {callback.property_city}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                        {timeLabel}
                      </p>
                      <p className="text-xs text-gray-400">
                        {callback.callback_time && new Date(callback.callback_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </p>
                      <Link
                        to={`/leads/${callback.lead_id}`}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        View Lead
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <svg className="h-10 w-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No pending callbacks</p>
              <p className="text-xs text-gray-400 mt-1">Callbacks will appear here after calls</p>
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <svg className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Recent Activity
            </h3>
          </div>

          {activityLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  {getActivityIcon(activity.type, activity.icon)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {activity.action}
                      </p>
                      <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                        {formatActivityTime(activity.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate" title={activity.description}>
                      {activity.description}
                    </p>
                    {/* Additional details for imports */}
                    {activity.type === 'import' && activity.details && (
                      <div className="mt-1 flex items-center space-x-3 text-xs text-gray-500">
                        <span>{activity.details.totalRows} total rows</span>
                        <span className="text-green-600">{activity.details.imported} imported</span>
                        {activity.details.duplicates > 0 && (
                          <span className="text-yellow-600">{activity.details.duplicates} duplicates</span>
                        )}
                        {activity.details.errors > 0 && (
                          <span className="text-red-600">{activity.details.errors} errors</span>
                        )}
                      </div>
                    )}
                    {/* Additional details for calls */}
                    {activity.type === 'call' && activity.details && activity.details.duration && (
                      <div className="mt-1 text-xs text-gray-500">
                        Duration: {Math.floor(activity.details.duration / 60)}:{String(activity.details.duration % 60).padStart(2, '0')}
                      </div>
                    )}
                  </div>
                  {/* Link to related item */}
                  {activity.type === 'call' && activity.details?.leadId && (
                    <Link
                      to={`/leads/${activity.details.leadId}`}
                      className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
                    >
                      View Lead
                    </Link>
                  )}
                  {activity.type === 'lead' && activity.details?.leadId && (
                    <Link
                      to={`/leads/${activity.details.leadId}`}
                      className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
                    >
                      View
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <svg className="h-10 w-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No recent activity</p>
              <p className="text-xs text-gray-400 mt-1">Import leads or make calls to see activity here</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link
            to="/import"
            className="bg-white p-6 rounded-lg shadow-sm border hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <svg className="h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Import Leads</h3>
                <p className="text-sm text-gray-500">Upload XLSX files from Kind Skiptracing</p>
              </div>
            </div>
          </Link>

          <Link
            to="/leads"
            className="bg-white p-6 rounded-lg shadow-sm border hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">View Leads</h3>
                <p className="text-sm text-gray-500">Browse and manage your leads</p>
              </div>
            </div>
          </Link>

          <Link
            to="/calls"
            className="bg-white p-6 rounded-lg shadow-sm border hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <svg className="h-10 w-10 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Call History</h3>
                <p className="text-sm text-gray-500">View past calls and recordings</p>
              </div>
            </div>
          </Link>

          <Link
            to="/monitor"
            className="bg-white p-6 rounded-lg shadow-sm border hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Live Monitor</h3>
                <p className="text-sm text-gray-500">Listen to active calls in real-time</p>
              </div>
            </div>
          </Link>

          <Link
            to="/queue"
            className="bg-white p-6 rounded-lg shadow-sm border hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <svg className="h-10 w-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Call Queue</h3>
                <p className="text-sm text-gray-500">Manage pending calls</p>
              </div>
            </div>
          </Link>

          <Link
            to="/config"
            className="bg-white p-6 rounded-lg shadow-sm border hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <svg className="h-10 w-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Configuration</h3>
                <p className="text-sm text-gray-500">AI prompts, questions, settings</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
