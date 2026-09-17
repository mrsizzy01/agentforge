/**
 * Exponential backoff retry utility for LLM API calls.
 * Handles HTTP 429 rate-limit errors and transient network failures.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for first retry (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Whether to add random jitter to prevent thundering herds (default: true) */
  jitter?: boolean;
}

export class RateLimitError extends Error {
  public readonly statusCode: number;
  public readonly retryAfterMs?: number;

  constructor(message: string, statusCode: number, retryAfterMs?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Determines if an error is a rate-limit / transient error worth retrying.
 */
export function isRetryableError(err: unknown): { retryable: boolean; retryAfterMs?: number } {
  if (err instanceof RateLimitError) {
    return { retryable: true, retryAfterMs: err.retryAfterMs };
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Common rate limit patterns across providers
    if (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('rate_limit') ||
      msg.includes('too many requests') ||
      msg.includes('quota exceeded') ||
      msg.includes('resource exhausted')
    ) {
      return { retryable: true };
    }

    // Transient network errors
    if (
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('socket hang up') ||
      msg.includes('network error') ||
      msg.includes('503') ||
      msg.includes('502')
    ) {
      return { retryable: true };
    }
  }

  return { retryable: false };
}

/**
 * Wraps an async function with exponential backoff retry logic.
 *
 * @example
 * const result = await withRetry(() => provider.complete(request), { maxRetries: 3 });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  const useJitter = options.jitter ?? true;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries) {
        break;
      }

      const { retryable, retryAfterMs } = isRetryableError(err);
      if (!retryable) {
        throw err;
      }

      // Respect Retry-After header if provided by the server
      let delayMs: number;
      if (retryAfterMs && retryAfterMs > 0) {
        delayMs = Math.min(retryAfterMs, maxDelayMs);
      } else {
        // Exponential backoff: base * 2^attempt
        delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      }

      // Add jitter: ±25% of delay to spread out concurrent requests
      if (useJitter) {
        const jitterRange = delayMs * 0.25;
        delayMs = delayMs + (Math.random() * 2 - 1) * jitterRange;
      }

      await new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
    }
  }

  throw lastError;
}
