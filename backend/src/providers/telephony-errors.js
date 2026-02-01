/**
 * Telephony Error Handling System
 *
 * Provides a unified error hierarchy for all telephony providers.
 * Maps provider-specific errors to common error types for consistent
 * error handling across the application.
 *
 * @module providers/telephony-errors
 */

/**
 * Base TelephonyError class
 *
 * All telephony-related errors should extend this class.
 * Provides structured error information with codes and metadata.
 */
export class TelephonyError extends Error {
  /**
   * Create a new TelephonyError
   * @param {string} message - Human-readable error message
   * @param {string} code - Error code for programmatic handling
   * @param {Object} metadata - Additional error context
   * @param {Error} [originalError] - The original error from the provider
   */
  constructor(message, code = 'TELEPHONY_ERROR', metadata = {}, originalError = null) {
    super(message);
    this.name = 'TelephonyError';
    this.code = code;
    this.metadata = metadata;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/transmission
   * @returns {Object} JSON representation of the error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      metadata: this.metadata,
      timestamp: this.timestamp,
      stack: this.stack,
      originalError: this.originalError ? {
        message: this.originalError.message,
        code: this.originalError.code,
        stack: this.originalError.stack
      } : null
    };
  }

  /**
   * Check if this error matches a specific code
   * @param {string} code - Error code to check
   * @returns {boolean} True if error code matches
   */
  isCode(code) {
    return this.code === code;
  }
}

/**
 * Authentication Error
 *
 * Thrown when API credentials are invalid, missing, or expired.
 */
export class AuthenticationError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Authentication failed', metadata = {}, originalError = null) {
    super(message, 'AUTHENTICATION_ERROR', metadata, originalError);
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate Limit Error
 *
 * Thrown when API rate limits are exceeded.
 */
export class RateLimitError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context (should include limit, reset time)
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Rate limit exceeded', metadata = {}, originalError = null) {
    super(message, 'RATE_LIMIT_ERROR', metadata, originalError);
    this.name = 'RateLimitError';
  }
}

/**
 * Call Failed Error
 *
 * Thrown when a call operation fails (initiate, end, etc.).
 */
export class CallFailedError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context (should include callId, operation)
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Call operation failed', metadata = {}, originalError = null) {
    super(message, 'CALL_FAILED_ERROR', metadata, originalError);
    this.name = 'CallFailedError';
  }
}

/**
 * Network Error
 *
 * Thrown when network connectivity issues occur.
 */
export class NetworkError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Network error', metadata = {}, originalError = null) {
    super(message, 'NETWORK_ERROR', metadata, originalError);
    this.name = 'NetworkError';
  }
}

/**
 * Validation Error
 *
 * Thrown when request parameters are invalid.
 */
export class ValidationError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context (should include field, value)
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Validation failed', metadata = {}, originalError = null) {
    super(message, 'VALIDATION_ERROR', metadata, originalError);
    this.name = 'ValidationError';
  }
}

/**
 * Configuration Error
 *
 * Thrown when provider configuration is invalid or missing.
 */
export class ConfigurationError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Configuration error', metadata = {}, originalError = null) {
    super(message, 'CONFIGURATION_ERROR', metadata, originalError);
    this.name = 'ConfigurationError';
  }
}

/**
 * Resource Not Found Error
 *
 * Thrown when a requested resource (call, recording, etc.) is not found.
 */
export class ResourceNotFoundError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Resource not found', metadata = {}, originalError = null) {
    super(message, 'RESOURCE_NOT_FOUND_ERROR', metadata, originalError);
    this.name = 'ResourceNotFoundError';
  }
}

/**
 * Permission Denied Error
 *
 * Thrown when the API key lacks permission for an operation.
 */
export class PermissionDeniedError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Permission denied', metadata = {}, originalError = null) {
    super(message, 'PERMISSION_DENIED_ERROR', metadata, originalError);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Service Unavailable Error
 *
 * Thrown when the telephony provider service is down or unavailable.
 */
export class ServiceUnavailableError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Service unavailable', metadata = {}, originalError = null) {
    super(message, 'SERVICE_UNAVAILABLE_ERROR', metadata, originalError);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Timeout Error
 *
 * Thrown when an operation times out.
 */
export class TimeoutError extends TelephonyError {
  /**
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context (should include timeout duration)
   * @param {Error} [originalError] - Original error
   */
  constructor(message = 'Operation timed out', metadata = {}, originalError = null) {
    super(message, 'TIMEOUT_ERROR', metadata, originalError);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// TELNYX ERROR MAPPER
// ============================================================================

/**
 * Telnyx error code mappings
 *
 * Maps Telnyx-specific error codes to unified TelephonyError types.
 * Based on Telnyx API error documentation.
 */
const TELNYX_ERROR_MAP = {
  // Authentication errors
  '401': AuthenticationError,
  '403': PermissionDeniedError,
  'unauthorized': AuthenticationError,
  'forbidden': PermissionDeniedError,
  'invalid_api_key': AuthenticationError,
  'api_key_missing': AuthenticationError,

  // Rate limit errors
  '429': RateLimitError,
  'rate_limit_exceeded': RateLimitError,
  'too_many_requests': RateLimitError,

  // Validation errors
  '400': ValidationError,
  '422': ValidationError,
  'invalid_request': ValidationError,
  'invalid_parameter': ValidationError,
  'missing_parameter': ValidationError,
  'invalid_phone_number': ValidationError,
  'invalid_webhook_url': ValidationError,

  // Resource not found errors
  '404': ResourceNotFoundError,
  'not_found': ResourceNotFoundError,
  'call_not_found': ResourceNotFoundError,
  'recording_not_found': ResourceNotFoundError,
  'phone_number_not_found': ResourceNotFoundError,

  // Network errors
  'connection_error': NetworkError,
  'network_error': NetworkError,
  'dns_resolution_failed': NetworkError,
  'connection_refused': NetworkError,
  'connection_timeout': TimeoutError,

  // Call failed errors
  'call_failed': CallFailedError,
  'call_rejected': CallFailedError,
  'busy': CallFailedError,
  'no_answer': CallFailedError,
  'destination_unreachable': CallFailedError,
  'rejected': CallFailedError,

  // Configuration errors
  'configuration_error': ConfigurationError,
  'missing_application_id': ConfigurationError,
  'invalid_connection_id': ConfigurationError,

  // Service errors
  '500': ServiceUnavailableError,
  '502': ServiceUnavailableError,
  '503': ServiceUnavailableError,
  'service_unavailable': ServiceUnavailableError,
  'internal_server_error': ServiceUnavailableError,

  // Timeout errors
  '408': TimeoutError,
  'request_timeout': TimeoutError,
  'dial_timeout': TimeoutError
};

/**
 * Map Telnyx error to unified TelephonyError
 *
 * @param {Object} telnyxError - Error object from Telnyx API
 * @param {Object} context - Additional context about the operation
 * @returns {TelephonyError} Mapped error instance
 */
export function mapTelnyxError(telnyxError, context = {}) {
  const errorCode = telnyxError.code || telnyxError.status || telnyxError.error_code;
  const errorMessage = telnyxError.message || telnyxError.error || 'Unknown Telnyx error';

  // Find the appropriate error class
  let ErrorClass = TelephonyError;
  if (errorCode && TELNYX_ERROR_MAP[errorCode]) {
    ErrorClass = TELNYX_ERROR_MAP[errorCode];
  } else if (telnyxError.status) {
    // Fallback to HTTP status code mapping
    const statusStr = String(telnyxError.status);
    if (TELNYX_ERROR_MAP[statusStr]) {
      ErrorClass = TELNYX_ERROR_MAP[statusStr];
    }
  }

  // Extract additional metadata
  const metadata = {
    ...context,
    provider: 'telnyx',
    providerCode: errorCode,
    providerStatus: telnyxError.status,
    providerRequestId: telnyxError.request_id
  };

  // Add rate limit specific metadata
  if (ErrorClass === RateLimitError) {
    metadata.limit = telnyxError.details?.limit;
    metadata.remaining = telnyxError.details?.remaining;
    metadata.resetAt = telnyxError.details?.reset_at;
  }

  // Add call-specific metadata (override context if in provider error)
  if (telnyxError.call_control_id && !metadata.callId) {
    metadata.callId = telnyxError.call_control_id;
  }

  // Add phone number metadata (override context if in provider error)
  if (telnyxError.to && !metadata.phoneNumber) {
    metadata.phoneNumber = telnyxError.to;
  }

  // Create the error with appropriate parameters
  if (ErrorClass === TelephonyError) {
    // Base class requires code parameter
    return new ErrorClass(errorMessage, 'TELEPHONY_ERROR', metadata, telnyxError);
  } else {
    // Subclasses have hardcoded codes
    return new ErrorClass(errorMessage, metadata, telnyxError);
  }
}

// ============================================================================
// SIGNALWIRE ERROR MAPPER
// ============================================================================

/**
 * SignalWire error code mappings
 *
 * Maps SignalWire-specific error codes to unified TelephonyError types.
 * Based on SignalWire API error documentation and Twilio-compatible error codes.
 */
const SIGNALWIRE_ERROR_MAP = {
  // Authentication errors
  '20003': AuthenticationError,  // Authentication Error - Invalid username
  '20005': AuthenticationError,  // Authentication Error - Invalid password
  '20404': AuthenticationError,  // Authentication Error - Invalid Account Sid
  'invalid_credentials': AuthenticationError,
  'unauthorized': AuthenticationError,
  '401': AuthenticationError,
  '403': PermissionDeniedError,
  'forbidden': PermissionDeniedError,

  // Rate limit errors
  '429': RateLimitError,
  'rate_limit_exceeded': RateLimitError,
  'too_many_requests': RateLimitError,

  // Validation errors
  '400': ValidationError,
  'invalid_request': ValidationError,
  'invalid_parameter': ValidationError,
  'missing_parameter': ValidationError,
  '21614': ValidationError,     // 'To' number is not a valid phone number
  '21612': ValidationError,     // 'From' number is not a valid phone number
  '21211': ValidationError,     // Invalid 'To' Phone Number
  'invalid_phone_number': ValidationError,

  // Resource not found errors
  '404': ResourceNotFoundError,
  '20404': ResourceNotFoundError, // Account does not exist
  'not_found': ResourceNotFoundError,
  'call_not_found': ResourceNotFoundError,
  'recording_not_found': ResourceNotFoundError,

  // Network errors
  'connection_error': NetworkError,
  'network_error': NetworkError,
  'connection_refused': NetworkError,
  'connection_timeout': TimeoutError,

  // Call failed errors
  'call_failed': CallFailedError,
  '13223': CallFailedError,      // Phone number does not support voice
  '13224': CallFailedError,      // Phone number cannot receive calls
  '13225': CallFailedError,      // Phone number cannot receive SMS
  '13227': CallFailedError,      // Phone number is not verified
  'busy': CallFailedError,
  'no_answer': CallFailedError,
  'destination_unreachable': CallFailedError,

  // Configuration errors
  'configuration_error': ConfigurationError,
  'invalid_application': ConfigurationError,

  // Service errors
  '500': ServiceUnavailableError,
  '502': ServiceUnavailableError,
  '503': ServiceUnavailableError,
  'service_unavailable': ServiceUnavailableError,

  // Timeout errors
  '408': TimeoutError,
  'request_timeout': TimeoutError,
  'dial_timeout': TimeoutError
};

/**
 * Map SignalWire error to unified TelephonyError
 *
 * @param {Object} signalwireError - Error object from SignalWire API
 * @param {Object} context - Additional context about the operation
 * @returns {TelephonyError} Mapped error instance
 */
export function mapSignalWireError(signalwireError, context = {}) {
  const errorCode = signalwireError.code || signalwireError.status || signalwireError.error_code;
  const errorMessage = signalwireError.message || signalwireError.error || 'Unknown SignalWire error';

  // Find the appropriate error class
  let ErrorClass = TelephonyError;
  if (errorCode && SIGNALWIRE_ERROR_MAP[errorCode]) {
    ErrorClass = SIGNALWIRE_ERROR_MAP[errorCode];
  } else if (signalwireError.status) {
    // Fallback to HTTP status code mapping
    const statusStr = String(signalwireError.status);
    if (SIGNALWIRE_ERROR_MAP[statusStr]) {
      ErrorClass = SIGNALWIRE_ERROR_MAP[statusStr];
    }
  }

  // Extract additional metadata
  const metadata = {
    ...context,
    provider: 'signalwire',
    providerCode: errorCode,
    providerStatus: signalwireError.status,
    providerSid: signalwireError.sid,
    providerAccountSid: signalwireError.account_sid
  };

  // Add rate limit specific metadata
  if (ErrorClass === RateLimitError) {
    metadata.limit = signalwireError.details?.limit;
    metadata.remaining = signalwireError.details?.remaining;
    metadata.resetAt = signalwireError.details?.reset_at;
  }

  // Add call-specific metadata (override context if in provider error)
  if (signalwireError.call_sid && !metadata.callId) {
    metadata.callId = signalwireError.call_sid;
  }

  // Add phone number metadata (override context if in provider error)
  if (signalwireError.to && !metadata.phoneNumber) {
    metadata.phoneNumber = signalwireError.to;
  }

  // Create the error with appropriate parameters
  if (ErrorClass === TelephonyError) {
    // Base class requires code parameter
    return new ErrorClass(errorMessage, 'TELEPHONY_ERROR', metadata, signalwireError);
  } else {
    // Subclasses have hardcoded codes
    return new ErrorClass(errorMessage, metadata, signalwireError);
  }
}

// ============================================================================
// GENERIC ERROR MAPPER
// ============================================================================

/**
 * Generic provider error mapper
 *
 * Maps provider errors to unified TelephonyError types based on
 * common error patterns across providers.
 *
 * @param {Object} providerError - Error from any telephony provider
 * @param {string} providerName - Name of the provider ('telnyx' or 'signalwire')
 * @param {Object} context - Additional context about the operation
 * @returns {TelephonyError} Mapped error instance
 */
export function mapProviderError(providerError, providerName, context = {}) {
  if (!providerError) {
    return new TelephonyError('Unknown error', 'UNKNOWN_ERROR', { provider: providerName });
  }

  // Route to provider-specific mapper
  switch (providerName.toLowerCase()) {
    case 'telnyx':
      return mapTelnyxError(providerError, context);
    case 'signalwire':
      return mapSignalWireError(providerError, context);
    default:
      // Generic fallback
      return new TelephonyError(
        providerError.message || 'Unknown provider error',
        'PROVIDER_ERROR',
        { provider: providerName, ...context },
        providerError
      );
  }
}

/**
 * Check if an error is a TelephonyError instance
 *
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is a TelephonyError
 */
export function isTelephonyError(error) {
  return error instanceof TelephonyError;
}

/**
 * Check if error is retryable based on error type
 *
 * @param {TelephonyError} error - Error to check
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error) {
  if (!isTelephonyError(error)) {
    return false;
  }

  const retryableCodes = [
    'RATE_LIMIT_ERROR',
    'NETWORK_ERROR',
    'TIMEOUT_ERROR',
    'SERVICE_UNAVAILABLE_ERROR'
  ];

  return retryableCodes.includes(error.code);
}

/**
 * Get user-friendly error message
 *
 * @param {TelephonyError} error - Error to convert
 * @returns {string} User-friendly message
 */
export function getUserFriendlyMessage(error) {
  if (!isTelephonyError(error)) {
    return 'An unexpected error occurred. Please try again.';
  }

  switch (error.code) {
    case 'AUTHENTICATION_ERROR':
      return 'Your API credentials are invalid. Please check your configuration.';
    case 'RATE_LIMIT_ERROR':
      return 'You\'ve exceeded the rate limit. Please wait a moment and try again.';
    case 'CALL_FAILED_ERROR':
      return `The call failed: ${error.message}`;
    case 'NETWORK_ERROR':
      return 'Network connection failed. Please check your internet connection.';
    case 'VALIDATION_ERROR':
      return `Invalid input: ${error.message}`;
    case 'CONFIGURATION_ERROR':
      return 'Configuration error. Please check your settings.';
    case 'RESOURCE_NOT_FOUND_ERROR':
      return 'The requested resource was not found.';
    case 'PERMISSION_DENIED_ERROR':
      return 'You don\'t have permission to perform this action.';
    case 'SERVICE_UNAVAILABLE_ERROR':
      return 'The telephony service is temporarily unavailable. Please try again later.';
    case 'TIMEOUT_ERROR':
      return 'The operation timed out. Please try again.';
    default:
      return error.message || 'An unexpected error occurred.';
  }
}

// Export all error classes for direct use
export default {
  TelephonyError,
  AuthenticationError,
  RateLimitError,
  CallFailedError,
  NetworkError,
  ValidationError,
  ConfigurationError,
  ResourceNotFoundError,
  PermissionDeniedError,
  ServiceUnavailableError,
  TimeoutError,
  mapTelnyxError,
  mapSignalWireError,
  mapProviderError,
  isTelephonyError,
  isRetryableError,
  getUserFriendlyMessage
};
