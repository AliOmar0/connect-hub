/**
 * Centralized Error Handling Module
 * Implements standardized error responses across all endpoints.
 * 
 * Error Response Format:
 * {
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "User-friendly message",
 *     "details": [{ field: "...", message: "..." }]
 *   },
 *   "meta": { "requestId": "...", "timestamp": "..." }
 * }
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguishes operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400 Bad Request)
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication error (401 Unauthorized)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error (403 Forbidden)
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error (404 Not Found)
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Conflict error (409 Conflict)
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Rate limit error (429 Too Many Requests)
 */
export class RateLimitError extends AppError {
  constructor(retryAfter = null) {
    super('Too many requests. Please slow down.', 429, 'RATE_LIMITED');
    this.retryAfter = retryAfter;
  }
}

/**
 * External service error (502 Bad Gateway)
 */
export class ExternalServiceError extends AppError {
  constructor(service = 'External service', message = 'Service temporarily unavailable') {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
  }
}

/**
 * Database error (503 Service Unavailable)
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database temporarily unavailable') {
    super(message, 503, 'DATABASE_ERROR');
  }
}

/**
 * Error code registry for consistent responses
 */
export const ErrorCodes = {
  // 4xx Client Errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  
  // 5xx Server Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  LLM_ERROR: 'LLM_ERROR',
  TTS_ERROR: 'TTS_ERROR',
  REDIS_ERROR: 'REDIS_ERROR',
};

/**
 * Map HTTP status codes to error categories
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Format error response for API
 */
export function formatErrorResponse(error, requestId) {
  const isOperational = error.isOperational ?? false;
  const statusCode = error.statusCode || 500;
  const code = error.code || ErrorCodes.INTERNAL_ERROR;
  const message = error.message || 'An unexpected error occurred';
  const details = error.details || null;

  // Log non-operational errors (programming errors)
  if (!isOperational) {
    console.error('[Non-operational error]', error);
  }

  return {
    error: {
      code,
      message: isOperational ? message : 'An unexpected error occurred. Please try again.',
      ...(details && { details }),
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Async handler wrapper to catch errors in route handlers
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
