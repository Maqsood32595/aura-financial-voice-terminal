/**
 * SEC EDGAR 10-K Financial Voice Agent Frontend Engine
 * Push-To-Talk (Hold Spacebar), Port 5030 Biometrics, AudioWorklet VAD & Live Visualizer
 */

// State
let ws = null;
let currentSessionId = null;
let isCallActive = false;
let isSpeaking = false;
let currentAudio = null;
let synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

let mediaStream = null;
let mediaRecorder = null;
let audioCtx = null;
let analyserNode = null;
let micSource = null;
let vadAnimationId = null;
let recordedAudioChunks = [];
let isUserSpeakingMic = false;
let micSilenceTimer = null;
let noiseGateThreshold = 0.038;
let speechStartTime = 0;

// Push To Talk (Spacebar) State
let isSpacebarHeld = false;
let isPttRecording = false;

// Biometric Caller Voice-Locking & Proximity Gate State (Port 5030 Architecture)
let isVoiceLocked = false;
let lockedVoiceVector = null;
let lockedF0 = 140;
let lockedProximity = 0.85;
let activeSpeechFrames = [];
let activeSpeechF0s = [];
let activeSpeechProximities = [];
let bargeInConsecutiveFrames = 0;

// Engine Mode State ('local' | 'assemblyai')
let currentEngineMode = localStorage.getItem('aura_engine_mode') || 'assemblyai';
let aaiWs = null;
let aaiToken = null;
let aaiAgentId = null;
let playbackAudioCtx = null;
let nextPcmPlayTime = 0;
let activePcmSources = [];

// DOM Elements
const wsStatus = document.getElementById('wsStatus');
const fsmStageDisplay = document.getElementById('fsmStageDisplay');
const inventoryTbody = document.getElementById('inventoryTbody');
const filingsCount = document.getElementById('filingsCount');
const sqlLogOutput = document.getElementById('sqlLogOutput');
const sqlLatencyTag = document.getElementById('sqlLatencyTag');
const activeEngineBadge = document.getElementById('activeEngineBadge');
const btnModeLocal = document.getElementById('btnModeLocal');
const btnModeAssembly = document.getElementById('btnModeAssembly');

const btnPushToTalk = document.getElementById('btnPushToTalk');
const pttLabel = document.getElementById('pttLabel');
const btnToggleCall = document.getElementById('btnToggleCall');
const btnCallText = document.getElementById('btnCallText');
const btnBargeIn = document.getElementById('btnBargeIn');
const noiseGateSlider = document.getElementById('noiseGateSlider');
const noiseGateVal = document.getElementById('noiseGateVal');
const lockMatchVal = document.getElementById('lockMatchVal');
const speechStateLabel = document.getElementById('speechStateLabel');
const transcriptBox = document.getElementById('transcriptBox');
const textInput = document.getElementById('textInput');
const btnSendText = document.getElementById('btnSendText');
const turnLatencyTag = document.getElementById('turnLatencyTag');

const btnOpenNotepad = document.getElementById('btnOpenNotepad');
const notepadModal = document.getElementById('notepadModal');
const btnCloseNotepad = document.getElementById('btnCloseNotepad');
const notepadContent = document.getElementById('notepadContent');
const btnClearNotepad = document.getElementById('btnClearNotepad');
const btnRefreshNotepad = document.getElementById('btnRefreshNotepad');
const canvas = document.getElementById('audioVisualizerCanvas');
const canvasCtx = canvas.getContext('2d');

// 1. Dual-Engine Switcher & WebSocket Management
function setEngineMode(mode) {
  currentEngineMode = mode;
  localStorage.setItem('aura_engine_mode', mode);

  // Always maintain local WebSocket connection for In-RAM database and telemetry
  initWebSocket();

  if (mode === 'assemblyai') {
    if (btnModeAssembly) btnModeAssembly.classList.add('active');
    if (btnModeLocal) btnModeLocal.classList.remove('active');
    if (activeEngineBadge) {
      activeEngineBadge.textContent = '🎙️ ASSEMBLYAI 24kHz NEURAL CLOUD STREAM';
      activeEngineBadge.style.color = '#10b981';
      activeEngineBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    }
    initAssemblyAiEngine();
  } else {
    if (btnModeLocal) btnModeLocal.classList.add('active');
    if (btnModeAssembly) btnModeAssembly.classList.remove('active');
    if (activeEngineBadge) {
      activeEngineBadge.textContent = '⚡ IN-RAM PGLITE DIALECTIC BRAIN';
      activeEngineBadge.style.color = '#06b6d4';
      activeEngineBadge.style.borderColor = 'rgba(6, 182, 212, 0.4)';
    }
    if (aaiWs) {
      try { aaiWs.close(); } catch {}
      aaiWs = null;
    }
  }
}

// 2. AssemblyAI 24kHz PCM Web Audio Player with Gapless Queue & Visualizer Binding
let playbackAnalyserNode = null;

function playPcmBase64(base64Data) {
  try {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    if (!playbackAudioCtx) {
      playbackAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      try {
        playbackAnalyserNode = playbackAudioCtx.createAnalyser();
        playbackAnalyserNode.fftSize = 512;
        playbackAnalyserNode.connect(playbackAudioCtx.destination);
      } catch {}
    }
    if (playbackAudioCtx.state === 'suspended') {
      playbackAudioCtx.resume();
    }

    const audioBuffer = playbackAudioCtx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = playbackAudioCtx.createBufferSource();
    source.buffer = audioBuffer;

    if (playbackAnalyserNode) {
      source.connect(playbackAnalyserNode);
    } else {
      source.connect(playbackAudioCtx.destination);
    }

    const startTime = Math.max(playbackAudioCtx.currentTime, nextPcmPlayTime);
    source.start(startTime);
    nextPcmPlayTime = startTime + audioBuffer.duration;

    activePcmSources.push(source);
    isSpeaking = true;
    speechStateLabel.textContent = '🎙️ AURA SPEAKING (AssemblyAI 24kHz Voice Stream)...';

    source.onended = () => {
      activePcmSources = activePcmSources.filter(s => s !== source);
      if (activePcmSources.length === 0) {
        isSpeaking = false;
        speechStateLabel.textContent = isCallActive ? 'LISTENING (Hands-Free)...' : 'HOLD SPACEBAR TO SPEAK';
      }
    };
  } catch (err) {
    console.error('PCM Audio Decode Error:', err);
  }
}

function flushPcmAudioQueue() {
  activePcmSources.forEach(s => {
    try { s.stop(); } catch {}
  });
  activePcmSources = [];
  nextPcmPlayTime = 0;
  isSpeaking = false;
}

// 3. Connect to AssemblyAI Voice Agent API WebSocket
let isAaiConnecting = false;

async function initAssemblyAiEngine() {
  if (isAaiConnecting) return;
  if (aaiWs && (aaiWs.readyState === WebSocket.OPEN || aaiWs.readyState === WebSocket.CONNECTING)) return;

  isAaiConnecting = true;
  try {
    speechStateLabel.textContent = 'CONNECTING TO ASSEMBLYAI VOICE AGENT API...';
    wsStatus.innerHTML = '<span class="status-dot" style="background:#f59e0b"></span><span class="status-label">FETCHING AAI TOKEN...</span>';

    const res = await fetch('/api/v1/assemblyai-token');
    const data = await res.json();
    if (!data.success || !data.token) {
      throw new Error(data.error || 'Failed to mint AssemblyAI token');
    }

    aaiToken = data.token;
    aaiAgentId = data.agentId;

    const url = new URL('wss://agents.assemblyai.com/v1/ws');
    url.searchParams.set('token', aaiToken);

    if (aaiWs) {
      try { aaiWs.close(); } catch {}
    }

    aaiWs = new WebSocket(url);

    aaiWs.onopen = () => {
      isAaiConnecting = false;
      console.log('🎙️ [AssemblyAI WebSocket] Connected to Voice Agent API');
      wsStatus.className = 'status-pill';
      wsStatus.innerHTML = '<span class="status-dot" style="background:#10b981"></span><span class="status-label">ASSEMBLYAI VOICE LIVE</span>';
      speechStateLabel.textContent = 'READY · HOLD SPACEBAR TO TALK WITH ASSEMBLYAI';
      
      // Update session with published agent
      aaiWs.send(JSON.stringify({
        type: 'session.update',
        session: { agent_id: aaiAgentId }
      }));
    };

    aaiWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'session.ready' || msg.type === 'session.updated') {
          console.log('✅ AssemblyAI Session Active:', msg.session_id || msg.type);
        } else if ((msg.type === 'reply.audio' || msg.type === 'output.audio') && (msg.data || msg.audio)) {
          playPcmBase64(msg.data || msg.audio);
        } else if ((msg.type === 'transcript.agent' || msg.type === 'reply.transcript' || msg.type === 'output.transcript') && (msg.text || msg.transcript)) {
          appendMessage('agent', msg.text || msg.transcript);
        } else if ((msg.type === 'transcript.user' || msg.type === 'input.transcript' || msg.type === 'transcript') && (msg.text || msg.transcript)) {
          appendMessage('user', msg.text || msg.transcript);
        } else if (msg.type === 'reply.interrupted' || msg.type === 'output.interrupted') {
          flushPcmAudioQueue();
          speechStateLabel.textContent = '⚡ BARGE-IN: FLUSHED AUDIO STREAM';
        }
      } catch (parseErr) {
        console.warn('AssemblyAI message parsing notice:', parseErr);
      }
    };

    aaiWs.onerror = (err) => {
      isAaiConnecting = false;
      console.error('AssemblyAI WS Error:', err);
    };

    aaiWs.onclose = (event) => {
      isAaiConnecting = false;
      console.log(`🎙️ AssemblyAI WS closed (code: ${event.code}, reason: ${event.reason})`);
      if (currentEngineMode === 'assemblyai' && event.code !== 1000) {
        wsStatus.innerHTML = '<span class="status-dot" style="background:#ef4444"></span><span class="status-label">ASSEMBLYAI RECONNECTING...</span>';
        setTimeout(initAssemblyAiEngine, 3000);
      }
    };
  } catch (err) {
    isAaiConnecting = false;
    console.error('AssemblyAI Engine Init Failed:', err);
    speechStateLabel.textContent = `AAI Error: ${err.message}`;
  }
}

// 4. Initialize Local WebSocket Connection
function initWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    wsStatus.className = 'status-pill';
    wsStatus.innerHTML = '<span class="status-dot"></span><span class="status-label">ONLINE (In-RAM Dialectic Ready)</span>';
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'SESSION_READY') {
      currentSessionId = data.sessionId;
      if (fsmStageDisplay) fsmStageDisplay.textContent = data.fsmState || 'GREETING';
    }

    if (data.type === 'TRANSCRIPTION_RESULT') {
      if (currentEngineMode !== 'assemblyai') {
        appendMessage('user', data.transcript);
      }
      speechStateLabel.textContent = `TRANSCRIBED IN ${data.sttLatencyMs}ms · ANALYZING 10-K...`;
    }

    if (data.type === 'AGENT_VOICE_REPLY') {
      if (currentEngineMode !== 'assemblyai') {
        appendMessage('agent', data.replyText);
        playAgentVoice(data.replyText);
      }
      if (fsmStageDisplay) fsmStageDisplay.textContent = data.fsmState || 'ANALYSIS';
      if (data.telemetry?.totalTurnMs) {
        turnLatencyTag.textContent = `Turn: ${data.telemetry.totalTurnMs}ms | KB: ${data.telemetry.kbLookupMs || 0.05}ms`;
      }
      fetchSqlLogs();
    }
  };

  ws.onclose = () => {
    wsStatus.innerHTML = '<span class="status-dot" style="background:#ef4444;box-shadow:0 0 8px #ef4444"></span><span class="status-label" style="color:#ef4444">RECONNECTING...</span>';
    setTimeout(initWebSocket, 2000);
  };
}

// 5. Append Chat Message (With 1.5s Anti-Duplicate Guard)
let lastUserMessageText = '';
let lastUserMessageTime = 0;

function appendMessage(role, text) {
  if (!text) return;
  const cleanText = text.trim();
  const now = Date.now();

  // Guard against duplicate user messages from parallel STT pipelines
  if (role === 'user' && cleanText.toLowerCase() === lastUserMessageText.toLowerCase() && (now - lastUserMessageTime) < 2000) {
    return;
  }
  if (role === 'user') {
    lastUserMessageText = cleanText;
    lastUserMessageTime = now;
  }

  const bubble = document.createElement('div');
  bubble.className = `bubble ${role === 'user' ? 'user-bubble' : 'agent-bubble'}`;
  
  const speaker = document.createElement('div');
  speaker.className = 'bubble-speaker';
  speaker.textContent = role === 'user' ? 'Analyst (You)' : (currentEngineMode === 'assemblyai' ? 'Aura (AssemblyAI Neural)' : 'Aura (In-RAM Analyst)');
  
  const content = document.createElement('div');
  content.className = 'bubble-text';
  content.textContent = cleanText;

  bubble.appendChild(speaker);
  bubble.appendChild(content);
  transcriptBox.appendChild(bubble);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

// 3. Play Agent Voice via SpeechSynthesis (Local Engine Only)
function playAgentVoice(text) {
  if (currentEngineMode === 'assemblyai') return;
  if (!synth) return;
  
  synth.cancel();
  isSpeaking = true;
  if (btnBargeIn) btnBargeIn.disabled = false;
  speechStateLabel.textContent = 'AURA SPEAKING (Hold Spacebar anytime to interrupt)...';

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;

  const voices = synth.getVoices();
  const naturalVoice = voices.find(v => (v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Victoria'))));
  if (naturalVoice) utterance.voice = naturalVoice;

  utterance.onend = () => {
    isSpeaking = false;
    if (btnBargeIn) btnBargeIn.disabled = true;
    speechStateLabel.textContent = isCallActive ? 'LISTENING (Hands-Free)...' : 'HOLD SPACEBAR TO SPEAK';
  };

  synth.speak(utterance);
}

// 4. Safe Barge-In Interruption Handler
function triggerInstantBargeIn(reason = 'Caller voice interruption') {
  flushPcmAudioQueue();
  if (isSpeaking) {
    if (synth) synth.cancel();
    isSpeaking = false;
    if (btnBargeIn) btnBargeIn.disabled = true;
    speechStateLabel.textContent = '⚡ BARGE-IN: AGENT FLUSHED <20ms';
    if (ws && ws.readyState === WebSocket.OPEN && currentSessionId) {
      ws.send(JSON.stringify({
        type: 'BARGE_IN_TRIGGERED',
        sessionId: currentSessionId,
        reason
      }));
    }
  }
}

// 5. 24-Dimensional Acoustic Feature Vector & Proximity Extractor
function extractAcousticVector() {
  if (!analyserNode || !audioCtx) {
    return { vector24: new Array(24).fill(0.2), f0Hz: 140, proximityScore: 0.85, isNearField: true, crestFactorDb: 12.0, rms: 0.05 };
  }

  const sampleRate = audioCtx.sampleRate || 44100;
  const fftSize = analyserNode.fftSize;
  const freqData = new Float32Array(analyserNode.frequencyBinCount);
  const timeData = new Float32Array(fftSize);

  analyserNode.getFloatFrequencyData(freqData);
  analyserNode.getFloatTimeDomainData(timeData);

  // Fundamental Pitch (F0) Estimation
  const minLag = Math.floor(sampleRate / 350);
  const maxLag = Math.floor(sampleRate / 80);
  let bestCorrelation = -1;
  let bestLag = minLag;

  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let sum = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < 256; i += 2) {
      const a = timeData[i];
      const b = timeData[i + lag];
      sum += a * b;
      normA += a * a;
      normB += b * b;
    }
    const corr = sum / (Math.sqrt(normA * normB) || 1e-6);
    if (corr > bestCorrelation) {
      bestCorrelation = corr;
      bestLag = lag;
    }
  }
  const f0Hz = Math.round(sampleRate / bestLag);

  // Direct-to-Reverberant Ratio & Proximity Effect
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < timeData.length; i++) {
    const val = Math.abs(timeData[i]);
    if (val > peak) peak = val;
    sumSq += val * val;
  }
  const rms = Math.sqrt(sumSq / timeData.length) || 1e-6;
  const crestFactorDb = 20 * Math.log10((peak / rms) || 1);
  const crestScore = Math.max(0, Math.min(1, (crestFactorDb - 5.5) / 7.5));

  let lowChestEnergy = 0;
  let midHighEnergy = 0;
  let totalEnergy = 0;
  let weightedFreq = 0;
  const numBins = freqData.length;

  for (let i = 0; i < numBins; i += 2) {
    const mag = Math.pow(10, freqData[i] / 20);
    const freq = (i * sampleRate) / fftSize;
    totalEnergy += mag;
    weightedFreq += freq * mag;
    if (freq >= 80 && freq <= 260) {
      lowChestEnergy += mag;
    } else if (freq >= 1000 && freq <= 4000) {
      midHighEnergy += mag;
    }
  }
  const spectralCentroid = weightedFreq / (totalEnergy || 1e-6);
  const resonanceRatio = lowChestEnergy / (midHighEnergy || 1e-6);
  const resonanceScore = Math.max(0, Math.min(1, (resonanceRatio - 0.30) / 1.5));
  const energyScore = Math.max(0, Math.min(1, (rms - 0.020) / 0.070));

  const proximityScore = Number(((crestScore * 0.40) + (resonanceScore * 0.35) + (energyScore * 0.25)).toFixed(3));

  let cumulativeEnergy = 0;
  let spectralRolloff = 1000;
  const rolloffThreshold = totalEnergy * 0.85;
  for (let i = 0; i < numBins; i += 2) {
    cumulativeEnergy += Math.pow(10, freqData[i] / 20);
    if (cumulativeEnergy >= rolloffThreshold) {
      spectralRolloff = (i * sampleRate) / fftSize;
      break;
    }
  }

  // 16-Band Mel Filterbank Energies
  const melBands = 16;
  const bandEnergies = new Float32Array(melBands);
  const binStep = Math.floor(numBins / melBands);

  for (let b = 0; b < melBands; b++) {
    let bEnergy = 0;
    const startBin = b * binStep;
    const endBin = Math.min(numBins, (b + 1) * binStep);
    for (let i = startBin; i < endBin; i += 2) {
      bEnergy += Math.pow(10, freqData[i] / 20);
    }
    bandEnergies[b] = Math.log1p(bEnergy);
  }

  const rawVector = new Float32Array(24);
  rawVector[0] = f0Hz / 350;
  rawVector[1] = Math.min(1, spectralCentroid / 4000);
  rawVector[2] = Math.min(1, spectralRolloff / 6000);
  rawVector[3] = Math.min(1, (bestCorrelation + 1) / 2);
  rawVector[4] = bandEnergies[0] / (bandEnergies[3] || 1);
  rawVector[5] = bandEnergies[4] / (bandEnergies[8] || 1);
  
  for (let i = 0; i < 16; i++) {
    rawVector[6 + i] = bandEnergies[i];
  }

  let norm = 0;
  for (let i = 0; i < 24; i++) norm += rawVector[i] * rawVector[i];
  norm = Math.sqrt(norm) || 1e-6;
  const vector24 = Array.from(rawVector).map(v => Number((v / norm).toFixed(4)));

  return {
    vector24,
    f0Hz,
    proximityScore,
    isNearField: proximityScore >= 0.50,
    crestFactorDb: Number(crestFactorDb.toFixed(1)),
    rms: Number(rms.toFixed(4)),
    resonanceRatio: Number(resonanceRatio.toFixed(2))
  };
}

function computeVectorSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

// 6. Setup Audio Hardware
async function ensureAudioHardware() {
  if (audioCtx && mediaStream && mediaRecorder) return true;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000
      }
    });

    micSource = audioCtx.createMediaStreamSource(mediaStream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 512;
    micSource.connect(analyserNode);

    // Continuous Real-Time Linear PCM Streaming for AssemblyAI Cloud Voice (Exact 24kHz Resampling)
    try {
      const pcmBufferSize = 2048;
      const pcmStreamNode = audioCtx.createScriptProcessor(pcmBufferSize, 1, 1);
      pcmStreamNode.onaudioprocess = (e) => {
        if (currentEngineMode === 'assemblyai' && aaiWs && aaiWs.readyState === WebSocket.OPEN && (isPttRecording || isCallActive)) {
          const inputData = e.inputBuffer.getChannelData(0);
          const inputSampleRate = audioCtx.sampleRate || 48000;
          
          // Accurate Linear Resampling to 24,000 Hz
          const ratio = inputSampleRate / 24000;
          const outputLength = Math.floor(inputData.length / ratio);
          const pcm16 = new Int16Array(outputLength);

          for (let i = 0; i < outputLength; i++) {
            const srcIdx = Math.floor(i * ratio);
            const sample = Math.max(-1, Math.min(1, inputData[srcIdx] || 0));
            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }

          const bytes = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          aaiWs.send(JSON.stringify({
            type: 'input.audio',
            audio: btoa(binary)
          }));
        }
      };
      micSource.connect(pcmStreamNode);
      pcmStreamNode.connect(audioCtx.destination);
    } catch (pcmErr) {
      console.warn('PCM streaming setup note:', pcmErr);
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
    recordedAudioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedAudioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      if (recordedAudioChunks.length > 0) {
        const blob = new Blob(recordedAudioChunks, { type: mime });
        recordedAudioChunks = [];

        // Auto-enroll caller on first utterance
        if (activeSpeechFrames.length > 0) {
          const sumVec = new Float32Array(24);
          for (const f of activeSpeechFrames) {
            for (let i = 0; i < 24; i++) sumVec[i] += f[i];
          }
          let norm = 0;
          for (let i = 0; i < 24; i++) {
            sumVec[i] /= activeSpeechFrames.length;
            norm += sumVec[i] * sumVec[i];
          }
          norm = Math.sqrt(norm) || 1e-6;
          const vector24 = Array.from(sumVec).map(v => Number((v / norm).toFixed(4)));
          const f0Hz = Math.round(activeSpeechF0s.reduce((a, b) => a + b, 0) / activeSpeechF0s.length);
          const avgProx = activeSpeechProximities.length > 0 ? activeSpeechProximities.reduce((a, b) => a + b, 0) / activeSpeechProximities.length : 0.85;

          activeSpeechFrames = [];
          activeSpeechF0s = [];
          activeSpeechProximities = [];

          if (!isVoiceLocked && f0Hz >= 70 && f0Hz <= 420) {
            isVoiceLocked = true;
            lockedVoiceVector = vector24;
            lockedF0 = f0Hz;
            lockedProximity = avgProx;
            if (lockMatchVal) lockMatchVal.textContent = '100% (Locked)';
            console.log('🔒 [Voice-Lock] Primary Caller Enrolled:', f0Hz, 'Hz');
          }
        }

        blob.arrayBuffer().then(buf => {
          if (currentEngineMode !== 'assemblyai') {
            if (ws && ws.readyState === WebSocket.OPEN && buf.byteLength > 800) {
              speechStateLabel.textContent = '⚡ Transcribing & Analyzing In-RAM...';
              ws.send(buf);
            }
          }
        });
      }
    };

    runVisualizerLoop();
    return true;
  } catch (err) {
    console.error('Audio hardware setup error:', err);
    alert(`Could not access microphone: ${err.message}`);
    return false;
  }
}

// 7. PUSH-TO-TALK (HOLD SPACEBAR) ENGINE
async function startPttRecording() {
  if (isPttRecording) return;
  
  const ready = await ensureAudioHardware();
  if (!ready) return;

  if (audioCtx && audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // Instant mute any agent voice if playing (<20ms)
  triggerInstantBargeIn('Spacebar Push-To-Talk Pressed');

  // Verify AssemblyAI connection health
  if (currentEngineMode === 'assemblyai' && (!aaiWs || aaiWs.readyState === WebSocket.CLOSED)) {
    console.log('🔄 Reconnecting AssemblyAI Voice Agent...');
    initAssemblyAiEngine();
  }

  isPttRecording = true;
  speechStartTime = Date.now();
  recordedAudioChunks = [];

  if (btnPushToTalk) btnPushToTalk.classList.add('recording');
  if (pttLabel) pttLabel.textContent = 'RECORDING · RELEASE SPACEBAR TO SEND';
  speechStateLabel.textContent = '🟢 RECORDING · RELEASE SPACEBAR TO SEND';

  try {
    if (mediaRecorder && mediaRecorder.state === 'inactive') {
      mediaRecorder.start(60);
    }
  } catch (err) {
    console.warn('PTT start error:', err);
  }
}

function stopPttRecording() {
  if (!isPttRecording) return;
  isPttRecording = false;

  const duration = Date.now() - speechStartTime;

  if (btnPushToTalk) btnPushToTalk.classList.remove('recording');
  if (pttLabel) pttLabel.textContent = 'HOLD SPACEBAR TO SPEAK';

  if (duration < 350) {
    // Too short / accidental tap
    speechStateLabel.textContent = isCallActive ? 'HANDS-FREE LISTENING...' : '🔴 MIC OFF · HOLD SPACEBAR TO SPEAK';
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    recordedAudioChunks = [];
    return;
  }

  speechStateLabel.textContent = '⚡ TRANSMITTING AUDIO...';

  // Flush silence to AssemblyAI to trigger end-of-utterance turn
  if (currentEngineMode === 'assemblyai' && aaiWs && aaiWs.readyState === WebSocket.OPEN) {
    try {
      const silenceBytes = new Uint8Array(3200); // 100ms silence
      let binary = '';
      for (let i = 0; i < silenceBytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, silenceBytes.subarray(i, i + 0x8000));
      }
      aaiWs.send(JSON.stringify({ type: 'input.audio', audio: btoa(binary) }));
    } catch {}
  }

  try {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  } catch (err) {
    console.warn('PTT stop error:', err);
  }
}

// 8. Visualizer & Hands-Free Audio VAD Loop
function runVisualizerLoop() {
  if (vadAnimationId) return;

  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
  const timeArray = new Float32Array(analyserNode.fftSize);

  function draw() {
    vadAnimationId = requestAnimationFrame(draw);

    analyserNode.getByteFrequencyData(dataArray);
    analyserNode.getFloatTimeDomainData(timeArray);

    let sum = 0;
    for (let i = 0; i < timeArray.length; i++) {
      sum += timeArray[i] * timeArray[i];
    }
    const rms = Math.sqrt(sum / timeArray.length);

    // Canvas Bars
    canvasCtx.fillStyle = '#03060a';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
      if (isPttRecording) {
        gradient.addColorStop(0, '#ef4444');
        gradient.addColorStop(1, '#f59e0b');
      } else {
        gradient.addColorStop(0, '#06b6d4');
        gradient.addColorStop(1, '#10b981');
      }

      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }

    // Collect Speech Frames for Biometric Vector
    if (isPttRecording || isCallActive) {
      if (rms > noiseGateThreshold) {
        const sample = extractAcousticVector();
        if (sample.f0Hz >= 70 && sample.f0Hz <= 420) {
          activeSpeechFrames.push(sample.vector24);
          activeSpeechF0s.push(sample.f0Hz);
          activeSpeechProximities.push(sample.proximityScore);
          if (activeSpeechFrames.length > 30) activeSpeechFrames.shift();
          if (activeSpeechF0s.length > 30) activeSpeechF0s.shift();
          if (activeSpeechProximities.length > 30) activeSpeechProximities.shift();
        }
      }
    }

    // Hands-Free VAD Mode (Only if explicitly connected via Call Toggle)
    if (isCallActive && !isPttRecording) {
      if (isSpeaking) {
        const BARGE_IN_RMS_THRESHOLD = Math.max(0.085, noiseGateThreshold + 0.045);
        if (rms > BARGE_IN_RMS_THRESHOLD && isVoiceLocked && lockedVoiceVector) {
          const sample = extractAcousticVector();
          const similarity = computeVectorSimilarity(sample.vector24, lockedVoiceVector);

          if (sample.proximityScore >= 0.60 && similarity >= 0.65 && sample.f0Hz >= 75 && sample.f0Hz <= 380) {
            bargeInConsecutiveFrames++;
            if (bargeInConsecutiveFrames >= 4) {
              bargeInConsecutiveFrames = 0;
              triggerInstantBargeIn('Caller voice interruption');
            }
          } else {
            bargeInConsecutiveFrames = 0;
          }
        }
        return;
      }

      if (rms > noiseGateThreshold) {
        const currentSample = extractAcousticVector();
        if (isVoiceLocked && lockedVoiceVector) {
          if (currentSample.proximityScore < 0.48) return;
          const sim = computeVectorSimilarity(currentSample.vector24, lockedVoiceVector);
          if (sim < 0.58) return;
        }

        if (!isUserSpeakingMic) {
          isUserSpeakingMic = true;
          speechStartTime = Date.now();
          speechStateLabel.textContent = 'VOICE DETECTED · RECORDING...';
          if (mediaRecorder && mediaRecorder.state === 'inactive') {
            recordedAudioChunks = [];
            try { mediaRecorder.start(60); } catch {}
          }
        }

        if (micSilenceTimer) {
          clearTimeout(micSilenceTimer);
          micSilenceTimer = null;
        }
      } else {
        if (isUserSpeakingMic && !micSilenceTimer) {
          micSilenceTimer = setTimeout(() => {
            const duration = Date.now() - speechStartTime;
            isUserSpeakingMic = false;
            if (duration < 550) {
              speechStateLabel.textContent = 'LISTENING (Hands-Free)...';
              if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
              recordedAudioChunks = [];
            } else {
              speechStateLabel.textContent = 'PROCESSING UTTERANCE...';
              if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            }
            micSilenceTimer = null;
          }, 1100);
        }
      }
    }
  }

  draw();
}

// 9. Fetch & Render In-RAM SEC Filings Table
async function fetchFilings() {
  try {
    const res = await fetch('/api/v1/filings');
    const data = await res.json();
    if (data.success) {
      filingsCount.textContent = `${data.count} Companies In-RAM`;
      renderFilingsTable(data.filings);
    }
  } catch (err) {
    console.error('Failed to load SEC filings:', err);
  }
}

function renderFilingsTable(filings) {
  if (!inventoryTbody) return;
  inventoryTbody.innerHTML = '';
  filings.slice(0, 100).forEach(f => {
    const tr = document.createElement('tr');
    tr.id = `filing-row-${f.ticker}`;
    const revB = f.revenue ? (Number(f.revenue) / 1e9).toFixed(2) : '0.00';
    const netB = f.net_income ? (Number(f.net_income) / 1e9).toFixed(2) : '0.00';
    const fcfB = f.free_cash_flow ? (Number(f.free_cash_flow) / 1e9).toFixed(2) : '0.00';
    const gmDisplay = (f.gross_margin_pct !== null && f.gross_margin_pct !== undefined) ? `${f.gross_margin_pct}%` : 'N/A (GAAP)';
    const gmBadgeClass = (f.gross_margin_pct !== null && f.gross_margin_pct > 50) ? 'badge-bullish' : 'badge-neutral';

    tr.innerHTML = `
      <td><strong>${f.ticker}</strong></td>
      <td>${f.company_name} <span class="sector-tag" style="color:var(--text-muted);font-size:10px;">(${f.sector || ''})</span></td>
      <td>${f.fiscal_year || 2023}</td>
      <td>$${revB}B</td>
      <td><span class="badge ${gmBadgeClass}">${gmDisplay}</span></td>
      <td>$${netB}B</td>
      <td>$${fcfB}B</td>
      <td><span class="status-verified" style="color:var(--accent-green);font-size:11px;font-family:var(--font-mono);">✅ Form 10-K</span></td>
    `;
    inventoryTbody.appendChild(tr);
  });
}

// 10. Fetch In-RAM SQL Query Logs
async function fetchSqlLogs() {
  try {
    const res = await fetch('/api/v1/sql-logs');
    const data = await res.json();
    if (data.success && data.logs.length > 0) {
      const latest = data.logs[data.logs.length - 1];
      sqlLogOutput.textContent = `[${new Date(latest.timestamp).toLocaleTimeString()}] ${latest.sql}`;
      sqlLatencyTag.textContent = `${latest.durationMs}ms In-RAM`;
    }
  } catch (err) {
    console.error('SQL log fetch error:', err);
  }
}

// 11. Financial Notepad Audit Trail Modal
async function loadNotepadContent() {
  try {
    const res = await fetch('/api/v1/notepad');
    const data = await res.json();
    if (data.success) {
      notepadContent.textContent = data.content || 'No audit log entries recorded yet.';
    }
  } catch (err) {
    notepadContent.textContent = `Error loading notepad: ${err.message}`;
  }
}

// 12. Push-To-Talk Keyboard (Spacebar) & Button Event Handlers
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    // If typing in the chat input bar, allow regular space character
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
    }
    e.preventDefault();
    isSpacebarHeld = true;
    startPttRecording();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
    }
    e.preventDefault();
    isSpacebarHeld = false;
    stopPttRecording();
  }
});

// Fail-safe: If window loses focus or user switches tabs, instantly stop recording
window.addEventListener('blur', () => {
  if (isPttRecording) {
    isSpacebarHeld = false;
    stopPttRecording();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && isPttRecording) {
    isSpacebarHeld = false;
    stopPttRecording();
  }
});

// Mouse & Touch Controls for the PTT Button
if (btnPushToTalk) {
  btnPushToTalk.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startPttRecording();
  });

  btnPushToTalk.addEventListener('mouseup', (e) => {
    e.preventDefault();
    stopPttRecording();
  });

  btnPushToTalk.addEventListener('mouseleave', () => {
    if (isPttRecording && !isSpacebarHeld) {
      stopPttRecording();
    }
  });

  btnPushToTalk.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startPttRecording();
  });

  btnPushToTalk.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopPttRecording();
  });
}

// Hands-Free Call Toggle
btnToggleCall.addEventListener('click', async () => {
  if (isCallActive) {
    isCallActive = false;
    btnToggleCall.classList.remove('active');
    btnCallText.textContent = 'Enable Hands-Free Mic';
    speechStateLabel.textContent = 'HANDS-FREE DISABLED · HOLD SPACEBAR TO SPEAK';
  } else {
    const ready = await ensureAudioHardware();
    if (ready) {
      isCallActive = true;
      btnToggleCall.classList.add('active');
      btnCallText.textContent = 'Disable Hands-Free Mic';
      speechStateLabel.textContent = 'HANDS-FREE ACTIVE (Or Hold Spacebar)';
    }
  }
});

btnBargeIn.addEventListener('click', () => {
  triggerInstantBargeIn('Manual Button Press');
});

noiseGateSlider.addEventListener('input', (e) => {
  noiseGateThreshold = parseFloat(e.target.value);
  noiseGateVal.textContent = noiseGateThreshold.toFixed(3);
});

function sendTextMessage(text) {
  if (!text) return;
  appendMessage('user', text);
  speechStateLabel.textContent = 'ANALYZING IN-RAM 10-K FILINGS...';

  // If in AssemblyAI mode, notify AssemblyAI
  if (currentEngineMode === 'assemblyai' && aaiWs && aaiWs.readyState === WebSocket.OPEN) {
    try {
      aaiWs.send(JSON.stringify({ type: 'input.text', text: text }));
    } catch {}
  }

  // Ensure local In-RAM WebSocket is active
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    initWebSocket();
  }

  const payload = JSON.stringify({
    type: 'USER_TEXT_QUERY',
    sessionId: currentSessionId,
    query: text,
    text: text
  });

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
  } else {
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }, 400);
  }
}

btnSendText.addEventListener('click', () => {
  const text = textInput.value.trim();
  if (text) {
    sendTextMessage(text);
    textInput.value = '';
  }
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnSendText.click();
  }
});

// Scenario Prompt Buttons
document.querySelectorAll('.scenario-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.getAttribute('data-query');
    if (query) {
      sendTextMessage(query);
    }
  });
});

btnOpenNotepad.addEventListener('click', () => {
  notepadModal.classList.add('active');
  loadNotepadContent();
});

btnCloseNotepad.addEventListener('click', () => {
  notepadModal.classList.remove('active');
});

btnRefreshNotepad.addEventListener('click', () => {
  loadNotepadContent();
});

btnClearNotepad.addEventListener('click', async () => {
  if (confirm('Clear the financial notepad audit trail?')) {
    await fetch('/api/v1/notepad', { method: 'DELETE' });
    loadNotepadContent();
  }
});

// Dual-Engine Mode Toggle Button Listeners
if (btnModeLocal) {
  btnModeLocal.addEventListener('click', () => setEngineMode('local'));
}

if (btnModeAssembly) {
  btnModeAssembly.addEventListener('click', () => setEngineMode('assemblyai'));
}

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  setEngineMode(currentEngineMode);
  fetchFilings();
  fetchSqlLogs();
});
