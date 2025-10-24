/**
 * React Hook for Error Handling
 *
 * Easy integration of production-grade error handling in React components.
 * Provides toast notifications, retry logic, and fallbacks.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import toast from 'react-hot-toast';

import errorHandler, {
  ErrorCategory,
  ErrorContext,
  ErrorEvent,
  ErrorSeverity,
  FallbackOptions,
  RetryOptions,
} from './ErrorHandler';

export interface UseErrorHandlerOptions {
  showToast?: boolean;                       // Show toast notifications
  toastDuration?: number;                    // Toast duration (ms)
  onError?: (event: ErrorEvent) => void;     // Custom error callback
  autoRetry?: boolean;                       // Auto-retry on errors
  retryOptions?: RetryOptions;               // Retry configuration
}

export interface UseErrorHandlerReturn {
  // Handle error
  handleError: (error: Error, context: ErrorContext) => ErrorEvent;

  // Retry with backoff
  retry: <T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options?: RetryOptions
  ) => Promise<T>;

  // With fallback
  withFallback: <T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options?: FallbackOptions<T>
  ) => Promise<T>;

  // State
  lastError: ErrorEvent | null;
  errorCount: number;

  // Statistics
  stats: ReturnType<typeof errorHandler.getStats>;
  recentErrors: ReadonlyArray<ErrorEvent>;

  // Clear errors
  clearErrors: () => void;
}

/**
 * Hook for error handling with automatic toast notifications
 */
export function useErrorHandler(
  options: UseErrorHandlerOptions = {}
): UseErrorHandlerReturn {
  const {
    showToast = true,
    toastDuration = 4000,
    onError,
    autoRetry = false,
    retryOptions = {},
  } = options;

  const [lastError, setLastError] = useState<ErrorEvent | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [stats, setStats] = useState(errorHandler.getStats());
  const [recentErrors, setRecentErrors] = useState<ReadonlyArray<ErrorEvent>>([]);

  // Subscribe to error events
  useEffect(() => {
    const unsubscribe = errorHandler.onError((event) => {
      setLastError(event);
      setErrorCount((prev) => prev + 1);
      setStats(errorHandler.getStats());
      setRecentErrors(errorHandler.getLog().slice(-10)); // Last 10 errors

      // Show toast notification
      if (showToast) {
        showErrorToast(event, toastDuration);
      }

      // Call custom callback
      onError?.(event);
    });

    return unsubscribe;
  }, [showToast, toastDuration, onError]);

  // Handle error
  const handleError = useCallback(
    (error: Error, context: ErrorContext): ErrorEvent => {
      return errorHandler.handle(error, context);
    },
    []
  );

  // Retry with backoff
  const retry = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      context: ErrorContext,
      customOptions?: RetryOptions
    ): Promise<T> => {
      const options = { ...retryOptions, ...customOptions };

      return errorHandler.retry(operation, context, {
        ...options,
        onRetry: (attempt, delay) => {
          if (showToast) {
            toast.loading(`Retrying... (${attempt})`, {
              duration: delay,
              id: `retry-${context.operation}`,
            });
          }
          options.onRetry?.(attempt, delay);
        },
      });
    },
    [retryOptions, showToast]
  );

  // With fallback
  const withFallback = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      context: ErrorContext,
      fallbackOptions?: FallbackOptions<T>
    ): Promise<T> => {
      return errorHandler.withFallback(operation, context, fallbackOptions);
    },
    []
  );

  // Clear errors
  const clearErrors = useCallback(() => {
    setLastError(null);
    setErrorCount(0);
    errorHandler.clearLog();
    errorHandler.resetStats();
    setStats(errorHandler.getStats());
    setRecentErrors([]);
  }, []);

  return {
    handleError,
    retry,
    withFallback,
    lastError,
    errorCount,
    stats,
    recentErrors,
    clearErrors,
  };
}

/**
 * Show toast notification for error
 */
function showErrorToast(event: ErrorEvent, duration: number): void {
  const message = errorHandler.getUserMessage(event);

  // Get toast function based on severity
  const toastFn = {
    [ErrorSeverity.INFO]: toast,
    [ErrorSeverity.WARNING]: toast,
    [ErrorSeverity.ERROR]: toast.error,
    [ErrorSeverity.CRITICAL]: toast.error,
  }[event.severity];

  // Show toast with appropriate icon and duration
  toastFn(message, {
    duration,
    id: event.id, // Prevent duplicates
    icon: getErrorIcon(event.severity),
  });
}

/**
 * Get icon for error severity
 */
function getErrorIcon(severity: ErrorSeverity): string {
  return {
    [ErrorSeverity.INFO]: 'ℹ️',
    [ErrorSeverity.WARNING]: '⚠️',
    [ErrorSeverity.ERROR]: '❌',
    [ErrorSeverity.CRITICAL]: '🚨',
  }[severity];
}

export default useErrorHandler;
