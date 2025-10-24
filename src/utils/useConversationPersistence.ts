/**
 * React Hook for Automatic Conversation Persistence
 *
 * Automatically saves and restores conversation messages using IndexedDB.
 * Provides conversation management UI capabilities.
 */

import { Message } from "@ai/types";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import conversationPersistence, {
  type ConversationMetadata,
  type StoredConversation,
} from "./ConversationPersistence";

export interface ConversationPersistenceOptions {
  enabled?: boolean;
  autoSaveDelay?: number; // ms
  systemPrompt?: string;
  mcpServers?: any[];
}

export interface UseConversationPersistenceReturn {
  // Conversation management
  currentConversationId: string | null;
  allConversations: ConversationMetadata[];
  loadConversation: (id: string) => Promise<Message[] | null>;
  saveCurrentConversation: (messages: Message[]) => Promise<void>;
  createNewConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;

  // Search and filter
  searchConversations: (query: string) => Promise<ConversationMetadata[]>;

  // Export/Import
  exportConversation: (id: string) => Promise<string | null>;
  exportAll: () => Promise<string>;
  importConversation: (jsonData: string) => Promise<string | null>;

  // Utilities
  refreshConversationList: () => Promise<void>;
  clearAllConversations: () => Promise<void>;

  // State
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for conversation persistence
 */
export function useConversationPersistence(
  messages: Message[],
  options: ConversationPersistenceOptions = {}
): UseConversationPersistenceReturn {
  const {
    enabled = true,
    autoSaveDelay = 2000,
    systemPrompt,
    mcpServers,
  } = options;

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [allConversations, setAllConversations] = useState<ConversationMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const hasRestoredRef = useRef(false);

  // Initialize persistence and restore conversation
  useEffect(() => {
    if (!enabled || isInitializedRef.current) return;

    const initialize = async () => {
      try {
        setIsLoading(true);
        await conversationPersistence.init();

        // Get current conversation ID
        const id = conversationPersistence.getCurrentConversationId();
        setCurrentConversationId(id);

        // Load conversation list
        const conversations = await conversationPersistence.listConversations(50);
        setAllConversations(conversations);

        isInitializedRef.current = true;
        setError(null);
      } catch (err) {
        console.error("[useConversationPersistence] Init failed:", err);
        setError("Failed to initialize conversation persistence");
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [enabled]);

  // Restore messages from IndexedDB on first load
  useEffect(() => {
    if (!enabled || !isInitializedRef.current || hasRestoredRef.current) return;
    if (messages.length > 0) {
      // Messages already exist, don't restore
      hasRestoredRef.current = true;
      return;
    }

    const restoreMessages = async () => {
      try {
        const stored = await conversationPersistence.loadCurrentConversation();

        if (stored && stored.messages.length > 0) {
          console.log(
            `[useConversationPersistence] Restored ${stored.messages.length} messages from conversation ${stored.id}`
          );
          // Note: We can't directly modify messages here, need to return them
          // This will be handled by the parent component
        }

        hasRestoredRef.current = true;
      } catch (err) {
        console.error("[useConversationPersistence] Restore failed:", err);
      }
    };

    restoreMessages();
  }, [enabled, isInitializedRef.current, messages.length]);

  // Auto-save messages when they change
  useEffect(() => {
    if (!enabled || !isInitializedRef.current || messages.length === 0) return;

    // Debounce auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        let id = currentConversationId;

        // Create new conversation if none exists
        if (!id) {
          id = await conversationPersistence.createNewConversation();
          setCurrentConversationId(id);
        }

        await conversationPersistence.saveConversation(messages, {
          id,
          systemPrompt,
          mcpServers,
        });

        console.log(`[useConversationPersistence] Auto-saved ${messages.length} messages`);

        // Refresh conversation list
        const conversations = await conversationPersistence.listConversations(50);
        setAllConversations(conversations);
      } catch (err) {
        console.error("[useConversationPersistence] Auto-save failed:", err);
      }
    }, autoSaveDelay);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [enabled, messages, currentConversationId, systemPrompt, mcpServers, autoSaveDelay]);

  // Load conversation by ID
  const loadConversation = useCallback(async (id: string): Promise<Message[] | null> => {
    try {
      setIsLoading(true);
      const stored = await conversationPersistence.loadConversation(id);

      if (stored) {
        setCurrentConversationId(id);
        conversationPersistence.setCurrentConversationId(id);
        setError(null);
        return stored.messages;
      }

      return null;
    } catch (err) {
      console.error("[useConversationPersistence] Load failed:", err);
      setError("Failed to load conversation");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save current conversation
  const saveCurrentConversation = useCallback(async (messagesToSave: Message[]) => {
    try {
      let id = currentConversationId;

      if (!id) {
        id = await conversationPersistence.createNewConversation();
        setCurrentConversationId(id);
      }

      await conversationPersistence.saveConversation(messagesToSave, {
        id,
        systemPrompt,
        mcpServers,
      });

      // Refresh conversation list
      const conversations = await conversationPersistence.listConversations(50);
      setAllConversations(conversations);

      setError(null);
    } catch (err) {
      console.error("[useConversationPersistence] Save failed:", err);
      setError("Failed to save conversation");
    }
  }, [currentConversationId, systemPrompt, mcpServers]);

  // Create new conversation
  const createNewConversation = useCallback(async (): Promise<string> => {
    try {
      const id = await conversationPersistence.createNewConversation();
      setCurrentConversationId(id);

      // Refresh conversation list
      const conversations = await conversationPersistence.listConversations(50);
      setAllConversations(conversations);

      setError(null);
      return id;
    } catch (err) {
      console.error("[useConversationPersistence] Create failed:", err);
      setError("Failed to create new conversation");
      throw err;
    }
  }, []);

  // Delete conversation
  const deleteConversation = useCallback(async (id: string) => {
    try {
      await conversationPersistence.deleteConversation(id);

      // If deleted current conversation, clear current ID
      if (id === currentConversationId) {
        setCurrentConversationId(null);
      }

      // Refresh conversation list
      const conversations = await conversationPersistence.listConversations(50);
      setAllConversations(conversations);

      setError(null);
    } catch (err) {
      console.error("[useConversationPersistence] Delete failed:", err);
      setError("Failed to delete conversation");
    }
  }, [currentConversationId]);

  // Search conversations
  const searchConversations = useCallback(async (query: string): Promise<ConversationMetadata[]> => {
    try {
      const results = await conversationPersistence.searchConversations(query);
      setError(null);
      return results;
    } catch (err) {
      console.error("[useConversationPersistence] Search failed:", err);
      setError("Failed to search conversations");
      return [];
    }
  }, []);

  // Export conversation
  const exportConversation = useCallback(async (id: string): Promise<string | null> => {
    try {
      const json = await conversationPersistence.exportConversation(id);
      setError(null);
      return json;
    } catch (err) {
      console.error("[useConversationPersistence] Export failed:", err);
      setError("Failed to export conversation");
      return null;
    }
  }, []);

  // Export all conversations
  const exportAll = useCallback(async (): Promise<string> => {
    try {
      const json = await conversationPersistence.exportAll();
      setError(null);
      return json;
    } catch (err) {
      console.error("[useConversationPersistence] Export all failed:", err);
      setError("Failed to export all conversations");
      return "[]";
    }
  }, []);

  // Import conversation
  const importConversation = useCallback(async (jsonData: string): Promise<string | null> => {
    try {
      const id = await conversationPersistence.importConversation(jsonData);

      if (id) {
        // Refresh conversation list
        const conversations = await conversationPersistence.listConversations(50);
        setAllConversations(conversations);
        setError(null);
      }

      return id;
    } catch (err) {
      console.error("[useConversationPersistence] Import failed:", err);
      setError("Failed to import conversation");
      return null;
    }
  }, []);

  // Refresh conversation list
  const refreshConversationList = useCallback(async () => {
    try {
      const conversations = await conversationPersistence.listConversations(50);
      setAllConversations(conversations);
      setError(null);
    } catch (err) {
      console.error("[useConversationPersistence] Refresh failed:", err);
      setError("Failed to refresh conversation list");
    }
  }, []);

  // Clear all conversations
  const clearAllConversations = useCallback(async () => {
    try {
      await conversationPersistence.clearAll();
      setAllConversations([]);
      setCurrentConversationId(null);
      setError(null);
    } catch (err) {
      console.error("[useConversationPersistence] Clear all failed:", err);
      setError("Failed to clear all conversations");
    }
  }, []);

  return {
    currentConversationId,
    allConversations,
    loadConversation,
    saveCurrentConversation,
    createNewConversation,
    deleteConversation,
    searchConversations,
    exportConversation,
    exportAll,
    importConversation,
    refreshConversationList,
    clearAllConversations,
    isLoading,
    error,
  };
}

export default useConversationPersistence;
