import type { MessageKey } from "./nexride-i18n";

export type AuthAction = "signin" | "signup" | "recovery" | "password";

const textOf = (error: unknown) => {
  if (typeof error === "string") return error.toLowerCase();
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message.toLowerCase() : "";
  }
  return "";
};

export function authErrorKey(error: unknown, action: AuthAction = "signin"): MessageKey {
  const details = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
  const code = typeof details.code === "string" ? details.code : "";
  if (code === "invalid_credentials") return "authInvalidCredentials";
  if (code === "email_not_confirmed") return "authEmailNotConfirmed";
  if (code === "user_already_exists" || code === "email_exists") return "authAccountExists";
  if (/rate_limit/.test(code) || details.status === 429) return "authTooManyAttempts";
  if (code === "otp_expired" || code === "bad_jwt") return "authExpiredLink";
  if (typeof details.status === "number" && details.status >= 500) return "authUnavailable";
  const value = textOf(error);
  if (/email.*not.*confirm|unconfirmed email/.test(value)) return "authEmailNotConfirmed";
  if (/invalid login|invalid.*credential|email.*password|wrong password/.test(value)) return "authInvalidCredentials";
  if (/already registered|already exists|user.*exists/.test(value)) return "authAccountExists";
  if (/rate limit|too many|over.*limit/.test(value)) return "authTooManyAttempts";
  if (/network|fetch|connection|timeout/.test(value)) return "authNetworkFailure";
  if (/expired|invalid.*token|otp.*expired|link.*expired/.test(value)) return "authExpiredLink";
  if (action === "signup") return "createAccountFailure";
  if (action === "recovery") return "recoveryFailure";
  if (action === "password") return "passwordUpdateFailure";
  return "authFailure";
}
