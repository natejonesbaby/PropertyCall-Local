import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom';

const API_BASE = '/api';

// Helper to get auth token
const getAuthToken = () => {
  return localStorage.getItem('token');
};

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

const Leads = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL query parameters
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [deleting, setDeleting] = useState(null);
  const [triggeringCall, setTriggeringCall] = useState(null);
  const [success, setSuccess] = useState(null);
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'created_at');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sortOrder') || 'desc');
  const [pagination, setPagination] = useState({
    page: parseInt(searchParams.get('page')) || 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  // Single lead detail state
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadNotFound, setLeadNotFound] = useState(false);
  const [leadCalls, setLeadCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  // AbortController ref for cancelling ongoing requests on unmount/navigation
  const abortControllerRef = useRef(null);

  // Debounce timer ref for search-as-you-type
  const debounceTimerRef = useRef(null);
  const DEBOUNCE_DELAY = 300; // 300ms debounce delay

  // Available status options
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'new', label: 'New' },
    { value: 'called', label: 'Called' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'not_qualified', label: 'Not Qualified' },
    { value: 'callback', label: 'Callback Scheduled' },
    { value: 'no_answer', label: 'No Answer' },
    { value: 'voicemail', label: 'Voicemail' },
    { value: 'wrong_number', label: 'Wrong Number' },
    { value: 'do_not_call', label: 'Do Not Call' }
  ];

  // Get status icon for accessibility (not conveyed by color alone)
  const getStatusIcon = (status, qualificationStatus) => {
    const effectiveStatus = qualificationStatus || status;
    switch (effectiveStatus) {
      case 'qualified':
      case 'Qualified':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'not_qualified':
      case 'Not Qualified':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'called':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
        );
      case 'callback':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        );
      case 'no_answer':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
          </svg>
        );
      case 'voicemail':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
          </svg>
        );
      case 'wrong_number':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'do_not_call':
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
          </svg>
        );
      case 'new':
      default:
        return (
          <svg className="h-3.5 w-3.5 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  // Update URL query parameters
  const updateUrlParams = (params) => {
    const newSearchParams = new URLSearchParams();

    if (params.search) newSearchParams.set('search', params.search);
    if (params.status) newSearchParams.set('status', params.status);
    if (params.page && params.page > 1) newSearchParams.set('page', params.page.toString());
    if (params.sortBy && params.sortBy !== 'created_at') newSearchParams.set('sortBy', params.sortBy);
    if (params.sortOrder && params.sortOrder !== 'desc') newSearchParams.set('sortOrder', params.sortOrder);

    setSearchParams(newSearchParams, { replace: true });
  };

  // Fetch leads
  const fetchLeads = async (page = 1, searchTerm = '', status = '', sort = sortBy, order = sortOrder, updateUrl = true, signal = null) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        search: searchTerm,
        sortBy: sort,
        sortOrder: order
      });

      // Add status filter if specified
      if (status) {
        params.set('status', status);
      }

      const response = await fetch(`${API_BASE}/leads?${params}`, {
        headers: getAuthHeaders(),
        signal: signal // Pass abort signal to fetch
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch leads');
      }

      setLeads(data.leads || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });

      // Update URL parameters to reflect current state
      if (updateUrl) {
        updateUrlParams({ search: searchTerm, status, page, sortBy: sort, sortOrder: order });
      }
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      setError(err.message || 'Failed to load leads');
    } finally {
      // Only update loading state if not aborted
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  // Fetch calls for a specific lead
  const fetchLeadCalls = async (leadId, signal = null) => {
    setLoadingCalls(true);
    try {
      const response = await fetch(`${API_BASE}/calls?lead_id=${leadId}`, {
        headers: getAuthHeaders(),
        signal: signal
      });
      const data = await response.json();

      if (response.ok) {
        setLeadCalls(data.calls || []);
      }
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch lead calls:', err);
      setLeadCalls([]);
    } finally {
      if (!signal?.aborted) {
        setLoadingCalls(false);
      }
    }
  };

  // Fetch a single lead by ID
  const fetchLeadById = async (leadId, signal = null) => {
    setLoading(true);
    setError(null);
    setLeadNotFound(false);
    setSelectedLead(null);
    setLeadCalls([]);

    try {
      const response = await fetch(`${API_BASE}/leads/${leadId}`, {
        headers: getAuthHeaders(),
        signal: signal // Pass abort signal to fetch
      });
      const data = await response.json();

      if (response.status === 404) {
        setLeadNotFound(true);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch lead');
      }

      setSelectedLead(data.lead);
      // Also fetch calls for this lead
      fetchLeadCalls(leadId, signal);
    } catch (err) {
      // Ignore abort errors - they're expected when navigating away
      if (err.name === 'AbortError') {
        return;
      }
      setError(err.message || 'Failed to load lead');
    } finally {
      // Only update loading state if not aborted
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Cancel any previous request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (id) {
      // If we have an ID parameter, fetch that specific lead
      fetchLeadById(id, abortController.signal);
    } else {
      // Otherwise, fetch the leads list using values from URL params (or defaults)
      const urlPage = parseInt(searchParams.get('page')) || 1;
      const urlSearch = searchParams.get('search') || '';
      const urlStatus = searchParams.get('status') || '';
      const urlSortBy = searchParams.get('sortBy') || 'created_at';
      const urlSortOrder = searchParams.get('sortOrder') || 'desc';

      // Update local state to match URL
      setSearch(urlSearch);
      setStatusFilter(urlStatus);
      setSortBy(urlSortBy);
      setSortOrder(urlSortOrder);

      // Fetch leads with URL parameters (don't update URL since we're reading from it)
      fetchLeads(urlPage, urlSearch, urlStatus, urlSortBy, urlSortOrder, false, abortController.signal);
    }

    // Cleanup function: abort request when component unmounts or id changes
    return () => {
      abortController.abort();
    };
  }, [id]);

  // Handle column header click for sorting
  const handleSort = (column) => {
    const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(column);
    setSortOrder(newOrder);
    fetchLeads(1, search, statusFilter, column, newOrder);
  };

  // Sort indicator component
  const SortIndicator = ({ column }) => {
    if (sortBy !== column) {
      return (
        <svg className="ml-1 h-4 w-4 text-gray-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortOrder === 'asc' ? (
      <svg className="ml-1 h-4 w-4 text-blue-600 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="ml-1 h-4 w-4 text-blue-600 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Handle search form submission (immediate search)
  const handleSearch = (e) => {
    e.preventDefault();
    // Clear any pending debounced search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    fetchLeads(1, search, statusFilter, sortBy, sortOrder);
  };

  // Handle search input change with debouncing
  const handleSearchInputChange = (e) => {
    const newValue = e.target.value;
    setSearch(newValue);

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer - search automatically after delay
    debounceTimerRef.current = setTimeout(() => {
      fetchLeads(1, newValue, statusFilter, sortBy, sortOrder);
      debounceTimerRef.current = null;
    }, DEBOUNCE_DELAY);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle status filter change
  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    fetchLeads(1, search, newStatus, sortBy, sortOrder);
  };

  // Clear all filters
  const clearFilters = () => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setSearch('');
    setStatusFilter('');
    fetchLeads(1, '', '', sortBy, sortOrder);
  };

  // Handle pagination
  const goToPage = (page) => {
    fetchLeads(page, search, statusFilter, sortBy, sortOrder);
  };

  // Format phone for display
  const formatPhones = (phones) => {
    if (!phones || phones.length === 0) return '-';
    return phones.slice(0, 2).map(p => `${p.number}`).join(', ') +
      (phones.length > 2 ? ` +${phones.length - 2} more` : '');
  };

  // Build back to leads URL preserving current filter state
  const getBackToLeadsUrl = () => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `/leads?${queryString}` : '/leads';
  };

  // Delete a lead
  const deleteLead = async (leadId, leadName) => {
    if (!confirm(`Are you sure you want to delete lead "${leadName}"? This cannot be undone.`)) {
      return;
    }

    setDeleting(leadId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/leads/${leadId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete lead');
      }

      // Remove from local state
      setLeads(prev => prev.filter(lead => lead.id !== leadId));
      setPagination(prev => ({ ...prev, total: prev.total - 1 }));
      setSuccess(`Lead "${leadName}" deleted successfully`);
    } catch (err) {
      setError(err.message || 'Failed to delete lead');
    } finally {
      setDeleting(null);
    }
  };

  // Trigger a call for a lead
  const triggerCall = async (leadId, leadName) => {
    setTriggeringCall(leadId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/calls/trigger`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ lead_id: leadId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to trigger call');
      }

      setSuccess(`Call initiated for "${leadName}". The call is now ${data.call?.status || 'in progress'}.`);
    } catch (err) {
      setError(err.message || 'Failed to trigger call');
    } finally {
      setTriggeringCall(null);
    }
  };

  // Lead not found view
  if (id && leadNotFound) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Not Found</h1>
              </div>
              <Link
                to={getBackToLeadsUrl()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Back to Leads
              </Link>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12 bg-white rounded-lg border">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Lead not found</h3>
            <p className="mt-2 text-gray-500">
              The lead you're looking for doesn't exist or has been deleted.
            </p>
            <Link
              to={getBackToLeadsUrl()}
              className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              View All Leads
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Single lead detail view
  if (id && selectedLead) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {selectedLead.first_name} {selectedLead.last_name}
                </h1>
                <p className="text-sm text-gray-500 mt-1">Lead Details</p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => triggerCall(selectedLead.id, `${selectedLead.first_name} ${selectedLead.last_name}`)}
                  disabled={triggeringCall === selectedLead.id || !selectedLead.phones || selectedLead.phones.length === 0}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!selectedLead.phones || selectedLead.phones.length === 0 ? 'No phone number available' : 'Trigger call'}
                >
                  {triggeringCall === selectedLead.id ? (
                    <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  )}
                  Trigger Call
                </button>
                <Link
                  to={getBackToLeadsUrl()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Back to Leads
                </Link>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Success/Error messages for lead detail view */}
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
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="text-sm text-gray-900">{selectedLead.first_name} {selectedLead.last_name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="text-sm text-gray-900">{selectedLead.email || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Phones</dt>
                    <dd className="text-sm text-gray-900">{formatPhones(selectedLead.phones)}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Property Information</h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Property Address</dt>
                    <dd className="text-sm text-gray-900">{selectedLead.property_address || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">City, State, ZIP</dt>
                    <dd className="text-sm text-gray-900">
                      {selectedLead.property_city}{selectedLead.property_city && selectedLead.property_state ? ', ' : ''}
                      {selectedLead.property_state} {selectedLead.property_zip}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Status</dt>
                    <dd className="text-sm">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                        selectedLead.status === 'qualified' ? 'bg-green-100 text-green-800' :
                        selectedLead.status === 'not_qualified' ? 'bg-red-100 text-red-800' :
                        selectedLead.status === 'called' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {getStatusIcon(selectedLead.status, selectedLead.qualification_status)}
                        {selectedLead.status || 'new'}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Call History Section */}
          <div className="mt-6 bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Call History</h3>
            {loadingCalls ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : leadCalls.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No calls have been made to this lead yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Disposition</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {leadCalls.map((call) => (
                      <tr key={call.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {new Date(call.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                            call.status === 'completed' ? 'bg-green-100 text-green-800' :
                            call.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                            call.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {call.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {call.disposition || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {call.duration ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, '0')}` : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <Link
                            to={`/calls/${call.id}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            View Details
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
              <p className="text-sm text-gray-500 mt-1">
                {pagination.total} total leads
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/import"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Import Leads
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filter Bar */}
        <div className="mb-6">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64 relative">
              <input
                type="text"
                value={search}
                onChange={handleSearchInputChange}
                placeholder="Search by name, address, or city..."
                className="w-full px-4 py-2 border border-gray-500 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    // Clear any pending debounce
                    if (debounceTimerRef.current) {
                      clearTimeout(debounceTimerRef.current);
                      debounceTimerRef.current = null;
                    }
                    setSearch('');
                    fetchLeads(1, '', statusFilter, sortBy, sortOrder);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="w-48">
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-500 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
                aria-label="Filter by status"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium"
            >
              Search
            </button>
            {(search || statusFilter) && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Clear All
              </button>
            )}
          </form>
          {/* Active filters indicator */}
          {(search || statusFilter) && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <span>Active filters:</span>
              {search && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  Search: "{search}"
                  <button
                    onClick={() => {
                      // Clear any pending debounce
                      if (debounceTimerRef.current) {
                        clearTimeout(debounceTimerRef.current);
                        debounceTimerRef.current = null;
                      }
                      setSearch('');
                      fetchLeads(1, '', statusFilter, sortBy, sortOrder);
                    }}
                    className="ml-1.5 text-blue-600 hover:text-blue-800"
                    aria-label="Remove search filter"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {statusFilter && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                  Status: {statusOptions.find(o => o.value === statusFilter)?.label}
                  <button
                    onClick={() => handleStatusChange('')}
                    className="ml-1.5 text-purple-600 hover:text-purple-800"
                    aria-label="Remove status filter"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Success Message */}
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

        {/* Error State */}
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

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && leads.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {search ? 'No results found' : 'No leads yet'}
            </h3>
            <p className="mt-2 text-gray-500">
              {search ? (
                <>
                  No leads match your search. Try adjusting your search terms.
                  <button onClick={clearFilters} className="ml-2 text-blue-600 hover:text-blue-500 font-medium">
                    Clear search
                  </button>
                </>
              ) : (
                'Get started by importing leads from an XLSX file.'
              )}
            </p>
            {!search && (
              <Link
                to="/import"
                className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Import Leads
              </Link>
            )}
          </div>
        )}

        {/* Leads Table */}
        {!loading && !error && leads.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('first_name')}
                    >
                      Name
                      <SortIndicator column="first_name" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('property_address')}
                    >
                      Property Address
                      <SortIndicator column="property_address" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('property_city')}
                    >
                      City, State
                      <SortIndicator column="property_city" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phones</th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('status')}
                    >
                      Status
                      <SortIndicator column="status" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('created_at')}
                    >
                      Created
                      <SortIndicator column="created_at" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        const params = new URLSearchParams(searchParams);
                        const queryString = params.toString();
                        navigate(`/leads/${lead.id}${queryString ? `?${queryString}` : ''}`);
                      }}
                    >
                      <td className="px-4 py-3 max-w-[200px]">
                        <div
                          className="text-sm font-medium text-gray-900 truncate"
                          title={`${lead.first_name} ${lead.last_name}`}
                        >
                          {lead.first_name} {lead.last_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[250px]">
                        <div
                          className="text-sm text-gray-900 truncate"
                          title={lead.property_address || ''}
                        >
                          {lead.property_address || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <div
                          className="text-sm text-gray-900 truncate"
                          title={`${lead.property_city}${lead.property_city && lead.property_state ? ', ' : ''}${lead.property_state} ${lead.property_zip}`}
                        >
                          {lead.property_city}{lead.property_city && lead.property_state ? ', ' : ''}{lead.property_state} {lead.property_zip}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[150px]">
                        <div
                          className="text-sm text-gray-600 truncate"
                          title={formatPhones(lead.phones)}
                        >
                          {formatPhones(lead.phones)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                          lead.qualification_status === 'Qualified' ? 'bg-green-100 text-green-800' :
                          lead.qualification_status === 'Not Qualified' ? 'bg-red-100 text-red-800' :
                          lead.status === 'called' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getStatusIcon(lead.status, lead.qualification_status)}
                          {lead.qualification_status || lead.status || 'new'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const params = new URLSearchParams(searchParams);
                              const queryString = params.toString();
                              navigate(`/leads/${lead.id}${queryString ? `?${queryString}` : ''}`);
                            }}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                            aria-label={`View details for ${lead.first_name} ${lead.last_name}`}
                            title="View details"
                          >
                            <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerCall(lead.id, `${lead.first_name} ${lead.last_name}`);
                            }}
                            disabled={triggeringCall === lead.id || !lead.phones || lead.phones.length === 0}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Trigger call for ${lead.first_name} ${lead.last_name}`}
                            title={!lead.phones || lead.phones.length === 0 ? 'No phone number available' : 'Trigger call'}
                          >
                            {triggeringCall === lead.id ? (
                              <svg className="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                            )}
                            Call
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteLead(lead.id, `${lead.first_name} ${lead.last_name}`);
                            }}
                            disabled={deleting === lead.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            aria-label={`Delete lead ${lead.first_name} ${lead.last_name}`}
                          >
                            {deleting === lead.id ? (
                              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => goToPage(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => goToPage(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Leads;
