import { describe, expect, it } from 'vitest';
import { authErrorKey } from '../../lib/nexride-auth-errors';

describe('customer-safe authentication errors', () => {
  it('uses server error codes without exposing technical messages', () => {
    expect(authErrorKey({ code: 'invalid_credentials', message: 'technical_detail' })).toBe('authInvalidCredentials');
    expect(authErrorKey({ code: 'email_not_confirmed', message: 'technical_detail' })).toBe('authEmailNotConfirmed');
    expect(authErrorKey({ code: 'user_already_exists' }, 'signup')).toBe('authAccountExists');
  });
  it('distinguishes retryable service failures and rate limits', () => {
    expect(authErrorKey({ status: 503, message: 'internal_error' })).toBe('authUnavailable');
    expect(authErrorKey({ status: 429 })).toBe('authTooManyAttempts');
    expect(authErrorKey(new TypeError('Failed to fetch'))).toBe('authNetworkFailure');
  });
  it('offers recovery for expired links and preserves generic safe fallbacks', () => {
    expect(authErrorKey({ code: 'otp_expired' })).toBe('authExpiredLink');
    expect(authErrorKey('Email not confirmed')).toBe('authEmailNotConfirmed');
    expect(authErrorKey({ message: 'secret_database_table' }, 'signup')).toBe('createAccountFailure');
  });
});
