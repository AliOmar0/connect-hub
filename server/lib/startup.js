/**
 * Startup Validation Module
 * Validates required secrets and configuration at server startup
 * Implements OWASP A05:2021 (Security Misconfiguration) best practices
 */

import { logger } from './logger.js';

/**
 * Secret configuration schema
 * Defines which secrets are required, optional, or conditionally required
 */
const SecretSchema = {
  // Critical: Server cannot start without these
  critical: [
    { name: 'VITE_SUPABASE_URL', description: 'Supabase project URL' },
    { name: 'VITE_SUPABASE_PUBLISHABLE_KEY', description: 'Supabase anon/public key' },
    { name: 'SUPABASE_JWT_SECRET', description: 'JWT secret for token validation' },
  ],
  
  // Required for core functionality
  required: [
    { name: 'TWILIO_ACCOUNT_SID', description: 'Twilio Account SID' },
    { name: 'TWILIO_AUTH_TOKEN', description: 'Twilio Auth Token' },
    { name: 'TWILIO_PHONE_NUMBER', description: 'Twilio phone number for voice calls' },
  ],
  
  // Optional but recommended
  recommended: [
    { name: 'OPENROUTER_API_KEY', description: 'OpenRouter API key for AI responses' },
    { name: 'REDIS_URL', description: 'Redis URL for distributed state (recommended for production)' },
    { name: 'NGROK_URL', description: 'Public URL for Twilio webhooks' },
  ],
  
  // Conditionally required based on features
  conditional: [
    { 
      name: 'SECURITY_WHATSAPP_PHONE_NUMBER_ID', 
      description: 'WhatsApp Business phone number ID',
      requires: ['SECURITY_WHATSAPP_ACCESS_TOKEN'],
    },
    { 
      name: 'SECURITY_WHATSAPP_ACCESS_TOKEN', 
      description: 'WhatsApp Business access token',
      requires: ['SECURITY_WHATSAPP_PHONE_NUMBER_ID'],
    },
    {
      name: 'TWILIO_API_KEY',
      description: 'Twilio API key for client token generation',
      requires: ['TWILIO_API_SECRET', 'TWIML_APP_SID'],
    },
    {
      name: 'AZURE_TTS_KEY',
      description: 'Azure TTS key',
      requires: ['AZURE_TTS_REGION'],
    },
    {
      name: 'ELEVENLABS_API_KEY',
      description: 'ElevenLabs TTS key',
      requires: ['ELEVENLABS_VOICE_ID'],
    },
  ],
};

/**
 * Validation result
 */
class ValidationResult {
  constructor(valid, errors = [], warnings = [], info = []) {
    this.valid = valid;
    this.errors = errors;
    this.warnings = warnings;
    this.info = info;
  }
}

/**
 * Check if a secret value is set and non-empty
 */
function isSecretSet(value) {
  return value !== undefined && value !== null && value !== '' && value !== 'your-xxx-here';
}

/**
 * Mask a secret value for safe logging
 */
function maskSecret(value, showChars = 4) {
  if (!value) return '[NOT SET]';
  if (value.length <= showChars * 2) return '[SET]';
  return `${value.slice(0, showChars)}...${value.slice(-showChars)}`;
}

/**
 * Validate all secrets and configuration
 */
export function validateStartup() {
  const errors = [];
  const warnings = [];
  const info = [];
  
  // Check critical secrets
  for (const secret of SecretSchema.critical) {
    const value = process.env[secret.name];
    if (!isSecretSet(value)) {
      errors.push({
        type: 'CRITICAL',
        name: secret.name,
        description: secret.description,
        message: `Critical secret ${secret.name} is not set. ${secret.description} is required.`,
      });
    } else {
      info.push({
        type: 'CRITICAL',
        name: secret.name,
        status: 'SET',
        masked: maskSecret(value),
      });
    }
  }
  
  // Check required secrets
  for (const secret of SecretSchema.required) {
    const value = process.env[secret.name];
    if (!isSecretSet(value)) {
      warnings.push({
        type: 'REQUIRED',
        name: secret.name,
        description: secret.description,
        message: `Required secret ${secret.name} is not set. Some features may not work.`,
      });
    } else {
      info.push({
        type: 'REQUIRED',
        name: secret.name,
        status: 'SET',
        masked: maskSecret(value),
      });
    }
  }
  
  // Check recommended secrets
  for (const secret of SecretSchema.recommended) {
    const value = process.env[secret.name];
    if (!isSecretSet(value)) {
      info.push({
        type: 'RECOMMENDED',
        name: secret.name,
        description: secret.description,
        status: 'NOT_SET',
        message: `Recommended secret ${secret.name} is not set. ${secret.description}.`,
      });
    } else {
      info.push({
        type: 'RECOMMENDED',
        name: secret.name,
        status: 'SET',
        masked: maskSecret(value),
      });
    }
  }
  
  // Check conditional secrets
  for (const secret of SecretSchema.conditional) {
    const value = process.env[secret.name];
    const isSet = isSecretSet(value);
    
    if (isSet && secret.requires) {
      // Check if all required companion secrets are also set
      const missingCompanions = secret.requires.filter(r => !isSecretSet(process.env[r]));
      if (missingCompanions.length > 0) {
        warnings.push({
          type: 'CONDITIONAL',
          name: secret.name,
          message: `${secret.name} is set but requires ${missingCompanions.join(', ')} to function.`,
        });
      } else {
        info.push({
          type: 'CONDITIONAL',
          name: secret.name,
          status: 'SET',
          masked: maskSecret(value),
        });
      }
    }
  }
  
  // Log results
  logger.info({ 
    secrets: info.map(i => ({ name: i.name, status: i.status, masked: i.masked })) 
  }, 'Startup configuration check');
  
  if (errors.length > 0) {
    logger.error({ errors }, 'Critical configuration errors detected');
  }
  
  if (warnings.length > 0) {
    logger.warn({ warnings }, 'Configuration warnings detected');
  }
  
  return new ValidationResult(
    errors.length === 0,
    errors,
    warnings,
    info
  );
}

/**
 * Quick check if server can start
 */
export function canStart() {
  const result = validateStartup();
  return result.valid;
}

/**
 * Get configuration status for health endpoint
 */
export function getConfigStatus() {
  const result = validateStartup();
  return {
    valid: result.valid,
    errors: result.errors.map(e => ({ name: e.name, message: e.message })),
    warnings: result.warnings.map(w => ({ name: w.name, message: w.message })),
    configured: result.info.filter(i => i.status === 'SET').map(i => i.name),
  };
}

export default {
  validateStartup,
  canStart,
  getConfigStatus,
};
