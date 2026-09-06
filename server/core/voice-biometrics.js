/**
 * In-RAM Ephemeral Speaker Biometric Voice-Lock & Distance Gate
 * 0 disk I/O, completely wiped on session teardown
 */
export class VoiceBiometricsEngine {
  constructor() {
    this.enrolledProfiles = new Map();
    this.SIMILARITY_THRESHOLD = 0.62;
    this.PROXIMITY_MIN_THRESHOLD = 0.55;
  }

  enrollSpeaker(sessionId, featureVector, fundamentalFreq = 140, proximityScore = 0.85) {
    const profile = {
      sessionId,
      vector: Array.from(featureVector),
      f0: fundamentalFreq,
      proximity: proximityScore,
      enrolledAt: new Date().toISOString()
    };
    this.enrolledProfiles.set(sessionId, profile);
    return profile;
  }

  cosineSimilarity(vecA, vecB) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  verifySpeaker(sessionId, inputVector, inputProximity = 0.85) {
    const profile = this.enrolledProfiles.get(sessionId);
    if (!profile) return { isMatch: true, similarity: 1.0, isProximityAccepted: true };

    if (inputProximity < this.PROXIMITY_MIN_THRESHOLD) {
      return {
        isMatch: false,
        similarity: 0,
        isProximityAccepted: false,
        reason: 'DISTANT_BACKGROUND_VOICE'
      };
    }

    const similarity = this.cosineSimilarity(profile.vector, inputVector);
    const isMatch = similarity >= this.SIMILARITY_THRESHOLD;

    return {
      isMatch,
      similarity: Number(similarity.toFixed(3)),
      isProximityAccepted: true,
      reason: isMatch ? 'AUTHORIZED_SPEAKER' : 'INTRUDER_VOICE_REJECTED'
    };
  }

  wipeProfile(sessionId) {
    this.enrolledProfiles.delete(sessionId);
  }
}

export const voiceBiometrics = new VoiceBiometricsEngine();
