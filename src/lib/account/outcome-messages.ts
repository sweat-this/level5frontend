import "server-only";

// Fixed, safe strings shared by login and registration's failure handling - see issue #6's
// "Registration Outcome Semantics"/"Login Outcome Semantics". Never derived from a raw Backend
// V2 body/exception for these particular kinds (unlike register's validation_failed/conflict,
// which do surface Backend V2's own intentionally-safe message - see actions.ts).

export const RATE_LIMITED_MESSAGE =
  "Too many attempts. Please wait a moment and try again.";

export const SESSION_STORE_UNAVAILABLE_MESSAGE =
  "We couldn't complete that right now. Please try again shortly.";

export const UNKNOWN_FAILURE_MESSAGE =
  "The request could not be completed. Please try again.";

// Deliberately identical regardless of whether the username is unknown, the password is wrong,
// or the account is disabled - see issue #6's "Login Outcome Semantics": these must stay
// indistinguishable to the user.
export const INVALID_CREDENTIALS_MESSAGE = "Username or password is incorrect.";

export const ORIGIN_REJECTED_MESSAGE =
  "Your request could not be verified. Please reload the page and try again.";

export const MISSING_FIELDS_MESSAGE = "Please fill in all required fields.";
