import { useState, useCallback, useEffect } from 'react';
import { useToast } from '../context/ToastContext';

const API_BASE = '/api';

const Import = () => {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [pushingToFub, setPushingToFub] = useState(false);
  const [fubResult, setFubResult] = useState(null);
  const [fubError, setFubError] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [showDuplicateDetails, setShowDuplicateDetails] = useState(false);
  const [importHistory, setImportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch import history on mount and after successful imports
  const fetchImportHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/import/history`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (response.ok) {
        const data = await response.json();
        setImportHistory(data.imports || []);
      }
    } catch (err) {
      console.error('Failed to fetch import history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Fetch history on mount
  useEffect(() => {
    fetchImportHistory();
  }, [fetchImportHistory]);

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  // Validate file type
  const validateAndSetFile = (selectedFile) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    const ext = selectedFile.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(selectedFile.type) && !['xlsx', 'xls'].includes(ext)) {
      setError('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setUploadResult(null);
    setImportResult(null);
  };

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

  // Upload and parse file with progress tracking
  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setErrorDetails(null);

    // Use XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    return new Promise((resolve) => {
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        setUploading(false);
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadResult(data);
            setUploadProgress(100);
            toast.success(`File uploaded successfully - ${data.totalRows} rows found`);
          } else {
            setError(data.error || 'Upload failed');
            setErrorDetails(data.details || null);
            toast.error(data.error || 'Upload failed');
          }
        } catch (err) {
          setError('Failed to parse server response');
          toast.error('Failed to parse server response');
        }
        resolve();
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        setUploading(false);
        setError('Network error during upload');
        toast.error('Network error during upload');
        resolve();
      });

      // Handle abort
      xhr.addEventListener('abort', () => {
        setUploading(false);
        setError('Upload cancelled');
        toast.error('Upload cancelled');
        resolve();
      });

      xhr.open('POST', `${API_BASE}/import/upload`);
      // Add authorization header
      const token = localStorage.getItem('token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  };

  // Check for duplicates before import
  const handleCheckDuplicates = async () => {
    if (!uploadResult?.importId) return;

    setCheckingDuplicates(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/import/check-duplicates/${uploadResult.importId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check duplicates');
      }

      setDuplicateResult(data);
      if (data.duplicateCount > 0) {
        toast.info(`Found ${data.duplicateCount} duplicate(s) in your file`);
      } else {
        toast.success('No duplicates found - all leads are new!');
      }
    } catch (err) {
      setError(err.message || 'Failed to check duplicates');
      toast.error(err.message || 'Failed to check duplicates');
    } finally {
      setCheckingDuplicates(false);
    }
  };

  // Execute import (save to database)
  const handleExecuteImport = async () => {
    if (!uploadResult?.importId) return;

    setImporting(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/import/execute/${uploadResult.importId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ skipDuplicates })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportResult(data);
      toast.success(`Successfully imported ${data.imported} leads!`);
      // Refresh import history after successful import
      fetchImportHistory();
    } catch (err) {
      setError(err.message || 'Failed to import leads');
      toast.error(err.message || 'Failed to import leads');
    } finally {
      setImporting(false);
    }
  };

  // Push imported leads to Follow-up Boss
  const handlePushToFub = async () => {
    if (!importResult?.importId) return;

    setPushingToFub(true);
    setFubError(null);
    setFubResult(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/import/push-to-fub/${importResult.importId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle FUB errors with detailed messages
        setFubError({
          message: data.error,
          suggestion: data.suggestion,
          errorType: data.errorType,
          localDataPreserved: data.localDataPreserved,
          details: data.details
        });
      } else {
        setFubResult(data);
      }
    } catch (err) {
      setFubError({
        message: err.message || 'Failed to push leads to Follow-up Boss',
        suggestion: 'Please check your network connection and try again.',
        localDataPreserved: true
      });
    } finally {
      setPushingToFub(false);
    }
  };

  // Reset state for new upload
  const handleReset = () => {
    setFile(null);
    setUploadResult(null);
    setImportResult(null);
    setError(null);
    setErrorDetails(null);
    setFubResult(null);
    setFubError(null);
    setDuplicateResult(null);
    setSkipDuplicates(true);
    setShowDuplicateDetails(false);
    // Refresh import history after reset
    fetchImportHistory();
  };

  // Format phone number for display
  const formatPhone = (phone) => {
    if (!phone || typeof phone !== 'object') return '-';
    return `${phone.type}: ${phone.number}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Import Leads</h1>
              <p className="text-sm text-gray-500 mt-1">
                Upload Kind Skiptracing XLSX files to import leads
              </p>
            </div>
            <a
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Alert */}
        {error && (
          <div role="alert" aria-live="assertive" className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
                {errorDetails && (
                  <p className="text-sm text-red-600 mt-1">{errorDetails}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Import Success Message with FUB Push Option */}
        {importResult && (
          <div className="mb-6">
            {/* Local import success */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-green-800">Import Complete!</h3>
                  <p className="text-sm text-green-700 mt-1">
                    Imported {importResult.imported} leads to local database. {importResult.duplicates > 0 && `${importResult.duplicates} duplicates skipped.`}
                  </p>
                </div>
              </div>
            </div>

            {/* FUB Error Message */}
            {fubError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex">
                  <svg className="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-red-800">Follow-up Boss Error</h3>
                    <p className="text-sm text-red-700 mt-1">{fubError.message}</p>
                    {fubError.suggestion && (
                      <p className="text-sm text-red-600 mt-2 font-medium">
                        💡 {fubError.suggestion}
                      </p>
                    )}
                    {fubError.localDataPreserved && (
                      <p className="text-xs text-green-700 mt-2 flex items-center">
                        <svg className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Your local lead data is safe and preserved.
                      </p>
                    )}
                    {fubError.errorType === 'not_configured' && (
                      <a
                        href="/settings"
                        className="inline-block mt-3 text-sm font-medium text-blue-600 hover:text-blue-500"
                      >
                        Go to Settings →
                      </a>
                    )}
                    {fubError.errorType === 'invalid_credentials' && (
                      <a
                        href="/settings"
                        className="inline-block mt-3 text-sm font-medium text-blue-600 hover:text-blue-500"
                      >
                        Check API Keys in Settings →
                      </a>
                    )}
                  </div>
                  <button onClick={() => setFubError(null)} className="text-red-700 hover:text-red-500" aria-label="Dismiss error">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* FUB Success Message */}
            {fubResult && (
              <div className={`border rounded-lg p-4 mb-4 ${fubResult.partialSuccess ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex">
                  <svg className={`h-5 w-5 ${fubResult.partialSuccess ? 'text-yellow-400' : 'text-green-400'}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-3 flex-1">
                    <h3 className={`text-sm font-medium ${fubResult.partialSuccess ? 'text-yellow-800' : 'text-green-800'}`}>
                      {fubResult.partialSuccess ? 'Partial Success' : 'Follow-up Boss Sync Complete'}
                    </h3>
                    <p className={`text-sm mt-1 ${fubResult.partialSuccess ? 'text-yellow-700' : 'text-green-700'}`}>
                      {fubResult.message}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Push to FUB button (if not already pushed successfully) */}
            {!fubResult && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-blue-800">Push to Follow-up Boss</h3>
                    <p className="text-sm text-blue-600 mt-1">
                      Send your imported leads to Follow-up Boss CRM
                    </p>
                  </div>
                  <button
                    onClick={handlePushToFub}
                    disabled={pushingToFub}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pushingToFub ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Pushing to FUB...
                      </span>
                    ) : (
                      'Push to FUB'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex space-x-3">
              <button
                onClick={handleReset}
                className="text-sm font-medium text-gray-600 hover:text-gray-500"
              >
                Import another file
              </button>
              <a
                href="/leads"
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                View Leads →
              </a>
            </div>
          </div>
        )}

        {/* Upload Section */}
        {!uploadResult && !importResult && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Upload XLSX File</h2>

            {/* Drag & Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : file
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {file ? (
                <div>
                  <svg className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div>
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">
                    <span className="font-medium text-blue-600 hover:text-blue-500">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">XLSX or XLS files up to 50MB</p>
                </div>
              )}
            </div>

            {/* Upload Progress Bar */}
            {uploading && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700">Uploading {file.name}...</span>
                  <span className="text-sm font-medium text-blue-700">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {uploadProgress < 100
                    ? 'Please wait while your file is being uploaded...'
                    : 'Upload complete! Processing file...'
                  }
                </p>
              </div>
            )}

            {/* Upload Button */}
            {file && !uploading && (
              <div className="mt-4 flex justify-end space-x-3">
                <button
                  onClick={() => setFile(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
                >
                  {uploading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {uploadProgress}%
                    </span>
                  ) : (
                    'Upload & Preview'
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Preview Section */}
        {uploadResult && !importResult && (
          <div className="bg-white rounded-lg shadow-sm border">
            {/* Validation Warning */}
            {uploadResult.validationSummary && uploadResult.validationSummary.totalRowsWithInvalidPhones > 0 && (
              <div className="px-6 py-4 bg-yellow-50 border-b border-yellow-200">
                <div className="flex">
                  <svg className="h-5 w-5 text-yellow-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-yellow-800">Phone Validation Warnings</h3>
                    <p className="text-sm text-yellow-700 mt-1">
                      {uploadResult.validationSummary.totalRowsWithInvalidPhones} row(s) have invalid phone numbers
                      ({uploadResult.validationSummary.totalValidationErrors} total invalid phone entries).
                      These leads can still be imported, but invalid phones will not be callable.
                    </p>
                    {uploadResult.validationSummary.sampleErrors && uploadResult.validationSummary.sampleErrors.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-yellow-800 mb-2">Sample validation errors:</p>
                        <ul className="text-xs text-yellow-700 space-y-1 max-h-32 overflow-y-auto">
                          {uploadResult.validationSummary.sampleErrors.map((err, idx) => (
                            <li key={idx} className="flex items-start">
                              <span className="text-yellow-700 mr-1">•</span>
                              <span>
                                <strong>Row {err.rowIndex}</strong> ({err.name}): {err.field} - {err.error}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {uploadResult.validationSummary.totalValidationErrors > 10 && (
                          <p className="text-xs text-yellow-700 mt-2 italic">
                            ...and {uploadResult.validationSummary.totalValidationErrors - 10} more validation errors
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Duplicate Check Section */}
            <div className="px-6 py-4 border-b bg-blue-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <svg className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-sm font-medium text-blue-800">Duplicate Check</h3>
                  </div>
                  {!duplicateResult ? (
                    <p className="text-sm text-blue-700 mt-1 ml-7">
                      Check for existing leads before importing to avoid duplicates.
                    </p>
                  ) : (
                    <div className="ml-7 mt-1">
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">{duplicateResult.newLeadCount}</span> new leads,
                        <span className="font-medium ml-1">{duplicateResult.duplicateCount}</span> duplicates found
                        {duplicateResult.fubCheckEnabled && duplicateResult.fubDuplicateCount > 0 && (
                          <span className="ml-1">
                            (<span className="text-green-600 font-medium">{duplicateResult.fubDuplicateCount}</span> in FUB)
                          </span>
                        )}
                      </p>
                      {duplicateResult.fubCheckEnabled && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ Follow-up Boss check enabled
                        </p>
                      )}
                      {duplicateResult.fubCheckEnabled === false && (
                        <p className="text-xs text-yellow-600 mt-1">
                          ⚠ FUB API key not configured - only checking local database
                        </p>
                      )}
                      {duplicateResult.duplicateCount > 0 && (
                        <div className="mt-2">
                          <label className="flex items-center text-sm">
                            <input
                              type="checkbox"
                              checked={skipDuplicates}
                              onChange={(e) => setSkipDuplicates(e.target.checked)}
                              className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-blue-800">Skip duplicates (recommended)</span>
                          </label>
                          <button
                            onClick={() => setShowDuplicateDetails(!showDuplicateDetails)}
                            className="text-sm text-blue-600 hover:text-blue-800 underline mt-2"
                          >
                            {showDuplicateDetails ? 'Hide duplicate details' : 'View duplicate details'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleCheckDuplicates}
                  disabled={checkingDuplicates}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checkingDuplicates ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Checking...
                    </span>
                  ) : duplicateResult ? (
                    'Re-check'
                  ) : (
                    'Check for Duplicates'
                  )}
                </button>
              </div>
            </div>

            {/* Duplicate Details */}
            {showDuplicateDetails && duplicateResult && duplicateResult.duplicates.length > 0 && (
              <div className="px-6 py-4 border-b bg-orange-50">
                <h4 className="text-sm font-medium text-orange-800 mb-3">
                  Duplicate Records Found ({duplicateResult.duplicateCount})
                </h4>
                <div className="max-h-64 overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-orange-100">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-orange-800">Row</th>
                        <th className="px-3 py-2 text-left font-medium text-orange-800">Uploaded Lead</th>
                        <th className="px-3 py-2 text-left font-medium text-orange-800">Match Type</th>
                        <th className="px-3 py-2 text-left font-medium text-orange-800">Existing Lead</th>
                        <th className="px-3 py-2 text-left font-medium text-orange-800">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-200">
                      {duplicateResult.duplicates.map((dup, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="px-3 py-2 text-gray-700">{dup.rowIndex}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{dup.uploadedLead.name}</div>
                            <div className="text-gray-500">{dup.uploadedLead.address}</div>
                            <div className="text-gray-400">{dup.uploadedLead.city}, {dup.uploadedLead.state}</div>
                            {dup.uploadedLead.phones.length > 0 && (
                              <div className="text-gray-400">{dup.uploadedLead.phones.join(', ')}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col space-y-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                dup.matchType === 'phone' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                              }`}>
                                {dup.matchType === 'phone' ? 'Phone Match' : 'Address Match'}
                              </span>
                              {dup.matchSource && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  dup.matchSource === 'fub' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {dup.matchSource === 'fub' ? 'Found in FUB' : 'Local DB'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{dup.existingLead.name}</div>
                            <div className="text-gray-500">{dup.existingLead.address}</div>
                            <div className="text-gray-400">{dup.existingLead.city}, {dup.existingLead.state}</div>
                            {dup.existingLead.phones.length > 0 && (
                              <div className="text-gray-400">{dup.existingLead.phones.join(', ')}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col space-y-1">
                              {dup.existingLead.id && (
                                <a
                                  href={`/leads/${dup.existingLead.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  View Lead
                                </a>
                              )}
                              {dup.existingLead.fubLink && (
                                <a
                                  href={dup.existingLead.fubLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-600 hover:text-green-800 flex items-center"
                                >
                                  <span className="mr-1">FUB</span>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              )}
                              {!dup.existingLead.id && dup.existingLead.fubId && (
                                <span className="text-xs text-purple-600 font-medium">FUB Only</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {duplicateResult.hasMoreDuplicates && (
                    <p className="text-xs text-orange-700 mt-2 italic text-center">
                      Showing first 50 duplicates. {duplicateResult.duplicateCount - 50} more duplicates not shown.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Preview Header */}
            <div className="px-6 py-4 border-b bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">Preview: {uploadResult.filename}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {uploadResult.totalRows} rows found - Showing first {Math.min(uploadResult.preview?.length || 0, 100)} rows
                    {duplicateResult && (
                      <span className="ml-2">
                        ({duplicateResult.newLeadCount} new, {duplicateResult.duplicateCount} duplicates)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteImport}
                    disabled={importing}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Importing...
                      </span>
                    ) : duplicateResult ? (
                      skipDuplicates ?
                        `Import ${duplicateResult.newLeadCount} New Leads` :
                        `Import All ${uploadResult.totalRows} Leads`
                    ) : (
                      `Import ${uploadResult.totalRows} Leads`
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Preview Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property Address</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City, State</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phones</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property Info</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploadResult.preview?.map((row, index) => (
                    <tr key={index} className={`${row.hasInvalidPhones ? 'bg-yellow-50' : (index % 2 === 0 ? 'bg-white' : 'bg-gray-50')}`}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          {row.hasInvalidPhones && (
                            <svg className="h-4 w-4 text-yellow-500 mr-1" viewBox="0 0 20 20" fill="currentColor" title="Row has invalid phone numbers">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                          {row.rowIndex}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {row.first_name} {row.last_name}
                        </div>
                        {row.email && (
                          <div className="text-xs text-gray-500">{row.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{row.property_address || '-'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {row.property_city}{row.property_city && row.property_state ? ', ' : ''}{row.property_state} {row.property_zip}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">
                          {row.phones && row.phones.length > 0 ? (
                            <ul className="space-y-1">
                              {row.phones.slice(0, 3).map((phone, i) => (
                                <li key={i} className={`text-xs flex items-center ${phone.valid === false ? 'text-red-600' : ''}`}>
                                  {phone.valid === false && (
                                    <svg className="h-3 w-3 text-red-500 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                  <span className={phone.valid === false ? 'text-red-500' : 'text-gray-500'}>{phone.type}:</span>
                                  <span className="ml-1">{phone.number}</span>
                                  {phone.valid === false && phone.error && (
                                    <span className="ml-1 text-red-400 text-xs" title={phone.error}>⚠</span>
                                  )}
                                </li>
                              ))}
                              {row.phones.length > 3 && (
                                <li className="text-xs text-gray-400">+{row.phones.length - 3} more</li>
                              )}
                            </ul>
                          ) : (
                            <span className="text-gray-400">No phones</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-600 space-y-1">
                          {row.bedrooms && <div>{row.bedrooms} bed</div>}
                          {row.bathrooms && <div>{row.bathrooms} bath</div>}
                          {row.sqft && <div>{row.sqft.toLocaleString()} sqft</div>}
                          {row.year_built && <div>Built {row.year_built}</div>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stats Summary */}
            <div className="px-6 py-4 border-t bg-gray-50">
              <div className="flex items-center space-x-6 text-sm">
                <div>
                  <span className="text-gray-500">Total Rows:</span>
                  <span className="ml-2 font-medium text-gray-900">{uploadResult.totalRows}</span>
                </div>
                <div>
                  <span className="text-gray-500">Columns:</span>
                  <span className="ml-2 font-medium text-gray-900">{uploadResult.headers?.length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import History Section */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Import History</h2>
                <p className="text-sm text-gray-500 mt-1">
                  View past import operations and their results
                </p>
              </div>
              <button
                onClick={fetchImportHistory}
                disabled={loadingHistory}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {loadingHistory ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {loadingHistory ? (
            <div className="px-6 py-8 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading import history...</p>
            </div>
          ) : importHistory.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-2 text-sm">No import history yet</p>
              <p className="text-xs text-gray-400">Import your first file to see it here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filename</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Rows</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Imported</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duplicates</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Errors</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {importHistory.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <svg className="h-5 w-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-900">{record.original_filename}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {record.total_rows}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="text-green-600 font-medium">{record.imported_count || 0}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {record.duplicate_count > 0 ? (
                          <span className="text-yellow-600">{record.duplicate_count}</span>
                        ) : (
                          <span>{record.duplicate_count || 0}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {record.error_count > 0 ? (
                          <span className="text-red-600">{record.error_count}</span>
                        ) : (
                          <span>{record.error_count || 0}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          record.status === 'completed' ? 'bg-green-100 text-green-800' :
                          record.status === 'preview' ? 'bg-yellow-100 text-yellow-800' :
                          record.status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {record.status === 'completed' ? 'Completed' :
                           record.status === 'preview' ? 'Preview' :
                           record.status === 'failed' ? 'Failed' :
                           record.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(record.created_at).toLocaleString()}
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
};

export default Import;
