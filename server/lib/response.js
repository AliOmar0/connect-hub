/**
 * Standardized API Response Formatter
 * Ensures consistent response format across all endpoints
 * 
 * Success Response:
 * {
 *   "data": { ... },
 *   "meta": { "requestId": "...", "timestamp": "..." }
 * }
 * 
 * Error Response:
 * {
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "User-friendly message",
 *     "details": [...]
 *   },
 *   "meta": { "requestId": "...", "timestamp": "..." }
 * }
 */

import { ErrorCodes } from './errors.js';

/**
 * Format successful response
 */
export function successResponse(data, requestId, meta = {}) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Format error response
 */
export function errorResponse(code, message, requestId, details = null, meta = {}) {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * HTTP Status Code mappings for common operations
 */
export const StatusMessages = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Standard response builders
 */
export const ResponseBuilder = {
  // Success responses
  ok: (data, requestId) => ({
    status: 200,
    body: successResponse(data, requestId),
  }),

  created: (data, requestId) => ({
    status: 201,
    body: successResponse(data, requestId),
  }),

  noContent: () => ({
    status: 204,
    body: null,
  }),

  // Error responses
  badRequest: (message, requestId, details = null) => ({
    status: 400,
    body: errorResponse(ErrorCodes.VALIDATION_ERROR, message, requestId, details),
  }),

  unauthorized: (message = 'Authentication required', requestId) => ({
    status: 401,
    body: errorResponse(ErrorCodes.AUTHENTICATION_ERROR, message, requestId),
  }),

  forbidden: (message = 'Insufficient permissions', requestId) => ({
    status: 403,
    body: errorResponse(ErrorCodes.AUTHORIZATION_ERROR, message, requestId),
  }),

  notFound: (resource = 'Resource', requestId) => ({
    status: 404,
    body: errorResponse(ErrorCodes.NOT_FOUND, `${resource} not found`, requestId),
  }),

  conflict: (message, requestId) => ({
    status: 409,
    body: errorResponse(ErrorCodes.CONFLICT, message, requestId),
  }),

  rateLimited: (retryAfter, requestId) => ({
    status: 429,
    body: errorResponse(ErrorCodes.RATE_LIMITED, 'Too many requests. Please slow down.', requestId),
    headers: { 'Retry-After': retryAfter },
  }),

  internalError: (requestId) => ({
    status: 500,
    body: errorResponse(ErrorCodes.INTERNAL_ERROR, 'An unexpected error occurred. Please try again.', requestId),
  }),

  serviceUnavailable: (service, requestId) => ({
    status: 503,
    body: errorResponse(ErrorCodes.DATABASE_ERROR, `${service} is temporarily unavailable.`, requestId),
  }),
};

/**
 * Response formatter middleware
 * Attaches helper methods to res object for consistent responses
 */
export function responseFormatterMiddleware(req, res, next) {
  // Success methods
  res.success = (data, meta = {}) => {
    const response = successResponse(data, req.correlationId, meta);
    res.json(response);
  };

  res.created = (data, meta = {}) => {
    const response = successResponse(data, req.correlationId, meta);
    res.status(201).json(response);
  };

  res.noContent = () => {
    res.status(204).send();
  };

  // Error methods
  res.badRequest = (message, details = null) => {
    const response = errorResponse(ErrorCodes.VALIDATION_ERROR, message, req.correlationId, details);
    res.status(400).json(response);
  };

  res.unauthorized = (message = 'Authentication required') => {
    const response = errorResponse(ErrorCodes.AUTHENTICATION_ERROR, message, req.correlationId);
    res.status(401).json(response);
  };

  res.forbidden = (message = 'Insufficient permissions') => {
    const response = errorResponse(ErrorCodes.AUTHORIZATION_ERROR, message, req.correlationId);
    res.status(403).json(response);
  };

  res.notFound = (resource = 'Resource') => {
    const response = errorResponse(ErrorCodes.NOT_FOUND, `${resource} not found`, req.correlationId);
    res.status(404).json(response);
  };

  res.conflict = (message) => {
    const response = errorResponse(ErrorCodes.CONFLICT, message, req.correlationId);
    res.status(409).json(response);
  };

  res.rateLimited = (retryAfter = 60) => {
    const response = errorResponse(ErrorCodes.RATE_LIMITED, 'Too many requests. Please slow down.', req.correlationId);
    res.set('Retry-After', retryAfter).status(429).json(response);
  };

  res.internalError = () => {
    const response = errorResponse(ErrorCodes.INTERNAL_ERROR, 'An unexpected error occurred. Please try again.', req.correlationId);
    res.status(500).json(response);
  };

  res.serviceUnavailable = (service = 'Service') => {
    const response = errorResponse(ErrorCodes.DATABASE_ERROR, `${service} is temporarily unavailable.`, req.correlationId);
    res.status(503).json(response);
  };

  next();
}

export default {
  successResponse,
  errorResponse,
  ResponseBuilder,
  responseFormatterMiddleware,
};
