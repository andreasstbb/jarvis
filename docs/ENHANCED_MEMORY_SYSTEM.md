# Enhanced Memory System

## Overview

The enhanced memory system transforms JARVIS's simple memory storage into a sophisticated knowledge management system with categories, search, importance scoring, and intelligent retrieval.

## Key Features

### 1. Structured Memory Format

Each memory now includes:
- **Content**: The actual memory text
- **Category**: Auto-categorized (Personal, Preference, Work, Technical, etc.)
- **Importance**: Scored 1-5 (Trivial to Critical)
- **Timestamp**: When the memory was created
- **Last Accessed**: Tracks memory usage
- **Access Count**: Frequency tracking
- **Tags**: Custom tags for organization
- **Metadata**: Additional custom data

### 2. Memory Categories

```typescript
enum MemoryCategory {
  PERSONAL       // Name, age, location, personal details
  PREFERENCE     // User preferences and likes/dislikes
  WORK           // Work-related information
  TECHNICAL      // Technical knowledge and skills
  CONVERSATION   // Conversation context
  TASK           // Tasks and reminders
  RELATIONSHIP   // People and relationships
  GENERAL        // Miscellaneous
}
```

### 3. Importance Levels

```typescript
enum MemoryImportance {
  CRITICAL = 5   // Must never forget (name, core preferences)
  HIGH = 4       // Very important (work info, key facts)
  MEDIUM = 3     // Moderately important (default)
  LOW = 2        // Nice to remember
  TRIVIAL = 1    // Can forget
}
```

## MCP Server Tools

### 1. `add_memory` (Enhanced)

Store memories with automatic categorization and importance scoring.

**Parameters:**
```typescript
{
  memory: string;          // Required: The memory content
  category?: string;       // Optional: Manual category (auto-inferred if not provided)
  importance?: number;     // Optional: Importance 1-5 (auto-inferred if not provided)
  tags?: string[];        // Optional: Custom tags
}
```

**Example:**
```
add_memory({
  memory: "User's name is Alex and they are 28 years old",
  category: "personal",
  importance: 5,
  tags: ["identity", "core"]
})
```

**Auto-Inference:**
If category/importance not provided, the system automatically infers them:
- "User is allergic to peanuts" → PERSONAL, CRITICAL
- "User prefers dark mode" → PREFERENCE, MEDIUM
- "User works at Google" → WORK, HIGH

### 2. `search_memories` (NEW)

Powerful search with multiple filters.

**Parameters:**
```typescript
{
  query?: string;                    // Text search
  categories?: string[];             // Filter by categories
  minImportance?: number;           // Minimum importance level
  tags?: string[];                  // Filter by tags
  limit?: number;                   // Max results
  sortBy?: 'relevance' | 'importance' | 'recent' | 'frequency'
}
```

**Examples:**
```javascript
// Search for work-related memories
search_memories({ categories: ["work"], sortBy: "importance" })

// Find recent preferences
search_memories({
  categories: ["preference"],
  sortBy: "recent",
  limit: 5
})

// Text search
search_memories({ query: "coffee", sortBy: "relevance" })

// Get critical memories
search_memories({ minImportance: 5 })
```

### 3. `get_memory_stats` (NEW)

Get statistics about stored memories.

**Returns:**
```
Memory Statistics:
━━━━━━━━━━━━━━━━━━━━━━
Total Memories: 24

By Category:
  • personal: 5
  • preference: 8
  • work: 7
  • technical: 4

By Importance:
  • Level 5: 3
  • Level 4: 6
  • Level 3: 12
  • Level 2: 3

Total Accesses: 156
Oldest Memory: 10/15/2025
Newest Memory: 10/24/2025
```

### 4. `update_memory` (NEW)

Update existing memories.

**Parameters:**
```typescript
{
  id: string;                // Required: Memory ID
  memory?: string;           // New content
  category?: string;         // New category
  importance?: number;       // New importance
  tags?: string[];          // New tags
}
```

### 5. `delete_memory` (NEW)

Delete a specific memory.

**Parameters:**
```typescript
{
  id: string;  // Memory ID to delete
}
```

## MCP Server Prompts

### 1. `user_memories` (Enhanced)

Retrieves all memories, formatted by category with importance stars.

**Output Example:**
```
**PERSONAL**:
  ★★★★★ User's name is Alex and they are 28 years old
  ★★★★ User lives in San Francisco

**PREFERENCE**:
  ★★★ User prefers dark mode
  ★★★ User likes coffee in the morning [beverage, routine]

**WORK**:
  ★★★★ User works as a software engineer at Google
  ★★★ User is working on a React project
```

### 2. `important_memories` (NEW)

Retrieves only HIGH and CRITICAL importance memories.

### 3. `recent_memories` (NEW)

Retrieves memories from the last 7 days.

## Usage in Code

### Basic Usage

```typescript
import memoryManager from '@utils/MemoryManager';

// Add a memory
const memory = memoryManager.add("User prefers TypeScript", {
  category: MemoryCategory.PREFERENCE,
  importance: MemoryImportance.MEDIUM,
  tags: ["coding", "language"]
});

// Search memories
const results = memoryManager.search({
  query: "typescript",
  categories: [MemoryCategory.TECHNICAL, MemoryCategory.PREFERENCE],
  limit: 5
});

// Get by category
const workMemories = memoryManager.getByCategory(MemoryCategory.WORK);

// Get important memories
const important = memoryManager.getImportant();

// Get recent memories
const recent = memoryManager.getRecent(7); // Last 7 days

// Update a memory
memoryManager.update(memory.id, {
  importance: MemoryImportance.HIGH,
  tags: ["coding", "language", "primary"]
});

// Delete a memory
memoryManager.delete(memory.id);
```

### Advanced Search

```typescript
// Complex search with multiple filters
const results = memoryManager.search({
  query: "react",
  categories: [MemoryCategory.WORK, MemoryCategory.TECHNICAL],
  minImportance: MemoryImportance.MEDIUM,
  tags: ["frontend"],
  limit: 10,
  sortBy: "relevance"
});

// Get statistics
const stats = memoryManager.getStats();
console.log(`Total: ${stats.total}, By Category:`, stats.byCategory);
```

### Import/Export

```typescript
// Export all memories
const json = memoryManager.export();
// Save to file or sync to cloud

// Import memories
memoryManager.import(jsonData, true); // true = merge with existing
```

## Relevance Scoring

The system uses a sophisticated relevance score combining:

1. **Importance** (0-5 points): Base score from importance level
2. **Recency** (+0-1 points): Memories from last 7 days get boost
3. **Frequency** (+0-1 points): Often-accessed memories ranked higher
4. **Query Match** (+0-3.5 points):
   - Exact phrase match: +3
   - Partial word matches: +0.5 per word

This ensures the most relevant memories surface first.

## Automatic Migration

When upgrading from the old memory system, memories are automatically migrated with:
- Auto-inferred categories
- Auto-inferred importance
- Extracted tags
- Preserved content
- Migration metadata

**Migration happens once** on first load of the enhanced system.

## Storage

Memories are stored in localStorage under `jarvis:enhanced_memories`.

**Old format** (array of strings):
```json
["User is 28 years old", "User likes coffee"]
```

**New format** (structured objects):
```json
[
  {
    "id": "mem_1729781234_xyz123",
    "content": "User is 28 years old",
    "category": "personal",
    "importance": 5,
    "timestamp": 1729781234567,
    "lastAccessed": 1729781234567,
    "accessCount": 0,
    "tags": ["identity"],
    "metadata": {}
  }
]
```

## Best Practices

### For Users

1. **Be Specific**: Include context in memories
   - Good: "User prefers dark mode in their IDE"
   - Bad: "dark mode"

2. **Use Tags**: Add relevant tags for better organization
   - `["coding", "preference", "visual"]`

3. **Set Importance**: Critical info should be marked HIGH or CRITICAL
   - User's name: CRITICAL
   - Preference: MEDIUM
   - Random fact: LOW

4. **Regular Cleanup**: Delete outdated or incorrect memories

### For Developers

1. **Search Before Adding**: Check if similar memory exists
```typescript
const existing = memoryManager.search({ query: "user's name" });
if (existing.length === 0) {
  memoryManager.add("User's name is Alex", { importance: 5 });
}
```

2. **Update Instead of Duplicate**: Modify existing memories
```typescript
if (existing.length > 0) {
  memoryManager.update(existing[0].id, {
    content: "User's full name is Alex Johnson"
  });
}
```

3. **Use Categories Wisely**: Proper categorization improves retrieval
4. **Track Important Memories**: Use `getImportant()` for critical context
5. **Leverage Prompts**: Use MCP prompts for automatic context injection

## Integration with JARVIS

The memory system is automatically integrated as an MCP server. JARVIS can:

1. **Automatically store** information users share
2. **Search memories** when answering questions
3. **Recall context** from previous conversations
4. **Prioritize** important information
5. **Organize** knowledge by category

## Example Conversations

**User**: "My name is Alex and I'm 28 years old"
**JARVIS**: *[Stores: "User's name is Alex and they are 28 years old" - PERSONAL, CRITICAL]*

**User**: "What's my name?"
**JARVIS**: *[Searches memories for "name"]* "Your name is Alex!"

**User**: "What do you remember about me?"
**JARVIS**: *[Retrieves important memories]* "Here's what I know about you:
- Your name is Alex, age 28
- You prefer dark mode
- You work as a software engineer at Google
- You're working on a React project
- You like coffee in the morning"

## Performance

- **Storage**: ~50-100 bytes per memory
- **Search**: O(n) for text search, O(n log n) for sorting
- **Relevance calculation**: O(n) where n = number of memories
- **Recommended max**: ~10,000 memories before considering cleanup

## Future Enhancements

Planned improvements (from MASTERPLAN.md):

1. **Vector Embeddings**: Semantic search using embeddings
2. **RAG Integration**: Ground responses in memory context
3. **Memory Consolidation**: Merge similar memories
4. **Forgetting Curve**: Fade old, unimportant memories
5. **Voice-Triggered Recall**: "Jarvis, what do you remember about..."
6. **Cloud Sync**: Multi-device memory synchronization
7. **Privacy Controls**: Memory encryption, selective sharing

## Troubleshooting

### Memories not persisting
- Check localStorage is enabled
- Verify no browser restrictions
- Check for quota errors in console

### Search not finding memories
- Try broader search terms
- Check category filters
- Lower minImportance threshold
- Use `getAll()` to verify memory exists

### Auto-categorization incorrect
- Manually set category when adding
- Update existing memory with correct category
- Add relevant tags to improve searchability

### Performance issues
- Check memory count with `getStats()`
- Consider deleting old/trivial memories
- Export and archive old memories

---

**Version**: 2.0.0
**Last Updated**: 2025-10-24
**Replaces**: Basic string-based memory system (v1.0)
