// Shared LLM worker — Bonsai-1.7B 1-bit via transformers.js + WebGPU.
// Based on the official Bonsai-WebGPU demo:
//   https://huggingface.co/spaces/webml-community/bonsai-webgpu
//
// Used by both the triage page and the corpus tutor panel.
//
// Message protocol:
//   { type: 'load' }                                          (idempotent — safe to call from multiple pages)
//   { type: 'generate', messages: [{role, content}], requestId? }
//   { type: 'interrupt' }
//   { type: 'reset' }                                         (clear past-key-values cache)
//
// Reply protocol:
//   { status: 'loading', stage }
//   { status: 'progress', loaded, total, progress }           (download progress)
//   { status: 'ready' }
//   { status: 'start', requestId? }
//   { status: 'update', output, tps, numTokens, requestId? }  (streamed chunk)
//   { status: 'complete', output, tps, numTokens, requestId? }
//   { status: 'error', error, stack, phase? }

import {
    pipeline,
    TextStreamer,
    DynamicCache,
    InterruptableStoppingCriteria
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';

const MODEL_ID = 'onnx-community/Bonsai-1.7B-ONNX';

let generator = null;
let loadPromise = null;
let pastKV = null;
const stopping = new InterruptableStoppingCriteria();

async function loadOnce() {
    self.postMessage({ status: 'loading', stage: 'probing webgpu' });
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing — WebGPU required');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no WebGPU adapter');

    self.postMessage({ status: 'loading', stage: 'downloading Bonsai-1.7B (1-bit)' });
    generator = await pipeline('text-generation', MODEL_ID, {
        device: 'webgpu',
        dtype: 'q1',
        progress_callback: (info) => {
            if (info?.status === 'progress_total' || info?.status === 'progress') {
                self.postMessage({
                    status: 'progress',
                    loaded: Number(info.loaded ?? 0),
                    total: Number(info.total ?? 0),
                    progress: Number(info.progress ?? 0)
                });
            }
        }
    });

    self.postMessage({ status: 'loading', stage: 'optimizing for 1-bit execution' });
    const warm = generator.tokenizer('a');
    await generator.model.generate({ ...warm, max_new_tokens: 1 });

    self.postMessage({ status: 'ready' });
}

function load() {
    if (!loadPromise) loadPromise = loadOnce().catch(err => { loadPromise = null; throw err; });
    return loadPromise;
}

async function generate(messages, requestId) {
    if (!generator) {
        self.postMessage({ status: 'error', error: 'model not loaded', stack: '', requestId });
        return;
    }
    stopping.reset();
    let startTime;
    let numTokens = 0;
    let tps;
    const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (output) => {
            self.postMessage({ status: 'update', output, tps, numTokens, requestId });
        },
        token_callback_function: () => {
            startTime ??= performance.now();
            if (numTokens++ > 0) tps = (numTokens / (performance.now() - startTime)) * 1000;
        }
    });
    self.postMessage({ status: 'start', requestId });
    pastKV ??= new DynamicCache();
    try {
        const out = await generator(messages, {
            max_new_tokens: 512,
            do_sample: false,
            streamer,
            stopping_criteria: stopping,
            past_key_values: pastKV
        });
        const content = out?.[0]?.generated_text?.at?.(-1)?.content ?? '';
        self.postMessage({ status: 'complete', output: content, tps, numTokens, requestId });
    } catch (e) {
        self.postMessage({ status: 'error', error: String(e?.message || e), stack: String(e?.stack || ''), requestId });
    }
}

function reset() {
    pastKV?.dispose?.();
    pastKV = null;
    stopping.reset();
}

self.addEventListener('message', async (e) => {
    const { type, messages, requestId } = e.data || {};
    try {
        if (type === 'load') {
            await load();
        } else if (type === 'generate') {
            await generate(messages, requestId);
        } else if (type === 'interrupt') {
            stopping.interrupt();
        } else if (type === 'reset') {
            reset();
        }
    } catch (err) {
        self.postMessage({ status: 'error', error: String(err?.message || err), stack: String(err?.stack || ''), phase: type });
    }
});
