# Production Error Handling System

## Overview

Enterprise-grade error handling system for operational excellence and SaaS viability. Provides automatic retry logic, graceful degradation, user-friendly messages, and comprehensive telemetry.

## Why This Matters

### Operational Excellence
- **99.9% Uptime**: Graceful error recovery
- **Self-Healing**: Automatic retry with exponential backoff
- **Monitoring**: Real-time error tracking and statistics
- **Debugging**: Comprehensive error logs with context

### User Experience
- **No Confusing Errors**: User-friendly messages
- **Seamless Recovery**: Transparent retries
- **Always Responsive**: Fallback values prevent crashes
- **Trust Building**: Professional error handling

### Cost Optimization
- **Prevent Infinite Retries**: Max retry limits save API costs
- **Smart Retry Logic**: Only retry recoverable errors
- **Exponential Backoff**: Respects rate limits
- **Telemetry**: Identify cost-heavy error patterns

---

## Features

### 1. Automatic Error Categorization

Errors are automatically categorized into 10 types:

```typescript
enum ErrorCategory {
  NETWORK              // Network/API errors
  AUTHENTICATION       // Auth failures
  RATE_LIMIT          // Too many requests
  QUOTA               // Usage limits
  VALIDATION          // Invalid input
  PERMISSION          // Access denied
  NOT_FOUND           // 404 errors
  TIMEOUT             // Request timeouts
  INTERNAL            // Server errors
  UNKNOWN             // Uncategorized
}
```

**Smart Detection**:
```typescript
// Automatic categorization from error message
"fetch failed" → NETWORK
"401 Unauthorized" → AUTHENTICATION
"429 Too Many Requests" → RATE_LIMIT
"Invalid API key" → AUTHENTICATION
"Request timed out" → TIMEOUT
```

### 2. Severity Levels

```typescript
enum ErrorSeverity {
  INFO        // Informational only
  WARNING     // Degraded functionality
  ERROR       // Significant issue
  CRITICAL    // System failure
}
```

Auto-assigned based on category:
- **CRITICAL**: Authentication, Quota, Permission failures
- **ERROR**: Network, Internal errors
- **WARNING**: Rate limits, Timeouts, Not found

### 3. Automatic Retry with Exponential Backoff

**Only retries recoverable errors**:
- ✅ Network errors
- ✅ Rate limits
- ✅ Timeouts
- ❌ Authentication (no point retrying)
- ❌ Permission denied
- ❌ Not found

**Exponential backoff prevents server overload**:
```
Attempt 1: Wait 1 second
Attempt 2: Wait 2 seconds
Attempt 3: Wait 4 seconds
Attempt 4: Wait 8 seconds (or max delay)
```

**Cost Protection**:
- Max 3 retries by default (configurable)
- Max delay cap prevents long waits
- Immediate failure for unrecoverable errors

### 4. User-Friendly Messages

Technical error → User-friendly message:

```typescript
"ECONNREFUSED" → "Can't connect right now. Check your internet."
"429 Too Many Requests" → "Too many requests. Please wait a moment."
"Invalid API key" → "Authentication failed. Please sign in again."
```

### 5. Comprehensive Telemetry

Track errors for optimization:

```typescript
{
  totalErrors: 147,
  byCategory: {
    network: 89,
    rate_limit: 31,
    authentication: 12,
    timeout: 15
  },
  bySeverity: {
    info: 0,
    warning: 46,
    error: 89,
    critical: 12
  },
  recovered: 120,      // Successfully retried
  unrecovered: 27      // Failed after retries
}
```

---

## Usage

### React Hook (Recommended)

```typescript
import { useErrorHandler } from '@utils/useErrorHandler';

function MyComponent() {
  const errorHandler = useErrorHandler({
    showToast: true,              // Auto-show toast notifications
    toastDuration: 4000,          // 4 second toast
    autoRetry: true,              // Enable auto-retry
    onError: (event) => {
      // Custom handling
      console.log('Error occurred:', event);
      analytics.track('error', event);
    }
  });

  const fetchData = async () => {
    try {
      // Automatically retries on network errors
      const data = await errorHandler.retry(
        () => fetch('/api/data').then(r => r.json()),
        { operation: 'fetch_data', component: 'MyComponent' }
      );
      return data;
    } catch (error) {
      // All retries failed - handle gracefully
      return [];
    }
  };

  const fetchWithFallback = async () => {
    // Provide fallback if operation fails
    return errorHandler.withFallback(
      () => fetch('/api/data').then(r => r.json()),
      { operation: 'fetch_data' },
      { fallbackValue: [] } // Return empty array on error
    );
  };

  return (
    <div>
      {errorHandler.lastError && (
        <div>
          Last error: {errorHandler.lastError.category}
        </div>
      )}

      <div>
        Total errors: {errorHandler.errorCount}
      </div>

      <button onClick={() => errorHandler.clearErrors()}>
        Clear Errors
      </button>
    </div>
  );
}
```

### Direct API Usage

```typescript
import errorHandler, { ErrorCategory, ErrorSeverity } from '@utils/ErrorHandler';

// Handle error with context
try {
  await fetch('/api/data');
} catch (error) {
  const event = errorHandler.handle(
    error instanceof Error ? error : new Error(String(error)),
    {
      operation: 'fetch_user_data',
      component: 'UserProfile',
      userId: user.id,
      metadata: { endpoint: '/api/data' }
    }
  );

  // Get user-friendly message
  const message = errorHandler.getUserMessage(event);
  toast.error(message);
}

// Retry with exponential backoff
const data = await errorHandler.retry(
  () => fetchUserData(userId),
  { operation: 'fetch_user_data' },
  {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialFactor: 2,
    onRetry: (attempt, delay) => {
      console.log(`Retry ${attempt} in ${delay}ms`);
    }
  }
);

// With fallback
const settings = await errorHandler.withFallback(
  () => loadUserSettings(userId),
  { operation: 'load_settings' },
  {
    fallbackValue: DEFAULT_SETTINGS,
    silent: false // Log fallback usage
  }
);

// Subscribe to errors
const unsubscribe = errorHandler.onError((event) => {
  // Send to monitoring service
  Sentry.captureException(event.error, {
    level: event.severity,
    tags: {
      category: event.category,
      operation: event.context.operation
    },
    extra: event.context.metadata
  });

  // Update UI
  if (event.severity === ErrorSeverity.CRITICAL) {
    showMaintenanceMessage();
  }
});
```

---

## Cost Optimization Examples

### Before: Infinite Retry Loop

```typescript
// ❌ BAD: Could retry forever, costing $$
async function fetchData() {
  while (true) {
    try {
      return await apiCall();
    } catch (error) {
      // Retry forever!
      await sleep(1000);
    }
  }
}
```

**Cost**: Unlimited API calls if server is down

### After: Smart Retry with Limits

```typescript
// ✓ GOOD: Max 3 retries, only on recoverable errors
async function fetchData() {
  return errorHandler.retry(
    () => apiCall(),
    { operation: 'fetch_data' },
    { maxRetries: 3 }
  );
}
```

**Cost**: Max 4 API calls (initial + 3 retries)
**Savings**: Prevents infinite loops = $$ saved

### Cost Comparison

**Scenario**: 1000 users, 10% encounter errors, server down for 1 hour

**Without limits**:
- Users retry every 1s = 3,600 retries/user
- 100 users × 3,600 = 360,000 API calls
- At $0.002/1K tokens × 100 tokens = **$72 wasted**

**With smart retry (max 3)**:
- 100 users × 3 retries = 300 API calls
- $0.002/1K × 100 × 300 = **$0.06 cost**
- **Savings: $71.94** in 1 hour!

---

## Integration Examples

### 1. API Calls

```typescript
async function callAPI(endpoint: string, data: any) {
  return errorHandler.retry(
    async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
    {
      operation: 'api_call',
      metadata: { endpoint, method: 'POST' }
    },
    {
      maxRetries: 3,
      baseDelay: 1000,
      onRetry: (attempt) => {
        console.log(`API call failed, retrying (${attempt}/3)...`);
      }
    }
  );
}
```

### 2. File Operations

```typescript
async function saveFile(filename: string, content: string) {
  return errorHandler.withFallback(
    () => fs.writeFile(filename, content),
    { operation: 'save_file', metadata: { filename } },
    {
      fallbackFn: async () => {
        // Fallback: Save to localStorage
        localStorage.setItem(`draft_${filename}`, content);
        toast.info('Saved draft locally');
      }
    }
  );
}
```

### 3. Real-Time Updates

```typescript
const socket = new WebSocket('wss://api.example.com');

socket.onerror = (error) => {
  errorHandler.handle(
    new Error('WebSocket connection failed'),
    { operation: 'websocket_connection' }
  );
};

// Auto-reconnect with backoff
errorHandler.retry(
  () => connectWebSocket(),
  { operation: 'websocket_reconnect' },
  { maxRetries: 5, baseDelay: 2000 }
);
```

### 4. Database Queries

```typescript
async function queryDatabase(sql: string) {
  return errorHandler.retry(
    () => db.query(sql),
    { operation: 'database_query', metadata: { sql } },
    {
      maxRetries: 2,  // Database errors usually not transient
      baseDelay: 500
    }
  );
}
```

---

## Monitoring & Alerts

### Setup Monitoring

```typescript
// Send errors to monitoring service
errorHandler.onError((event) => {
  // Sentry
  Sentry.captureException(event.error, {
    level: event.severity,
    tags: {
      category: event.category,
      component: event.context.component,
      recoverable: event.recoverable
    },
    contexts: {
      operation: {
        name: event.context.operation,
        retry_count: event.retryCount
      }
    }
  });

  // Custom analytics
  analytics.track('error_occurred', {
    error_id: event.id,
    category: event.category,
    severity: event.severity,
    recovered: event.recoverable && event.retryCount > 0
  });
});
```

### Alert Thresholds

```typescript
// Check error rates periodically
setInterval(() => {
  const stats = errorHandler.getStats();

  // Critical errors > 10 in last hour
  if (stats.bySeverity.critical > 10) {
    alertOps('High critical error rate');
  }

  // Network errors > 50%
  const networkRate = stats.byCategory.network / stats.totalErrors;
  if (networkRate > 0.5) {
    alertOps('High network error rate - possible outage');
  }

  // Low recovery rate
  const recoveryRate = stats.recovered / (stats.recovered + stats.unrecovered);
  if (recoveryRate < 0.5) {
    alertOps('Low error recovery rate');
  }
}, 3600000); // Every hour
```

### Dashboard Metrics

Display error health in admin dashboard:

```typescript
function ErrorDashboard() {
  const { stats, recentErrors } = useErrorHandler();

  return (
    <div>
      <h2>Error Statistics</h2>

      <div>
        <strong>Total Errors:</strong> {stats.totalErrors}
      </div>

      <div>
        <strong>Recovery Rate:</strong>
        {((stats.recovered / stats.totalErrors) * 100).toFixed(1)}%
      </div>

      <h3>By Category</h3>
      <ul>
        {Object.entries(stats.byCategory).map(([category, count]) => (
          <li key={category}>
            {category}: {count}
          </li>
        ))}
      </ul>

      <h3>Recent Errors</h3>
      {recentErrors.slice(0, 5).map(error => (
        <div key={error.id}>
          {error.category} - {error.context.operation}
        </div>
      ))}
    </div>
  );
}
```

---

## Best Practices

### 1. Always Provide Context

```typescript
// ✓ Good - Rich context
errorHandler.handle(error, {
  operation: 'load_user_profile',
  component: 'UserProfile',
  userId: user.id,
  metadata: {
    profileId: profile.id,
    source: 'api',
    timestamp: Date.now()
  }
});

// ✗ Bad - No context
errorHandler.handle(error, { operation: 'error' });
```

### 2. Use Appropriate Retry Limits

```typescript
// ✓ Good - Different limits for different operations
// Quick operations: fewer retries
errorHandler.retry(fastOperation, context, { maxRetries: 2 });

// Slow operations: more retries
errorHandler.retry(slowOperation, context, { maxRetries: 5 });

// Critical operations: no retries (fail fast)
errorHandler.retry(criticalOperation, context, { maxRetries: 0 });
```

### 3. Provide Meaningful Fallbacks

```typescript
// ✓ Good - Useful fallback
errorHandler.withFallback(
  () => loadUserPreferences(),
  { operation: 'load_preferences' },
  { fallbackValue: DEFAULT_PREFERENCES }
);

// ✗ Bad - Useless fallback
errorHandler.withFallback(
  () => loadCriticalData(),
  { operation: 'load_data' },
  { fallbackValue: null } // Application crashes anyway!
);
```

### 4. Monitor and Act on Statistics

```typescript
// ✓ Good - Regular monitoring
useEffect(() => {
  const interval = setInterval(() => {
    const stats = errorHandler.getStats();

    if (stats.totalErrors > 100) {
      toast.warning('High error rate detected');
      // Switch to degraded mode
      enableDegradedMode();
    }
  }, 60000);

  return () => clearInterval(interval);
}, []);
```

---

## Testing

### Unit Tests

```typescript
describe('ErrorHandler', () => {
  it('categorizes network errors', () => {
    const error = new Error('fetch failed');
    const event = errorHandler.handle(error, { operation: 'test' });

    expect(event.category).toBe(ErrorCategory.NETWORK);
    expect(event.recoverable).toBe(true);
  });

  it('retries recoverable errors', async () => {
    let attempts = 0;
    const operation = () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('network error');
      }
      return Promise.resolve('success');
    };

    const result = await errorHandler.retry(
      operation,
      { operation: 'test' },
      { maxRetries: 3 }
    );

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('uses fallback on error', async () => {
    const result = await errorHandler.withFallback(
      () => Promise.reject(new Error('failed')),
      { operation: 'test' },
      { fallbackValue: 'fallback' }
    );

    expect(result).toBe('fallback');
  });
});
```

---

## API Reference

### ErrorHandler

**`handle(error, context, options?): ErrorEvent`**
- Handle error with context
- Returns: Error event

**`retry<T>(operation, context, options?): Promise<T>`**
- Retry operation with exponential backoff
- Only retries recoverable errors
- Returns: Operation result

**`withFallback<T>(operation, context, options): Promise<T>`**
- Try operation with fallback
- Returns: Operation result or fallback

**`getUserMessage(event): string`**
- Get user-friendly error message

**`onError(handler): () => void`**
- Subscribe to error events
- Returns: Unsubscribe function

**`getStats(): Statistics`**
- Get error statistics

**`getLog(): ReadonlyArray<ErrorEvent>`**
- Get error log

**`clearLog(): void`**
- Clear error log

**`resetStats(): void`**
- Reset statistics

---

**Version**: 1.0.0
**Last Updated**: 2025-10-24
**Production Ready**: Yes
**Cost Optimized**: Yes
**SaaS Ready**: Yes

Essential for operational excellence in production SaaS applications.
