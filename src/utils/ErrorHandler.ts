/**
 * Production-Grade Error Handling System
 *
 * Operational excellence for SaaS viability:
 * - Graceful degradation
 * - Automatic retry with exponential backoff
 * - User-friendly error messages
 * - Telemetry and monitoring
 * - Cost optimization (prevent infinite retries)
 */

export enum ErrorSeverity {
  INFO = 'info',           // Informational, no action needed
  WARNING = 'warning',     // Warning, still functional
  ERROR = 'error',         // Error, functionality impaired
  CRITICAL = 'critical',   // Critical, system failure
}

export enum ErrorCategory {
  NETWORK = 'network',               // Network/API errors
  AUTHENTICATION = 'authentication', // Auth errors
  RATE_LIMIT = 'rate_limit',        // Rate limiting
  QUOTA = 'quota',                  // Quota exceeded
  VALIDATION = 'validation',        // Input validation
  PERMISSION = 'permission',        // Permission denied
  NOT_FOUND = 'not_found',          // Resource not found
  TIMEOUT = 'timeout',              // Request timeout
  INTERNAL = 'internal',            // Internal errors
  UNKNOWN = 'unknown',              // Unknown errors
}

export interface ErrorContext {
  operation: string;              // What was being attempted
  component?: string;             // Which component
  userId?: string;               // User ID (if applicable)
  metadata?: Record<string, any>; // Additional context
}

export interface ErrorEvent {
  id: string;
  error: Error;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: ErrorContext;
  timestamp: number;
  recoverable: boolean;
  retryCount: number;
}

export interface RetryOptions {
  maxRetries?: number;           // Default: 3
  baseDelay?: number;            // Default: 1000ms
  maxDelay?: number;             // Default: 10000ms
  exponentialFactor?: number;    // Default: 2
  onRetry?: (attempt: number, delay: number) => void;
}

export interface FallbackOptions<T> {
  fallbackValue?: T;
  fallbackFn?: () => T | Promise<T>;
  silent?: boolean;
}

type ErrorHandler = (event: ErrorEvent) => void;

/**
 * User-friendly error messages
 */
const USER_FRIENDLY_MESSAGES: Record<ErrorCategory, string> = {
  [ErrorCategory.NETWORK]:
    "Can't connect right now. Check your internet connection.",
  [ErrorCategory.AUTHENTICATION]:
    "Authentication failed. Please sign in again.",
  [ErrorCategory.RATE_LIMIT]:
    "Too many requests. Please wait a moment and try again.",
  [ErrorCategory.QUOTA]:
    "You've reached your usage limit. Please upgrade your plan.",
  [ErrorCategory.VALIDATION]:
    "Invalid input. Please check your request and try again.",
  [ErrorCategory.PERMISSION]:
    "You don't have permission to do that.",
  [ErrorCategory.NOT_FOUND]:
    "Couldn't find what you're looking for.",
  [ErrorCategory.TIMEOUT]:
    "Request timed out. Please try again.",
  [ErrorCategory.INTERNAL]:
    "Something went wrong on our end. We're looking into it.",
  [ErrorCategory.UNKNOWN]:
    "An unexpected error occurred. Please try again.",
};

class ErrorHandlerService {
  private handlers: Set<ErrorHandler> = new Set();
  private errorLog: ErrorEvent[] = [];
  private maxLogSize = 100;

  // Statistics for monitoring
  private stats = {
    totalErrors: 0,
    byCategory: {} as Record<ErrorCategory, number>,
    bySeverity: {} as Record<ErrorSeverity, number>,
    recovered: 0,
    unrecovered: 0,
  };

  /**
   * Categorize error automatically
   */
  categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      error.name === 'NetworkError'
    ) {
      return ErrorCategory.NETWORK;
    }

    // Auth errors
    if (
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('invalid token') ||
      message.includes('401')
    ) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Rate limit
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429')
    ) {
      return ErrorCategory.RATE_LIMIT;
    }

    // Quota
    if (
      message.includes('quota') ||
      message.includes('limit exceeded') ||
      message.includes('usage limit')
    ) {
      return ErrorCategory.QUOTA;
    }

    // Validation
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('400') ||
      message.includes('bad request')
    ) {
      return ErrorCategory.VALIDATION;
    }

    // Permission
    if (
      message.includes('permission') ||
      message.includes('forbidden') ||
      message.includes('403')
    ) {
      return ErrorCategory.PERMISSION;
    }

    // Not found
    if (
      message.includes('not found') ||
      message.includes('404')
    ) {
      return ErrorCategory.NOT_FOUND;
    }

    // Timeout
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('408')
    ) {
      return ErrorCategory.TIMEOUT;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  determineSeverity(category: ErrorCategory): ErrorSeverity {
    switch (category) {
      case ErrorCategory.CRITICAL:
        return ErrorSeverity.CRITICAL;

      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.QUOTA:
      case ErrorCategory.PERMISSION:
        return ErrorSeverity.ERROR;

      case ErrorCategory.RATE_LIMIT:
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.NOT_FOUND:
        return ErrorSeverity.WARNING;

      default:
        return ErrorSeverity.ERROR;
    }
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(category: ErrorCategory): boolean {
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.RATE_LIMIT:
      case ErrorCategory.TIMEOUT:
        return true; // Can retry

      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.QUOTA:
      case ErrorCategory.PERMISSION:
      case ErrorCategory.NOT_FOUND:
        return false; // No point retrying

      default:
        return false; // Conservative: don't retry unknown
    }
  }

  /**
   * Handle error with full context
   */
  handle(
    error: Error,
    context: ErrorContext,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      retryCount?: number;
    } = {}
  ): ErrorEvent {
    const category = options.category || this.categorizeError(error);
    const severity = options.severity || this.determineSeverity(category);
    const recoverable = this.isRecoverable(category);

    const event: ErrorEvent = {
      id: this.generateErrorId(),
      error,
      category,
      severity,
      context,
      timestamp: Date.now(),
      recoverable,
      retryCount: options.retryCount || 0,
    };

    // Update statistics
    this.updateStats(event);

    // Log error
    this.logError(event);

    // Notify handlers
    this.notifyHandlers(event);

    // Console log for development
    this.logToConsole(event);

    return event;
  }

  /**
   * Retry with exponential backoff
   */
  async retry<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      exponentialFactor = 2,
      onRetry,
    } = options;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if recoverable
        const category = this.categorizeError(lastError);
        if (!this.isRecoverable(category)) {
          // Not recoverable, fail immediately
          this.handle(lastError, context, { category, retryCount: attempt });
          throw lastError;
        }

        attempt++;

        if (attempt > maxRetries) {
          // Max retries reached
          this.handle(lastError, context, { category, retryCount: attempt });
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          baseDelay * Math.pow(exponentialFactor, attempt - 1),
          maxDelay
        );

        console.log(
          `[ErrorHandler] Retry ${attempt}/${maxRetries} after ${delay}ms for: ${context.operation}`
        );

        onRetry?.(attempt, delay);

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // Should never reach here
    throw lastError || new Error('Retry failed');
  }

  /**
   * Try operation with fallback
   */
  async withFallback<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options: FallbackOptions<T> = {}
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handle(err, context);

      // Use fallback
      if (options.fallbackFn) {
        const result = await options.fallbackFn();
        if (!options.silent) {
          console.log(`[ErrorHandler] Using fallback for: ${context.operation}`);
        }
        return result;
      }

      if (options.fallbackValue !== undefined) {
        if (!options.silent) {
          console.log(`[ErrorHandler] Using fallback value for: ${context.operation}`);
        }
        return options.fallbackValue;
      }

      // No fallback, rethrow
      throw err;
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(event: ErrorEvent): string {
    return USER_FRIENDLY_MESSAGES[event.category] || USER_FRIENDLY_MESSAGES[ErrorCategory.UNKNOWN];
  }

  /**
   * Subscribe to error events
   */
  onError(handler: ErrorHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Get error statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get error log
   */
  getLog(): ReadonlyArray<ErrorEvent> {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clearLog(): void {
    this.errorLog = [];
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalErrors: 0,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      recovered: 0,
      unrecovered: 0,
    };
  }

  private updateStats(event: ErrorEvent): void {
    this.stats.totalErrors++;

    // By category
    this.stats.byCategory[event.category] = (this.stats.byCategory[event.category] || 0) + 1;

    // By severity
    this.stats.bySeverity[event.severity] = (this.stats.bySeverity[event.severity] || 0) + 1;

    // Recovered vs unrecovered
    if (event.recoverable && event.retryCount > 0) {
      this.stats.recovered++;
    } else {
      this.stats.unrecovered++;
    }
  }

  private logError(event: ErrorEvent): void {
    this.errorLog.push(event);

    // Limit log size
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }

  private notifyHandlers(event: ErrorEvent): void {
    this.handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error('[ErrorHandler] Handler error:', error);
      }
    });
  }

  private logToConsole(event: ErrorEvent): void {
    const emoji = {
      [ErrorSeverity.INFO]: 'ℹ️',
      [ErrorSeverity.WARNING]: '⚠️',
      [ErrorSeverity.ERROR]: '❌',
      [ErrorSeverity.CRITICAL]: '🚨',
    };

    console.error(
      `${emoji[event.severity]} [${event.category.toUpperCase()}] ${event.context.operation}`,
      {
        error: event.error.message,
        severity: event.severity,
        recoverable: event.recoverable,
        retryCount: event.retryCount,
        context: event.context,
      }
    );
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const errorHandler = new ErrorHandlerService();
export default errorHandler;
