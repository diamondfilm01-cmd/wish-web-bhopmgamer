/**
 * WishMagic Centralized API Client Layer
 * Part 22: Full Frontend <-> Worker <-> D1/R2 Integration
 * 
 * Provides unified HTTP operations, structured error classification,
 * credentials handling, retry policies, and centralized configuration.
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
    constructor(message, status = 500, code = 'API_ERROR', details = null) {
      super(message);
      this.name = 'WishApiError';
      this.status = status;
      this.code = code;
      this.details = details;
      this.timestamp = new Date().toISOString();
    }
  }

  class WishAuthenticationError extends WishApiError {
    constructor(message = 'Authentication required. Please sign in.', details = null) {
      super(message, 401, 'UNAUTHORIZED', details);
      this.name = 'WishAuthenticationError';
    }
  }

  class WishAuthorizationError extends WishApiError {
    constructor(message = 'Access denied. You do not have permission to perform this action.', details = null) {
      super(message, 403, 'FORBIDDEN', details);
      this.name = 'WishAuthorizationError';
    }
  }

  class WishNotFoundError extends WishApiError {
    constructor(message = 'The requested resource was not found.', details = null) {
      super(message, 404, 'NOT_FOUND', details);
      this.name = 'WishNotFoundError';
    }
  }

  class WishValidationError extends WishApiError {
    constructor(message = 'Validation failed for request data.', details = null, fields = {}) {
      super(message, 400, 'VALIDATION_ERROR', details);
      this.name = 'WishValidationError';
      this.fields = fields;
    }
  }

  class WishConflictError extends WishApiError {
    constructor(message = 'A resource conflict occurred.', details = null) {
      super(message, 409, 'CONFLICT', details);
      this.name = 'WishConflictError';
    }
  }

  class WishRateLimitError extends WishApiError {
    constructor(message = 'Too many requests. Please try again shortly.', retryAfter = 60, details = null) {
      super(message, 429, 'RATE_LIMITED', details);
      this.name = 'WishRateLimitError';
      this.retryAfter = retryAfter;
    }
  }

  class WishServerError extends WishApiError {
    constructor(message = 'A server error occurred. Please try again later.', status = 500, details = null) {
      super(message, status, 'SERVER_ERROR', details);
      this.name = 'WishServerError';
    }
  }

  class WishNotConfiguredError extends WishApiError {
    constructor(message = 'This service or integration is not yet configured in production.', details = null) {
      super(message, 503, 'NOT_CONFIGURED', details);
      this.name = 'WishNotConfiguredError';
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
      NotFoundError: WishNotFoundError,
      ValidationError: WishValidationError,
      ConflictError: WishConflictError,
      RateLimitError: WishRateLimitError,
      ServerError: WishServerError,
      NotConfiguredError: WishNotConfiguredError,
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
      const code = errorBody.code || (errorBody.error && errorBody.error.code) || 'UNKNOWN_ERROR';
      const message = errorBody.message || (errorBody.error && errorBody.error.message) || `HTTP Error ${status}`;
      const details = errorBody.details || (errorBody.error && errorBody.error.details) || null;

      if (status === 401) {
        return new WishAuthenticationError(message, details);
      }
      if (status === 403) {
        return new WishAuthorizationError(message, details);
      }
      if (status === 404) {
        return new WishNotFoundError(message, details);
      }
      if (status === 400 || status === 422) {
        return new WishValidationError(message, details, errorBody.fields || {});
      }
      if (status === 409) {
        return new WishConflictError(message, details);
      }
      if (status === 429) {
        return new WishRateLimitError(message, errorBody.retryAfter || 60, details);
      }
      if (status === 503 || code === 'NOT_CONFIGURED' || code === 'PROVIDER_NOT_CONFIGURED') {
        return new WishNotConfiguredError(message, details);
      }
      if (status >= 500) {
        return new WishServerError(message, status, details);
      }
      return new WishApiError(message, status, code, details);
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
    window.WishNotFoundError = WishNotFoundError;
    window.WishValidationError = WishValidationError;
    window.WishConflictError = WishConflictError;
    window.WishRateLimitError = WishRateLimitError;
    window.WishServerError = WishServerError;
    window.WishNotConfiguredError = WishNotConfiguredError;
    window.WishNetworkError = WishNetworkError;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      WishConfig,
      WishApiClient,
      WishApiError,
      WishAuthenticationError,
      WishAuthorizationError,
      WishNotFoundError,
      WishValidationError,
      WishConflictError,
      WishRateLimitError,
      WishServerError,
      WishNotConfiguredError,
      WishNetworkError
    };
  }

})(typeof window !== 'undefined' ? window : global);
