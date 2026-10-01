const SAMPLE_RATE = 24000;

const micButton = document.querySelector('#mic-button');
const micLabel = document.querySelector('#mic-label');
const statusText = document.querySelector('#status');
const connectionPill = document.querySelector('#connection-pill');
const visualizer = document.querySelector('#visualizer');
const conversation = document.querySelector('#conversation');
const textForm = document.querySelector('#text-form');
const textInput = document.querySelector('#text-input');
const clearButton = document.querySelector('#clear-button');
const launcher = document.querySelector('#launcher');
const assistantPanel = document.querySelector('#assistant-panel');
const closePanel = document.querySelector('#close-panel');
const sectionPreview = document.querySelector('#section-preview');

let socket = null;
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let processorNode = null;
let mutedForAgent = false;
let nextPlayTime = 0;

function setStatus(text) {
  statusText.textContent = text;
}

function setConnection(connected) {
  connectionPill.classList.toggle('live', connected);
  connectionPill.lastChild.textContent = connected ? ' Connected' : ' Ready';
}

function addMessage(role, text) {
  const empty = conversation.querySelector('.empty-state');
  if (empty) empty.remove();
  const item = document.createElement('div');
  item.className = `message ${role}`;
  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'You' : 'Vardhan';
  item.append(label, document.createTextNode(text));
  conversation.appendChild(item);
  conversation.scrollTop = conversation.scrollHeight;
}

function showError(message) {
  setStatus(message);
  setConnection(false);
  stopCapture(false);
}

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function downsample(buffer, inputRate, outputRate) {
  if (inputRate === outputRate) return buffer;
  if (inputRate < outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const length = Math.round(buffer.length / ratio);
  const result = new Float32Array(length);
  let offset = 0;
  for (let index = 0; index < length; index += 1) {
    const nextOffset = Math.round((index + 1) * ratio);
    let total = 0;
    let count = 0;
    for (let cursor = offset; cursor < nextOffset && cursor < buffer.length; cursor += 1) {
      total += buffer[cursor];
      count += 1;
    }
    result[index] = total / Math.max(count, 1);
    offset = nextOffset;
  }
  return result;
}

function floatToPcm16(float32) {
  const pcm = new Int16Array(float32.length);
  for (let index = 0; index < float32.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

function playPcm16(arrayBuffer) {
  if (!audioContext) return;
  const pcm = new Int16Array(arrayBuffer);
  const audio = audioContext.createBuffer(1, pcm.length, SAMPLE_RATE);
  const channel = audio.getChannelData(0);
  for (let index = 0; index < pcm.length; index += 1) channel[index] = pcm[index] / 0x8000;
  const source = audioContext.createBufferSource();
  source.buffer = audio;
  source.connect(audioContext.destination);
  nextPlayTime = Math.max(nextPlayTime, audioContext.currentTime + 0.02);
  source.start(nextPlayTime);
  nextPlayTime += audio.duration;
}

function handleDeepgramEvent(event) {
  const type = event.type;
  if (type === 'ConversationText' && event.content) {
    addMessage(event.role === 'user' ? 'user' : 'assistant', event.content);
    if (event.role === 'user') setStatus('Thinking…');
  } else if (type === 'AgentStartedSpeaking') {
    mutedForAgent = true;
    if (visualizer) visualizer.classList.add('active');
    setStatus('Vardhan is speaking…');
  } else if (type === 'AgentAudioDone') {
    mutedForAgent = false;
    if (visualizer) visualizer.classList.remove('active');
    setStatus('Listening…');
  } else if (type === 'UserStartedSpeaking') {
    if (visualizer) visualizer.classList.add('active');
    setStatus('Listening…');
  } else if (type === 'SettingsApplied') {
    setStatus('Listening… Ask anything about the portfolio.');
  } else if (type === 'Error') {
    showError(event.description || 'Deepgram returned an error.');
  }
}

function handleServerMessage(message) {
  if (message.type === 'connected') {
    setConnection(true);
  } else if (message.type === 'deepgram_event') {
    handleDeepgramEvent(message.event || {});
  } else if (message.type === 'navigation') {
    const section = message.section;
    const localTarget = document.querySelector(`#${CSS.escape(section)}`);
    if (localTarget) localTarget.scrollIntoView({ behavior: 'smooth' });
    else window.open(`https://phanivardhan-portfolio.onrender.com/#${section}`, '_blank', 'noopener');
    setStatus(`Opening the ${section} section…`);
  } else if (message.type === 'navigation_offer') {
    showSectionPreview(message.section);
    addNavigationChoice(message.section);
  } else if (message.type === 'open_link') {
    window.open(message.url, '_blank', 'noopener');
    setStatus('Opening that link…');
  } else if (message.type === 'error') {
    showError(message.message || 'Unable to start the voice session.');
  }
}

function showSectionPreview(section) {
  const source = document.querySelector(`#${CSS.escape(section)}`);
  if (!source || !sectionPreview) return;
  sectionPreview.innerHTML = source.outerHTML;
  const previewSection = sectionPreview.querySelector('section');
  if (previewSection) previewSection.removeAttribute('id');
  sectionPreview.hidden = false;
}

function addNavigationChoice(section) {
  const empty = conversation.querySelector('.empty-state');
  if (empty) empty.remove();
  const item = document.createElement('div');
  item.className = 'navigation-choice';
  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = 'Open section?';
  const prompt = document.createElement('span');
  prompt.textContent = `Would you like to open the ${section} section?`;
  const actions = document.createElement('div');
  actions.className = 'choice-actions';
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.textContent = `Yes, open ${section}`;
  yes.addEventListener('click', () => {
    addMessage('user', `Yes, open the ${section} section.`);
    socket?.send(JSON.stringify({
      type: 'inject_user_message',
      content: `Yes, please open the ${section} section now.`,
    }));
    item.remove();
    setStatus('Opening it…');
  });
  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = 'No, thanks';
  no.addEventListener('click', () => {
    addMessage('user', 'No, thanks.');
    socket?.send(JSON.stringify({ type: 'inject_user_message', content: 'No, thanks. Keep me here.' }));
    item.remove();
    setStatus('Listening…');
  });
  actions.append(yes, no);
  item.append(label, prompt, actions);
  conversation.appendChild(item);
  conversation.scrollTop = conversation.scrollHeight;
}

function stopCapture(closeSocket = true) {
  if (processorNode) processorNode.disconnect();
  if (sourceNode) sourceNode.disconnect();
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  if (audioContext && audioContext.state !== 'closed') audioContext.close();
  processorNode = null;
  sourceNode = null;
  mediaStream = null;
  audioContext = null;
  mutedForAgent = false;
  nextPlayTime = 0;
  if (visualizer) visualizer.classList.remove('active');
  micButton.classList.remove('recording');
  micLabel.textContent = 'Start speaking';
  micButton.setAttribute('aria-label', 'Start speaking');
  if (closeSocket && socket) socket.close();
  socket = null;
  setConnection(false);
}

async function startCapture() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support microphone access.');
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  await audioContext.resume();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  processorNode.onaudioprocess = (event) => {
    if (mutedForAgent || !socket || socket.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const resampled = downsample(input, audioContext.sampleRate, SAMPLE_RATE);
    socket.send(floatToPcm16(resampled));
  };
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  sourceNode.connect(processorNode);
  processorNode.connect(silentGain);
  silentGain.connect(audioContext.destination);
}

function openSocket() {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(websocketUrl());
    socket.binaryType = 'arraybuffer';
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Could not connect to the voice server.'));
    socket.onclose = () => {
      if (micButton.classList.contains('recording')) stopCapture(false);
      setConnection(false);
    };
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') handleServerMessage(JSON.parse(event.data));
      else playPcm16(event.data);
    };
  });
}

async function toggleAssistant() {
  if (micButton.classList.contains('recording')) {
    stopCapture();
    setStatus('Voice session stopped.');
    return;
  }
  try {
    micButton.disabled = true;
    setStatus('Connecting…');
    await openSocket();
    await startCapture();
    micButton.classList.add('recording');
    micLabel.textContent = 'Stop listening';
    micButton.setAttribute('aria-label', 'Stop listening');
    setStatus('Listening…');
  } catch (error) {
    stopCapture();
    showError(error.message || 'Microphone access was not available.');
  } finally {
    micButton.disabled = false;
  }
}

function sendText(text) {
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) {
    setStatus('Start the voice assistant first, then try a typed question.');
    return;
  }
  addMessage('user', text);
  socket.send(JSON.stringify({ type: 'inject_user_message', content: text }));
  setStatus('Thinking…');
}

micButton.addEventListener('click', toggleAssistant);
launcher.addEventListener('click', () => {
  const willOpen = assistantPanel.hidden;
  assistantPanel.hidden = !willOpen;
  launcher.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) textInput.focus();
});
closePanel.addEventListener('click', () => {
  assistantPanel.hidden = true;
  launcher.setAttribute('aria-expanded', 'false');
});
clearButton.addEventListener('click', () => {
  conversation.innerHTML = '<div class="welcome-message">Ask me about Phani’s experience, skills, projects, education, or contact details.</div>';
});
textForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  textInput.value = '';
  sendText(text);
});
document.querySelectorAll('[data-question]').forEach((button) => {
  button.addEventListener('click', () => sendText(button.dataset.question));
});
