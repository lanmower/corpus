// Whisper STT worker — in-browser speech-to-text via transformers.js (WebGPU/wasm).
// Model: onnx-community/whisper-base.en_timestamped is overkill for push-to-talk;
// whisper-tiny.en is fast, English, and reliable for short study-app utterances.
//
// Protocol:
//   { type:'load' }                                  -> { status:'loading', stage } ... { status:'ready' }
//   { type:'transcribe', audio:Float32Array(16kHz mono), requestId } -> { status:'transcript', text, requestId }
//   { type:'interrupt' }                             (drops late results by id)
// Errors: { status:'error', error, requestId? }

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';

const MODEL_ID = 'onnx-community/whisper-tiny.en';

let asr = null;
let loadPromise = null;
let activeReq = null;

async function loadOnce() {
    self.postMessage({ status: 'loading', stage: 'probing webgpu' });
    const hasGpu = ('gpu' in navigator) && !!(await navigator.gpu.requestAdapter().catch(() => null));
    const device = hasGpu ? 'webgpu' : 'wasm';
    self.postMessage({ status: 'loading', stage: `downloading whisper-tiny.en (${device})` });
    asr = await pipeline('automatic-speech-recognition', MODEL_ID, {
        device,
        progress_callback: (info) => {
            if (info?.status === 'progress' || info?.status === 'progress_total') {
                self.postMessage({ status: 'progress', loaded: Number(info.loaded ?? 0), total: Number(info.total ?? 0), progress: Number(info.progress ?? 0) });
            }
        }
    });
    self.postMessage({ status: 'ready', device });
}

function load() {
    if (!loadPromise) loadPromise = loadOnce().catch(err => { loadPromise = null; self.postMessage({ status: 'error', error: String(err?.message || err) }); throw err; });
    return loadPromise;
}

async function transcribe(audio, requestId) {
    await load();
    activeReq = requestId;
    // audio is a Float32Array of mono PCM at 16kHz (the pipeline's expected rate).
    const out = await asr(audio, { chunk_length_s: 30, stride_length_s: 5 });
    if (activeReq !== requestId) return; // interrupted
    const text = (out && (out.text ?? (Array.isArray(out) ? out.map(o => o.text).join(' ') : ''))) || '';
    self.postMessage({ status: 'transcript', text: text.trim(), requestId });
}

self.addEventListener('message', async (e) => {
    const data = e.data || {};
    try {
        if (data.type === 'load') { await load(); }
        else if (data.type === 'transcribe') {
            const audio = data.audio instanceof Float32Array ? data.audio : new Float32Array(data.audio || []);
            await transcribe(audio, data.requestId);
        }
        else if (data.type === 'interrupt') { activeReq = null; }
    } catch (err) {
        self.postMessage({ status: 'error', error: String(err?.message || err), requestId: data.requestId });
    }
});
