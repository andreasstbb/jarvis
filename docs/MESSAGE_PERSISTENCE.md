# Message Persistence System

## Overview

The message persistence system saves conversation history to IndexedDB, allowing conversations to persist across browser sessions, be searched, exported, and managed.

## Features

### 1. Automatic Persistence
- Messages automatically saved to IndexedDB every 2 seconds
- Restored on page load
- No user action required

### 2. Conversation Management
- Create new conversations
- Load previous conversations
- Delete conversations
- Search conversation history

### 3. Export/Import
- Export individual conversations as JSON
- Export all conversations
- Import conversations from backup

### 4. Auto-Cleanup
- Delete conversations older than N days
- Manual cleanup available

## Architecture

```
┌─────────────────────────────────┐
│  React Component/AgentContext   │
│  (Messages Array)                │
└─────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────┐
│  useConversationPersistence     │
│  (React Hook)                    │
│  - Auto-save on changes          │
│  - Debouncing (2s)               │
│  - Conversation management       │
└─────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────┐
│  ConversationPersistence        │
│  (Core Logic)                    │
│  - IndexedDB operations          │
│  - Search & filter               │
│  - Export/import                 │
└─────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────┐
│  IndexedDB                       │
│  - conversations (full data)     │
│  - metadata (quick lookups)      │
└─────────────────────────────────┘
```

## Data Structure

### StoredConversation

```typescript
interface StoredConversation {
  id: string;                    // Unique conversation ID
  messages: Message[];           // Full message history
  metadata: ConversationMetadata;
  systemPrompt?: string;         // System prompt used
  mcpServers?: any[];           // MCP servers active
}
```

### ConversationMetadata

```typescript
interface ConversationMetadata {
  id: string;
  title: string;                // Auto-generated from first message
  timestamp: number;            // Creation time
  lastUpdated: number;          // Last modification time
  messageCount: number;         // Number of messages
  preview: string;              // First user message (100 chars)
}
```

## Usage

### Basic Integration (React Hook)

```typescript
import { useConversationPersistence } from '@utils/useConversationPersistence';

function ChatComponent() {
  const { messages, setMessages } = useMessages();

  // Enable automatic persistence
  const persistence = useConversationPersistence(messages, {
    enabled: true,
    autoSaveDelay: 2000,
    systemPrompt: SYSTEM_PROMPT,
    mcpServers: activeMcpServers,
  });

  // Conversation management
  const handleNewConversation = async () => {
    const id = await persistence.createNewConversation();
    setMessages([]);
  };

  const handleLoadConversation = async (id: string) => {
    const messages = await persistence.loadConversation(id);
    if (messages) {
      setMessages(messages);
    }
  };

  return (
    <div>
      {/* Conversation list */}
      <ConversationList
        conversations={persistence.allConversations}
        currentId={persistence.currentConversationId}
        onSelect={handleLoadConversation}
        onDelete={persistence.deleteConversation}
      />

      {/* Chat interface */}
      <Chat messages={messages} />
    </div>
  );
}
```

### Direct API Usage

```typescript
import conversationPersistence from '@utils/ConversationPersistence';

// Initialize
await conversationPersistence.init();

// Save conversation
const id = await conversationPersistence.saveConversation(messages, {
  systemPrompt: "You are JARVIS",
  mcpServers: [/*...*/],
  title: "Debug Session",
});

// Load conversation
const conversation = await conversationPersistence.loadConversation(id);

// List all conversations
const conversations = await conversationPersistence.listConversations(20);

// Search
const results = await conversationPersistence.searchConversations("debug");

// Delete
await conversationPersistence.deleteConversation(id);

// Export
const json = await conversationPersistence.exportConversation(id);

// Import
const newId = await conversationPersistence.importConversation(json);
```

## Auto-Save Behavior

1. **Triggers**: Auto-save occurs when messages array changes
2. **Debouncing**: Waits 2 seconds after last change
3. **ID Management**:
   - First save: Creates new conversation ID
   - Subsequent saves: Updates existing conversation
4. **Metadata Update**: Title, preview, and lastUpdated refreshed on each save

## Title Generation

Titles are automatically generated from the first user message:

```typescript
// First message: "How do I fix this TypeError?"
// Generated title: "How do I fix this TypeError?"

// Long message: "I'm trying to implement a feature that..."
// Generated title: "I'm trying to implement a feature that..."
```

Manual title setting:

```typescript
await conversationPersistence.saveConversation(messages, {
  title: "Custom Title",
});
```

## Search

Search looks in both title and preview:

```typescript
const results = await persistence.searchConversations("react");
// Returns all conversations mentioning "react" in title or first message
```

## Export/Import

### Export Single Conversation

```typescript
const json = await persistence.exportConversation(id);
// Download or send to backend
downloadFile(json, 'conversation.json');
```

### Export All

```typescript
const json = await persistence.exportAll();
// Backup all conversations
```

### Import

```typescript
// From file upload
const file = event.target.files[0];
const text = await file.text();
const id = await persistence.importConversation(text);
```

## Storage Management

### Get Statistics

```typescript
const stats = await conversationPersistence.getStats();
console.log(stats);
// {
//   total: 15,
//   totalMessages: 347,
//   oldestDate: 1729000000000,
//   newestDate: 1729781234567
// }
```

### Delete Old Conversations

```typescript
// Delete conversations older than 30 days
const deleted = await conversationPersistence.deleteOldConversations(30);
console.log(`Deleted ${deleted} old conversations`);
```

### Clear All

```typescript
await conversationPersistence.clearAll();
```

## IndexedDB Schema

### Database: `jarvis_conversations` (v1)

**Object Store: `conversations`**
- keyPath: `id`
- Indexes:
  - `timestamp` (non-unique)
  - `lastUpdated` (non-unique)

**Object Store: `metadata`**
- keyPath: `id`
- Indexes:
  - `lastUpdated` (non-unique)

## Performance

- **Save**: ~10-50ms for typical conversation (100 messages)
- **Load**: ~5-20ms
- **List**: ~10-30ms for 50 conversations
- **Search**: ~20-50ms for 100 conversations
- **Storage**: ~1-2KB per message, ~100-200KB per conversation

## Best Practices

### 1. Don't Block UI

```typescript
// Good: Use async/await
const handleSave = async () => {
  await persistence.saveCurrentConversation(messages);
};

// Bad: Synchronous blocking
```

### 2. Handle Errors

```typescript
try {
  await persistence.loadConversation(id);
} catch (error) {
  console.error("Failed to load conversation:", error);
  toast.error("Failed to load conversation");
}
```

### 3. Provide User Feedback

```typescript
if (persistence.isLoading) {
  return <LoadingSpinner />;
}

if (persistence.error) {
  return <ErrorMessage message={persistence.error} />;
}
```

### 4. Cleanup Regularly

```typescript
// Run cleanup weekly
useEffect(() => {
  const cleanup = async () => {
    await conversationPersistence.deleteOldConversations(90);
  };

  const interval = setInterval(cleanup, 7 * 24 * 60 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```

## Browser Compatibility

Requires IndexedDB support:
- Chrome 24+
- Firefox 16+
- Safari 10+
- Edge 12+

**Note**: IndexedDB not available in:
- Private/Incognito mode (some browsers)
- Very old browsers
- Some embedded webviews

Fallback: Store in localStorage (limited to ~5-10MB)

## Limitations

1. **Storage Quota**: Browsers limit IndexedDB storage (typically 50MB-100MB+)
2. **No Cloud Sync**: Data local to browser only
3. **Manual Backup**: Users must export for backup
4. **No Encryption**: Data stored in plain text

## Future Enhancements

From MASTERPLAN.md:

1. **Cloud Sync**: Sync conversations across devices
2. **Encryption**: Encrypt sensitive conversations
3. **Compression**: Compress old conversations
4. **Search Improvements**: Full-text search, semantic search
5. **Auto-Tagging**: Automatically tag conversations
6. **Conversation Branching**: Fork conversations
7. **Conversation Merging**: Combine related conversations

## Troubleshooting

### Conversations not saving

1. **Check IndexedDB support**:
```typescript
if (!window.indexedDB) {
  console.error("IndexedDB not supported");
}
```

2. **Check storage quota**:
```typescript
if (navigator.storage && navigator.storage.estimate) {
  const estimate = await navigator.storage.estimate();
  console.log(`Used: ${estimate.usage}, Quota: ${estimate.quota}`);
}
```

3. **Check browser console**: Look for IndexedDB errors

### Can't load conversations

1. **Check conversation exists**:
```typescript
const conversations = await persistence.listConversations();
console.log(conversations);
```

2. **Try exporting**: See if data is still there

### Performance issues

1. **Too many messages**: Consider conversation archiving
2. **Old conversations**: Run cleanup
3. **Large messages**: Split into multiple conversations

---

**Version**: 1.0.0
**Last Updated**: 2025-10-24
**Storage**: IndexedDB (local)
**Auto-save**: Enabled by default
