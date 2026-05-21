// Bonsai WebGPU tutor worker - runs inference on GPU in background thread
// Message protocol: {cmd: 'load-card', id: '...', front: '...', back: '...'} etc.

const state = {
    gpu: null,
    device: null,
    model: null,
    modelLoaded: false,
    ready: false,
    lastContext: [],
    currentGeneration: null,
};

const log = (...a) => self.postMessage({ event: 'log', msg: a.join(' ') });
const warn = (...a) => self.postMessage({ event: 'warn', msg: a.join(' ') });

// Initialize GPU on worker startup
async function initGPU() {
    try {
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported on this device');
        }
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) {
            throw new Error('No GPU adapter available');
        }
        state.device = await adapter.requestDevice();
        state.gpu = navigator.gpu;
        state.ready = true;
        log('GPU initialized successfully');
        self.postMessage({ event: 'ready' });
    } catch (err) {
        warn(`GPU initialization failed: ${err.message}`);
        state.ready = false;
        self.postMessage({ event: 'gpu-error', error: err.message });
    }
}

// Load Bonsai model from cache or network
async function loadModel() {
    if (state.modelLoaded) return;

    try {
        log('Starting model download...');
        // TODO: Implement actual Bonsai model loading from HuggingFace
        // For now, placeholder that indicates the pattern
        const cacheKey = 'bonsai-1-bit-model';
        const cache = await caches.open('tutor-models');

        // Try to get from cache first
        let modelBuffer;
        const cached = await cache.match(cacheKey);
        if (cached) {
            log('Model found in cache');
            modelBuffer = await cached.arrayBuffer();
        } else {
            log('Downloading model from network...');
            // Placeholder: In real implementation, this would fetch from HuggingFace CDN
            // const modelUrl = 'https://huggingface.co/prism-ml/Bonsai-8B-gguf/resolve/main/model.gguf';
            // const response = await fetch(modelUrl);
            // modelBuffer = await response.arrayBuffer();
            // await cache.put(cacheKey, new Response(modelBuffer));
            throw new Error('Model download not yet implemented');
        }

        // Initialize model (placeholder - actual implementation depends on Bonsai library)
        state.model = { data: modelBuffer };
        state.modelLoaded = true;
        log('Model loaded successfully');
        self.postMessage({ event: 'model-ready' });
    } catch (err) {
        warn(`Model loading failed: ${err.message}`);
        self.postMessage({ event: 'model-error', error: err.message });
    }
}

// Generate coaching message (streaming tokens)
async function generateCoaching(cardFront, cardBack, cardSubject, userGrade) {
    if (!state.ready) {
        self.postMessage({ event: 'error', msg: 'Tutor not ready' });
        return;
    }

    if (!state.modelLoaded) {
        self.postMessage({ event: 'error', msg: 'Model not loaded' });
        return;
    }

    try {
        // Build system prompt
        const systemPrompt = `You are a compassionate medical study coach. Your role is to:
- Briefly explain concepts in simple language
- Suggest memory aids or mnemonics
- Recommend next steps in learning
- Adapt to the learner's pace and mastery level

Keep responses under 150 words. Be encouraging.`;

        // Build user message with context
        const userMessage = `Card question: ${cardFront}\nCard answer: ${cardBack}\nSubject: ${cardSubject}\nStudent grade: ${userGrade}

Provide brief coaching for this card.`;

        // Add to context window
        state.lastContext.push({ role: 'user', content: userMessage });
        if (state.lastContext.length > 10) {
            state.lastContext = state.lastContext.slice(-10);
        }

        // Placeholder: In real implementation, this would run Bonsai inference
        // For now, return a simple coaching message to validate the plumbing
        const coachingMessage = `Great work on this card! Let's focus on the key concept: ${cardFront.split(' ').slice(0, 5).join(' ')}. Take a moment to review the answer, then we'll try the next one.`;

        // Stream tokens (simulate token-by-token generation)
        self.postMessage({ event: 'coaching-start' });
        let fullMessage = '';
        for (let i = 0; i < coachingMessage.length; i++) {
            fullMessage += coachingMessage[i];
            self.postMessage({ event: 'token', token: coachingMessage[i] });
            // Simulate generation latency
            await new Promise(r => setTimeout(r, 50));
        }
        self.postMessage({ event: 'coaching-done', message: fullMessage });

        // Add assistant response to context
        state.lastContext.push({ role: 'assistant', content: fullMessage });
    } catch (err) {
        warn(`Generation failed: ${err.message}`);
        self.postMessage({ event: 'generation-error', error: err.message });
    }
}

// Message router
self.addEventListener('message', async (e) => {
    const { cmd, ...args } = e.data;

    try {
        switch (cmd) {
            case 'init':
                await initGPU();
                await loadModel();
                break;

            case 'load-model':
                await loadModel();
                break;

            case 'generate-coaching':
                await generateCoaching(args.front, args.back, args.subject, args.grade);
                break;

            case 'card-loaded':
                log(`Card loaded: ${args.id}`);
                break;

            case 'user-graded':
                log(`User graded card ${args.cardId}: ${args.score}`);
                break;

            default:
                warn(`Unknown command: ${cmd}`);
        }
    } catch (err) {
        self.postMessage({ event: 'error', msg: err.message });
    }
});

// Initialize on worker load
initGPU();
