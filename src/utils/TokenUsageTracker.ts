/**
 * Production Token Usage & Cost Monitoring System
 *
 * Enterprise-grade cost optimization for SaaS viability.
 * Tracks token usage, calculates costs, provides alerts, and prevents budget overruns.
 *
 * Features:
 * - Real-time token usage tracking
 * - Cost calculation with configurable pricing
 * - Budget alerts and limits
 * - Daily/weekly/monthly reports
 * - IndexedDB persistence
 * - Export to CSV/JSON
 */

export interface TokenUsage {
  id: string;
  timestamp: number;
  conversationId?: string;
  userId?: string;
  model: string;

  // Token counts
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  // Cost
  inputCost: number;
  outputCost: number;
  totalCost: number;

  // Context
  operation: string;
  component?: string;
  metadata?: Record<string, any>;
}

export interface ModelPricing {
  input: number;   // Cost per 1K input tokens
  output: number;  // Cost per 1K output tokens
}

export interface UsageStatistics {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;

  byModel: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  }>;

  byDay: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;

  averageTokensPerRequest: number;
  averageCostPerRequest: number;
}

export interface BudgetConfig {
  daily?: number;
  weekly?: number;
  monthly?: number;
  total?: number;
  alertThresholds?: {
    daily?: number;    // Alert at X% of daily budget
    weekly?: number;   // Alert at X% of weekly budget
    monthly?: number;  // Alert at X% of monthly budget
  };
}

export interface BudgetAlert {
  type: 'warning' | 'critical';
  period: 'daily' | 'weekly' | 'monthly' | 'total';
  currentSpend: number;
  budgetLimit: number;
  percentageUsed: number;
  timestamp: number;
}

type BudgetAlertCallback = (alert: BudgetAlert) => void;

class TokenUsageTrackerService {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'jarvis_token_usage';
  private readonly dbVersion = 1;
  private readonly storeName = 'usage';

  // Model pricing (default: Gemini 2.5 Flash pricing)
  private pricing: Record<string, ModelPricing> = {
    'gemini-2.5-flash-preview-09-2025': {
      input: 0.00015,    // $0.15 per 1M tokens = $0.00015 per 1K
      output: 0.0006,    // $0.60 per 1M tokens = $0.0006 per 1K
    },
    'gemini-1.5-pro': {
      input: 0.00125,    // $1.25 per 1M
      output: 0.005,     // $5.00 per 1M
    },
    'gemini-1.5-flash': {
      input: 0.000075,   // $0.075 per 1M
      output: 0.0003,    // $0.30 per 1M
    },
  };

  private budget: BudgetConfig = {
    daily: 10,       // $10/day default
    weekly: 60,      // $60/week
    monthly: 200,    // $200/month
    alertThresholds: {
      daily: 80,     // Alert at 80% of daily budget
      weekly: 80,
      monthly: 80,
    },
  };

  private alertCallbacks: Set<BudgetAlertCallback> = new Set();
  private lastAlerts: Map<string, number> = new Map(); // Prevent duplicate alerts

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[TokenUsageTracker] Initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });

          // Indexes for efficient queries
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('model', 'model', { unique: false });
          store.createIndex('conversationId', 'conversationId', { unique: false });
          store.createIndex('userId', 'userId', { unique: false });
        }
      };
    });
  }

  /**
   * Set model pricing
   */
  setModelPricing(model: string, pricing: ModelPricing): void {
    this.pricing[model] = pricing;
  }

  /**
   * Set budget configuration
   */
  setBudget(budget: BudgetConfig): void {
    this.budget = { ...this.budget, ...budget };
    console.log('[TokenUsageTracker] Budget updated:', this.budget);
  }

  /**
   * Subscribe to budget alerts
   */
  onBudgetAlert(callback: BudgetAlertCallback): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }

  /**
   * Track token usage
   */
  async trackUsage(
    inputTokens: number,
    outputTokens: number,
    model: string,
    options: {
      conversationId?: string;
      userId?: string;
      operation?: string;
      component?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<TokenUsage> {
    const totalTokens = inputTokens + outputTokens;
    const pricing = this.pricing[model] || this.pricing['gemini-2.5-flash-preview-09-2025'];

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    const usage: TokenUsage = {
      id: this.generateId(),
      timestamp: Date.now(),
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost,
      outputCost,
      totalCost,
      operation: options.operation || 'unknown',
      conversationId: options.conversationId,
      userId: options.userId,
      component: options.component,
      metadata: options.metadata,
    };

    // Save to IndexedDB
    await this.saveUsage(usage);

    // Check budget limits
    await this.checkBudgetLimits(usage);

    console.log(`[TokenUsageTracker] Tracked: ${totalTokens} tokens ($${totalCost.toFixed(4)}) - ${model}`);

    return usage;
  }

  /**
   * Save usage to IndexedDB
   */
  private async saveUsage(usage: TokenUsage): Promise<void> {
    if (!this.db) {
      console.warn('[TokenUsageTracker] DB not initialized, usage not saved');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(usage);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check budget limits and trigger alerts
   */
  private async checkBudgetLimits(latestUsage: TokenUsage): Promise<void> {
    const now = Date.now();

    // Daily budget
    if (this.budget.daily) {
      const dailyStats = await this.getStatsForPeriod('daily');
      const threshold = this.budget.alertThresholds?.daily || 80;
      const percentageUsed = (dailyStats.totalCost / this.budget.daily) * 100;

      if (percentageUsed >= threshold) {
        this.triggerAlert({
          type: percentageUsed >= 95 ? 'critical' : 'warning',
          period: 'daily',
          currentSpend: dailyStats.totalCost,
          budgetLimit: this.budget.daily,
          percentageUsed,
          timestamp: now,
        });
      }
    }

    // Weekly budget
    if (this.budget.weekly) {
      const weeklyStats = await this.getStatsForPeriod('weekly');
      const threshold = this.budget.alertThresholds?.weekly || 80;
      const percentageUsed = (weeklyStats.totalCost / this.budget.weekly) * 100;

      if (percentageUsed >= threshold) {
        this.triggerAlert({
          type: percentageUsed >= 95 ? 'critical' : 'warning',
          period: 'weekly',
          currentSpend: weeklyStats.totalCost,
          budgetLimit: this.budget.weekly,
          percentageUsed,
          timestamp: now,
        });
      }
    }

    // Monthly budget
    if (this.budget.monthly) {
      const monthlyStats = await this.getStatsForPeriod('monthly');
      const threshold = this.budget.alertThresholds?.monthly || 80;
      const percentageUsed = (monthlyStats.totalCost / this.budget.monthly) * 100;

      if (percentageUsed >= threshold) {
        this.triggerAlert({
          type: percentageUsed >= 95 ? 'critical' : 'warning',
          period: 'monthly',
          currentSpend: monthlyStats.totalCost,
          budgetLimit: this.budget.monthly,
          percentageUsed,
          timestamp: now,
        });
      }
    }
  }

  /**
   * Trigger budget alert (with debouncing)
   */
  private triggerAlert(alert: BudgetAlert): void {
    const alertKey = `${alert.period}_${alert.type}`;
    const lastAlert = this.lastAlerts.get(alertKey);

    // Debounce: Don't send same alert more than once per hour
    if (lastAlert && Date.now() - lastAlert < 3600000) {
      return;
    }

    this.lastAlerts.set(alertKey, Date.now());

    console.warn(`[TokenUsageTracker] BUDGET ALERT (${alert.type.toUpperCase()}): ${alert.period} spending at ${alert.percentageUsed.toFixed(1)}% ($${alert.currentSpend.toFixed(2)} / $${alert.budgetLimit})`);

    this.alertCallbacks.forEach((callback) => {
      try {
        callback(alert);
      } catch (error) {
        console.error('[TokenUsageTracker] Alert callback error:', error);
      }
    });
  }

  /**
   * Get statistics for a time period
   */
  async getStatsForPeriod(period: 'daily' | 'weekly' | 'monthly' | 'all'): Promise<UsageStatistics> {
    if (!this.db) {
      await this.init();
    }

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
      case 'all':
        startTime = 0;
        break;
    }

    return this.getStatistics(startTime, now);
  }

  /**
   * Get usage statistics
   */
  async getStatistics(startTime: number = 0, endTime: number = Date.now()): Promise<UsageStatistics> {
    if (!this.db) {
      return this.getEmptyStats();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      const range = IDBKeyRange.bound(startTime, endTime);
      const request = index.openCursor(range);

      const stats: UsageStatistics = this.getEmptyStats();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          const usage: TokenUsage = cursor.value;

          stats.totalRequests++;
          stats.totalInputTokens += usage.inputTokens;
          stats.totalOutputTokens += usage.outputTokens;
          stats.totalTokens += usage.totalTokens;
          stats.totalCost += usage.totalCost;

          // By model
          if (!stats.byModel[usage.model]) {
            stats.byModel[usage.model] = {
              requests: 0,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              cost: 0,
            };
          }
          stats.byModel[usage.model].requests++;
          stats.byModel[usage.model].inputTokens += usage.inputTokens;
          stats.byModel[usage.model].outputTokens += usage.outputTokens;
          stats.byModel[usage.model].totalTokens += usage.totalTokens;
          stats.byModel[usage.model].cost += usage.totalCost;

          // By day
          const day = new Date(usage.timestamp).toISOString().split('T')[0];
          if (!stats.byDay[day]) {
            stats.byDay[day] = {
              requests: 0,
              tokens: 0,
              cost: 0,
            };
          }
          stats.byDay[day].requests++;
          stats.byDay[day].tokens += usage.totalTokens;
          stats.byDay[day].cost += usage.totalCost;

          cursor.continue();
        } else {
          // Calculate averages
          if (stats.totalRequests > 0) {
            stats.averageTokensPerRequest = stats.totalTokens / stats.totalRequests;
            stats.averageCostPerRequest = stats.totalCost / stats.totalRequests;
          }

          resolve(stats);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Export usage data to JSON
   */
  async exportToJSON(startTime: number = 0, endTime: number = Date.now()): Promise<string> {
    const usageRecords = await this.getUsageRecords(startTime, endTime);
    const stats = await this.getStatistics(startTime, endTime);

    return JSON.stringify({
      exportDate: new Date().toISOString(),
      period: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
      },
      statistics: stats,
      records: usageRecords,
    }, null, 2);
  }

  /**
   * Export usage data to CSV
   */
  async exportToCSV(startTime: number = 0, endTime: number = Date.now()): Promise<string> {
    const usageRecords = await this.getUsageRecords(startTime, endTime);

    const headers = [
      'Timestamp',
      'Date',
      'Time',
      'Model',
      'Operation',
      'Component',
      'Input Tokens',
      'Output Tokens',
      'Total Tokens',
      'Input Cost',
      'Output Cost',
      'Total Cost',
      'Conversation ID',
      'User ID',
    ];

    const rows = usageRecords.map((usage) => {
      const date = new Date(usage.timestamp);
      return [
        usage.timestamp,
        date.toISOString().split('T')[0],
        date.toISOString().split('T')[1].split('.')[0],
        usage.model,
        usage.operation,
        usage.component || '',
        usage.inputTokens,
        usage.outputTokens,
        usage.totalTokens,
        usage.inputCost.toFixed(6),
        usage.outputCost.toFixed(6),
        usage.totalCost.toFixed(6),
        usage.conversationId || '',
        usage.userId || '',
      ];
    });

    return [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');
  }

  /**
   * Get usage records
   */
  private async getUsageRecords(startTime: number, endTime: number): Promise<TokenUsage[]> {
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
   * Clear all usage data
   */
  async clearAll(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[TokenUsageTracker] All usage data cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private getEmptyStats(): UsageStatistics {
    return {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      byModel: {},
      byDay: {},
      averageTokensPerRequest: 0,
      averageCostPerRequest: 0,
    };
  }

  private generateId(): string {
    return `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const tokenUsageTracker = new TokenUsageTrackerService();
export default tokenUsageTracker;
