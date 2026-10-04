/**
 * WishMagic Centralized API Client Layer
 * Part 28: Full Frontend <-> Worker API Contract & End-to-End Regression Lock
 * 
 * Provides unified HTTP operations, structured error classification,
 * credentials handling, CSRF token attachment, retry policies, and centralized configuration.
 */

(function(window) {
  'use strict';

  // Centralized Application & API Configuration
  const WishConfig = {
    API_BASE_URL: (typeof window !== 'undefined' && window.WISHMAGIC_API_BASE_URL) || '',
    PUBLIC_APP_URL: (typeof window !== 'undefined' && (window.WISHMAGIC_PUBLIC_APP_URL || (window.location && window.location.origin))) || 'https://wishmagic.live',
    REQUEST_TIMEOUT_MS: 15000,
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 1000
  };

  // =========================================================================
  // STRUCTURED API ERROR HIERARCHY
  // =========================================================================

  class WishApiError extends Error {
    constructor(message, status = 500, code = 'API_ERROR', details = null, requestId = null) {
      super(message);
      this.name = 'WishApiError';
      this.status = status;
      this.code = code;
      this.details = details;
      this.requestId = requestId;
      this.timestamp = new Date().toISOString();
    }
  }

  class WishAuthenticationError extends WishApiError {
    constructor(message = 'Authentication required. Please sign in.', details = null, requestId = null) {
      super(message, 401, 'AUTH_REQUIRED', details, requestId);
      this.name = 'WishAuthenticationError';
    }
  }

  class WishAuthorizationError extends WishApiError {
    constructor(message = 'Access denied. You do not have permission to perform this action.', details = null, requestId = null) {
      super(message, 403, 'FORBIDDEN', details, requestId);
      this.name = 'WishAuthorizationError';
    }
  }

  class WishPremiumRequiredError extends WishApiError {
    constructor(message = 'VIP or Premium subscription required to use this template or feature.', details = null, requestId = null) {
      super(message, 403, 'PREMIUM_REQUIRED', details, requestId);
      this.name = 'WishPremiumRequiredError';
    }
  }

  class WishNotFoundError extends WishApiError {
    constructor(message = 'The requested resource was not found.', details = null, requestId = null) {
      super(message, 404, 'NOT_FOUND', details, requestId);
      this.name = 'WishNotFoundError';
    }
  }

  class WishValidationError extends WishApiError {
    constructor(message = 'Validation failed for request data.', details = null, fields = {}, requestId = null) {
      super(message, 400, 'VALIDATION_ERROR', details, requestId);
      this.name = 'WishValidationError';
      this.fields = fields;
    }
  }

  class WishConflictError extends WishApiError {
    constructor(message = 'A resource conflict occurred.', details = null, requestId = null) {
      super(message, 409, 'CONFLICT', details, requestId);
      this.name = 'WishConflictError';
    }
  }

  class WishRateLimitError extends WishApiError {
    constructor(message = 'Too many requests. Please try again shortly.', retryAfter = 60, details = null, requestId = null) {
      super(message, 429, 'RATE_LIMITED', details, requestId);
      this.name = 'WishRateLimitError';
      this.retryAfter = retryAfter;
    }
  }

  class WishServerError extends WishApiError {
    constructor(message = 'A server error occurred. Please try again later.', status = 500, details = null, requestId = null) {
      super(message, status, 'INTERNAL_ERROR', details, requestId);
      this.name = 'WishServerError';
    }
  }

  class WishNotConfiguredError extends WishApiError {
    constructor(message = 'This service or integration is not yet configured in production.', details = null, requestId = null) {
      super(message, 503, 'NOT_CONFIGURED', details, requestId);
      this.name = 'WishNotConfiguredError';
    }
  }

  class WishServiceUnavailableError extends WishApiError {
    constructor(message = 'The service is temporarily unavailable. Please try again shortly.', details = null, requestId = null) {
      super(message, 503, 'SERVICE_UNAVAILABLE', details, requestId);
      this.name = 'WishServiceUnavailableError';
    }
  }

  class WishNetworkError extends WishApiError {
    constructor(message = 'Network connection failed. Please check your internet connection.', originalError = null) {
      super(message, 0, 'NETWORK_ERROR', originalError ? originalError.message : null);
      this.name = 'WishNetworkError';
      this.isNetworkError = true;
    }
  }

  // =========================================================================
  // CENTRALIZED HTTP CLIENT
  // =========================================================================

  const WishApiClient = {
    Config: WishConfig,
    Errors: {
      ApiError: WishApiError,
      AuthenticationError: WishAuthenticationError,
      AuthorizationError: WishAuthorizationError,
      PremiumRequiredError: WishPremiumRequiredError,
      NotFoundError: WishNotFoundError,
      ValidationError: WishValidationError,
      ConflictError: WishConflictError,
      RateLimitError: WishRateLimitError,
      ServerError: WishServerError,
      NotConfiguredError: WishNotConfiguredError,
      ServiceUnavailableError: WishServiceUnavailableError,
      NetworkError: WishNetworkError
    },

    /**
     * Get the authoritative public wish URL
     */
    getPublicWishUrl(slugOrId) {
      if (!slugOrId) return WishConfig.PUBLIC_APP_URL;
      const cleanSlug = String(slugOrId).replace(/^\/+/, '').replace(/^w\//, '');
      const base = (typeof window !== 'undefined' && window.location && window.location.origin) 
        ? window.location.origin 
        : WishConfig.PUBLIC_APP_URL;
      return `${base}/w/${cleanSlug}`;
    },

    /**
     * Build standard headers including authorization token and content type
     */
    _buildHeaders(customHeaders = {}, isFormData = false) {
      const headers = new Headers();

      if (!isFormData) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
      }
      headers.set('Accept', 'application/json');

      // Add auth token from session if available
      try {
        if (typeof window !== 'undefined' && window.WishAuth) {
          const session = window.WishAuth.getSession();
          if (session && session.token) {
            headers.set('Authorization', `Bearer ${session.token}`);
          }
        } else if (typeof localStorage !== 'undefined') {
          const rawSession = localStorage.getItem('wishmagic_auth_session');
          if (rawSession) {
            const parsed = JSON.parse(rawSession);
            if (parsed && parsed.token) {
              headers.set('Authorization', `Bearer ${parsed.token}`);
            }
          }
        }
      } catch (e) {}

      // Apply custom headers
      if (customHeaders) {
        for (const [key, val] of Object.entries(customHeaders)) {
          if (val !== undefined && val !== null) {
            headers.set(key, val);
          }
        }
      }

      return headers;
    },

    /**
     * Helper to classify response status into specific error instances
     */
    _handleHttpError(status, errorBody = {}) {
      const errObj = errorBody.error || {};
      const code = errorBody.code || errObj.code || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : 'UNKNOWN_ERROR');
      const message = errorBody.message || errObj.message || `HTTP Error ${status}`;
      const details = errorBody.details || errObj.details || null;
      const requestId = errorBody.requestId || errObj.requestId || null;

      if (status === 401 || code === 'AUTH_REQUIRED' || code === 'UNAUTHORIZED') {
        return new WishAuthenticationError(message, details, requestId);
      }
      if (status === 403 && (code === 'PREMIUM_REQUIRED' || code === 'ENTITLEMENT_REQUIRED')) {
        return new WishPremiumRequiredError(message, details, requestId);
      }
      if (status === 403 || code === 'FORBIDDEN') {
        return new WishAuthorizationError(message, details, requestId);
      }
      if (status === 404 || code === 'NOT_FOUND') {
        return new WishNotFoundError(message, details, requestId);
      }
      if (status === 400 || status === 422 || code === 'VALIDATION_ERROR' || code === 'BAD_REQUEST') {
        return new WishValidationError(message, details, errorBody.fields || errObj.fields || {}, requestId);
      }
      if (status === 409 || code === 'CONFLICT') {
        return new WishConflictError(message, details, requestId);
      }
      if (status === 429 || code === 'RATE_LIMITED') {
        return new WishRateLimitError(message, errorBody.retryAfter || 60, details, requestId);
      }
      if (status === 503 && (code === 'DATABASE_UNAVAILABLE' || code === 'SERVICE_UNAVAILABLE')) {
        return new WishServiceUnavailableError(message, details, requestId);
      }
      if (status === 503 || code === 'NOT_CONFIGURED' || code === 'PROVIDER_NOT_CONFIGURED') {
        return new WishNotConfiguredError(message, details, requestId);
      }
      if (status >= 500) {
        return new WishServerError(message, status, details, requestId);
      }
      return new WishApiError(message, status, code, details, requestId);
    },

    /**
     * Core request executor with timeout and retry logic
     */
    async request(endpoint, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      const isIdempotent = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
      const maxRetries = options.retries !== undefined ? options.retries : (isIdempotent ? WishConfig.MAX_RETRIES : 0);
      const timeoutMs = options.timeout || WishConfig.REQUEST_TIMEOUT_MS;

      let fullUrl = endpoint;
      if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
        const cleanBase = WishConfig.API_BASE_URL.replace(/\/+$/, '');
        const cleanPath = endpoint.replace(/^\/+/, '/');
        fullUrl = cleanBase ? `${cleanBase}${cleanPath}` : cleanPath;
      }

      // Add query parameters if provided
      if (options.params && typeof options.params === 'object') {
        const urlObj = new URL(fullUrl, (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost'));
        for (const [k, v] of Object.entries(options.params)) {
          if (v !== undefined && v !== null && v !== '') {
            urlObj.searchParams.set(k, String(v));
          }
        }
        fullUrl = urlObj.pathname + urlObj.search;
      }

      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const headers = this._buildHeaders(options.headers, isFormData);

      let body = options.body;
      if (body && typeof body === 'object' && !isFormData && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
        body = JSON.stringify(body);
      }

      let attempt = 0;
      let lastError = null;

      while (attempt <= maxRetries) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
          const fetchOptions = {
            method,
            headers,
            body: isIdempotent ? undefined : body,
            credentials: options.credentials || 'include',
            signal: controller ? controller.signal : undefined
          };

          const response = await fetch(fullUrl, fetchOptions);
          if (timeoutId) clearTimeout(timeoutId);

          let parsedData = null;
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            parsedData = await response.json().catch(() => ({}));
          } else {
            const text = await response.text();
            try {
              parsedData = JSON.parse(text);
            } catch (e) {
              parsedData = { text };
            }
          }

          if (!response.ok) {
            throw this._handleHttpError(response.status, parsedData || {});
          }

          return parsedData;
        } catch (err) {
          if (timeoutId) clearTimeout(timeoutId);
          lastError = err;

          // Check if error is network/abort
          if (err.name === 'AbortError') {
            lastError = new WishNetworkError(`Request timed out after ${timeoutMs}ms`, err);
          } else if (!(err instanceof WishApiError)) {
            lastError = new WishNetworkError('Network error during request: ' + err.message, err);
          }

          // Non-retryable errors (e.g. 400, 401, 403, 404, 422)
          if (lastError instanceof WishApiError && lastError.status > 0 && lastError.status < 500 && lastError.status !== 429) {
            throw lastError;
          }

          attempt++;
          if (attempt <= maxRetries) {
            const delay = WishConfig.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError;
    },

    // Convenience HTTP Verbs
    async get(endpoint, params = null, options = {}) {
      return await this.request(endpoint, { ...options, method: 'GET', params });
    },

    async post(endpoint, body = {}, options = {}) {
      return await this.request(endpoint, { ...options, method: 'POST', body });
    },

    async put(endpoint, body = {}, options = {}) {
      return await this.request(endpoint, { ...options, method: 'PUT', body });
    },

    async patch(endpoint, body = {}, options = {}) {
      return await this.request(endpoint, { ...options, method: 'PATCH', body });
    },

    async delete(endpoint, options = {}) {
      return await this.request(endpoint, { ...options, method: 'DELETE' });
    },

    async upload(endpoint, formData, options = {}) {
      return await this.request(endpoint, {
        ...options,
        method: 'POST',
        body: formData,
        retries: 0 // Do not auto-retry file uploads
      });
    }
  };

  // Expose to window / module
  if (typeof window !== 'undefined') {
    window.WishConfig = WishConfig;
    window.WishApiClient = WishApiClient;
    window.apiClient = WishApiClient;
    window.WishApiError = WishApiError;
    window.WishAuthenticationError = WishAuthenticationError;
    window.WishAuthorizationError = WishAuthorizationError;
    window.WishPremiumRequiredError = WishPremiumRequiredError;
    window.WishNotFoundError = WishNotFoundError;
    window.WishValidationError = WishValidationError;
    window.WishConflictError = WishConflictError;
    window.WishRateLimitError = WishRateLimitError;
    window.WishServerError = WishServerError;
    window.WishNotConfiguredError = WishNotConfiguredError;
    window.WishServiceUnavailableError = WishServiceUnavailableError;
    window.WishNetworkError = WishNetworkError;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      WishConfig,
      WishApiClient,
      WishApiError,
      WishAuthenticationError,
      WishAuthorizationError,
      WishPremiumRequiredError,
      WishNotFoundError,
      WishValidationError,
      WishConflictError,
      WishRateLimitError,
      WishServerError,
      WishNotConfiguredError,
      WishServiceUnavailableError,
      WishNetworkError
    };
  }

})(typeof window !== 'undefined' ? window : global);
