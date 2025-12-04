/**
 * Retry configuration for API calls
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ThrottlingException',
    'RequestTimeout',
    'TooManyRequestsException',
    'ServiceUnavailable',
  ],
};

/**
 * Checks if an error is retryable based on configuration
 */
function isRetryableError(error: Error, config: RetryConfig): boolean {
  if (!config.retryableErrors || config.retryableErrors.length === 0) {
    return false;
  }

  const errorMessage = error.message || '';
  const errorName = error.name || '';
  const errorCode = (error as any).code || '';

  return config.retryableErrors.some(
    (retryableError) =>
      errorMessage.includes(retryableError) ||
      errorName.includes(retryableError) ||
      errorCode === retryableError
  );
}

/**
 * Calculates the delay for the next retry attempt using exponential backoff
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

/**
 * Sleeps for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (error: Error, attempt: number, delay: number) => void
): Promise<T> {
  const retryConfig = { ...defaultRetryConfig, ...config };
  let lastError: Error;

  for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt === retryConfig.maxAttempts - 1 || !isRetryableError(lastError, retryConfig)) {
        throw lastError;
      }

      const delay = calculateDelay(attempt, retryConfig);
      
      if (onRetry) {
        onRetry(lastError, attempt + 1, delay);
      }

      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  timeoutMs: number;
  timeoutMessage?: string;
}

/**
 * Wraps a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  config: TimeoutConfig
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(config.timeoutMessage || `Operation timed out after ${config.timeoutMs}ms`));
    }, config.timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Combines retry and timeout logic
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  retryConfig: Partial<RetryConfig> = {},
  timeoutConfig?: TimeoutConfig,
  onRetry?: (error: Error, attempt: number, delay: number) => void
): Promise<T> {
  return withRetry(
    async () => {
      if (timeoutConfig) {
        return withTimeout(fn(), timeoutConfig);
      }
      return fn();
    },
    retryConfig,
    onRetry
  );
}
