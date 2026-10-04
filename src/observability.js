/**
 * WishMagic Centralized Production Observability & Diagnostics Layer
 * Part 25: Logging, Log Redaction, Request Tracing, Failure Classification,
 * Audit Events, Error Reporting Abstraction, and Performance Telemetry.
 */

// Application Constants
export const APP_VERSION = '1.0.0';
export const API_VERSION = 'v1';
export const SCHEMA_VERSION = '3.0.0';

// Failure Categories
export const FailureCategory = {
  AUTH: 'AUTH',
  AUTHORIZATION: 'AUTHORIZATION',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  DATABASE: 'DATABASE',
  STORAGE: 'STORAGE',
  MEDIA: 'MEDIA',
  TEMPLATE: 'TEMPLATE',
  PAYMENT: 'PAYMENT',
  NOTIFICATION: 'NOTIFICATION',
  ANALYTICS: 'ANALYTICS',
  CONFIGURATION: 'CONFIGURATION',
  NETWORK: 'NETWORK',
  SECURITY: 'SECURITY',
  INTERNAL: 'INTERNAL',
  UNKNOWN: 'UNKNOWN'
};

// Failure Classifications
export const FailureClassification = {
  TRANSIENT: 'TRANSIENT',
  PERMANENT: 'PERMANENT',
  USER_ERROR: 'USER_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
  DATA_INTEGRITY_ERROR: 'DATA_INTEGRITY_ERROR',
  SECURITY_ERROR: 'SECURITY_ERROR'
};

// Sensitive Key Names for Automatic Redaction
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'privatekey',
  'webhooksecret',
  'cardnumber',
  'cvv',
  'session',
  'wm_session'
]);

/**
 * Recursively redacts sensitive keys and personal content from logs and telemetry
 */
export function redactSensitiveData(data, depth = 0) {
  if (depth > 5 || data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, val] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactSensitiveData(val, depth + 1);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Standardized Application Error Structure
 */
export class AppError extends Error {
  constructor({
    code = 'INTERNAL_ERROR',
    message = 'An unexpected error occurred',
    status = 500,
    category = FailureCategory.INTERNAL,
    classification = FailureClassification.PERMANENT,
    retryable = false,
    requestId = null,
    details = null,
    cause = null
  }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.category = category;
    this.classification = classification;
    this.retryable = retryable;
    this.requestId = requestId;
    this.details = details;
    this.cause = cause;
    this.timestamp = new Date().toISOString();
  }

  toPublicJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        category: this.category,
        retryable: this.retryable,
        ...(this.details ? { details: this.details } : {})
      },
      requestId: this.requestId
    };
  }
}

/**
 * Central Structured Logger
 */
export const Logger = {
  isProduction: typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production',

  _format(level, event, message, metadata = {}, requestId = null) {
    return {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      requestId,
      version: APP_VERSION,
      metadata: redactSensitiveData(metadata)
    };
  },

  debug(event, message, metadata = {}, requestId = null) {
    if (!this.isProduction) {
      console.debug(JSON.stringify(this._format('DEBUG', event, message, metadata, requestId)));
    }
  },

  info(event, message, metadata = {}, requestId = null) {
    console.info(JSON.stringify(this._format('INFO', event, message, metadata, requestId)));
  },

  warn(event, message, metadata = {}, requestId = null) {
    console.warn(JSON.stringify(this._format('WARN', event, message, metadata, requestId)));
  },

  error(event, message, metadata = {}, requestId = null) {
    console.error(JSON.stringify(this._format('ERROR', event, message, metadata, requestId)));
  },

  security(event, message, metadata = {}, requestId = null) {
    console.warn(JSON.stringify(this._format('SECURITY', event, message, metadata, requestId)));
  },

  audit(event, message, metadata = {}, requestId = null) {
    console.info(JSON.stringify(this._format('AUDIT', event, message, metadata, requestId)));
  }
};

/**
 * Performance Telemetry Tracker
 */
export class PerformanceTimer {
  constructor(operationName, requestId = null) {
    this.operationName = operationName;
    this.requestId = requestId;
    this.startMs = Date.now();
  }

  end(metadata = {}) {
    const durationMs = Date.now() - this.startMs;
    if (durationMs > 1000) {
      Logger.warn('slow_operation_detected', `Operation '${this.operationName}' took ${durationMs}ms`, {
        operation: this.operationName,
        durationMs,
        ...metadata
      }, this.requestId);
    }
    return durationMs;
  }
}

/**
 * Error Reporter Abstraction (Pluggable for Sentry, Cloudflare Logs, etc.)
 */
export const ErrorReporter = {
  captureException(error, context = {}) {
    const sanitizedContext = redactSensitiveData(context);
    Logger.error('exception_captured', error.message || 'Unknown Exception', {
      errorName: error.name,
      errorCode: error.code,
      stack: Logger.isProduction ? undefined : error.stack,
      ...sanitizedContext
    }, context.requestId);
  }
};

/**
 * Request ID Helper
 */
export function getOrCreateRequestId(request) {
  const incoming = request ? request.headers.get('X-Request-ID') : null;
  if (incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming)) {
    return incoming;
  }
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}
