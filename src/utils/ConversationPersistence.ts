/**
 * Conversation Persistence System
 *
 * Stores conversation messages in IndexedDB for persistence across sessions.
 * Includes conversation management, search, and export capabilities.
 */

import { Message } from "@ai/types";

export interface ConversationMetadata {
  id: string;
  title: string;
  timestamp: number;
  lastUpdated: number;
  messageCount: number;
  preview: string; // First user message or summary
}

export interface StoredConversation {
  id: string;
  messages: Message[];
  metadata: ConversationMetadata;
  systemPrompt?: string;
  mcpServers?: any[];
}

const DB_NAME = "jarvis_conversations";
const DB_VERSION = 1;
const STORE_NAME = "conversations";
const METADATA_STORE = "metadata";
const CURRENT_CONVERSATION_KEY = "current_conversation_id";

class ConversationPersistence {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    if (this.db) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("[ConversationPersistence] IndexedDB initialized");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create conversations store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("timestamp", "metadata.timestamp", {
            unique: false,
          });
          store.createIndex("lastUpdated", "metadata.lastUpdated", {
            unique: false,
          });
        }

        // Create metadata store for quick lookups
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          const metaStore = db.createObjectStore(METADATA_STORE, {
            keyPath: "id",
          });
          metaStore.createIndex("lastUpdated", "lastUpdated", {
            unique: false,
          });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Save current conversation
   */
  async saveConversation(
    messages: Message[],
    options: {
      id?: string;
      systemPrompt?: string;
      mcpServers?: any[];
      title?: string;
    } = {}
  ): Promise<string> {
    await this.init();
    if (!this.db) throw new Error("Database not initialized");

    const id = options.id || this.generateId();
    const now = Date.now();

    // Generate title if not provided
    const title =
      options.title ||
      this.generateTitle(messages) ||
      `Conversation ${new Date(now).toLocaleDateString()}`;

    // Generate preview (first user message)
    const preview = this.generatePreview(messages);

    const metadata: ConversationMetadata = {
      id,
      title,
      timestamp: now,
      lastUpdated: now,
      messageCount: messages.length,
      preview,
    };

    const conversation: StoredConversation = {
      id,
      messages,
      metadata,
      systemPrompt: options.systemPrompt,
      mcpServers: options.mcpServers,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_NAME, METADATA_STORE],
        "readwrite"
      );

      transaction.onerror = () => reject(transaction.error);

      // Save full conversation
      const conversationStore = transaction.objectStore(STORE_NAME);
      conversationStore.put(conversation);

      // Save metadata for quick lookups
      const metadataStore = transaction.objectStore(METADATA_STORE);
      metadataStore.put(metadata);

      transaction.oncomplete = () => {
        console.log(`[ConversationPersistence] Saved conversation: ${id}`);
        resolve(id);
      };
    });
  }

  /**
   * Load conversation by ID
   */
  async loadConversation(id: string): Promise<StoredConversation | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error("Failed to load conversation:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get current conversation ID
   */
  getCurrentConversationId(): string | null {
    return localStorage.getItem(CURRENT_CONVERSATION_KEY);
  }

  /**
   * Set current conversation ID
   */
  setCurrentConversationId(id: string): void {
    localStorage.setItem(CURRENT_CONVERSATION_KEY, id);
  }

  /**
   * Load current conversation
   */
  async loadCurrentConversation(): Promise<StoredConversation | null> {
    const id = this.getCurrentConversationId();
    if (!id) return null;
    return this.loadConversation(id);
  }

  /**
   * Create new conversation
   */
  async createNewConversation(): Promise<string> {
    const id = this.generateId();
    this.setCurrentConversationId(id);
    await this.saveConversation([], { id });
    return id;
  }

  /**
   * List all conversations
   */
  async listConversations(limit?: number): Promise<ConversationMetadata[]> {
    await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(METADATA_STORE, "readonly");
      const store = transaction.objectStore(METADATA_STORE);
      const index = store.index("lastUpdated");
      const request = index.openCursor(null, "prev"); // Most recent first

      const results: ConversationMetadata[] = [];
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor && (!limit || count < limit)) {
          results.push(cursor.value);
          count++;
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        console.error("Failed to list conversations:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id: string): Promise<boolean> {
    await this.init();
    if (!this.db) return false;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_NAME, METADATA_STORE],
        "readwrite"
      );

      transaction.onerror = () => reject(transaction.error);

      const conversationStore = transaction.objectStore(STORE_NAME);
      conversationStore.delete(id);

      const metadataStore = transaction.objectStore(METADATA_STORE);
      metadataStore.delete(id);

      transaction.oncomplete = () => {
        console.log(`[ConversationPersistence] Deleted conversation: ${id}`);

        // Clear current ID if this was the current conversation
        if (this.getCurrentConversationId() === id) {
          localStorage.removeItem(CURRENT_CONVERSATION_KEY);
        }

        resolve(true);
      };
    });
  }

  /**
   * Delete all conversations
   */
  async clearAll(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_NAME, METADATA_STORE],
        "readwrite"
      );

      transaction.onerror = () => reject(transaction.error);

      transaction.objectStore(STORE_NAME).clear();
      transaction.objectStore(METADATA_STORE).clear();

      transaction.oncomplete = () => {
        localStorage.removeItem(CURRENT_CONVERSATION_KEY);
        console.log("[ConversationPersistence] Cleared all conversations");
        resolve();
      };
    });
  }

  /**
   * Delete old conversations (older than N days)
   */
  async deleteOldConversations(daysOld: number = 30): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const allConversations = await this.listConversations();

    const oldConversations = allConversations.filter(
      (conv) => conv.lastUpdated < cutoff
    );

    for (const conv of oldConversations) {
      await this.deleteConversation(conv.id);
    }

    return oldConversations.length;
  }

  /**
   * Search conversations
   */
  async searchConversations(query: string): Promise<ConversationMetadata[]> {
    const allConversations = await this.listConversations();
    const lowerQuery = query.toLowerCase();

    return allConversations.filter(
      (conv) =>
        conv.title.toLowerCase().includes(lowerQuery) ||
        conv.preview.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Export conversation as JSON
   */
  async exportConversation(id: string): Promise<string | null> {
    const conversation = await this.loadConversation(id);
    if (!conversation) return null;

    return JSON.stringify(conversation, null, 2);
  }

  /**
   * Export all conversations
   */
  async exportAll(): Promise<string> {
    await this.init();
    if (!this.db) return "[]";

    const conversations: StoredConversation[] = [];
    const allMetadata = await this.listConversations();

    for (const meta of allMetadata) {
      const conv = await this.loadConversation(meta.id);
      if (conv) {
        conversations.push(conv);
      }
    }

    return JSON.stringify(conversations, null, 2);
  }

  /**
   * Import conversation
   */
  async importConversation(
    jsonData: string,
    newId: boolean = false
  ): Promise<string | null> {
    try {
      const conversation = JSON.parse(jsonData) as StoredConversation;

      if (!conversation.messages || !Array.isArray(conversation.messages)) {
        throw new Error("Invalid conversation format");
      }

      const id = newId ? this.generateId() : conversation.id;

      await this.saveConversation(conversation.messages, {
        id,
        systemPrompt: conversation.systemPrompt,
        mcpServers: conversation.mcpServers,
        title: conversation.metadata?.title,
      });

      return id;
    } catch (error) {
      console.error("Failed to import conversation:", error);
      return null;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    total: number;
    totalMessages: number;
    oldestDate: number | null;
    newestDate: number | null;
  }> {
    const allConversations = await this.listConversations();

    return {
      total: allConversations.length,
      totalMessages: allConversations.reduce(
        (sum, conv) => sum + conv.messageCount,
        0
      ),
      oldestDate:
        allConversations.length > 0
          ? Math.min(...allConversations.map((c) => c.timestamp))
          : null,
      newestDate:
        allConversations.length > 0
          ? Math.max(...allConversations.map((c) => c.lastUpdated))
          : null,
    };
  }

  /**
   * Generate conversation title from messages
   */
  private generateTitle(messages: Message[]): string {
    // Find first user message
    const firstUserMessage = messages.find((m) => m.role === "user");

    if (firstUserMessage && firstUserMessage.messageParts.length > 0) {
      const firstPart = firstUserMessage.messageParts[0];
      if (firstPart.type === "text" && firstPart.text) {
        // Use first 50 characters as title
        const text = firstPart.text.trim();
        return text.length > 50 ? text.slice(0, 47) + "..." : text;
      }
    }

    return `Conversation ${new Date().toLocaleDateString()}`;
  }

  /**
   * Generate preview from messages
   */
  private generatePreview(messages: Message[]): string {
    const firstUserMessage = messages.find((m) => m.role === "user");

    if (firstUserMessage && firstUserMessage.messageParts.length > 0) {
      const firstPart = firstUserMessage.messageParts[0];
      if (firstPart.type === "text" && firstPart.text) {
        return firstPart.text.slice(0, 100);
      }
    }

    return "No messages yet";
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Auto-save current conversation (debounced)
   */
  private autoSaveTimer: NodeJS.Timeout | null = null;

  async autoSave(
    messages: Message[],
    options: {
      systemPrompt?: string;
      mcpServers?: any[];
    } = {}
  ): Promise<void> {
    // Debounce auto-save (wait 2 seconds after last message)
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(async () => {
      try {
        let id = this.getCurrentConversationId();

        // Create new conversation if none exists
        if (!id) {
          id = await this.createNewConversation();
        }

        await this.saveConversation(messages, {
          id,
          ...options,
        });
      } catch (error) {
        console.error("Auto-save failed:", error);
      }
    }, 2000);
  }
}

export const conversationPersistence = new ConversationPersistence();
export default conversationPersistence;
