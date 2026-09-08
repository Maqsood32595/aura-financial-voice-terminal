/**
 * Lightweight Local STT Buffer & Voice Streaming in RAM
 * Handles real-time PCM16 audio ring buffering, VAD energy detection, and zero-disk stream aggregation.
 * RAM Footprint: ~40 MB
 */
export class InRamSttStreamEngine {
  constructor(maxRingBufferSize = 16000 * 2 * 10) { // 10 seconds of 16kHz 16-bit PCM = 320 KB per active stream
    this.maxRingBufferSize = maxRingBufferSize;
    this.activeSessions = new Map();
  }

  /**
   * Register or retrieve an active session ring buffer
   */
  getOrCreateSession(sessionId) {
    if (!this.activeSessions.has(sessionId)) {
      this.activeSessions.set(sessionId, {
        buffer: Buffer.alloc(this.maxRingBufferSize),
        offset: 0,
        totalBytesReceived: 0,
        lastChunkTime: Date.now(),
        isSpeechActive: false,
        speechEnergy: 0
      });
    }
    return this.activeSessions.get(sessionId);
  }

  /**
   * Ingest raw PCM audio chunk into RAM ring buffer
   */
  ingestAudioChunk(sessionId, chunk) {
    const session = this.getOrCreateSession(sessionId);
    const chunkLength = chunk.length;

    // Check if chunk fits in buffer
    if (session.offset + chunkLength <= this.maxRingBufferSize) {
      chunk.copy(session.buffer, session.offset);
      session.offset += chunkLength;
    } else {
      // Shift buffer to maintain newest audio (circular FIFO)
      const overflow = (session.offset + chunkLength) - this.maxRingBufferSize;
      session.buffer.copy(session.buffer, 0, overflow, session.offset);
      session.offset -= overflow;
      chunk.copy(session.buffer, session.offset);
      session.offset += chunkLength;
    }

    session.totalBytesReceived += chunkLength;
    session.lastChunkTime = Date.now();

    // Compute instantaneous RMS energy for VAD in RAM
    session.speechEnergy = this.calculateRmsEnergy(chunk);
    session.isSpeechActive = session.speechEnergy > 0.02;

    return {
      bytesBuffered: session.offset,
      isSpeechActive: session.isSpeechActive,
      energy: Number(session.speechEnergy.toFixed(4))
    };
  }

  /**
   * Calculate RMS energy of 16-bit linear PCM chunk
   */
  calculateRmsEnergy(chunk) {
    if (chunk.length < 2) return 0;
    let sumSquares = 0;
    const sampleCount = Math.floor(chunk.length / 2);
    for (let i = 0; i < sampleCount; i++) {
      const sample = chunk.readInt16LE(i * 2) / 32768.0;
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / sampleCount);
  }

  /**
   * Flush and retrieve complete audio buffer for transcription
   */
  flushAudio(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.offset === 0) return null;

    const audioData = Buffer.alloc(session.offset);
    session.buffer.copy(audioData, 0, 0, session.offset);
    session.offset = 0;
    return audioData;
  }

  /**
   * Teardown session from RAM
   */
  teardownSession(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      this.activeSessions.delete(sessionId);
    }
  }
}

export const inRamSttStream = new InRamSttStreamEngine();
