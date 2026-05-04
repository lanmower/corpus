import {
    AutoTokenizer,
    AutoModelForCausalLM,
    TextStreamer,
    InterruptableStoppingCriteria,
    env
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'onnx-community/gemma-4-e2b-it-ONNX';

let tokenizer = null;
let model = null;
const stopping_criteria = new InterruptableStoppingCriteria();

async function load() {
    self.postMessage({ status: 'loading', stage: 'tokenizer' });
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
        progress_callback: p => self.postMessage({ status: 'progress', payload: p })
    });
    self.postMessage({ status: 'loading', stage: 'model' });
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: 'q4f16',
        device: 'webgpu',
        progress_callback: p => self.postMessage({ status: 'progress', payload: p })
    });
    self.postMessage({ status: 'loading', stage: 'warmup' });
    const warm = await tokenizer('hi', { return_tensors: 'pt' });
    await model.generate({ ...warm, max_new_tokens: 1 });
    self.postMessage({ status: 'ready' });
}

async function generate(messages) {
    if (!model || !tokenizer) {
        self.postMessage({ status: 'error', error: 'model not loaded' });
        return;
    }
    stopping_criteria.reset();
    const inputs = tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true,
        return_dict: true
    });
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
        self.postMessage({ status: 'error', error: String(e && e.message || e) });
    }
}

self.addEventListener('message', async (e) => {
    const { type, messages } = e.data || {};
    if (type === 'load') {
        try { await load(); }
        catch (err) { self.postMessage({ status: 'error', error: String(err && err.message || err) }); }
    } else if (type === 'generate') {
        await generate(messages);
    } else if (type === 'interrupt') {
        stopping_criteria.interrupt();
    }
});
