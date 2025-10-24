/**
 * React Hook for Telemetry & Performance Monitoring
 *
 * Easy integration of telemetry tracking in React components.
 * Provides real-time metrics, anomaly detection, and performance insights.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import toast from 'react-hot-toast';

import telemetry, {
  type AnomalyAlert,
  type PerformanceMetrics,
  EventType,
  EventSeverity,
} from './TelemetryService';

export interface UseTelemetryOptions {
  enabled?: boolean;
  showToasts?: boolean;
  onAnomaly?: (alert: AnomalyAlert) => void;
  userId?: string;
}

export interface UseTelemetryReturn {
  // Metrics
  currentMetrics: PerformanceMetrics | null;
  hourlyMetrics: PerformanceMetrics | null;
  dailyMetrics: PerformanceMetrics | null;

  // Tracking methods
  trackAPICall: (name: string, duration: number, success: boolean, options?: any) => Promise<void>;
  trackError: (error: Error | string, options?: any) => Promise<void>;
  trackInteraction: (action: string, options?: any) => Promise<void>;
  trackFeature: (feature: string, duration?: number, options?: any) => Promise<void>;
  startTimer: (name: string) => () => Promise<void>;

  // Utilities
  refreshMetrics: () => Promise<void>;
  exportData: (period?: 'hour' | 'day' | 'all') => Promise<string>;
  downloadExport: (period?: 'hour' | 'day' | 'all') => Promise<void>;
  clearAllData: () => Promise<void>;

  // State
  isLoading: boolean;
  error: string | null;
  sessionId: string;
}

/**
 * Hook for telemetry tracking
 */
export function useTelemetry(
  options: UseTelemetryOptions = {}
): UseTelemetryReturn {
  const {
    enabled = true,
    showToasts = false,
    onAnomaly,
    userId,
  } = options;

  const [currentMetrics, setCurrentMetrics] = useState<PerformanceMetrics | null>(null);
  const [hourlyMetrics, setHourlyMetrics] = useState<PerformanceMetrics | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  // Initialize telemetry
  useEffect(() => {
    if (!enabled) return;

    const initialize = async () => {
      try {
        setIsLoading(true);
        await telemetry.init();

        // Load initial metrics
        await refreshMetrics();

        setError(null);
      } catch (err) {
        console.error('[useTelemetry] Init failed:', err);
        setError('Failed to initialize telemetry');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [enabled]);

  // Subscribe to anomaly alerts
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = telemetry.onAnomaly((alert) => {
      console.warn('[useTelemetry] Anomaly detected:', alert);

      // Show toast notification
      if (showToasts) {
        showAnomalyToast(alert);
      }

      // Call user callback
      onAnomaly?.(alert);

      // Refresh metrics
      refreshMetrics();
    });

    return unsubscribe;
  }, [enabled, showToasts, onAnomaly]);

  // Auto-refresh metrics every 30 seconds
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      refreshMetrics();
    }, 30000);

    return () => clearInterval(interval);
  }, [enabled]);

  // Refresh metrics
  const refreshMetrics = useCallback(async () => {
    try {
      const now = Date.now();
      const [current, hourly, daily] = await Promise.all([
        telemetry.getMetrics(now - 5 * 60 * 1000, now), // Last 5 minutes
        telemetry.getMetrics(now - 60 * 60 * 1000, now), // Last hour
        telemetry.getMetrics(now - 24 * 60 * 60 * 1000, now), // Last 24 hours
      ]);

      setCurrentMetrics(current);
      setHourlyMetrics(hourly);
      setDailyMetrics(daily);
    } catch (err) {
      console.error('[useTelemetry] Failed to refresh metrics:', err);
      setError('Failed to load metrics');
    }
  }, []);

  // Track API call
  const trackAPICall = useCallback(async (
    name: string,
    duration: number,
    success: boolean,
    options: any = {}
  ) => {
    await telemetry.trackAPICall(name, duration, success, {
      ...options,
      userId,
    });
  }, [userId]);

  // Track error
  const trackError = useCallback(async (
    error: Error | string,
    options: any = {}
  ) => {
    await telemetry.trackError(error, {
      ...options,
      userId,
    });
  }, [userId]);

  // Track interaction
  const trackInteraction = useCallback(async (
    action: string,
    options: any = {}
  ) => {
    await telemetry.trackInteraction(action, {
      ...options,
      userId,
    });
  }, [userId]);

  // Track feature usage
  const trackFeature = useCallback(async (
    feature: string,
    duration?: number,
    options: any = {}
  ) => {
    await telemetry.trackFeatureUsage(feature, duration, {
      ...options,
      userId,
    });
  }, [userId]);

  // Start timer
  const startTimer = useCallback((name: string) => {
    const endTimer = telemetry.startTimer(name);

    return async (options: any = {}) => {
      await endTimer({
        ...options,
        userId,
      });
    };
  }, [userId]);

  // Export data
  const exportData = useCallback(async (period: 'hour' | 'day' | 'all' = 'all'): Promise<string> => {
    const now = Date.now();
    let startTime = 0;

    switch (period) {
      case 'hour':
        startTime = now - 60 * 60 * 1000;
        break;
      case 'day':
        startTime = now - 24 * 60 * 60 * 1000;
        break;
    }

    return telemetry.exportToJSON(startTime, now);
  }, []);

  // Download export
  const downloadExport = useCallback(async (period: 'hour' | 'day' | 'all' = 'all'): Promise<void> => {
    try {
      const data = await exportData(period);

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jarvis-telemetry-${period}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (showToasts) {
        toast.success(`Downloaded ${period} telemetry data`);
      }
    } catch (err) {
      console.error('[useTelemetry] Export failed:', err);
      if (showToasts) {
        toast.error('Failed to export telemetry data');
      }
    }
  }, [exportData, showToasts]);

  // Clear all data
  const clearAllData = useCallback(async () => {
    try {
      await telemetry.clearAll();
      await refreshMetrics();

      if (showToasts) {
        toast.success('All telemetry data cleared');
      }
    } catch (err) {
      console.error('[useTelemetry] Clear failed:', err);
      if (showToasts) {
        toast.error('Failed to clear data');
      }
    }
  }, [refreshMetrics, showToasts]);

  return {
    currentMetrics,
    hourlyMetrics,
    dailyMetrics,
    trackAPICall,
    trackError,
    trackInteraction,
    trackFeature,
    startTimer,
    refreshMetrics,
    exportData,
    downloadExport,
    clearAllData,
    isLoading,
    error,
    sessionId,
  };
}

/**
 * Show toast notification for anomaly alert
 */
function showAnomalyToast(alert: AnomalyAlert): void {
  const message = alert.message;

  if (alert.severity === EventSeverity.CRITICAL || alert.severity === EventSeverity.ERROR) {
    toast.error(message, {
      duration: 10000,
      icon: '🚨',
    });
  } else {
    toast(message, {
      duration: 6000,
      icon: '⚠️',
    });
  }
}

export default useTelemetry;
