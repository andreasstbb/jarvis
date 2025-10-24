/**
 * Enhanced Memory Management System
 *
 * Provides structured memory storage with categories, search,
 * importance scoring, and advanced retrieval capabilities.
 */

import LocalStorageManager from './LocalStorage';

export interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: MemoryImportance;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  tags: string[];
  metadata?: Record<string, any>;
}

export enum MemoryCategory {
  PERSONAL = 'personal',          // Personal info (name, age, location)
  PREFERENCE = 'preference',      // User preferences
  WORK = 'work',                 // Work-related info
  TECHNICAL = 'technical',       // Technical knowledge
  CONVERSATION = 'conversation', // Conversation context
  TASK = 'task',                // Tasks and reminders
  RELATIONSHIP = 'relationship', // People and relationships
  GENERAL = 'general',          // Miscellaneous
}

export enum MemoryImportance {
  CRITICAL = 5,  // Must never forget (name, core preferences)
  HIGH = 4,      // Very important (work info, key facts)
  MEDIUM = 3,    // Moderately important (default)
  LOW = 2,       // Nice to remember
  TRIVIAL = 1,   // Can forget
}

export interface MemorySearchOptions {
  query?: string;
  categories?: MemoryCategory[];
  minImportance?: MemoryImportance;
  tags?: string[];
  limit?: number;
  sortBy?: 'relevance' | 'importance' | 'recent' | 'frequency';
}

export interface MemoryStats {
  total: number;
  byCategory: Record<MemoryCategory, number>;
  byImportance: Record<MemoryImportance, number>;
  oldestMemory: number | null;
  newestMemory: number | null;
  totalAccesses: number;
}

const STORAGE_KEY = 'jarvis:enhanced_memories';
const MIGRATION_KEY = 'jarvis:memories_migrated';

class MemoryManager {
  /**
   * Add a new memory
   */
  add(
    content: string,
    options: {
      category?: MemoryCategory;
      importance?: MemoryImportance;
      tags?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): Memory {
    const memory: Memory = {
      id: this.generateId(),
      content: content.trim(),
      category: options.category || MemoryCategory.GENERAL,
      importance: options.importance || MemoryImportance.MEDIUM,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      tags: options.tags || [],
      metadata: options.metadata,
    };

    const memories = this.getAll();
    memories.push(memory);
    this.saveAll(memories);

    return memory;
  }

  /**
   * Get memory by ID
   */
  get(id: string): Memory | null {
    const memories = this.getAll();
    const memory = memories.find(m => m.id === id);

    if (memory) {
      // Update access tracking
      memory.lastAccessed = Date.now();
      memory.accessCount++;
      this.saveAll(memories);
    }

    return memory || null;
  }

  /**
   * Get all memories
   */
  getAll(): Memory[] {
    const stored = LocalStorageManager.getItem<Memory[]>(STORAGE_KEY);
    return stored || [];
  }

  /**
   * Update a memory
   */
  update(id: string, updates: Partial<Omit<Memory, 'id' | 'timestamp'>>): Memory | null {
    const memories = this.getAll();
    const index = memories.findIndex(m => m.id === id);

    if (index === -1) return null;

    memories[index] = {
      ...memories[index],
      ...updates,
      id: memories[index].id, // Ensure ID doesn't change
      timestamp: memories[index].timestamp, // Preserve original timestamp
    };

    this.saveAll(memories);
    return memories[index];
  }

  /**
   * Delete a memory
   */
  delete(id: string): boolean {
    const memories = this.getAll();
    const filtered = memories.filter(m => m.id !== id);

    if (filtered.length === memories.length) {
      return false; // Memory not found
    }

    this.saveAll(filtered);
    return true;
  }

  /**
   * Search memories
   */
  search(options: MemorySearchOptions = {}): Memory[] {
    let results = this.getAll();

    // Filter by category
    if (options.categories && options.categories.length > 0) {
      results = results.filter(m => options.categories!.includes(m.category));
    }

    // Filter by minimum importance
    if (options.minImportance !== undefined) {
      results = results.filter(m => m.importance >= options.minImportance!);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter(m =>
        options.tags!.some(tag => m.tags.includes(tag))
      );
    }

    // Text search (simple case-insensitive contains)
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(m =>
        m.content.toLowerCase().includes(query) ||
        m.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Sort results
    const sortBy = options.sortBy || 'relevance';
    switch (sortBy) {
      case 'importance':
        results.sort((a, b) => b.importance - a.importance);
        break;
      case 'recent':
        results.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'frequency':
        results.sort((a, b) => b.accessCount - a.accessCount);
        break;
      case 'relevance':
      default:
        // Combined score: importance * recency * frequency
        results.sort((a, b) => {
          const scoreA = this.calculateRelevanceScore(a, options.query);
          const scoreB = this.calculateRelevanceScore(b, options.query);
          return scoreB - scoreA;
        });
        break;
    }

    // Limit results
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    // Update access tracking for search results
    results.forEach(memory => {
      memory.lastAccessed = Date.now();
      memory.accessCount++;
    });
    this.saveAll(this.getAll()); // Save updated access counts

    return results;
  }

  /**
   * Calculate relevance score for a memory
   */
  private calculateRelevanceScore(memory: Memory, query?: string): number {
    // Base importance score (0-5)
    let score = memory.importance;

    // Recency bonus (memories from last 7 days get boost)
    const daysSinceCreation = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation < 7) {
      score += (7 - daysSinceCreation) / 7; // Up to +1
    }

    // Frequency bonus (frequently accessed memories are more relevant)
    score += Math.min(memory.accessCount / 10, 1); // Up to +1

    // Query match bonus
    if (query) {
      const queryLower = query.toLowerCase();
      const contentLower = memory.content.toLowerCase();

      // Exact phrase match: +3
      if (contentLower.includes(queryLower)) {
        score += 3;
      }

      // Word matches: +0.5 per word
      const queryWords = queryLower.split(/\s+/);
      const matches = queryWords.filter(word => contentLower.includes(word)).length;
      score += (matches / queryWords.length) * 0.5;
    }

    return score;
  }

  /**
   * Get memories by category
   */
  getByCategory(category: MemoryCategory): Memory[] {
    return this.search({ categories: [category] });
  }

  /**
   * Get important memories (HIGH or CRITICAL)
   */
  getImportant(): Memory[] {
    return this.search({
      minImportance: MemoryImportance.HIGH,
      sortBy: 'importance',
    });
  }

  /**
   * Get recent memories (last N days)
   */
  getRecent(days: number = 7): Memory[] {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return this.getAll()
      .filter(m => m.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get frequently accessed memories
   */
  getFrequent(limit: number = 10): Memory[] {
    return this.search({
      sortBy: 'frequency',
      limit,
    });
  }

  /**
   * Get statistics about memories
   */
  getStats(): MemoryStats {
    const memories = this.getAll();

    const byCategory: Record<MemoryCategory, number> = {
      [MemoryCategory.PERSONAL]: 0,
      [MemoryCategory.PREFERENCE]: 0,
      [MemoryCategory.WORK]: 0,
      [MemoryCategory.TECHNICAL]: 0,
      [MemoryCategory.CONVERSATION]: 0,
      [MemoryCategory.TASK]: 0,
      [MemoryCategory.RELATIONSHIP]: 0,
      [MemoryCategory.GENERAL]: 0,
    };

    const byImportance: Record<MemoryImportance, number> = {
      [MemoryImportance.CRITICAL]: 0,
      [MemoryImportance.HIGH]: 0,
      [MemoryImportance.MEDIUM]: 0,
      [MemoryImportance.LOW]: 0,
      [MemoryImportance.TRIVIAL]: 0,
    };

    let oldestMemory: number | null = null;
    let newestMemory: number | null = null;
    let totalAccesses = 0;

    memories.forEach(memory => {
      byCategory[memory.category]++;
      byImportance[memory.importance]++;
      totalAccesses += memory.accessCount;

      if (oldestMemory === null || memory.timestamp < oldestMemory) {
        oldestMemory = memory.timestamp;
      }
      if (newestMemory === null || memory.timestamp > newestMemory) {
        newestMemory = memory.timestamp;
      }
    });

    return {
      total: memories.length,
      byCategory,
      byImportance,
      oldestMemory,
      newestMemory,
      totalAccesses,
    };
  }

  /**
   * Clear all memories
   */
  clearAll(): void {
    LocalStorageManager.removeItem(STORAGE_KEY);
  }

  /**
   * Export memories as JSON
   */
  export(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  /**
   * Import memories from JSON
   */
  import(jsonData: string, merge: boolean = false): boolean {
    try {
      const imported = JSON.parse(jsonData) as Memory[];

      if (!Array.isArray(imported)) {
        throw new Error('Invalid format: expected array');
      }

      // Validate structure
      imported.forEach(memory => {
        if (!memory.id || !memory.content || !memory.category) {
          throw new Error('Invalid memory format');
        }
      });

      if (merge) {
        const existing = this.getAll();
        const existingIds = new Set(existing.map(m => m.id));
        const newMemories = imported.filter(m => !existingIds.has(m.id));
        this.saveAll([...existing, ...newMemories]);
      } else {
        this.saveAll(imported);
      }

      return true;
    } catch (error) {
      console.error('Failed to import memories:', error);
      return false;
    }
  }

  /**
   * Migrate old memories to new format
   */
  migrateFromLegacy(): number {
    // Check if already migrated
    const alreadyMigrated = LocalStorageManager.getItem<boolean>(MIGRATION_KEY);
    if (alreadyMigrated) {
      return 0;
    }

    // Get old memories
    const oldMemories = LocalStorageManager.getItem<string[]>('jarvis_user_memories');
    if (!oldMemories || oldMemories.length === 0) {
      LocalStorageManager.setItem(MIGRATION_KEY, true);
      return 0;
    }

    // Convert to new format
    const newMemories: Memory[] = oldMemories.map(content => ({
      id: this.generateId(),
      content: content.trim(),
      category: this.inferCategory(content),
      importance: this.inferImportance(content),
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      tags: this.extractTags(content),
      metadata: { migrated: true },
    }));

    // Save new memories
    this.saveAll(newMemories);
    LocalStorageManager.setItem(MIGRATION_KEY, true);

    return newMemories.length;
  }

  /**
   * Infer category from content
   */
  private inferCategory(content: string): MemoryCategory {
    const lower = content.toLowerCase();

    if (lower.match(/\b(name|age|born|live|location|address)\b/)) {
      return MemoryCategory.PERSONAL;
    }
    if (lower.match(/\b(like|prefer|favorite|enjoy|love|hate)\b/)) {
      return MemoryCategory.PREFERENCE;
    }
    if (lower.match(/\b(work|job|company|project|colleague)\b/)) {
      return MemoryCategory.WORK;
    }
    if (lower.match(/\b(code|program|software|api|database|tech)\b/)) {
      return MemoryCategory.TECHNICAL;
    }
    if (lower.match(/\b(task|todo|remind|remember to)\b/)) {
      return MemoryCategory.TASK;
    }
    if (lower.match(/\b(friend|family|partner|spouse|child|parent)\b/)) {
      return MemoryCategory.RELATIONSHIP;
    }

    return MemoryCategory.GENERAL;
  }

  /**
   * Infer importance from content
   */
  private inferImportance(content: string): MemoryImportance {
    const lower = content.toLowerCase();

    // Critical indicators
    if (lower.match(/\b(name is|allergic|emergency|critical|must|never)\b/)) {
      return MemoryImportance.CRITICAL;
    }

    // High importance indicators
    if (lower.match(/\b(important|work|password|pin|birthday)\b/)) {
      return MemoryImportance.HIGH;
    }

    // Low importance indicators
    if (lower.match(/\b(maybe|sometimes|occasionally|might)\b/)) {
      return MemoryImportance.LOW;
    }

    return MemoryImportance.MEDIUM;
  }

  /**
   * Extract tags from content
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const lower = content.toLowerCase();

    // Extract hashtags
    const hashtags = content.match(/#\w+/g);
    if (hashtags) {
      tags.push(...hashtags.map(tag => tag.slice(1)));
    }

    // Extract keywords
    const keywords = ['work', 'personal', 'tech', 'preference', 'family', 'friend'];
    keywords.forEach(keyword => {
      if (lower.includes(keyword)) {
        tags.push(keyword);
      }
    });

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save all memories
   */
  private saveAll(memories: Memory[]): void {
    LocalStorageManager.setItem(STORAGE_KEY, memories);
  }
}

export const memoryManager = new MemoryManager();
export default memoryManager;
