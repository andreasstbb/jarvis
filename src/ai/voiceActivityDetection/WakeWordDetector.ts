/**
 * Advanced Wake Word Detection System
 *
 * Provides fuzzy matching, phonetic matching, and configurable wake words
 * to improve reliability of voice activation.
 */

export interface WakeWordConfig {
  /** Primary wake words */
  keywords: string[];
  /** Known variations and common mishearings */
  variations: string[];
  /** Minimum confidence threshold (0-1) */
  confidence: number;
  /** Enable phonetic matching */
  usePhonetic: boolean;
  /** Enable fuzzy matching */
  useFuzzy: boolean;
  /** Maximum edit distance for fuzzy matching */
  maxEditDistance: number;
}

export interface DetectionResult {
  detected: boolean;
  confidence: number;
  matchedKeyword: string | null;
  method: 'exact' | 'fuzzy' | 'phonetic' | 'variation' | null;
}

// Default configuration
const DEFAULT_CONFIG: WakeWordConfig = {
  keywords: ['jarvis', 'charmus'],
  variations: [
    // Common Whisper mishearings
    'jarifas', 'jarvas', 'jarvis.', 'jarvis,',
    'charvis', 'charmis', 'jarmus', 'jarvus',
    'jervis', 'jarv', 'jarvise', 'jarvas',
    'char miss', 'jar miss', 'jar vis',
    // Phonetically similar
    'service', // sometimes confused
    'harvey', 'marvis', // rare but possible
  ],
  confidence: 0.6,
  usePhonetic: true,
  useFuzzy: true,
  maxEditDistance: 2,
};

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Simple phonetic encoding (Soundex-like)
 * Groups similar sounding consonants together
 */
function phoneticEncode(word: string): string {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.length === 0) return '';

  // Keep first letter
  let code = normalized[0];

  // Phonetic groupings
  const groups: { [key: string]: string } = {
    'bfpv': '1',
    'cgjkqsxz': '2',
    'dt': '3',
    'l': '4',
    'mn': '5',
    'r': '6',
  };

  // Map consonants to codes
  for (let i = 1; i < normalized.length; i++) {
    const char = normalized[i];
    for (const [group, digit] of Object.entries(groups)) {
      if (group.includes(char)) {
        // Don't add duplicate adjacent codes
        if (code[code.length - 1] !== digit) {
          code += digit;
        }
        break;
      }
    }
  }

  return code.slice(0, 6); // Limit length
}

/**
 * Extract words from text and find potential wake word matches
 */
function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Check for exact match (including variations)
 */
function checkExactMatch(
  text: string,
  keywords: string[],
  variations: string[]
): { found: boolean; keyword: string | null; isVariation: boolean } {
  const normalized = text.toLowerCase();

  // Check primary keywords
  for (const keyword of keywords) {
    if (normalized.includes(keyword.toLowerCase())) {
      return { found: true, keyword, isVariation: false };
    }
  }

  // Check variations
  for (const variation of variations) {
    if (normalized.includes(variation.toLowerCase())) {
      return { found: true, keyword: variation, isVariation: true };
    }
  }

  return { found: false, keyword: null, isVariation: false };
}

/**
 * Check for fuzzy match using Levenshtein distance
 */
function checkFuzzyMatch(
  words: string[],
  keywords: string[],
  maxDistance: number
): { found: boolean; keyword: string | null; confidence: number } {
  let bestMatch = { distance: Infinity, keyword: null as string | null };

  for (const word of words) {
    for (const keyword of keywords) {
      const distance = levenshteinDistance(word, keyword.toLowerCase());
      if (distance <= maxDistance && distance < bestMatch.distance) {
        bestMatch = { distance, keyword };
      }
    }
  }

  if (bestMatch.keyword) {
    // Convert distance to confidence (inverse relationship)
    const confidence = 1 - (bestMatch.distance / (maxDistance + 1));
    return { found: true, keyword: bestMatch.keyword, confidence };
  }

  return { found: false, keyword: null, confidence: 0 };
}

/**
 * Check for phonetic match
 */
function checkPhoneticMatch(
  words: string[],
  keywords: string[]
): { found: boolean; keyword: string | null; confidence: number } {
  const keywordPhonetics = keywords.map(k => ({
    word: k,
    phonetic: phoneticEncode(k)
  }));

  for (const word of words) {
    const wordPhonetic = phoneticEncode(word);
    if (wordPhonetic.length < 3) continue; // Skip very short words

    for (const { word: keyword, phonetic } of keywordPhonetics) {
      // Exact phonetic match
      if (wordPhonetic === phonetic) {
        return { found: true, keyword, confidence: 0.8 };
      }

      // Similar phonetic (starts with same code)
      if (wordPhonetic.length >= 3 && phonetic.length >= 3) {
        if (wordPhonetic.slice(0, 3) === phonetic.slice(0, 3)) {
          return { found: true, keyword, confidence: 0.6 };
        }
      }
    }
  }

  return { found: false, keyword: null, confidence: 0 };
}

/**
 * Main wake word detection function
 */
export function detectWakeWord(
  text: string,
  config: Partial<WakeWordConfig> = {}
): DetectionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Empty input
  if (!text || text.trim().length === 0) {
    return {
      detected: false,
      confidence: 0,
      matchedKeyword: null,
      method: null,
    };
  }

  // 1. Check for exact match (highest confidence)
  const exactMatch = checkExactMatch(text, cfg.keywords, cfg.variations);
  if (exactMatch.found) {
    return {
      detected: true,
      confidence: exactMatch.isVariation ? 0.9 : 1.0,
      matchedKeyword: exactMatch.keyword,
      method: exactMatch.isVariation ? 'variation' : 'exact',
    };
  }

  // Extract individual words for fuzzy and phonetic matching
  const words = extractWords(text);
  if (words.length === 0) {
    return {
      detected: false,
      confidence: 0,
      matchedKeyword: null,
      method: null,
    };
  }

  // 2. Check for fuzzy match
  if (cfg.useFuzzy) {
    const fuzzyMatch = checkFuzzyMatch(words, cfg.keywords, cfg.maxEditDistance);
    if (fuzzyMatch.found && fuzzyMatch.confidence >= cfg.confidence) {
      return {
        detected: true,
        confidence: fuzzyMatch.confidence,
        matchedKeyword: fuzzyMatch.keyword,
        method: 'fuzzy',
      };
    }
  }

  // 3. Check for phonetic match
  if (cfg.usePhonetic) {
    const phoneticMatch = checkPhoneticMatch(words, cfg.keywords);
    if (phoneticMatch.found && phoneticMatch.confidence >= cfg.confidence) {
      return {
        detected: true,
        confidence: phoneticMatch.confidence,
        matchedKeyword: phoneticMatch.keyword,
        method: 'phonetic',
      };
    }
  }

  // No match found
  return {
    detected: false,
    confidence: 0,
    matchedKeyword: null,
    method: null,
  };
}

/**
 * Get current configuration
 */
export function getDefaultConfig(): WakeWordConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Utility to test wake word detection
 */
export function testWakeWord(testText: string, config?: Partial<WakeWordConfig>): void {
  const result = detectWakeWord(testText, config);
  console.log(`[WakeWordDetector] Test: "${testText}"`);
  console.log(`  Detected: ${result.detected}`);
  console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`  Matched: ${result.matchedKeyword || 'none'}`);
  console.log(`  Method: ${result.method || 'none'}`);
}

export default detectWakeWord;
