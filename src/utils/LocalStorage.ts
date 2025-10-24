type LocalStorageCallback<T> = (
  key: string,
  newValue: T | null,
  oldValue: T | null
) => void;

class LocalStorageManager {
  private callbacks: Map<string, Set<LocalStorageCallback<any>>> = new Map();
  private values: Map<string, any> = new Map();
  private storageHandler: ((event: StorageEvent) => void) | null = null;

  constructor() {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        try {
          const value = JSON.parse(window.localStorage.getItem(key) || "null");
          this.values.set(key, value);
        } catch {
          // Handle non-JSON values
          this.values.set(key, window.localStorage.getItem(key));
        }
      }
    }

    // Store bound handler for cleanup
    this.storageHandler = this.handleStorageEvent.bind(this);
    window.addEventListener("storage", this.storageHandler);
  }

  private handleStorageEvent(event: StorageEvent) {
    if (event.key && event.storageArea === window.localStorage) {
      const oldValue = this.values.get(event.key) || null;
      let newValue: any = null;

      if (event.newValue) {
        try {
          newValue = JSON.parse(event.newValue);
        } catch {
          newValue = event.newValue;
        }
      }

      this.values.set(event.key, newValue);
      this.notifyCallbacks(event.key, newValue, oldValue);
    }
  }

  private notifyCallbacks<T>(
    key: string,
    newValue: T | null,
    oldValue: T | null
  ) {
    const keyCallbacks = this.callbacks.get(key);
    if (keyCallbacks) {
      keyCallbacks.forEach((callback) => {
        try {
          callback(key, newValue, oldValue);
        } catch (error) {
          console.error("Error in localStorage callback:", error);
        }
      });
    }
  }

  setItem<T>(key: string, value: T): void {
    const oldValue = this.values.get(key) || null;
    const serializedValue = JSON.stringify(value);

    window.localStorage.setItem(key, serializedValue);
    this.values.set(key, value);

    this.notifyCallbacks(key, value, oldValue);
  }

  getItem<T>(key: string): T | null {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;

    try {
      return JSON.parse(stored) as T;
    } catch (error) {
      console.error(`Failed to parse localStorage item "${key}":`, error);
      return null;
    }
  }

  removeItem(key: string): void {
    const oldValue = this.values.get(key) || null;
    window.localStorage.removeItem(key);
    this.values.delete(key);

    this.notifyCallbacks(key, null, oldValue);
  }

  onItemChange<T>(key: string, callback: LocalStorageCallback<T>): () => void {
    if (!this.callbacks.has(key)) {
      this.callbacks.set(key, new Set());
    }

    const keyCallbacks = this.callbacks.get(key)!;
    keyCallbacks.add(callback);

    return () => {
      keyCallbacks.delete(callback);
      if (keyCallbacks.size === 0) {
        this.callbacks.delete(key);
      }
    };
  }

  clear(): void {
    const oldValues = new Map(this.values);
    window.localStorage.clear();
    this.values.clear();

    oldValues.forEach((oldValue, key) => {
      this.notifyCallbacks(key, null, oldValue);
    });
  }

  /**
   * Cleanup resources and remove event listeners
   * Call this before destroying to prevent memory leaks
   */
  destroy(): void {
    // Remove storage event listener
    if (this.storageHandler) {
      window.removeEventListener("storage", this.storageHandler);
      this.storageHandler = null;
    }

    // Clear all callbacks
    this.callbacks.clear();
    this.values.clear();

    console.log('[LocalStorageManager] Destroyed and cleaned up resources');
  }
}

export const localStorage = new LocalStorageManager();
export default localStorage;
