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
  const value = textOf(error);
  if (/invalid login|invalid.*credential|email.*password|wrong password/.test(value)) return "authInvalidCredentials";
  // Registration must not disclose whether a particular email has an account.
  // Offer a general sign-in/recovery path on the registration screen instead.
  if (/already registered|already exists|user.*exists/.test(value))
    return action === "signup" ? "createAccountFailure" : "authAccountExists";
  if (/rate limit|too many|over.*limit/.test(value)) return "authTooManyAttempts";
  if (/network|fetch|connection|timeout/.test(value)) return "authNetworkFailure";
  if (/expired|invalid.*token|otp.*expired|link.*expired/.test(value)) return "authExpiredLink";
  if (action === "signup") return "createAccountFailure";
  if (action === "recovery") return "recoveryFailure";
  if (action === "password") return "passwordUpdateFailure";
  return "authFailure";
}
