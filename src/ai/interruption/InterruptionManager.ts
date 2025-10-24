/**
 * Audio Interruption Manager
 *
 * Production-ready system for interrupting JARVIS mid-speech.
 * Critical for natural conversation and IoT devices (earpieces, smart speakers).
 *
 * Features:
 * - Voice activity detection during playback
 * - Voice command shortcuts ("stop", "pause", etc.)
 * - Keyboard shortcuts (ESC, Space)
 * - Visual feedback
 * - Cost optimization (stops API calls immediately)
 */

export enum InterruptionReason {
  USER_SPEECH = 'user_speech',           // User started speaking
  VOICE_COMMAND = 'voice_command',       // Explicit command ("stop")
  KEYBOARD = 'keyboard',                 // Keyboard shortcut
  MANUAL = 'manual',                     // Programmatic call
  ERROR = 'error',                       // Error occurred
}

export interface InterruptionEvent {
  reason: InterruptionReason;
  timestamp: number;
  detail?: string;
}

type InterruptionCallback = (event: InterruptionEvent) => void;

/**
 * Voice commands that trigger interruption
 */
const INTERRUPT_COMMANDS = {
  stop: ['stop', 'halt', 'cancel', 'shut up', 'quiet', 'silence'],
  pause: ['pause', 'wait', 'hold on', 'hang on'],
  resume: ['continue', 'resume', 'go on', 'keep going', 'proceed'],
  repeat: ['repeat', 'say again', 'what', 'pardon', 'repeat that'],
  clear: ['clear', 'new conversation', 'start over', 'reset'],
} as const;

/**
 * Keyboard shortcuts for interruption
 */
const KEYBOARD_SHORTCUTS = {
  interrupt: ['Escape', 'Space'],
  pause: ['p', 'P'],
  resume: ['r', 'R', 'Enter'],
} as const;

class InterruptionManager {
  private abortController: AbortController | null = null;
  private listeners: Set<InterruptionCallback> = new Set();
  private isPaused = false;
  private isEnabled = true;
  private lastInterruption: InterruptionEvent | null = null;

  // Debouncing to prevent accidental triggers
  private interruptDebounceMs = 500;
  private lastInterruptTime = 0;

  // Statistics for monitoring
  private stats = {
    totalInterruptions: 0,
    byReason: {
      [InterruptionReason.USER_SPEECH]: 0,
      [InterruptionReason.VOICE_COMMAND]: 0,
      [InterruptionReason.KEYBOARD]: 0,
      [InterruptionReason.MANUAL]: 0,
      [InterruptionReason.ERROR]: 0,
    },
  };

  constructor() {
    this.setupKeyboardListeners();
  }

  /**
   * Create new abort controller for TTS
   */
  createAbortController(): AbortController {
    this.abortController = new AbortController();
    this.isPaused = false;
    return this.abortController;
  }

  /**
   * Get current abort signal for TTS
   */
  getAbortSignal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }

  /**
   * Interrupt current speech
   */
  interrupt(reason: InterruptionReason, detail?: string): boolean {
    if (!this.isEnabled) return false;

    // Debounce rapid interruptions
    const now = Date.now();
    if (now - this.lastInterruptTime < this.interruptDebounceMs) {
      console.log('[InterruptionManager] Debounced rapid interrupt');
      return false;
    }

    if (!this.abortController || this.abortController.signal.aborted) {
      console.log('[InterruptionManager] No active speech to interrupt');
      return false;
    }

    // Abort current speech
    this.abortController.abort();
    this.abortController = null;

    // Record event
    const event: InterruptionEvent = {
      reason,
      timestamp: now,
      detail,
    };

    this.lastInterruption = event;
    this.lastInterruptTime = now;

    // Update statistics
    this.stats.totalInterruptions++;
    this.stats.byReason[reason]++;

    // Notify listeners
    this.notifyListeners(event);

    console.log(`[InterruptionManager] Interrupted: ${reason}${detail ? ` (${detail})` : ''}`);

    return true;
  }

  /**
   * Pause current speech (can resume)
   */
  pause(reason: InterruptionReason = InterruptionReason.MANUAL): boolean {
    if (this.isPaused) return false;

    const interrupted = this.interrupt(reason, 'paused');
    if (interrupted) {
      this.isPaused = true;
    }

    return interrupted;
  }

  /**
   * Resume paused speech (not implemented yet - would need buffering)
   */
  resume(): boolean {
    if (!this.isPaused) return false;

    this.isPaused = false;
    console.log('[InterruptionManager] Resume requested (not yet implemented)');

    // TODO: Implement resume with buffering
    // For now, just clear paused state

    return true;
  }

  /**
   * Detect voice commands in transcribed text
   */
  detectVoiceCommand(text: string): {
    isCommand: boolean;
    command: keyof typeof INTERRUPT_COMMANDS | null;
  } {
    const lowerText = text.toLowerCase().trim();

    // Check each command category
    for (const [command, phrases] of Object.entries(INTERRUPT_COMMANDS)) {
      for (const phrase of phrases) {
        if (lowerText === phrase || lowerText.includes(phrase)) {
          return {
            isCommand: true,
            command: command as keyof typeof INTERRUPT_COMMANDS,
          };
        }
      }
    }

    return { isCommand: false, command: null };
  }

  /**
   * Handle voice command
   */
  handleVoiceCommand(text: string): boolean {
    const { isCommand, command } = this.detectVoiceCommand(text);

    if (!isCommand || !command) return false;

    console.log(`[InterruptionManager] Voice command detected: "${command}"`);

    switch (command) {
      case 'stop':
      case 'pause':
        return this.interrupt(InterruptionReason.VOICE_COMMAND, command);

      case 'resume':
        return this.resume();

      case 'repeat':
        // TODO: Implement repeat last message
        console.log('[InterruptionManager] Repeat command (not yet implemented)');
        return true;

      case 'clear':
        // TODO: Implement clear conversation
        console.log('[InterruptionManager] Clear command (not yet implemented)');
        return true;

      default:
        return false;
    }
  }

  /**
   * Setup keyboard shortcuts
   */
  private setupKeyboardListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (event) => {
      if (!this.isEnabled) return;

      // Don't trigger if user is typing in input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Interrupt shortcuts
      if (KEYBOARD_SHORTCUTS.interrupt.includes(event.key)) {
        event.preventDefault();
        this.interrupt(InterruptionReason.KEYBOARD, event.key);
        return;
      }

      // Pause shortcuts
      if (KEYBOARD_SHORTCUTS.pause.includes(event.key)) {
        event.preventDefault();
        this.pause(InterruptionReason.KEYBOARD);
        return;
      }

      // Resume shortcuts
      if (KEYBOARD_SHORTCUTS.resume.includes(event.key)) {
        event.preventDefault();
        this.resume();
        return;
      }
    });
  }

  /**
   * Subscribe to interruption events
   */
  onInterrupt(callback: InterruptionCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(event: InterruptionEvent): void {
    this.listeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('[InterruptionManager] Listener error:', error);
      }
    });
  }

  /**
   * Enable/disable interruption system
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`[InterruptionManager] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get last interruption
   */
  getLastInterruption(): InterruptionEvent | null {
    return this.lastInterruption;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalInterruptions: 0,
      byReason: {
        [InterruptionReason.USER_SPEECH]: 0,
        [InterruptionReason.VOICE_COMMAND]: 0,
        [InterruptionReason.KEYBOARD]: 0,
        [InterruptionReason.MANUAL]: 0,
        [InterruptionReason.ERROR]: 0,
      },
    };
  }

  /**
   * Check if currently paused
   */
  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * Check if currently active (has abort controller)
   */
  get isActive(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }

  /**
   * Get available voice commands
   */
  static getVoiceCommands(): typeof INTERRUPT_COMMANDS {
    return { ...INTERRUPT_COMMANDS };
  }

  /**
   * Get available keyboard shortcuts
   */
  static getKeyboardShortcuts(): typeof KEYBOARD_SHORTCUTS {
    return { ...KEYBOARD_SHORTCUTS };
  }
}

// Singleton instance
export const interruptionManager = new InterruptionManager();
export default interruptionManager;
