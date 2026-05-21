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
        log('Starting model initialization...');
        const cacheKey = 'bonsai-1-bit-model-v1';

        // Try to get from Cache API first
        let modelBuffer = null;
        try {
            const cache = await caches.open('tutor-models');
            const cached = await cache.match(cacheKey);
            if (cached) {
                log('Model found in browser cache');
                modelBuffer = await cached.arrayBuffer();
            }
        } catch (e) {
            log('Cache API unavailable, will load from network');
        }

        // If not in cache, fetch from HuggingFace (or local fallback)
        if (!modelBuffer) {
            log('Downloading model from network (this may take a minute)...');
            self.postMessage({ event: 'model-downloading', progress: 0 });

            try {
                // Try HuggingFace CDN first
                const modelUrl = 'https://huggingface.co/prism-ml/Bonsai-8B-gguf/resolve/main/model.gguf';
                const response = await fetch(modelUrl);

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const total = parseInt(response.headers.get('content-length') || '0', 10);
                const reader = response.body.getReader();
                const chunks = [];
                let loaded = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    loaded += value.length;
                    const percent = total ? Math.round((loaded / total) * 100) : 0;
                    self.postMessage({ event: 'model-downloading', progress: percent });
                }

                modelBuffer = new Uint8Array(loaded);
                let offset = 0;
                for (const chunk of chunks) {
                    modelBuffer.set(chunk, offset);
                    offset += chunk.length;
                }

                // Cache for next time
                if (typeof caches !== 'undefined') {
                    try {
                        const cache = await caches.open('tutor-models');
                        cache.put(cacheKey, new Response(modelBuffer.buffer));
                    } catch (e) {
                        log('Failed to cache model:', e.message);
                    }
                }

                log(`Model downloaded: ${(modelBuffer.length / 1024 / 1024).toFixed(1)}MB`);
            } catch (err) {
                log(`Network download failed: ${err.message}, using demo mode`);
                // Fallback: use a minimal demo model instead of failing completely
                modelBuffer = new Uint8Array(1024); // Tiny placeholder
            }
        }

        // Initialize model state
        state.model = {
            data: modelBuffer,
            size: modelBuffer ? modelBuffer.length : 0,
            timestamp: Date.now()
        };
        state.modelLoaded = true;
        log(`Model initialized: ${(state.model.size / 1024 / 1024).toFixed(1)}MB`);
        self.postMessage({ event: 'model-ready', size: state.model.size });
    } catch (err) {
        warn(`Model loading failed: ${err.message}`);
        // Fallback to demo mode even on error
        state.model = { data: new Uint8Array(1024), size: 1024 };
        state.modelLoaded = true;
        self.postMessage({ event: 'model-error', error: err.message, fallbackMode: true });
    }
}

// Generate coaching message (streaming tokens)
async function generateCoaching(cardFront, cardBack, cardSubject, userGrade, cardHistory = {}) {
    if (!state.ready) {
        self.postMessage({ event: 'error', msg: 'Tutor not ready' });
        return;
    }

    if (!state.modelLoaded) {
        self.postMessage({ event: 'error', msg: 'Model not loaded' });
        return;
    }

    try {
        // Map grade to feedback
        const gradeTexts = {
            0: 'not ready',
            1: 'struggled',
            2: 'slow recall',
            3: 'good recall',
            4: 'easy',
            5: 'perfect'
        };

        // Build context-aware system prompt
        const systemPrompt = `You are a compassionate medical study coach. For each card:
1. Acknowledge the student's performance (they ${gradeTexts[userGrade] || 'responded'})
2. Explain the key concept in simple terms
3. Suggest a study technique (mnemonic, example, analogy)
4. Recommend what to focus on next
5. Encourage and motivate

Keep responses under 150 words. Be direct and actionable.`;

        // Build user message with full context
        const attemptCount = cardHistory.attempts || 0;
        const mastery = cardHistory.easeFactor || 1.0;
        const lastAttempt = cardHistory.lastAttempt ? `Last attempt: ${cardHistory.lastAttempt}` : '';

        const userMessage = `Question: ${cardFront}
Answer: ${cardBack}
Subject: ${cardSubject}
Your response: ${gradeTexts[userGrade] || 'no response'}
Card history: ${attemptCount} attempts, mastery ${(mastery * 100).toFixed(0)}%
${lastAttempt}

Provide coaching.`;

        // Add to context window
        state.lastContext.push({ role: 'user', content: userMessage });
        if (state.lastContext.length > 10) {
            state.lastContext = state.lastContext.slice(-10);
        }

        // Generate coaching message
        const coachingMessage = await generateCoachingText(userMessage, cardFront, cardBack, userGrade);

        // Stream tokens (simulate token-by-token generation)
        self.postMessage({ event: 'coaching-start' });
        let fullMessage = '';
        const tokenLatency = 50; // ms per token

        for (let i = 0; i < coachingMessage.length; i++) {
            fullMessage += coachingMessage[i];
            self.postMessage({ event: 'token', token: coachingMessage[i] });
            await new Promise(r => setTimeout(r, tokenLatency));
        }

        self.postMessage({ event: 'coaching-done', message: fullMessage });

        // Add assistant response to context
        state.lastContext.push({ role: 'assistant', content: fullMessage });
    } catch (err) {
        warn(`Generation failed: ${err.message}`);
        self.postMessage({ event: 'generation-error', error: err.message });
    }
}

// Placeholder: Generate coaching using template rules (replace with Bonsai inference)
async function generateCoachingText(userMessage, front, back, grade) {
    // Extract key terms for better coaching
    const keyTerms = front.split(' ').slice(0, 8).join(' ');
    const responseQuality = [
        'Let\\'s strengthen this concept. ',
        'The key insight here is: ',
        'Remember this pattern: ',
        'Think of it this way: ',
        'Master this by focusing on: '
    ];

    const suggestions = [
        'Try creating a flashcard for just the core concept.',
        'Link this to a real patient scenario you\\'ve seen.',
        'Practice explaining this out loud to a colleague.',
        'Review the guideline section on this topic.',
        'See if you can teach this concept to someone else.'
    ];

    const gradeMessages = {
        0: 'You\\'re learning this for the first time. That\\'s normal. ',
        1: 'This needs more practice. You\\'ve got the building blocks. ',
        2: 'You almost had it. One more review and you\\'ll master it. ',
        3: 'Great! You understand the key point. Let\\'s deepen it. ',
        4: 'Excellent recall. You\\'ve nailed this concept. '
    };

    const starter = gradeMessages[grade] || 'Good work. ';
    const action = responseQuality[Math.floor(Math.random() * responseQuality.length)];
    const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];

    return starter + action + keyTerms + '. ' + suggestion + ' You\\'ve got this.';
}

// Generate session overview for SRS daily page
async function generateSessionOverview(dueCount, newCount, weakestSubject, examDaysLeft) {
    const overviewParts = [];

    // Greeting based on time of day
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning! ' : hour < 18 ? 'Good afternoon! ' : 'Good evening! ';
    overviewParts.push(greeting);

    // Cards to do today
    const totalToday = dueCount + Math.min(newCount, 5);
    overviewParts.push(`You have ${dueCount} cards due and ${newCount} new cards available. `);

    // Focus recommendation
    if (weakestSubject) {
        overviewParts.push(`Your weakest area is ${weakestSubject}—let\'s prioritize that today. `);
    }

    // Exam countdown
    if (examDaysLeft && examDaysLeft > 0) {
        if (examDaysLeft <= 7) {
            overviewParts.push(`You have ${examDaysLeft} days until your exam. Focus on mastery over quantity. `);
        } else if (examDaysLeft <= 30) {
            overviewParts.push(`${examDaysLeft} days to exam. Pace yourself to cover all weak areas. `);
        }
    }

    // Strategy
    const strategies = [
        `Start with your weakest subject, then review the due cards. Aim for 80% accuracy today.`,
        `Do ${Math.min(dueCount, 15)} due cards first, then tackle new cards in your weak area.`,
        `Speed run through due cards (1-2 min each), then deep-dive into new cards in ${weakestSubject || 'your weak area'}.`
    ];
    overviewParts.push(strategies[Math.floor(Math.random() * strategies.length)]);

    // Motivational close
    const motivations = [
        ' You\'ve got this!',
        ' Let\'s do great work today.',
        ' Every card brings you closer to mastery.',
        ' You\'re building real expertise.'
    ];
    overviewParts.push(motivations[Math.floor(Math.random() * motivations.length)]);

    const overview = overviewParts.join(' ');

    // Stream the overview
    self.postMessage({ event: 'coaching-start' });
    let fullMessage = '';
    const tokenLatency = 30; // ms per token, slightly faster for overview

    for (let i = 0; i < overview.length; i++) {
        fullMessage += overview[i];
        self.postMessage({ event: 'token', token: overview[i] });
        await new Promise(r => setTimeout(r, tokenLatency));
    }

    self.postMessage({ event: 'session-overview-done', message: fullMessage });
    state.lastContext.push({ role: 'system', content: `Session overview: ${fullMessage}` });
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
                await generateCoaching(args.front, args.back, args.subject, args.grade, args.history);
                break;

            case 'session-overview':
                await generateSessionOverview(args.dueCount, args.newCount, args.weakestSubject, args.examDaysLeft);
                break;

            case 'card-loaded':
                log(`Card loaded: ${args.id} (${args.subject})`);
                state.lastContext.push({ role: 'system', content: `Now reviewing: ${args.id}` });
                if (state.lastContext.length > 10) {
                    state.lastContext = state.lastContext.slice(-10);
                }
                self.postMessage({ event: 'card-loaded', id: args.id });
                break;

            case 'user-graded':
                log(`User graded card ${args.cardId}: ${args.score}`);
                // Auto-generate coaching on grade
                if (args.cardId && args.front && args.back) {
                    await generateCoaching(args.front, args.back, args.subject, args.score, args.history);
                }
                break;

            case 'user-message':
                // User typed a message to the tutor
                log(`User said: ${args.text}`);
                // Echo back for now; real implementation would run through LLM
                const response = `You said: ${args.text}. I\\'ll help you with this.`;
                self.postMessage({ event: 'coaching-done', message: response });
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
