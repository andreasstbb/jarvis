# Production Cost Monitoring System

## Overview

Enterprise-grade token usage and cost tracking for SaaS viability. Prevents budget overruns, tracks spending patterns, and provides actionable insights for cost optimization.

## Why This Matters

### Financial Control
- **Budget Limits**: Never exceed daily/weekly/monthly budgets
- **Real-Time Alerts**: Get notified at 80% and 95% thresholds
- **Cost Prediction**: Identify spending trends before they become problems
- **Export Reports**: CSV/JSON exports for accounting

### Operational Excellence
- **Token Tracking**: Every API call tracked in IndexedDB
- **Model-Level Metrics**: Compare costs across different models
- **User-Level Tracking**: Identify high-usage users (SaaS)
- **Conversation Tracking**: Cost per conversation analytics

### SaaS Viability
- **Per-User Billing**: Track usage for subscription tiers
- **ROI Analysis**: Cost vs. value metrics
- **Scalability**: Handles millions of tracking records
- **Compliance**: Full audit trail for financial reporting

---

## Features

### 1. Automatic Token Tracking

Every Gemini API call is automatically tracked with:
- Input tokens (prompt)
- Output tokens (response)
- Model used
- Timestamp
- Cost calculation
- Context (conversation ID, user ID, operation)

**No manual tracking needed** - integrated directly into `ConversationGemini.ts`.

### 2. Real-Time Cost Calculation

Pricing automatically configured for all Gemini models:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|-----------------------|------------------------|
| Gemini 2.5 Flash (default) | $0.15 | $0.60 |
| Gemini 1.5 Pro | $1.25 | $5.00 |
| Gemini 1.5 Flash | $0.075 | $0.30 |

**Custom pricing**: Easily add new models or update rates:
```typescript
tokenUsageTracker.setModelPricing('custom-model', {
  input: 0.001,   // $1.00 per 1M input tokens
  output: 0.002,  // $2.00 per 1M output tokens
});
```

### 3. Budget Management

Set limits and get alerts:

```typescript
tokenUsageTracker.setBudget({
  daily: 10,      // $10/day
  weekly: 60,     // $60/week
  monthly: 200,   // $200/month
  alertThresholds: {
    daily: 80,    // Alert at 80%
    weekly: 80,
    monthly: 80,
  },
});
```

**Alert Types**:
- **Warning** (80%): "You're approaching your daily budget"
- **Critical** (95%): "BUDGET EXCEEDED - Immediate action required"

### 4. Statistics & Analytics

Comprehensive statistics for any time period:

```typescript
interface UsageStatistics {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;

  // By model
  byModel: {
    'gemini-2.5-flash': {
      requests: 147,
      tokens: 45832,
      cost: 0.89,
    },
  };

  // By day
  byDay: {
    '2025-10-24': {
      requests: 47,
      tokens: 15284,
      cost: 0.28,
    },
  };

  averageTokensPerRequest: 311.5;
  averageCostPerRequest: 0.006;
}
```

### 5. Export & Reporting

Export usage data for accounting:

**JSON Export**:
```json
{
  "exportDate": "2025-10-24T10:30:00Z",
  "period": {
    "start": "2025-10-01T00:00:00Z",
    "end": "2025-10-31T23:59:59Z"
  },
  "statistics": { /* full stats */ },
  "records": [ /* all usage records */ ]
}
```

**CSV Export**:
```csv
Timestamp,Date,Time,Model,Operation,Input Tokens,Output Tokens,Total Tokens,Total Cost
1729762800000,2025-10-24,10:30:00,gemini-2.5-flash,chat,245,389,634,0.000271
```

### 6. IndexedDB Persistence

All usage data stored locally:
- Survives page reloads
- Fast queries with indexes
- Handles millions of records
- No server dependency

---

## Usage

### React Hook Integration (Recommended)

```typescript
import { useTokenUsage } from '@utils/useTokenUsage';

function CostDashboard() {
  const {
    dailyStats,
    weeklyStats,
    monthlyStats,
    setBudget,
    downloadExport,
    refreshStats,
  } = useTokenUsage({
    enabled: true,
    showToasts: true,  // Show budget alert toasts
    initialBudget: {
      daily: 10,
      weekly: 60,
      monthly: 200,
    },
    onBudgetAlert: (alert) => {
      // Custom alert handling
      if (alert.type === 'critical') {
        // Stop API calls, notify admin, etc.
        console.error('BUDGET EXCEEDED:', alert);
      }
    },
  });

  return (
    <div>
      <h2>Cost Monitoring</h2>

      {/* Daily Stats */}
      <div>
        <h3>Today</h3>
        <p>Requests: {dailyStats?.totalRequests || 0}</p>
        <p>Tokens: {dailyStats?.totalTokens.toLocaleString() || 0}</p>
        <p>Cost: ${(dailyStats?.totalCost || 0).toFixed(2)}</p>
      </div>

      {/* Weekly Stats */}
      <div>
        <h3>This Week</h3>
        <p>Cost: ${(weeklyStats?.totalCost || 0).toFixed(2)}</p>
      </div>

      {/* Monthly Stats */}
      <div>
        <h3>This Month</h3>
        <p>Cost: ${(monthlyStats?.totalCost || 0).toFixed(2)}</p>
      </div>

      {/* Export */}
      <button onClick={() => downloadExport('csv', 'monthly')}>
        Download Monthly Report (CSV)
      </button>

      <button onClick={() => downloadExport('json', 'all')}>
        Download All Data (JSON)
      </button>
    </div>
  );
}
```

### Direct API Usage

```typescript
import tokenUsageTracker from '@utils/TokenUsageTracker';

// Initialize (happens automatically in AgentContextProvider)
await tokenUsageTracker.init();

// Track usage (automatic in ConversationGemini)
await tokenUsageTracker.trackUsage(
  245,    // input tokens
  389,    // output tokens
  'gemini-2.5-flash',
  {
    conversationId: 'conv_123',
    userId: 'user_456',
    operation: 'chat_message',
    component: 'ChatUI',
  }
);

// Get statistics
const dailyStats = await tokenUsageTracker.getStatsForPeriod('daily');
console.log(`Today's cost: $${dailyStats.totalCost.toFixed(2)}`);

// Subscribe to budget alerts
tokenUsageTracker.onBudgetAlert((alert) => {
  console.warn('Budget alert:', alert);

  if (alert.type === 'critical') {
    // Emergency actions
    disableNonCriticalFeatures();
    notifyAdministrators();
  }
});

// Export data
const csvData = await tokenUsageTracker.exportToCSV(
  Date.now() - 30 * 24 * 60 * 60 * 1000,  // Last 30 days
  Date.now()
);
```

---

## Cost Optimization Strategies

### 1. Model Selection

Choose the right model for the task:

**Gemini 2.5 Flash** (recommended for most use cases):
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens
- Best balance of cost and quality
- **10x cheaper** than Gemini 1.5 Pro

**Gemini 1.5 Flash** (ultra-cheap):
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens
- Good for simple queries
- **20x cheaper** than Gemini 1.5 Pro

**Gemini 1.5 Pro** (premium):
- Input: $1.25 per 1M tokens
- Output: $5.00 per 1M tokens
- Use only for complex reasoning tasks

**Cost Comparison** (1000 requests, avg 500 tokens in + 500 tokens out):

| Model | Total Tokens | Cost |
|-------|-------------|------|
| Gemini 1.5 Pro | 1M | **$3.13** |
| Gemini 2.5 Flash | 1M | **$0.38** |
| Gemini 1.5 Flash | 1M | **$0.19** |

**Savings**: Using 2.5 Flash instead of 1.5 Pro = $2.75 per 1M tokens = **88% cost reduction**

### 2. Prompt Optimization

Reduce input tokens:
- Remove unnecessary context
- Use concise system prompts
- Compress tool descriptions
- Cache frequently used prompts

**Example**:
```typescript
// ❌ BAD: Verbose prompt (150 tokens)
const badPrompt = `
Please analyze the following user input and provide a comprehensive response
that takes into account all of the context provided above, making sure to
be thorough and complete in your analysis...
`;

// ✓ GOOD: Concise prompt (30 tokens)
const goodPrompt = `Analyze the user input and respond.`;

// Savings: 120 tokens × $0.00015 = $0.000018 per request
// At 100K requests/month = $1.80/month saved
```

### 3. Response Length Control

Limit output tokens:
```typescript
// Configure Gemini to limit response length
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    maxOutputTokens: 500,  // Prevent runaway responses
  },
});
```

**Cost Impact**:
- Max 500 tokens: $0.0003 per response
- Uncapped (could be 2000+): $0.0012 per response
- **Savings: 75%**

### 4. User Quotas

Implement per-user limits (SaaS):
```typescript
// Free tier: 100K tokens/month
// Pro tier: 1M tokens/month

async function checkUserQuota(userId: string): Promise<boolean> {
  const userStats = await getUserStats(userId);
  const plan = await getUserPlan(userId);

  const monthlyLimit = plan === 'free' ? 100000 : 1000000;

  if (userStats.monthlyTokens > monthlyLimit) {
    throw new Error('Monthly quota exceeded. Please upgrade.');
  }

  return true;
}
```

### 5. Caching

Cache common responses:
```typescript
// Cache weather queries for 1 hour
const weatherCache = new Map<string, { response: string; timestamp: number }>();

async function getWeather(location: string): Promise<string> {
  const cached = weatherCache.get(location);

  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.response;  // Free!
  }

  const response = await callGemini(`Weather in ${location}`);
  weatherCache.set(location, { response, timestamp: Date.now() });

  return response;
}
```

**Savings**: 90% cache hit rate = 90% cost reduction for cached queries

---

## Budget Alert Examples

### Warning Alert (80%)

```typescript
{
  type: 'warning',
  period: 'daily',
  currentSpend: 8.00,
  budgetLimit: 10.00,
  percentageUsed: 80.0,
  timestamp: 1729762800000
}
```

**Action**: Monitor closely, prepare to throttle if needed

### Critical Alert (95%)

```typescript
{
  type: 'critical',
  period: 'daily',
  currentSpend: 9.50,
  budgetLimit: 10.00,
  percentageUsed: 95.0,
  timestamp: 1729762900000
}
```

**Action**: Immediate throttling, disable non-essential features

---

## Dashboard Integration

Create a comprehensive cost dashboard:

```typescript
function TokenUsageDashboard() {
  const {
    dailyStats,
    weeklyStats,
    monthlyStats,
    setBudget,
    downloadExport,
  } = useTokenUsage({
    initialBudget: {
      daily: 10,
      weekly: 60,
      monthly: 200,
    },
  });

  const dailyBudget = 10;
  const dailyPercent = (dailyStats?.totalCost / dailyBudget) * 100;

  return (
    <div>
      {/* Cost Overview */}
      <section>
        <h2>Cost Overview</h2>
        <div>
          <h3>Daily: ${(dailyStats?.totalCost || 0).toFixed(2)} / $10.00</h3>
          <div className="progress-bar">
            <div style={{ width: `${dailyPercent}%` }} />
          </div>
        </div>
      </section>

      {/* Model Breakdown */}
      <section>
        <h2>Cost by Model</h2>
        {Object.entries(dailyStats?.byModel || {}).map(([model, stats]) => (
          <div key={model}>
            <strong>{model}</strong>
            <span>{stats.requests} requests</span>
            <span>${stats.cost.toFixed(4)}</span>
          </div>
        ))}
      </section>

      {/* Daily Trend */}
      <section>
        <h2>7-Day Trend</h2>
        <div>
          {Object.entries(weeklyStats?.byDay || {})
            .slice(-7)
            .map(([date, stats]) => (
              <div key={date}>
                <span>{date}</span>
                <span>${stats.cost.toFixed(2)}</span>
              </div>
            ))}
        </div>
      </section>

      {/* Export */}
      <section>
        <h2>Export Reports</h2>
        <button onClick={() => downloadExport('csv', 'daily')}>
          Daily Report (CSV)
        </button>
        <button onClick={() => downloadExport('csv', 'monthly')}>
          Monthly Report (CSV)
        </button>
        <button onClick={() => downloadExport('json', 'all')}>
          All Data (JSON)
        </button>
      </section>
    </div>
  );
}
```

---

## SaaS Monetization

Use token tracking for subscription billing:

### Pricing Tiers

**Free Tier**:
- 100K tokens/month
- ~200 chat messages
- $0 cost to user
- ~$0.12/user cost to you

**Pro Tier ($9.99/month)**:
- 1M tokens/month
- ~2,000 chat messages
- ~$1.20/user cost to you
- **Profit: $8.79/user**

**Enterprise Tier ($49.99/month)**:
- 10M tokens/month
- ~20,000 chat messages
- ~$12/user cost to you
- **Profit: $37.99/user**

### Usage-Based Billing

```typescript
async function calculateMonthlyBill(userId: string): Promise<number> {
  const stats = await getUserMonthlyStats(userId);

  const basePlan = getUserBasePlan(userId);
  const includedTokens = basePlan === 'pro' ? 1000000 : 100000;

  // Overage: $0.000015 per token ($15 per 1M)
  const overageTokens = Math.max(0, stats.totalTokens - includedTokens);
  const overageCost = overageTokens * 0.000015;

  const planCost = basePlan === 'pro' ? 9.99 : 0;

  return planCost + overageCost;
}
```

---

## Monitoring & Alerts

### 1. Sentry Integration

```typescript
tokenUsageTracker.onBudgetAlert((alert) => {
  Sentry.captureMessage('Budget Alert', {
    level: alert.type === 'critical' ? 'error' : 'warning',
    tags: {
      period: alert.period,
      percentageUsed: alert.percentageUsed.toFixed(1),
    },
    extra: {
      currentSpend: alert.currentSpend,
      budgetLimit: alert.budgetLimit,
    },
  });
});
```

### 2. Slack Notifications

```typescript
async function sendSlackAlert(alert: BudgetAlert): Promise<void> {
  const message = {
    text: `🚨 JARVIS Budget Alert`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.type.toUpperCase()}*: ${alert.period} budget at ${alert.percentageUsed.toFixed(1)}%\n$${alert.currentSpend.toFixed(2)} / $${alert.budgetLimit}`,
        },
      },
    ],
  };

  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}
```

### 3. Email Alerts

```typescript
async function sendEmailAlert(alert: BudgetAlert): Promise<void> {
  await sendEmail({
    to: 'admin@example.com',
    subject: `JARVIS ${alert.type.toUpperCase()} Budget Alert`,
    body: `
      Your ${alert.period} spending has reached ${alert.percentageUsed.toFixed(1)}%.

      Current: $${alert.currentSpend.toFixed(2)}
      Limit: $${alert.budgetLimit}

      Please review usage and take action if needed.
    `,
  });
}
```

---

## Best Practices

### 1. Set Realistic Budgets

Start conservative, adjust based on actual usage:
```typescript
// Week 1: Collect baseline data
setBudget({ daily: 5, weekly: 30, monthly: 100 });

// Week 2: Adjust based on actual usage
const weeklyAverage = await getWeeklyAverage();
setBudget({ daily: weeklyAverage * 1.2 });  // 20% buffer
```

### 2. Monitor Trends

Check weekly to identify issues early:
```typescript
setInterval(async () => {
  const stats = await tokenUsageTracker.getStatsForPeriod('weekly');

  // Cost increasing >50% week-over-week?
  if (stats.totalCost > lastWeekCost * 1.5) {
    console.warn('Unusual cost spike detected!');
    investigateCostIncrease();
  }
}, 7 * 24 * 60 * 60 * 1000);
```

### 3. Export Regularly

Backup usage data monthly:
```typescript
// Automated monthly export
setInterval(async () => {
  const data = await tokenUsageTracker.exportToJSON(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
    Date.now()
  );

  // Upload to S3, send to accounting, etc.
  await saveToBackup(data);
}, 30 * 24 * 60 * 60 * 1000);
```

### 4. Per-Feature Tracking

Track costs by feature for optimization:
```typescript
// Chat feature
await tokenUsageTracker.trackUsage(tokens.input, tokens.output, model, {
  operation: 'chat_message',
  component: 'ChatUI',
  metadata: { feature: 'chat' },
});

// Voice feature (typically more expensive)
await tokenUsageTracker.trackUsage(tokens.input, tokens.output, model, {
  operation: 'voice_transcription',
  component: 'VoiceUI',
  metadata: { feature: 'voice' },
});
```

---

## API Reference

### TokenUsageTracker

**`init(): Promise<void>`**
- Initialize IndexedDB
- Must be called before other methods

**`trackUsage(inputTokens, outputTokens, model, options): Promise<TokenUsage>`**
- Track token usage for an API call
- Calculates cost automatically
- Checks budget limits
- Returns: TokenUsage object

**`setModelPricing(model, pricing): void`**
- Set custom pricing for a model
- pricing: `{ input: number, output: number }`

**`setBudget(budget): void`**
- Set budget limits
- budget: `{ daily?, weekly?, monthly?, alertThresholds? }`

**`onBudgetAlert(callback): () => void`**
- Subscribe to budget alerts
- Returns: Unsubscribe function

**`getStatsForPeriod(period): Promise<UsageStatistics>`**
- Get statistics for a time period
- period: 'daily' | 'weekly' | 'monthly' | 'all'

**`exportToJSON(startTime, endTime): Promise<string>`**
- Export usage data as JSON

**`exportToCSV(startTime, endTime): Promise<string>`**
- Export usage data as CSV

**`clearAll(): Promise<void>`**
- Clear all usage data from IndexedDB

---

**Version**: 1.0.0
**Last Updated**: 2025-10-24
**Production Ready**: Yes
**SaaS Ready**: Yes
**Cost Optimized**: Yes

Essential for financial control and SaaS viability.
