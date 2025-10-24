/**
 * Enhanced Memories MCP Server
 *
 * Provides comprehensive memory management with categories, search,
 * importance scoring, and advanced retrieval capabilities.
 */

import type {
  JSONRPCError,
  JSONRPCRequest,
  JSONRPCResponse,
} from "@modelcontextprotocol/sdk/types.js";

import memoryManager, {
  MemoryCategory,
  MemoryImportance,
  type Memory,
  type MemorySearchOptions,
} from "@utils/MemoryManager";
import PromiseTransport, {
  type PromiseTransportConfig,
} from "../PromiseTransport";

export class MemoriesServerEnhanced {
  private transport: PromiseTransport;

  constructor() {
    // Migrate old memories on first load
    const migrated = memoryManager.migrateFromLegacy();
    if (migrated > 0) {
      console.log(`[MemoriesServer] Migrated ${migrated} legacy memories`);
    }

    const config: PromiseTransportConfig = {
      executeRequest: async (
        request: JSONRPCRequest
      ): Promise<JSONRPCResponse | JSONRPCError> => {
        return this.handleRequest(request);
      },
      timeout: 30000,
      onConnect: async () => {
        console.log("[MemoriesServerEnhanced] Connected");
      },
    };

    this.transport = new PromiseTransport(config);
  }

  private async handleRequest(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    try {
      if (request.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              prompts: {},
            },
            serverInfo: {
              name: "memories-server-enhanced",
              version: "2.0.0",
            },
          },
        };
      }

      if (request.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: [
              {
                name: "add_memory",
                description:
                  "Store important information about the user or conversation context in memory with automatic categorization and importance scoring. Use this when the user shares personal information, preferences, or context that should be remembered for future interactions.",
                inputSchema: {
                  type: "object",
                  properties: {
                    memory: {
                      type: "string",
                      description:
                        "The memory to store, describing what should be remembered about the user or context. Include full context (e.g., 'The user is 20 years old' instead of just '20').",
                    },
                    category: {
                      type: "string",
                      enum: Object.values(MemoryCategory),
                      description:
                        "Optional category for the memory. If not provided, will be inferred automatically.",
                    },
                    importance: {
                      type: "number",
                      enum: Object.values(MemoryImportance).filter(v => typeof v === 'number'),
                      description:
                        "Optional importance level (1-5). If not provided, will be inferred automatically. 5=critical, 4=high, 3=medium, 2=low, 1=trivial",
                    },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                      description: "Optional tags for categorization and search",
                    },
                  },
                  required: ["memory"],
                  additionalProperties: false,
                },
              },
              {
                name: "search_memories",
                description:
                  "Search stored memories using various filters. Can search by text query, category, importance level, tags, or combinations of these.",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "Text to search for in memory content",
                    },
                    categories: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: Object.values(MemoryCategory),
                      },
                      description: "Filter by specific categories",
                    },
                    minImportance: {
                      type: "number",
                      enum: Object.values(MemoryImportance).filter(v => typeof v === 'number'),
                      description: "Minimum importance level (1-5)",
                    },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                      description: "Filter by tags",
                    },
                    limit: {
                      type: "number",
                      description: "Maximum number of results to return",
                    },
                    sortBy: {
                      type: "string",
                      enum: ["relevance", "importance", "recent", "frequency"],
                      description: "How to sort results (default: relevance)",
                    },
                  },
                  additionalProperties: false,
                },
              },
              {
                name: "get_memory_stats",
                description:
                  "Get statistics about stored memories including counts by category and importance",
                inputSchema: {
                  type: "object",
                  properties: {},
                  additionalProperties: false,
                },
              },
              {
                name: "update_memory",
                description:
                  "Update an existing memory's content, category, importance, or tags",
                inputSchema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "ID of the memory to update",
                    },
                    memory: {
                      type: "string",
                      description: "New content for the memory",
                    },
                    category: {
                      type: "string",
                      enum: Object.values(MemoryCategory),
                      description: "New category",
                    },
                    importance: {
                      type: "number",
                      enum: Object.values(MemoryImportance).filter(v => typeof v === 'number'),
                      description: "New importance level (1-5)",
                    },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                      description: "New tags",
                    },
                  },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
              {
                name: "delete_memory",
                description: "Delete a specific memory by ID",
                inputSchema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "ID of the memory to delete",
                    },
                  },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
            ],
          },
        };
      }

      if (request.method === "prompts/list") {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            prompts: [
              {
                name: "user_memories",
                description: "Retrieve all stored memories about the user",
              },
              {
                name: "important_memories",
                description: "Retrieve only high and critical importance memories",
              },
              {
                name: "recent_memories",
                description: "Retrieve memories from the last 7 days",
              },
            ],
          },
        };
      }

      if (request.method === "prompts/get") {
        const params = request.params as {
          name: string;
        };

        if (params.name === "user_memories") {
          const memories = memoryManager.getAll();
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              description: "User memories and context",
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text:
                      memories.length > 0
                        ? this.formatMemoriesForPrompt(memories)
                        : "No memories have been stored yet.",
                  },
                },
              ],
            },
          };
        }

        if (params.name === "important_memories") {
          const memories = memoryManager.getImportant();
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              description: "Important user memories",
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text:
                      memories.length > 0
                        ? this.formatMemoriesForPrompt(memories)
                        : "No important memories found.",
                  },
                },
              ],
            },
          };
        }

        if (params.name === "recent_memories") {
          const memories = memoryManager.getRecent(7);
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              description: "Recent user memories (last 7 days)",
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text:
                      memories.length > 0
                        ? this.formatMemoriesForPrompt(memories)
                        : "No recent memories found.",
                  },
                },
              ],
            },
          };
        }
      }

      if (request.method === "tools/call") {
        return this.handleToolCall(request);
      }

      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: "Method not found",
        },
      } as JSONRPCError;
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
      } as JSONRPCError;
    }
  }

  private async handleToolCall(
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCError> {
    const params = request.params as {
      name: string;
      arguments?: any;
    };

    try {
      switch (params.name) {
        case "add_memory":
          return this.handleAddMemory(request.id, params.arguments);

        case "search_memories":
          return this.handleSearchMemories(request.id, params.arguments);

        case "get_memory_stats":
          return this.handleGetStats(request.id);

        case "update_memory":
          return this.handleUpdateMemory(request.id, params.arguments);

        case "delete_memory":
          return this.handleDeleteMemory(request.id, params.arguments);

        default:
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${params.name}`,
            },
          } as JSONRPCError;
      }
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        },
      };
    }
  }

  private handleAddMemory(id: any, args: any): JSONRPCResponse {
    if (!args?.memory) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Error: Memory content is required",
            },
          ],
        },
      };
    }

    const memory = memoryManager.add(args.memory, {
      category: args.category,
      importance: args.importance,
      tags: args.tags,
    });

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: `Memory stored successfully!\n\n${this.formatSingleMemory(memory)}`,
          },
        ],
      },
    };
  }

  private handleSearchMemories(id: any, args: any): JSONRPCResponse {
    const options: MemorySearchOptions = {
      query: args?.query,
      categories: args?.categories,
      minImportance: args?.minImportance,
      tags: args?.tags,
      limit: args?.limit,
      sortBy: args?.sortBy,
    };

    const memories = memoryManager.search(options);

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text:
              memories.length > 0
                ? `Found ${memories.length} matching memories:\n\n${this.formatMemoriesForPrompt(memories)}`
                : "No memories found matching your search criteria.",
          },
        ],
      },
    };
  }

  private handleGetStats(id: any): JSONRPCResponse {
    const stats = memoryManager.getStats();

    const text = `Memory Statistics:
━━━━━━━━━━━━━━━━━━━━━━
Total Memories: ${stats.total}

By Category:
${Object.entries(stats.byCategory)
  .filter(([_, count]) => count > 0)
  .map(([cat, count]) => `  • ${cat}: ${count}`)
  .join('\n')}

By Importance:
${Object.entries(stats.byImportance)
  .filter(([_, count]) => count > 0)
  .map(([imp, count]) => `  • Level ${imp}: ${count}`)
  .join('\n')}

Total Accesses: ${stats.totalAccesses}
${stats.oldestMemory ? `Oldest Memory: ${new Date(stats.oldestMemory).toLocaleDateString()}` : ''}
${stats.newestMemory ? `Newest Memory: ${new Date(stats.newestMemory).toLocaleDateString()}` : ''}`;

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    };
  }

  private handleUpdateMemory(id: any, args: any): JSONRPCResponse {
    if (!args?.id) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Error: Memory ID is required",
            },
          ],
        },
      };
    }

    const updates: any = {};
    if (args.memory) updates.content = args.memory;
    if (args.category) updates.category = args.category;
    if (args.importance !== undefined) updates.importance = args.importance;
    if (args.tags) updates.tags = args.tags;

    const updated = memoryManager.update(args.id, updates);

    if (!updated) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Error: Memory not found",
            },
          ],
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: `Memory updated successfully!\n\n${this.formatSingleMemory(updated)}`,
          },
        ],
      },
    };
  }

  private handleDeleteMemory(id: any, args: any): JSONRPCResponse {
    if (!args?.id) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Error: Memory ID is required",
            },
          ],
        },
      };
    }

    const deleted = memoryManager.delete(args.id);

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: deleted
              ? "Memory deleted successfully"
              : "Error: Memory not found",
          },
        ],
      },
    };
  }

  private formatMemoriesForPrompt(memories: Memory[]): string {
    const grouped = memories.reduce((acc, memory) => {
      if (!acc[memory.category]) {
        acc[memory.category] = [];
      }
      acc[memory.category].push(memory);
      return acc;
    }, {} as Record<string, Memory[]>);

    let text = "Here are the stored memories about the user:\n\n";

    for (const [category, mems] of Object.entries(grouped)) {
      text += `**${category.toUpperCase()}**:\n`;
      mems.forEach((mem) => {
        const importanceStars = "★".repeat(mem.importance);
        const tags = mem.tags.length > 0 ? ` [${mem.tags.join(", ")}]` : "";
        text += `  ${importanceStars} ${mem.content}${tags}\n`;
      });
      text += "\n";
    }

    return text.trim();
  }

  private formatSingleMemory(memory: Memory): string {
    return `ID: ${memory.id}
Content: ${memory.content}
Category: ${memory.category}
Importance: ${"★".repeat(memory.importance)} (${memory.importance}/5)
Tags: ${memory.tags.join(", ") || "none"}
Created: ${new Date(memory.timestamp).toLocaleString()}
Accessed: ${memory.accessCount} times`;
  }

  public getTransport(): PromiseTransport {
    return this.transport;
  }
}

export default MemoriesServerEnhanced;
