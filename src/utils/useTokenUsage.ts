/**
 * React Hook for Token Usage & Cost Monitoring
 *
 * Easy integration of token tracking in React components.
 * Provides real-time statistics, budget alerts, and export capabilities.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import toast from 'react-hot-toast';

import tokenUsageTracker, {
  type BudgetAlert,
  type BudgetConfig,
  type UsageStatistics,
} from './TokenUsageTracker';

export interface UseTokenUsageOptions {
  enabled?: boolean;
  showToasts?: boolean;
  onBudgetAlert?: (alert: BudgetAlert) => void;
  initialBudget?: BudgetConfig;
}

export interface UseTokenUsageReturn {
  // Statistics
  dailyStats: UsageStatistics | null;
  weeklyStats: UsageStatistics | null;
  monthlyStats: UsageStatistics | null;

  // Budget
  setBudget: (budget: BudgetConfig) => void;
  currentBudget: BudgetConfig | null;

  // Export
  exportToJSON: (period?: 'daily' | 'weekly' | 'monthly' | 'all') => Promise<string>;
  exportToCSV: (period?: 'daily' | 'weekly' | 'monthly' | 'all') => Promise<string>;
  downloadExport: (format: 'json' | 'csv', period?: 'daily' | 'weekly' | 'monthly' | 'all') => Promise<void>;

  // Utilities
  refreshStats: () => Promise<void>;
  clearAllData: () => Promise<void>;

  // State
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for token usage tracking
 */
export function useTokenUsage(
  options: UseTokenUsageOptions = {}
): UseTokenUsageReturn {
  const {
    enabled = true,
    showToasts = true,
    onBudgetAlert,
    initialBudget,
  } = options;

  const [dailyStats, setDailyStats] = useState<UsageStatistics | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<UsageStatistics | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<UsageStatistics | null>(null);
  const [currentBudget, setCurrentBudget] = useState<BudgetConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize tracker
  useEffect(() => {
    if (!enabled) return;

    const initialize = async () => {
      try {
        setIsLoading(true);
        await tokenUsageTracker.init();

        // Set initial budget if provided
        if (initialBudget) {
          tokenUsageTracker.setBudget(initialBudget);
          setCurrentBudget(initialBudget);
        }

        // Load initial stats
        await refreshStats();

        setError(null);
      } catch (err) {
        console.error('[useTokenUsage] Init failed:', err);
        setError('Failed to initialize token usage tracker');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [enabled]);

  // Subscribe to budget alerts
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = tokenUsageTracker.onBudgetAlert((alert) => {
      console.warn('[useTokenUsage] Budget alert:', alert);

      // Show toast notification
      if (showToasts) {
        showBudgetAlertToast(alert);
      }

      // Call user callback
      onBudgetAlert?.(alert);

      // Refresh stats to show updated usage
      refreshStats();
    });

    return unsubscribe;
  }, [enabled, showToasts, onBudgetAlert]);

  // Refresh statistics
  const refreshStats = useCallback(async () => {
    try {
      const [daily, weekly, monthly] = await Promise.all([
        tokenUsageTracker.getStatsForPeriod('daily'),
        tokenUsageTracker.getStatsForPeriod('weekly'),
        tokenUsageTracker.getStatsForPeriod('monthly'),
      ]);

      setDailyStats(daily);
      setWeeklyStats(weekly);
      setMonthlyStats(monthly);
    } catch (err) {
      console.error('[useTokenUsage] Failed to refresh stats:', err);
      setError('Failed to load statistics');
    }
  }, []);

  // Set budget
  const setBudget = useCallback((budget: BudgetConfig) => {
    tokenUsageTracker.setBudget(budget);
    setCurrentBudget(budget);
    console.log('[useTokenUsage] Budget updated:', budget);
  }, []);

  // Export to JSON
  const exportToJSON = useCallback(async (period: 'daily' | 'weekly' | 'monthly' | 'all' = 'all'): Promise<string> => {
    const now = Date.now();
    let startTime = 0;

    switch (period) {
      case 'daily':
        startTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'weekly':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'monthly':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }

    return tokenUsageTracker.exportToJSON(startTime, now);
  }, []);

  // Export to CSV
  const exportToCSV = useCallback(async (period: 'daily' | 'weekly' | 'monthly' | 'all' = 'all'): Promise<string> => {
    const now = Date.now();
    let startTime = 0;

    switch (period) {
      case 'daily':
        startTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'weekly':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'monthly':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }

    return tokenUsageTracker.exportToCSV(startTime, now);
  }, []);

  // Download export
  const downloadExport = useCallback(async (
    format: 'json' | 'csv',
    period: 'daily' | 'weekly' | 'monthly' | 'all' = 'all'
  ): Promise<void> => {
    try {
      const data = format === 'json'
        ? await exportToJSON(period)
        : await exportToCSV(period);

      const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jarvis-token-usage-${period}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (showToasts) {
        toast.success(`Downloaded ${period} usage report as ${format.toUpperCase()}`);
      }
    } catch (err) {
      console.error('[useTokenUsage] Export failed:', err);
      if (showToasts) {
        toast.error('Failed to export usage data');
      }
    }
  }, [exportToJSON, exportToCSV, showToasts]);

  // Clear all data
  const clearAllData = useCallback(async () => {
    try {
      await tokenUsageTracker.clearAll();
      await refreshStats();

      if (showToasts) {
        toast.success('All usage data cleared');
      }
    } catch (err) {
      console.error('[useTokenUsage] Clear failed:', err);
      if (showToasts) {
        toast.error('Failed to clear data');
      }
    }
  }, [refreshStats, showToasts]);

  return {
    dailyStats,
    weeklyStats,
    monthlyStats,
    setBudget,
    currentBudget,
    exportToJSON,
    exportToCSV,
    downloadExport,
    refreshStats,
    clearAllData,
    isLoading,
    error,
  };
}

/**
 * Show toast notification for budget alert
 */
function showBudgetAlertToast(alert: BudgetAlert): void {
  const message = `${alert.period.toUpperCase()} budget ${alert.type === 'critical' ? 'EXCEEDED' : 'warning'}: $${alert.currentSpend.toFixed(2)} / $${alert.budgetLimit} (${alert.percentageUsed.toFixed(1)}%)`;

  if (alert.type === 'critical') {
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

export default useTokenUsage;
