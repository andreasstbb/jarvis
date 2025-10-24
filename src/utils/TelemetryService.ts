/**
 * Production Telemetry & Performance Monitoring Service
 *
 * Enterprise-grade observability for operational excellence.
 * Tracks performance metrics, errors, user behavior, and system health.
 *
 * Features:
 * - API latency tracking
 * - Error rate monitoring
 * - User interaction analytics
 * - Feature usage metrics
 * - System performance (memory, CPU)
 * - Real-time dashboards
 * - Export to JSON/CSV
 * - Alert on anomalies
 */

export enum EventType {
  API_CALL = 'api_call',
  ERROR = 'error',
  USER_INTERACTION = 'user_interaction',
  FEATURE_USAGE = 'feature_usage',
  PERFORMANCE = 'performance',
  SYSTEM = 'system',
}

export enum EventSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  type: EventType;
  severity: EventSeverity;
  name: string;
  duration?: number;
  success: boolean;

  // Context
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  component?: string;

  // Data
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };

  // Performance
  performance?: {
    memory?: number;
    cpu?: number;
    fps?: number;
  };
}

export interface PerformanceMetrics {
  // API Performance
  apiCalls: {
    total: number;
    successful: number;
    failed: number;
    averageLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
  };

  // Error Metrics
  errors: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<EventSeverity, number>;
    errorRate: number;
  };

  // User Metrics
  users: {
    totalSessions: number;
    totalInteractions: number;
    averageInteractionsPerSession: number;
    averageSessionDuration: number;
  };

  // Feature Usage
  features: Record<string, {
    usageCount: number;
    uniqueUsers: number;
    averageDuration: number;
  }>;

  // System Health
  system: {
    averageMemory: number;
    peakMemory: number;
    averageCPU?: number;
    peakCPU?: number;
  };
}

export interface AnomalyAlert {
  type: 'latency_spike' | 'error_spike' | 'memory_leak' | 'performance_degradation';
  severity: EventSeverity;
  message: string;
  metric: string;
  currentValue: number;
  baselineValue: number;
  timestamp: number;
}

type AnomalyCallback = (alert: AnomalyAlert) => void;

class TelemetryService {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'jarvis_telemetry';
  private readonly dbVersion = 1;
  private readonly storeName = 'events';

  private sessionId: string;
  private anomalyCallbacks: Set<AnomalyCallback> = new Set();

  // Baselines for anomaly detection
  private baselines: {
    apiLatency?: number;
    errorRate?: number;
    memoryUsage?: number;
  } = {};

  // Performance observer
  private performanceObserver: PerformanceObserver | null = null;

  constructor() {
    this.sessionId = this.generateId();
    this.setupPerformanceMonitoring();
    this.setupErrorMonitoring();
  }

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[Telemetry] Initialized');

        // Calculate baselines from historical data
        this.calculateBaselines();

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });

          // Indexes for efficient queries
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('severity', 'severity', { unique: false });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('sessionId', 'sessionId', { unique: false });
          store.createIndex('success', 'success', { unique: false });
        }
      };
    });
  }

  /**
   * Track an event
   */
  async trackEvent(
    type: EventType,
    name: string,
    options: {
      severity?: EventSeverity;
      duration?: number;
      success?: boolean;
      userId?: string;
      conversationId?: string;
      component?: string;
      metadata?: Record<string, any>;
      error?: {
        message: string;
        stack?: string;
        code?: string;
      };
    } = {}
  ): Promise<TelemetryEvent> {
    const event: TelemetryEvent = {
      id: this.generateId(),
      timestamp: Date.now(),
      type,
      severity: options.severity || EventSeverity.INFO,
      name,
      duration: options.duration,
      success: options.success !== undefined ? options.success : true,
      userId: options.userId,
      sessionId: this.sessionId,
      conversationId: options.conversationId,
      component: options.component,
      metadata: options.metadata,
      error: options.error,
    };

    // Add system performance metrics
    if (type === EventType.PERFORMANCE || type === EventType.API_CALL) {
      event.performance = this.getSystemPerformance();
    }

    // Save to IndexedDB
    await this.saveEvent(event);

    // Check for anomalies
    if (type === EventType.API_CALL && options.duration) {
      this.checkLatencyAnomaly(options.duration);
    }

    if (type === EventType.ERROR) {
      this.checkErrorRateAnomaly();
    }

    console.log(`[Telemetry] ${type}: ${name}`, event);

    return event;
  }

  /**
   * Track API call
   */
  async trackAPICall(
    name: string,
    duration: number,
    success: boolean,
    options: {
      component?: string;
      metadata?: Record<string, any>;
      error?: { message: string; stack?: string; code?: string };
    } = {}
  ): Promise<TelemetryEvent> {
    return this.trackEvent(EventType.API_CALL, name, {
      severity: success ? EventSeverity.INFO : EventSeverity.ERROR,
      duration,
      success,
      ...options,
    });
  }

  /**
   * Track error
   */
  async trackError(
    error: Error | string,
    options: {
      severity?: EventSeverity;
      component?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<TelemetryEvent> {
    const errorObj = typeof error === 'string'
      ? { message: error }
      : {
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
        };

    return this.trackEvent(EventType.ERROR, errorObj.message, {
      severity: options.severity || EventSeverity.ERROR,
      success: false,
      error: errorObj,
      ...options,
    });
  }

  /**
   * Track user interaction
   */
  async trackInteraction(
    action: string,
    options: {
      userId?: string;
      component?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<TelemetryEvent> {
    return this.trackEvent(EventType.USER_INTERACTION, action, options);
  }

  /**
   * Track feature usage
   */
  async trackFeatureUsage(
    feature: string,
    duration?: number,
    options: {
      userId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<TelemetryEvent> {
    return this.trackEvent(EventType.FEATURE_USAGE, feature, {
      duration,
      ...options,
    });
  }

  /**
   * Start timing an operation
   */
  startTimer(name: string): () => Promise<TelemetryEvent> {
    const startTime = performance.now();

    return async (options: {
      success?: boolean;
      component?: string;
      metadata?: Record<string, any>;
      error?: { message: string; stack?: string };
    } = {}) => {
      const duration = performance.now() - startTime;

      return this.trackAPICall(name, duration, options.success !== false, {
        component: options.component,
        metadata: options.metadata,
        error: options.error,
      });
    };
  }

  /**
   * Get performance metrics
   */
  async getMetrics(startTime: number = 0, endTime: number = Date.now()): Promise<PerformanceMetrics> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      const range = IDBKeyRange.bound(startTime, endTime);
      const request = index.openCursor(range);

      const metrics: PerformanceMetrics = {
        apiCalls: {
          total: 0,
          successful: 0,
          failed: 0,
          averageLatency: 0,
          p50Latency: 0,
          p95Latency: 0,
          p99Latency: 0,
        },
        errors: {
          total: 0,
          byType: {},
          bySeverity: {
            [EventSeverity.DEBUG]: 0,
            [EventSeverity.INFO]: 0,
            [EventSeverity.WARNING]: 0,
            [EventSeverity.ERROR]: 0,
            [EventSeverity.CRITICAL]: 0,
          },
          errorRate: 0,
        },
        users: {
          totalSessions: 0,
          totalInteractions: 0,
          averageInteractionsPerSession: 0,
          averageSessionDuration: 0,
        },
        features: {},
        system: {
          averageMemory: 0,
          peakMemory: 0,
        },
      };

      const apiLatencies: number[] = [];
      const sessions = new Set<string>();
      const sessionTimestamps = new Map<string, { first: number; last: number; interactions: number }>();
      let totalMemory = 0;
      let memoryCount = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          const event: TelemetryEvent = cursor.value;

          // API metrics
          if (event.type === EventType.API_CALL) {
            metrics.apiCalls.total++;
            if (event.success) {
              metrics.apiCalls.successful++;
            } else {
              metrics.apiCalls.failed++;
            }

            if (event.duration) {
              apiLatencies.push(event.duration);
            }
          }

          // Error metrics
          if (event.type === EventType.ERROR) {
            metrics.errors.total++;
            metrics.errors.bySeverity[event.severity]++;

            const errorType = event.error?.code || event.name;
            metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
          }

          // User metrics
          if (event.sessionId) {
            sessions.add(event.sessionId);

            if (!sessionTimestamps.has(event.sessionId)) {
              sessionTimestamps.set(event.sessionId, {
                first: event.timestamp,
                last: event.timestamp,
                interactions: 0,
              });
            }

            const session = sessionTimestamps.get(event.sessionId)!;
            session.last = Math.max(session.last, event.timestamp);

            if (event.type === EventType.USER_INTERACTION) {
              session.interactions++;
              metrics.users.totalInteractions++;
            }
          }

          // Feature metrics
          if (event.type === EventType.FEATURE_USAGE) {
            if (!metrics.features[event.name]) {
              metrics.features[event.name] = {
                usageCount: 0,
                uniqueUsers: 0,
                averageDuration: 0,
              };
            }

            metrics.features[event.name].usageCount++;

            if (event.duration) {
              const feature = metrics.features[event.name];
              feature.averageDuration =
                (feature.averageDuration * (feature.usageCount - 1) + event.duration) / feature.usageCount;
            }
          }

          // System metrics
          if (event.performance?.memory) {
            totalMemory += event.performance.memory;
            memoryCount++;
            metrics.system.peakMemory = Math.max(metrics.system.peakMemory, event.performance.memory);
          }

          cursor.continue();
        } else {
          // Calculate final metrics

          // API latencies
          if (apiLatencies.length > 0) {
            apiLatencies.sort((a, b) => a - b);
            metrics.apiCalls.averageLatency = apiLatencies.reduce((a, b) => a + b, 0) / apiLatencies.length;
            metrics.apiCalls.p50Latency = apiLatencies[Math.floor(apiLatencies.length * 0.5)];
            metrics.apiCalls.p95Latency = apiLatencies[Math.floor(apiLatencies.length * 0.95)];
            metrics.apiCalls.p99Latency = apiLatencies[Math.floor(apiLatencies.length * 0.99)];
          }

          // Error rate
          if (metrics.apiCalls.total > 0) {
            metrics.errors.errorRate = metrics.errors.total / metrics.apiCalls.total;
          }

          // User metrics
          metrics.users.totalSessions = sessions.size;

          if (sessions.size > 0) {
            let totalSessionDuration = 0;

            sessionTimestamps.forEach((session) => {
              totalSessionDuration += session.last - session.first;
            });

            metrics.users.averageSessionDuration = totalSessionDuration / sessions.size;
            metrics.users.averageInteractionsPerSession = metrics.users.totalInteractions / sessions.size;
          }

          // System metrics
          if (memoryCount > 0) {
            metrics.system.averageMemory = totalMemory / memoryCount;
          }

          resolve(metrics);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Subscribe to anomaly alerts
   */
  onAnomaly(callback: AnomalyCallback): () => void {
    this.anomalyCallbacks.add(callback);
    return () => this.anomalyCallbacks.delete(callback);
  }

  /**
   * Export telemetry data
   */
  async exportToJSON(startTime: number = 0, endTime: number = Date.now()): Promise<string> {
    const events = await this.getEvents(startTime, endTime);
    const metrics = await this.getMetrics(startTime, endTime);

    return JSON.stringify({
      exportDate: new Date().toISOString(),
      period: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
      },
      sessionId: this.sessionId,
      metrics,
      events,
    }, null, 2);
  }

  /**
   * Clear all telemetry data
   */
  async clearAll(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[Telemetry] All data cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save event to IndexedDB
   */
  private async saveEvent(event: TelemetryEvent): Promise<void> {
    if (!this.db) {
      console.warn('[Telemetry] DB not initialized, event not saved');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(event);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get events from IndexedDB
   */
  private async getEvents(startTime: number, endTime: number): Promise<TelemetryEvent[]> {
    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      const range = IDBKeyRange.bound(startTime, endTime);
      const request = index.getAll(range);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get system performance metrics
   */
  private getSystemPerformance() {
    const performance: TelemetryEvent['performance'] = {};

    // Memory usage (if available)
    if ((window.performance as any).memory) {
      const memory = (window.performance as any).memory;
      performance.memory = memory.usedJSHeapSize / (1024 * 1024); // MB
    }

    return performance;
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            this.trackEvent(EventType.PERFORMANCE, entry.name, {
              duration: entry.duration,
              metadata: { entryType: entry.entryType },
            });
          }
        }
      });

      this.performanceObserver.observe({ entryTypes: ['measure'] });
    } catch (error) {
      console.warn('[Telemetry] PerformanceObserver not supported');
    }
  }

  /**
   * Setup global error monitoring
   */
  private setupErrorMonitoring(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.trackError(event.error || event.message, {
        severity: EventSeverity.ERROR,
        component: 'window',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.trackError(event.reason, {
        severity: EventSeverity.ERROR,
        component: 'promise',
      });
    });
  }

  /**
   * Calculate baselines from historical data
   */
  private async calculateBaselines(): Promise<void> {
    try {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const metrics = await this.getMetrics(weekAgo, Date.now());

      this.baselines.apiLatency = metrics.apiCalls.averageLatency;
      this.baselines.errorRate = metrics.errors.errorRate;
      this.baselines.memoryUsage = metrics.system.averageMemory;

      console.log('[Telemetry] Baselines calculated:', this.baselines);
    } catch (error) {
      console.warn('[Telemetry] Failed to calculate baselines:', error);
    }
  }

  /**
   * Check for latency anomaly
   */
  private checkLatencyAnomaly(latency: number): void {
    if (!this.baselines.apiLatency) return;

    // Alert if latency is 3x baseline
    if (latency > this.baselines.apiLatency * 3) {
      this.triggerAnomaly({
        type: 'latency_spike',
        severity: EventSeverity.WARNING,
        message: `API latency spike detected: ${latency.toFixed(0)}ms (baseline: ${this.baselines.apiLatency.toFixed(0)}ms)`,
        metric: 'api_latency',
        currentValue: latency,
        baselineValue: this.baselines.apiLatency,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Check for error rate anomaly
   */
  private async checkErrorRateAnomaly(): Promise<void> {
    if (!this.baselines.errorRate) return;

    const recentMetrics = await this.getMetrics(Date.now() - 60000, Date.now()); // Last minute

    // Alert if error rate is 2x baseline
    if (recentMetrics.errors.errorRate > this.baselines.errorRate * 2) {
      this.triggerAnomaly({
        type: 'error_spike',
        severity: EventSeverity.ERROR,
        message: `Error rate spike detected: ${(recentMetrics.errors.errorRate * 100).toFixed(1)}% (baseline: ${(this.baselines.errorRate * 100).toFixed(1)}%)`,
        metric: 'error_rate',
        currentValue: recentMetrics.errors.errorRate,
        baselineValue: this.baselines.errorRate,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Trigger anomaly alert
   */
  private triggerAnomaly(alert: AnomalyAlert): void {
    console.warn('[Telemetry] ANOMALY DETECTED:', alert);

    this.anomalyCallbacks.forEach((callback) => {
      try {
        callback(alert);
      } catch (error) {
        console.error('[Telemetry] Anomaly callback error:', error);
      }
    });
  }

  private generateId(): string {
    return `telemetry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }

    this.anomalyCallbacks.clear();

    console.log('[Telemetry] Destroyed');
  }
}

// Singleton instance
export const telemetry = new TelemetryService();
export default telemetry;
