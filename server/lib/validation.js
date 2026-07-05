/**
 * Input Validation Module using Zod-like schema validation
 * Implements OWASP A03:2021 (Injection) protection
 * 
 * Note: Using native validation since Zod isn't in package.json
 * This module provides schema validation similar to Zod but without the dependency.
 */

// Validation result type
class ValidationResult {
  constructor(success, data = null, errors = []) {
    this.success = success;
    this.data = data;
    this.errors = errors;
  }
}

// Field validators
class FieldValidator {
  constructor(fieldName) {
    this.fieldName = fieldName;
    this.rules = [];
    this.optional = false;
  }

  static field(name) {
    return new FieldValidator(name);
  }

  isOptional() {
    this.optional = true;
    return this;
  }

  required(message = 'Field is required') {
    this.rules.push({ type: 'required', message });
    return this;
  }

  string(message = 'Must be a string') {
    this.rules.push({ type: 'string', message });
    return this;
  }

  number(message = 'Must be a number') {
    this.rules.push({ type: 'number', message });
    return this;
  }

  min(minValue, message) {
    this.rules.push({ 
      type: 'min', 
      value: minValue, 
      message: message || `Minimum value is ${minValue}` 
    });
    return this;
  }

  max(maxValue, message) {
    this.rules.push({ 
      type: 'max', 
      value: maxValue, 
      message: message || `Maximum value is ${maxValue}` 
    });
    return this;
  }

  minLength(length, message) {
    this.rules.push({ 
      type: 'minLength', 
      value: length, 
      message: message || `Minimum length is ${length}` 
    });
    return this;
  }

  maxLength(length, message) {
    this.rules.push({ 
      type: 'maxLength', 
      value: length, 
      message: message || `Maximum length is ${length}` 
    });
    return this;
  }

  pattern(regex, message) {
    this.rules.push({ 
      type: 'pattern', 
      value: regex, 
      message: message || 'Invalid format' 
    });
    return this;
  }

  email(message = 'Invalid email format') {
    this.rules.push({ 
      type: 'email', 
      message 
    });
    return this;
  }

  phone(message = 'Invalid phone number format') {
    // International phone format: + followed by digits, optional spaces/dashes
    this.rules.push({ 
      type: 'pattern', 
      value: /^\+?[1-9]\d{1,14}$/, 
      message 
    });
    return this;
  }

  uuid(message = 'Invalid UUID format') {
    this.rules.push({ 
      type: 'pattern', 
      value: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      message 
    });
    return this;
  }

  enum(values, message) {
    this.rules.push({ 
      type: 'enum', 
      values, 
      message: message || `Must be one of: ${values.join(', ')}` 
    });
    return this;
  }

  sanitize() {
    this.rules.push({ type: 'sanitize' });
    return this;
  }

  validate(value) {
    const errors = [];
    let processedValue = value;

    // Check required
    if (value === undefined || value === null || value === '') {
      if (!this.optional) {
        const requiredRule = this.rules.find(r => r.type === 'required');
        if (requiredRule) {
          errors.push({ field: this.fieldName, message: requiredRule.message });
        }
      }
      return new ValidationResult(errors.length === 0, processedValue, errors);
    }

    // Apply rules
    for (const rule of this.rules) {
      switch (rule.type) {
        case 'string':
          if (typeof processedValue !== 'string') {
            errors.push({ field: this.fieldName, message: rule.message });
          }
          break;

        case 'number':
          const num = Number(processedValue);
          if (isNaN(num)) {
            errors.push({ field: this.fieldName, message: rule.message });
          } else {
            processedValue = num;
          }
          break;

        case 'min':
          if (typeof processedValue === 'number' && processedValue < rule.value) {
            errors.push({ field: this.fieldName, message: rule.message });
          }
          break;

        case 'max':
          if (typeof processedValue === 'number' && processedValue > rule.value) {
            errors.push({ field: this.fieldName, message: rule.message });
          }
          break;

        case 'minLength':
          if (typeof processedValue === 'string' && processedValue.length < rule.value) {
            errors.push({ field: this.fieldName, message: rule.message });
          }
          break;

        case 'maxLength':
          if (typeof processedValue === 'string' && processedValue.length > rule.value) {
            errors.push({ field: this.fieldName, message: rule.message });
          }
          break;

        case 'pattern':
          if (!rule.value.test(String(processedValue))) {
            errors.push({ field: this.fieldName, message: rule.message });
          }
          break;

        case 'email':
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(processedValue))) {
            errors.push({ field: this.fieldName, message: rule.message });
          }
          break;

        case 'enum':
          if (!rule.values.includes(processedValue)) {
            errors.push({ field: this.fieldName, message: rule.message });
          }
          break;

        case 'sanitize':
          // Strip potentially dangerous characters
          if (typeof processedValue === 'string') {
            processedValue = processedValue
              .replace(/<[^>]*>/g, '')  // Remove HTML tags
              .replace(/[<>\"\'\\]/g, '') // Remove dangerous chars
              .trim();
          }
          break;
      }
    }

    return new ValidationResult(errors.length === 0, processedValue, errors);
  }
}

// Schema builder
export class Schema {
  constructor() {
    this.fields = [];
  }

  static create() {
    return new Schema();
  }

  field(name) {
    const validator = new FieldValidator(name);
    this.fields.push(validator);
    return validator;
  }

  validate(data) {
    const errors = [];
    const result = {};

    for (const fieldValidator of this.fields) {
      const value = data?.[fieldValidator.fieldName];
      const validation = fieldValidator.validate(value);
      
      if (!validation.success) {
        errors.push(...validation.errors);
      } else if (validation.data !== undefined) {
        result[fieldValidator.fieldName] = validation.data;
      }
    }

    return new ValidationResult(errors.length === 0, errors.length === 0 ? result : null, errors);
  }
}

// Pre-built schemas for common endpoints
export const Schemas = {
  // Chat message validation
  chatMessage: Schema.create()
    .field('message')
      .required('Message is required')
      .string()
      .minLength(1, 'Message cannot be empty')
      .maxLength(4000, 'Message too long')
      .sanitize()
    .field('sessionId')
      .string()
      .maxLength(100)
    .field('phone')
      .string()
      .maxLength(20)
    .field('history')
      .isOptional(),

  // OTP validation
  otp: Schema.create()
    .field('otp')
      .required('OTP code is required')
      .string()
      .minLength(4, 'OTP must be 4-6 digits')
      .maxLength(6, 'OTP must be 4-6 digits')
      .pattern(/^\d+$/, 'OTP must contain only digits'),

  // Phone number validation
  phone: Schema.create()
    .field('phone')
      .required('Phone number is required')
      .string()
      .phone('Invalid phone number format')
      .maxLength(20),

  // Session ID validation
  sessionId: Schema.create()
    .field('sessionId')
      .required('Session ID is required')
      .string()
      .maxLength(100),

  // Make call validation
  makeCall: Schema.create()
    .field('to')
      .required('Phone number is required')
      .string()
      .phone('Invalid phone number format'),

  // Media sign validation
  mediaSign: Schema.create()
    .field('path')
      .required('Path is required')
      .string()
      .maxLength(500)
      .pattern(/^[a-zA-Z0-9_\-/.]+$/, 'Invalid path format'),
};

/**
 * Validation middleware factory
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.validate(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: result.errors,
        },
        meta: {
          requestId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    // Replace body with validated/sanitized data
    req.body = result.data;
    next();
  };
}

export { FieldValidator, ValidationResult };
