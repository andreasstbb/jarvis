# Wake Word Detection System

## Overview

The improved wake word detection system provides reliable, configurable voice activation with multiple detection methods including exact matching, fuzzy matching, and phonetic matching.

## Features

### 1. Multiple Detection Methods

- **Exact Match**: Direct string matching (highest confidence: 100%)
- **Variation Match**: Pre-configured common mishearings (90% confidence)
- **Fuzzy Match**: Levenshtein distance-based matching for typos (variable confidence)
- **Phonetic Match**: Sound-based matching for similar pronunciations (60-80% confidence)

### 2. Configurable Settings

Users can customize:
- Custom wake words
- Confidence threshold
- Enable/disable fuzzy and phonetic matching
- Maximum edit distance for fuzzy matching

### 3. Common Mishearings Handled

The system automatically handles common Speech-to-Text errors:
- jarvis → jarifas, jarvas, jarv, jarvus, jervis
- charmus → charvis, charmis, jarmus

## Usage

### Basic Usage

```typescript
import detectWakeWord from '@ai/voiceActivityDetection/WakeWordDetector';

// Detect wake word in transcribed text
const result = detectWakeWord("hey jarvis");

if (result.detected) {
  console.log(`Wake word detected: ${result.matchedKeyword}`);
  console.log(`Confidence: ${result.confidence * 100}%`);
  console.log(`Method: ${result.method}`);
}
```

### Custom Configuration

```typescript
import detectWakeWord, { WakeWordConfig } from '@ai/voiceActivityDetection/WakeWordDetector';

const config: Partial<WakeWordConfig> = {
  keywords: ['jarvis', 'friday', 'computer'],
  confidence: 0.7, // 70% minimum confidence
  useFuzzy: true,
  usePhonetic: true,
  maxEditDistance: 2,
};

const result = detectWakeWord("hey freyday", config);
// Will match "friday" using fuzzy matching
```

### Using Configuration API

```typescript
import WakeWordConfigManager from '@utils/WakeWordConfig';

// Add custom wake word
WakeWordConfigManager.addKeyword('alfred');

// Set sensitivity level
WakeWordConfigManager.setSensitivity('high'); // low, medium, or high

// Get all configured keywords
const keywords = WakeWordConfigManager.getKeywords();
```

## Configuration Storage

Wake word settings are stored in localStorage under the key `jarvis:wake_word_config`.

### Example Stored Configuration

```json
{
  "keywords": ["jarvis", "charmus", "friday"],
  "confidence": 0.65,
  "usePhonetic": true,
  "useFuzzy": true,
  "maxEditDistance": 2
}
```

## Detection Methods Explained

### 1. Exact Match
Checks if the wake word appears exactly in the transcribed text (case-insensitive).

```typescript
"Hey Jarvis, what's the weather?" → ✓ Detected (100%)
```

### 2. Variation Match
Checks against known mishearings and variations.

```typescript
"Hey Jarifas, what's the weather?" → ✓ Detected (90%)
```

### 3. Fuzzy Match
Uses Levenshtein distance to find words within the specified edit distance.

```typescript
"Hey Jarvs, what's the weather?" → ✓ Detected (~80%)
// Distance of 1 from "jarvis"
```

### 4. Phonetic Match
Converts words to phonetic codes and compares them.

```typescript
"Hey Jervus, what's the weather?" → ✓ Detected (~70%)
// "Jervus" sounds similar to "Jarvis"
```

## Sensitivity Levels

### Low (confidence: 0.5)
- Very permissive
- May have false positives
- Best for noisy environments or accented speech

### Medium (confidence: 0.65) - **DEFAULT**
- Balanced approach
- Good for most use cases
- Reduces false positives while maintaining good detection

### High (confidence: 0.8)
- Strict matching
- Minimizes false positives
- May miss some valid wake words

## Testing

You can test the wake word detector using the built-in test function:

```typescript
import { testWakeWord } from '@ai/voiceActivityDetection/WakeWordDetector';

// Test various inputs
testWakeWord("hey jarvis");        // Exact match
testWakeWord("hey jarifas");       // Variation match
testWakeWord("hey jarvs");         // Fuzzy match
testWakeWord("hey service");       // Phonetic match (may match)
testWakeWord("hello computer");    // No match
```

## Architecture

```
Text Input
    ↓
Extract Words
    ↓
┌────────────────────────┐
│ 1. Exact Match Check   │ → Found? Return (100% confidence)
└────────────────────────┘
    ↓ Not found
┌────────────────────────┐
│ 2. Variation Match     │ → Found? Return (90% confidence)
└────────────────────────┘
    ↓ Not found
┌────────────────────────┐
│ 3. Fuzzy Match         │ → Found? Return (variable confidence)
└────────────────────────┘
    ↓ Not found
┌────────────────────────┐
│ 4. Phonetic Match      │ → Found? Return (60-80% confidence)
└────────────────────────┘
    ↓ Not found
No Match (0% confidence)
```

## Performance Considerations

- **Exact matching**: O(n) where n is text length - very fast
- **Variation matching**: O(n * m) where m is number of variations - fast
- **Fuzzy matching**: O(n * k * w²) where k is keywords, w is word length - moderate
- **Phonetic matching**: O(n * k) - moderate

The system processes methods in order of speed, short-circuiting when a match is found.

## Integration with JARVIS

The wake word detector is automatically integrated into the JARVIS voice interface at `src/ui/jarvis/Jarvis.tsx`.

When the VAD (Voice Activity Detection) captures speech:
1. Speech is transcribed using Whisper STT
2. The transcription is passed to the wake word detector
3. If detected, JARVIS activates and processes the command
4. Detection details are logged to console for debugging

## Future Improvements

Potential enhancements for v2:

1. **Dedicated Wake Word Engine**: Integrate Picovoice Porcupine for offline wake word detection
2. **Machine Learning**: Train custom model on user's voice
3. **Multi-Language Support**: Detect wake words in different languages
4. **Continuous Learning**: Adapt to user's pronunciation over time
5. **Voice Biometrics**: Recognize specific users by voice
6. **Background Noise Adaptation**: Adjust thresholds based on environment

## Troubleshooting

### Wake word not detected

1. Check console logs for detection details
2. Lower the confidence threshold
3. Add common variations of your wake word
4. Verify Whisper STT is working correctly

### Too many false positives

1. Increase the confidence threshold
2. Disable phonetic matching
3. Reduce max edit distance
4. Remove ambiguous variations

### Specific word not working

1. Test with `testWakeWord()` function
2. Add the word to variations list
3. Check phonetic encoding
4. Verify STT transcription accuracy

## API Reference

### `detectWakeWord(text, config?): DetectionResult`

Main detection function.

**Parameters:**
- `text` (string): The transcribed text to analyze
- `config` (Partial<WakeWordConfig>): Optional configuration override

**Returns:** `DetectionResult`
```typescript
{
  detected: boolean;
  confidence: number; // 0-1
  matchedKeyword: string | null;
  method: 'exact' | 'fuzzy' | 'phonetic' | 'variation' | null;
}
```

### Configuration Functions

- `getWakeWordConfig()`: Get stored configuration
- `saveWakeWordConfig(config)`: Save configuration
- `resetWakeWordConfig()`: Reset to defaults
- `addCustomWakeWord(keyword)`: Add a wake word
- `removeCustomWakeWord(keyword)`: Remove a wake word
- `setWakeWordSensitivity(level)`: Set sensitivity (low/medium/high)
- `getConfiguredWakeWords()`: Get all keywords

## Examples

See `src/ui/jarvis/Jarvis.tsx` for a complete integration example.

---

**Version**: 1.0.0
**Last Updated**: 2025-10-24
**Author**: Claude (AI Assistant)
