// voice.js — shared voice controller for the corpus tutor + triage tutor.
// Owns the singleton STT (Whisper) and TTS (KittenTTS) workers, push-to-talk mic
// capture, and a gapless streaming-TTS playback queue. Both surfaces import this so
// the heavy workers load once per origin and are reused.
//
// Public API:
//   startListening()                  begin push-to-talk capture (mousedown)
//   stopListening(): Promise<string>  stop + transcribe (mouseup) -> transcript text
//   isListening(): boolean
//   feedText(chunk)                   stream assistant tokens; complete sentences are spoken as they form
//   flushSpeech()                     speak any buffered remainder (turn end)
//   cancelSpeech()                    stop playback + clear the queue (interrupt / new user turn)
//   resetSpeech()                     clear the sentence buffer for a fresh turn
//   setSpeechEnabled(bool) / speechEnabled()
//   setVoice(name) / voices(): Promise<string[]>
//   preload()                         warm both workers

let _tts = null, _ttsReady = null, _voiceList = null;
let _stt = null, _sttReady = null;
// Opt-in: spoken replies (and the ~24MB KittenTTS download) only start once the
// user enables the speaker toggle, so a silent tutor session downloads nothing.
let _speechEnabled = false;
let _voice = 'expr-voice-2-f';
let _reqSeq = 0;

// ---- worker singletons ----
function ttsWorker() {
    if (_tts) return _tts;
    _tts = new Worker(new URL('./tts-worker.js', import.meta.url), { type: 'module' });
    _ttsReady = new Promise((resolve, reject) => {
        const onMsg = (e) => {
            const d = e.data || {};
            if (d.status === 'ready') { _voiceList = d.voices || []; _tts.removeEventListener('message', onMsg); resolve(d); }
            else if (d.status === 'error' && !d.requestId) { _tts.removeEventListener('message', onMsg); reject(new Error(d.error || 'tts load failed')); }
        };
        _tts.addEventListener('message', onMsg);
        _tts.addEventListener('error', (ev) => reject(new Error('tts worker: ' + (ev.message || ev.filename || '?'))));
    });
    _tts.postMessage({ type: 'load' });
    return _tts;
}
function sttWorker() {
    if (_stt) return _stt;
    _stt = new Worker(new URL('./stt-worker.js', import.meta.url), { type: 'module' });
    _sttReady = new Promise((resolve, reject) => {
        const onMsg = (e) => {
            const d = e.data || {};
            if (d.status === 'ready') { _stt.removeEventListener('message', onMsg); resolve(d); }
            else if (d.status === 'error' && !d.requestId) { _stt.removeEventListener('message', onMsg); reject(new Error(d.error || 'stt load failed')); }
        };
        _stt.addEventListener('message', onMsg);
        _stt.addEventListener('error', (ev) => reject(new Error('stt worker: ' + (ev.message || ev.filename || '?'))));
    });
    _stt.postMessage({ type: 'load' });
    return _stt;
}
export function preload() { try { ttsWorker(); sttWorker(); } catch {} }
export async function voices() { ttsWorker(); await _ttsReady; return _voiceList || []; }
export function setVoice(name) { if (name) _voice = name; }
export function setSpeechEnabled(on) { _speechEnabled = !!on; if (!_speechEnabled) cancelSpeech(); }
export function speechEnabled() { return _speechEnabled; }

// ---- push-to-talk mic capture (16kHz mono Float32 via a 16k AudioContext) ----
let _micCtx = null, _micStream = null, _micNode = null, _micSrc = null, _micChunks = null, _listening = false;

export function isListening() { return _listening; }

export async function startListening() {
    if (_listening) return;
    _micChunks = [];
    try {
        _micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
        _micChunks = null;
        throw err;
    }
    _listening = true;
    // A 16kHz context resamples the (typically 48kHz) mic input to Whisper's rate.
    _micCtx = new (self.AudioContext || self.webkitAudioContext)({ sampleRate: 16000 });
    _micSrc = _micCtx.createMediaStreamSource(_micStream);
    _micNode = _micCtx.createScriptProcessor(4096, 1, 1);
    _micNode.onaudioprocess = (e) => {
        if (!_listening) return;
        _micChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    _micSrc.connect(_micNode);
    _micNode.connect(_micCtx.destination); // required for onaudioprocess to fire
    sttWorker(); // warm in parallel with recording
}

export async function stopListening() {
    if (!_listening) return '';
    _listening = false;
    try { _micNode && _micNode.disconnect(); } catch {}
    try { _micSrc && _micSrc.disconnect(); } catch {}
    try { _micStream && _micStream.getTracks().forEach(t => t.stop()); } catch {}
    try { _micCtx && _micCtx.close(); } catch {}
    const chunks = _micChunks || []; _micChunks = null;
    let len = 0; for (const c of chunks) len += c.length;
    if (len < 1600) return ''; // < 0.1s — treat as empty
    const audio = new Float32Array(len);
    let off = 0; for (const c of chunks) { audio.set(c, off); off += c.length; }
    return transcribe(audio);
}

function transcribe(audio) {
    try { sttWorker(); } catch (err) {
        return Promise.reject(new Error('microphone unavailable: ' + err.message));
    }
    if (!_sttReady) return Promise.reject(new Error('microphone unavailable'));
    return _sttReady.then(() => new Promise((resolve) => {
        const id = 'stt-' + (++_reqSeq);
        const timer = setTimeout(() => { _stt.removeEventListener('message', onMsg); reject(new Error('transcription timed out')); }, 30000);
        const onMsg = (e) => {
            const d = e.data || {};
            if (d.requestId === id && (d.status === 'transcript' || d.status === 'error')) {
                clearTimeout(timer);
                _stt.removeEventListener('message', onMsg);
                resolve(d.text || '');
            }
        };
        _stt.addEventListener('message', onMsg);
        _stt.postMessage({ type: 'transcribe', audio, requestId: id }, [audio.buffer]);
    }));
}

// ---- streaming TTS: sentence buffer -> synth queue -> gapless playback ----
let _sentenceBuf = '';
let _playCtx = null, _playCursor = 0, _playEpoch = 0;
const _synthQueue = [];   // pending sentences awaiting synthesis
let _synthBusy = false;

function playCtx() {
    if (!_playCtx || _playCtx.state === 'closed') { _playCtx = new (self.AudioContext || self.webkitAudioContext)(); _playCursor = 0; }
    return _playCtx;
}

export function resetSpeech() { _sentenceBuf = ''; }

export function feedText(chunk) {
    if (!_speechEnabled || !chunk) return;
    _sentenceBuf += chunk;
    // Never emit while inside an unclosed ``` fence: a streamed tool block would
    // otherwise be spoken as garbage JSON before its closing fence arrives. An odd
    // count of ``` means we're mid-fence — hold until it closes.
    if (((_sentenceBuf.match(/```/g) || []).length % 2) === 1) return;
    // Emit complete sentences as they form so speech starts before the reply ends.
    const re = /[^.!?\n]*[.!?\n]+/g;
    let m, consumed = 0;
    while ((m = re.exec(_sentenceBuf))) {
        const sentence = m[0].trim();
        consumed = re.lastIndex;
        if (sentence) enqueueSentence(sentence);
    }
    if (consumed) _sentenceBuf = _sentenceBuf.slice(consumed);
}

export function flushSpeech() {
    const rest = _sentenceBuf.trim();
    _sentenceBuf = '';
    if (_speechEnabled && rest) enqueueSentence(rest);
}

function enqueueSentence(text) {
    // Strip fenced tool blocks and markdown noise so only prose is spoken.
    const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[*_`#>]/g, '').trim();
    if (!clean) return;
    _synthQueue.push({ text: clean, epoch: _playEpoch });
    pumpSynth();
}

function pumpSynth() {
    if (_synthBusy) return;
    const job = _synthQueue.shift();
    if (!job) return;
    _synthBusy = true;
    try { ttsWorker(); } catch { _synthBusy = false; return; }
    if (!_ttsReady) { _synthBusy = false; return; }
    _ttsReady.then(() => {
        if (job.epoch !== _playEpoch) { _synthBusy = false; pumpSynth(); return; } // cancelled
        const id = 'tts-' + (++_reqSeq);
        const onMsg = (e) => {
            const d = e.data || {};
            if (d.requestId !== id) return;
            _tts.removeEventListener('message', onMsg);
            _synthBusy = false;
            if (d.status === 'audio' && d.pcm && d.pcm.length && job.epoch === _playEpoch) {
                schedulePcm(d.pcm, d.sampleRate || 24000);
            }
            pumpSynth();
        };
        _tts.addEventListener('message', onMsg);
        _tts.postMessage({ type: 'speak', text: job.text, voice: _voice, requestId: id });
    }).catch(() => { _tts = null; _ttsReady = null; _synthBusy = false; });
}

function schedulePcm(pcm, sr) {
    const ctx = playCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const buf = ctx.createBuffer(1, pcm.length, sr);
    buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    const at = Math.max(now, _playCursor);
    src.start(at);
    _playCursor = at + buf.duration;
}

export function cancelSpeech() {
    _playEpoch++;            // invalidate in-flight synth jobs
    _synthQueue.length = 0;
    _sentenceBuf = '';
    _synthBusy = false;
    if (_tts) { try { _tts.postMessage({ type: 'interrupt' }); } catch {} }
    if (_playCtx && _playCtx.state !== 'closed') { try { _playCtx.close(); } catch {} _playCtx = null; _playCursor = 0; }
}
