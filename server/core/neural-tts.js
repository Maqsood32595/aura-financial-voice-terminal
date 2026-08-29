import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/**
 * Free Studio-Grade Neural TTS Engine
 * Uses Microsoft Azure Neural Voices (JennyNeural / AriaNeural)
 * completely free with 0 API key requirements.
 */
export class NeuralTtsEngine {
  constructor() {
    this.tts = new MsEdgeTTS();
    this.voice = 'en-US-JennyNeural'; // Ultra-natural conversational female
    this.format = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
  }

  /**
   * Synthesize text to Base64 MP3 Audio Buffer
   * @param {string} text 
   * @param {string} [voiceName] 
   * @returns {Promise<string>} base64 audio string
   */
  async synthesizeToBase64(text, voiceName = 'en-US-JennyNeural') {
    try {
      const ttsInstance = new MsEdgeTTS();
      await ttsInstance.setMetadata(voiceName, this.format);
      
      const { audioStream } = ttsInstance.toStream(text);
      const chunks = [];

      return new Promise((resolve, reject) => {
        audioStream.on('data', chunk => chunks.push(chunk));
        audioStream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer.toString('base64'));
        });
        audioStream.on('error', err => reject(err));
      });
    } catch (err) {
      console.warn(`[Neural TTS Error] ${err.message}`);
      return null;
    }
  }
}

export const neuralTts = new NeuralTtsEngine();
