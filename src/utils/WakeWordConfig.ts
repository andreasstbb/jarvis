/**
 * Wake Word Configuration Management
 *
 * Handles storage and retrieval of user-customized wake word settings
 */

import { WakeWordConfig } from '@ai/voiceActivityDetection/WakeWordDetector';
import LocalStorageManager from './LocalStorage';

const STORAGE_KEY = 'jarvis:wake_word_config';

/**
 * Get stored wake word configuration, or return default
 */
export function getWakeWordConfig(): Partial<WakeWordConfig> | null {
  return LocalStorageManager.getItem<Partial<WakeWordConfig>>(STORAGE_KEY);
}

/**
 * Save wake word configuration
 */
export function saveWakeWordConfig(config: Partial<WakeWordConfig>): void {
  LocalStorageManager.setItem(STORAGE_KEY, config);
}

/**
 * Reset to default wake word configuration
 */
export function resetWakeWordConfig(): void {
  LocalStorageManager.removeItem(STORAGE_KEY);
}

/**
 * Add a custom wake word
 */
export function addCustomWakeWord(keyword: string): void {
  const config = getWakeWordConfig() || {};
  const keywords = config.keywords || ['jarvis', 'charmus'];

  if (!keywords.includes(keyword.toLowerCase())) {
    keywords.push(keyword.toLowerCase());
    saveWakeWordConfig({ ...config, keywords });
  }
}

/**
 * Remove a custom wake word
 */
export function removeCustomWakeWord(keyword: string): void {
  const config = getWakeWordConfig() || {};
  const keywords = config.keywords || ['jarvis', 'charmus'];

  const filtered = keywords.filter(k => k !== keyword.toLowerCase());
  saveWakeWordConfig({ ...config, keywords: filtered });
}

/**
 * Get all configured wake words
 */
export function getConfiguredWakeWords(): string[] {
  const config = getWakeWordConfig();
  return config?.keywords || ['jarvis', 'charmus'];
}

/**
 * Update wake word sensitivity (confidence threshold)
 */
export function setWakeWordSensitivity(sensitivity: 'low' | 'medium' | 'high'): void {
  const config = getWakeWordConfig() || {};

  const confidenceMap = {
    low: 0.5,     // Very permissive
    medium: 0.65,  // Balanced
    high: 0.8,    // Strict
  };

  saveWakeWordConfig({
    ...config,
    confidence: confidenceMap[sensitivity],
  });
}

export default {
  get: getWakeWordConfig,
  save: saveWakeWordConfig,
  reset: resetWakeWordConfig,
  addKeyword: addCustomWakeWord,
  removeKeyword: removeCustomWakeWord,
  getKeywords: getConfiguredWakeWords,
  setSensitivity: setWakeWordSensitivity,
};
