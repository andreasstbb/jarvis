/**
 * React Hook for Audio Interruption
 *
 * Integrates interruption manager with JARVIS voice system.
 * Handles:
 * - Speech detection during playback
 * - Voice command detection
 * - Abort controller management
 * - Visual feedback
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import interruptionManager, {
  InterruptionEvent,
  InterruptionReason,
} from './InterruptionManager';

export interface UseInterruptionOptions {
  enabled?: boolean;
  onInterrupt?: (event: InterruptionEvent) => void;
  detectSpeechDuringPlayback?: boolean;
  detectVoiceCommands?: boolean;
}

export interface UseInterruptionReturn {
  // Abort controller for current speech
  abortController: AbortController;
  abortSignal: AbortSignal;

  // Interruption methods
  interrupt: (reason?: InterruptionReason) => boolean;
  pause: () => boolean;
  resume: () => boolean;

  // State
  isPaused: boolean;
  isActive: boolean;
  lastInterruption: InterruptionEvent | null;

  // Voice command detection
  handleTranscription: (text: string, isSpeaking: boolean) => boolean;

  // Create new abort controller (call when starting new speech)
  createNewController: () => AbortController;
}

/**
 * Hook for managing audio interruption
 */
export function useInterruption(
  options: UseInterruptionOptions = {}
): UseInterruptionReturn {
  const {
    enabled = true,
    onInterrupt,
    detectSpeechDuringPlayback = true,
    detectVoiceCommands = true,
  } = options;

  const [abortController, setAbortController] = useState<AbortController>(
    () => interruptionManager.createAbortController()
  );

  const [isPaused, setIsPaused] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [lastInterruption, setLastInterruption] = useState<InterruptionEvent | null>(null);

  // Track if currently speaking
  const isSpeakingRef = useRef(false);

  // Enable/disable interruption manager
  useEffect(() => {
    interruptionManager.setEnabled(enabled);
  }, [enabled]);

  // Subscribe to interruption events
  useEffect(() => {
    const unsubscribe = interruptionManager.onInterrupt((event) => {
      setLastInterruption(event);
      setIsPaused(interruptionManager.paused);
      setIsActive(interruptionManager.isActive);

      // Call user callback
      onInterrupt?.(event);

      // Log for debugging/telemetry
      console.log('[useInterruption] Interrupted:', {
        reason: event.reason,
        detail: event.detail,
        timestamp: new Date(event.timestamp).toISOString(),
      });
    });

    return unsubscribe;
  }, [onInterrupt]);

  // Create new abort controller
  const createNewController = useCallback((): AbortController => {
    const newController = interruptionManager.createAbortController();
    setAbortController(newController);
    setIsActive(true);
    setIsPaused(false);
    isSpeakingRef.current = true;

    // Listen for abort
    newController.signal.addEventListener(
      'abort',
      () => {
        isSpeakingRef.current = false;
        setIsActive(false);
      },
      { once: true }
    );

    return newController;
  }, []);

  // Interrupt current speech
  const interrupt = useCallback((reason: InterruptionReason = InterruptionReason.MANUAL): boolean => {
    return interruptionManager.interrupt(reason);
  }, []);

  // Pause speech
  const pause = useCallback((): boolean => {
    const paused = interruptionManager.pause();
    if (paused) {
      setIsPaused(true);
    }
    return paused;
  }, []);

  // Resume speech
  const resume = useCallback((): boolean => {
    const resumed = interruptionManager.resume();
    if (resumed) {
      setIsPaused(false);
    }
    return resumed;
  }, []);

  // Handle transcription (from VAD)
  const handleTranscription = useCallback(
    (text: string, isSpeaking: boolean): boolean => {
      if (!enabled) return false;

      isSpeakingRef.current = isSpeaking;

      // Check for voice commands first
      if (detectVoiceCommands) {
        const handled = interruptionManager.handleVoiceCommand(text);
        if (handled) {
          return true;
        }
      }

      // If JARVIS is speaking and user starts talking, interrupt
      if (detectSpeechDuringPlayback && isSpeaking && text.trim().length > 0) {
        // Filter out very short utterances (might be noise)
        if (text.split(/\s+/).length >= 2) {
          // At least 2 words
          console.log('[useInterruption] User started speaking during playback');
          return interrupt(InterruptionReason.USER_SPEECH);
        }
      }

      return false;
    },
    [enabled, detectSpeechDuringPlayback, detectVoiceCommands, interrupt]
  );

  return {
    abortController,
    abortSignal: abortController.signal,
    interrupt,
    pause,
    resume,
    isPaused,
    isActive,
    lastInterruption,
    handleTranscription,
    createNewController,
  };
}

export default useInterruption;
