import {
    AutoProcessor,
    Gemma4ForConditionalGeneration,
    TextStreamer,
    InterruptableStoppingCriteria,
    env
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';

let processor = null;
let model = null;
let chosenDtype = 'q4f16';
const stopping_criteria = new InterruptableStoppingCriteria();

async function probeAdapter() {
    if (!('gpu' in navigator)) {
        throw new Error('navigator.gpu missing — browser does not expose WebGPU');
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('navigator.gpu.requestAdapter() returned null — no GPU adapter available');
    const features = Array.from(adapter.features || []);
    const fp16 = features.includes('shader-f16');
    let info = {};
    try { info = await adapter.requestAdapterInfo?.() || {}; } catch {}
    return { features, fp16, info: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } };
}

async function load() {
    self.postMessage({ status: 'loading', stage: 'probing webgpu adapter' });
    const probe = await probeAdapter();
    chosenDtype = probe.fp16 ? 'q4f16' : 'q4';
    self.postMessage({ status: 'gpu-info', adapter: probe.info, features: probe.features, fp16: probe.fp16, dtype: chosenDtype });

    self.postMessage({ status: 'loading', stage: 'processor' });
    processor = await AutoProcessor.from_pretrained(MODEL_ID, {
        progress_callback: p => self.postMessage({ status: 'progress', payload: p })
    });

    self.postMessage({ status: 'loading', stage: 'model' });
    model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
        dtype: chosenDtype,
        device: 'webgpu',
        use_external_data_format: true,
        progress_callback: p => self.postMessage({ status: 'progress', payload: p })
    });

    self.postMessage({ status: 'loading', stage: 'warmup' });
    const warmText = processor.apply_chat_template([{ role: 'user', content: 'hi' }], { add_generation_prompt: true });
    const warmInputs = await processor(warmText);
    await model.generate({ ...warmInputs, max_new_tokens: 1 });
    self.postMessage({ status: 'ready', dtype: chosenDtype });
}

async function generate(messages) {
    if (!model || !processor) {
        self.postMessage({ status: 'error', error: 'model not loaded', stack: '' });
        return;
    }
    stopping_criteria.reset();
    const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
    const inputs = await processor(text);
    let startTime = null;
    let numTokens = 0;
    let tps = 0;
    const token_callback_function = () => {
        startTime ??= performance.now();
        if (numTokens++ > 0) tps = (numTokens / (performance.now() - startTime)) * 1000;
    };
    const callback_function = (output) => {
        self.postMessage({ status: 'update', output, tps, numTokens });
    };
    const tokenizer = processor.tokenizer || processor;
    const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function,
        token_callback_function
    });
    self.postMessage({ status: 'start' });
    try {
        const out = await model.generate({
            ...inputs,
            max_new_tokens: 384,
            do_sample: false,
            streamer,
            stopping_criteria,
            return_dict_in_generate: true
        });
        const decoded = tokenizer.batch_decode(out.sequences, { skip_special_tokens: true });
        self.postMessage({ status: 'complete', output: decoded[0] || '', tps, numTokens });
    } catch (e) {
        self.postMessage({ status: 'error', error: String(e && e.message || e), stack: String(e && e.stack || '') });
    }
}

self.addEventListener('message', async (e) => {
    const { type, messages } = e.data || {};
    if (type === 'load') {
        try { await load(); }
        catch (err) {
            self.postMessage({ status: 'error', error: String(err && err.message || err), stack: String(err && err.stack || ''), phase: 'load' });
        }
    } else if (type === 'generate') {
        await generate(messages);
    } else if (type === 'interrupt') {
        stopping_criteria.interrupt();
    }
});
