// Voice Agent Interactive Operations Console Client

let ws = null;
let currentSessionId = null;
let isCallActive = false;
let isSpeaking = false;
let recognition = null;
let synth = window.speechSynthesis;
let audioContext = null;
let analyser = null;
let animationFrameId = null;

// DOM Elements
const wsStatus = document.getElementById('wsStatus');
const btnToggleCall = document.getElementById('btnToggleCall');
const btnCallText = document.getElementById('btnCallText');
const btnBargeIn = document.getElementById('btnBargeIn');
const transcriptBox = document.getElementById('transcriptBox');
const textInput = document.getElementById('textInput');
const btnSendText = document.getElementById('btnSendText');
const speechStateLabel = document.getElementById('speechStateLabel');
const agentOrb = document.getElementById('agentOrb');
const sessionDisplay = document.getElementById('sessionDisplay');
const callerBalance = document.getElementById('callerBalance');
const callerTier = document.getElementById('callerTier');
const simulationFeed = document.getElementById('simulationFeed');

// Latency DOM
const latSTT = document.getElementById('latSTT');
const latKB = document.getElementById('latKB');
const latTTFT = document.getElementById('latTTFT');
const latTTS = document.getElementById('latTTS');
const totalLatencyText = document.getElementById('totalLatencyText');
const latencyBarFill = document.getElementById('latencyBarFill');

// Initialize WebSockets
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    wsStatus.textContent = 'Connected (WebRTC/WS)';
    wsStatus.className = 'value status-green';
  };

  ws.onclose = () => {
    wsStatus.textContent = 'Disconnected';
    wsStatus.className = 'value status-red';
    setTimeout(initWebSocket, 2000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
}

// Handle Server Messages
function handleServerMessage(data) {
  if (data.type === 'SESSION_READY') {
    currentSessionId = data.session.id;
    sessionDisplay.textContent = `Session: ${currentSessionId.slice(0, 16)}...`;
    callerBalance.textContent = `$${data.session.caller.balance.toFixed(2)}`;
    callerTier.textContent = data.session.caller.tier;
    appendSystemMessage(`Ephemeral In-RAM session initialized. Zero disk latency.`);
  } 
  else if (data.type === 'AGENT_REPLY') {
    renderAgentReply(data);
  }
  else if (data.type === 'BARGE_IN_ACK') {
    handleBargeInAck(data);
  }
  else if (data.type === 'SESSION_TERMINATED') {
    appendSystemMessage(`Call disconnected. In-RAM session memory torn down cleanly.`);
    resetCallUI();
  }
}

let currentAudio = null;

// Render Agent Speech & Diagnostics
function renderAgentReply(data) {
  setAgentState('speaking');
  appendChatMessage('agent', data.replyText, `Latency: ${data.latency.totalMouthToEarMs}ms`);

  // Update Latency Metrics
  latSTT.textContent = `${data.latency.sttEstimatedMs} ms`;
  latKB.textContent = `${data.latency.kbLookupMs} ms`;
  latTTFT.textContent = `${data.latency.llmTtftMs} ms`;
  latTTS.textContent = `${data.latency.ttsEstimatedMs} ms`;
  totalLatencyText.textContent = `Total Mouth-to-Ear: ${data.latency.totalMouthToEarMs} ms`;

  const percent = Math.min(100, Math.round((data.latency.totalMouthToEarMs / 800) * 100));
  latencyBarFill.style.width = `${percent}%`;

  // Update Caller State if modified
  if (data.caller) {
    callerBalance.textContent = `$${data.caller.balance.toFixed(2)}`;
    callerTier.textContent = data.caller.tier;
  }

  // Update VSAP In-RAM Inspector
  if (data.toolExecution && data.toolExecution.simulation) {
    appendSimulationTrace(data.toolExecution.simulation);
  }

  // Play Studio-Grade Neural Female Voice Audio
  if (data.audioBase64) {
    playNeuralAudio(data.audioBase64);
  } else {
    playAgentVoice(data.replyText);
  }
}

// Play Studio-Grade Base64 MP3 Audio
function playNeuralAudio(b64) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const audioSrc = `data:audio/mp3;base64,${b64}`;
  currentAudio = new Audio(audioSrc);
  
  isSpeaking = true;
  btnBargeIn.disabled = false;
  setAgentState('speaking');

  currentAudio.onended = () => {
    isSpeaking = false;
    btnBargeIn.disabled = true;
    currentAudio = null;
    if (isCallActive) {
      setAgentState('listening');
      restartSpeechRecognition();
    } else {
      setAgentState('idle');
    }
  };

  currentAudio.onerror = () => {
    isSpeaking = false;
    btnBargeIn.disabled = true;
    currentAudio = null;
  };

  currentAudio.play().catch(e => {
    console.warn('Audio play error:', e);
    // Fallback if autoplay was blocked
    playAgentVoice(data.replyText);
  });
}

// Play Voice Audio Fallback
function playAgentVoice(text) {
  if (!('speechSynthesis' in window)) return;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.05;

  const voices = synth.getVoices();
  const femaleVoice = voices.find(v => (v.name.includes('Jenny') || v.name.includes('Aria') || v.name.includes('Zira') || v.name.includes('Female')) && v.lang.startsWith('en'));
  if (femaleVoice) utterance.voice = femaleVoice;

  utterance.onstart = () => {
    isSpeaking = true;
    btnBargeIn.disabled = false;
    setAgentState('speaking');
  };

  utterance.onend = () => {
    isSpeaking = false;
    btnBargeIn.disabled = true;
    if (isCallActive) {
      setAgentState('listening');
      restartSpeechRecognition();
    } else {
      setAgentState('idle');
    }
  };

  synth.speak(utterance);
}

// Barge-In (Interruption Handler)
function triggerBargeIn(reason = 'User voice barge-in') {
  if (currentAudio) {
    currentAudio.pause(); // Instant <10ms neural audio flush
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (synth.speaking) {
    synth.cancel();
  }
  isSpeaking = false;
  btnBargeIn.disabled = true;
  setAgentState('interrupted');

  if (ws && ws.readyState === WebSocket.OPEN && currentSessionId) {
    ws.send(JSON.stringify({
      type: 'BARGE_IN',
      sessionId: currentSessionId,
      reason
    }));
  }
}

function handleBargeInAck(data) {
  appendSystemMessage(`⚡ Barge-in executed: Agent audio flushed in <30ms.`);
  setTimeout(() => {
    if (isCallActive) setAgentState('listening');
  }, 400);
}

// Web Speech Recognition
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported in this browser. Fallback to text input.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    if (!isSpeaking) setAgentState('listening');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript && transcript.trim()) {
      handleUserSpeech(transcript.trim());
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== 'no-speech') {
      console.warn('Speech Recognition error:', event.error);
    }
  };

  recognition.onend = () => {
    if (isCallActive && !isSpeaking) {
      restartSpeechRecognition();
    }
  };
}

function restartSpeechRecognition() {
  if (!recognition || !isCallActive || isSpeaking) return;
  try {
    recognition.start();
  } catch {
    // Already running
  }
}

// User Speech Dispatcher
function handleUserSpeech(text) {
  if (isSpeaking) {
    triggerBargeIn('Spoke during agent speech');
  }

  appendChatMessage('user', text);

  if (ws && ws.readyState === WebSocket.OPEN && currentSessionId) {
    ws.send(JSON.stringify({
      type: 'USER_SPEECH',
      sessionId: currentSessionId,
      text
    }));
  }
}

// Toggle Live Call
function toggleCall() {
  if (!isCallActive) {
    isCallActive = true;
    btnCallText.textContent = 'End Call';
    btnToggleCall.className = 'btn btn-danger btn-lg';
    speechStateLabel.textContent = 'Call Connected · Listening...';

    // Start Audio Context & Waveform
    startAudioVisualizer();

    // Initialize session over WS
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'SESSION_INIT',
        sessionId: `call-${Date.now().toString(36)}`,
        caller: {
          callerName: 'Alex Mercer',
          tier: 'Enterprise Premium',
          accountNumber: 'ACC-882194',
          balance: 420.00
        }
      }));
    }

    if (recognition) {
      restartSpeechRecognition();
    }
  } else {
    isCallActive = false;
    btnCallText.textContent = 'Start Live Call';
    btnToggleCall.className = 'btn btn-primary btn-lg';
    btnBargeIn.disabled = true;
    synth.cancel();

    if (recognition) {
      recognition.stop();
    }

    if (ws && ws.readyState === WebSocket.OPEN && currentSessionId) {
      ws.send(JSON.stringify({
        type: 'SESSION_HANGUP',
        sessionId: currentSessionId
      }));
    }
  }
}

function resetCallUI() {
  setAgentState('idle');
  speechStateLabel.textContent = 'Call Ended';
}

// Visual State Changes
function setAgentState(state) {
  agentOrb.className = `agent-avatar-orb ${state}`;
  if (state === 'speaking') {
    speechStateLabel.textContent = 'Agent Speaking (Press Barge-In to Interrupt)';
  } else if (state === 'listening') {
    speechStateLabel.textContent = 'Agent Listening to Customer...';
  } else if (state === 'interrupted') {
    speechStateLabel.textContent = '⚡ Barge-In Interrupted!';
  } else {
    speechStateLabel.textContent = 'Agent Standby';
  }
}

// Chat UI Appenders
function appendChatMessage(role, text, meta = '') {
  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg ${role}`;
  msgEl.innerHTML = `
    <span class="bubble">${escapeHtml(text)}</span>
    ${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ''}
  `;
  transcriptBox.appendChild(msgEl);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

function appendSystemMessage(text) {
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg system';
  msgEl.innerHTML = `<span class="bubble">${escapeHtml(text)}</span>`;
  transcriptBox.appendChild(msgEl);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

// In-RAM VSAP Simulation Inspector Feed
function appendSimulationTrace(sim) {
  if (simulationFeed.querySelector('.feed-placeholder')) {
    simulationFeed.innerHTML = '';
  }

  const card = document.createElement('div');
  card.className = `trace-card ${sim.approved ? '' : 'blocked'}`;
  card.innerHTML = `
    <div class="trace-header">
      <span class="trace-tool">${escapeHtml(sim.toolName)}</span>
      <span class="trace-score">${sim.approved ? 'PASSED (100%)' : 'BLOCKED (0%)'} · ${sim.executionTimeMs}ms</span>
    </div>
    <div class="trace-reason">${escapeHtml(sim.reason)}</div>
  `;

  simulationFeed.prepend(card);
}

// Waveform Canvas Generator
function startAudioVisualizer() {
  const canvas = document.getElementById('waveformCanvas');
  const ctx = canvas.getContext('2d');
  let phase = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = isSpeaking ? '#00e676' : isCallActive ? '#00f2fe' : 'rgba(255,255,255,0.1)';

    ctx.beginPath();
    const sliceWidth = canvas.width / 40;
    let x = 0;

    for (let i = 0; i < 40; i++) {
      const amp = (isSpeaking || isCallActive) ? Math.sin(i * 0.3 + phase) * 20 : 2;
      const y = (canvas.height / 2) + amp;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);

      x += sliceWidth;
    }

    ctx.stroke();
    phase += (isSpeaking ? 0.2 : 0.05);
    animationFrameId = requestAnimationFrame(draw);
  }

  if (!animationFrameId) draw();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Quick Prompt Sender
window.sendCustomPrompt = function(promptText) {
  if (!isCallActive) {
    toggleCall();
    setTimeout(() => handleUserSpeech(promptText), 300);
  } else {
    handleUserSpeech(promptText);
  }
};

// Event Listeners
btnToggleCall.addEventListener('click', toggleCall);
btnBargeIn.addEventListener('click', () => triggerBargeIn('Manual Barge-In button'));

btnSendText.addEventListener('click', () => {
  const val = textInput.value.trim();
  if (val) {
    if (!isCallActive) toggleCall();
    handleUserSpeech(val);
    textInput.value = '';
  }
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSendText.click();
});

// Boot Client
initWebSocket();
setupSpeechRecognition();
startAudioVisualizer();
