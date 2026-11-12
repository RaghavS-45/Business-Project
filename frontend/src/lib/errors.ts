import { isAxiosError } from "axios";

interface ApiErrorBody {
  message?: string;
  errors?: Array<{ field?: string; message?: string }>;
}

/**
 * Turn an API error into a message a person can act on.
 *
 * The backend responds with { message, errors: [{ field, message }] }.
 * For validation failures the top-level message is just "Validation failed",
 * so the field-level messages are what actually explain the problem.
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    const details = (body?.errors ?? [])
      .map((e) => e.message)
      .filter((m): m is string => !!m);

    if (details.length) return [...new Set(details)].join(" · ");
    if (body?.message) return body.message;
    if (!error.response) return "Can't reach the server. Check your connection.";
  }
  return fallback;
}
