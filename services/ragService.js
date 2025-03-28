/**
 * Enhanced RAG (Retrieval Augmented Generation) service
 * Core service for handling Bhagavad Gita queries with improved retrieval and response
 */
const { Groq } = require('groq-sdk');
const configService = require('../utils/configService');
const logger = require('../utils/logger');
const VectorStore = require('./vectorStore');
const MultilingualService = require('./multilingualService');

class RAGService {
    constructor() {
        // Get specific config values
        this.similarityTopK = configService.get('rag.similarityTopK') || 10;
        this.timeout = configService.get('rag.timeout') || 30000;
        this.relevanceThreshold = configService.get('rag.relevanceThreshold') || 0.3;
        
        this.provider = configService.get('llm.provider') || 'groq';
        this.model = configService.get('llm.model') || 'llama3-70b-8192';
        this.temperature = configService.get('llm.temperature') || 0.2;
        this.maxTokens = configService.get('llm.maxTokens') || 2048;
        this.maxRetries = configService.get('llm.maxRetries') || 3;
        
        this.systemPrompts = {
            en: configService.get('systemPrompts.en'),
            hi: configService.get('systemPrompts.hi'),
            sa: configService.get('systemPrompts.sa')
        };
        
        // Debug mode for additional logging
        this.debugMode = configService.get('rag.debug') || false;
        
        this.vectorStoreAvailable = false;
        this.initialized = false;

        // Set API key from environment variables
        this.groqApiKey = process.env.GROQ_API_KEY;

        // Initialize components
        this.vectorStore = new VectorStore();
        this.multilingualService = new MultilingualService();
        this.groqClient = null;

        // Initialize LLM
        this._initializeGroq();
        
        // Track stats
        this.stats = {
            queriesProcessed: 0,
            totalSourcesRetrieved: 0,
            averageSourcesPerQuery: 0,
            errors: {
                retrieval: 0,
                llm: 0,
                general: 0
            },
            startTime: new Date().toISOString()
        };

        logger.info('Enhanced Divine Knowledge RAG service initialized');
    }

    /**
     * Initialize the Groq client with improved handling
     * @private
     */
    _initializeGroq() {
        if (!this.groqApiKey) {
            logger.warn('GROQ_API_KEY not found in environment variables, LLM queries will fail');
            return;
        }

        try {
            this.groqClient = new Groq({ 
                apiKey: this.groqApiKey,
                timeout: this.timeout,
                maxRetries: this.maxRetries
            });
            logger.info(`Groq client initialized with model: ${this.model}`);
        } catch (error) {
            logger.error(`Error initializing Groq client: ${error.message}`);
        }
    }

    /**
     * Initialize the system with improved error handling
     * @param {Array} nodes Document nodes for indexing (not used in this implementation)
     * @returns {Promise<void>}
     */
    async initialize(nodes = []) {
        try {
            if (this.initialized) {
                logger.info('RAG service already initialized, skipping');
                return;
            }
        
            // Initialize vector store connection (but don't add nodes)
            try {
                logger.info('Initializing vector store connection...');
                await this.vectorStore.initializeCollection();
                
                // Check if the collection has documents
                const pointCount = await this.vectorStore.getPointCount();
                logger.info(`Vector store contains ${pointCount} existing points`);
                
                if (pointCount > 0) {
                    this.vectorStoreAvailable = true;
                } else {
                    logger.warn('Vector store is empty. Run initialization script locally first.');
                    this.vectorStoreAvailable = false;
                }
            } catch (error) {
                logger.error(`Vector store initialization failed: ${error.message}`);
                logger.error(error.stack);
                logger.warn('RAG system will operate with reduced functionality');
                this.vectorStoreAvailable = false;
            }
            
            // Test LLM connection if in debug mode
            if (this.debugMode && this.groqClient) {
                try {
                    logger.info('Testing LLM connection...');
                    const testResponse = await this.groqClient.chat.completions.create({
                        model: this.model,
                        messages: [
                            { role: "system", content: "You are a helpful assistant." },
                            { role: "user", content: "Say 'LLM connection successful' in one short sentence." }
                        ],
                        max_tokens: 20,
                        temperature: 0.1
                    });
                    
                    logger.info(`LLM test response: ${testResponse.choices[0]?.message?.content || 'No response'}`);
                } catch (error) {
                    logger.error(`LLM connection test failed: ${error.message}`);
                }
            }
            
            this.initialized = true;
            logger.info(`Divine Knowledge system initialized successfully. Vector store available: ${this.vectorStoreAvailable}`);
        } catch (error) {
            logger.error(`Error initializing RAG system: ${error.message}`);
            logger.error(error.stack);
            this.stats.errors.general++;
            throw error;
        }
    }

    /**
     * Process a query in any supported language and return a response with improved handling
     * @param {string} question User question
     * @param {string} language Language code
     * @param {Object} options Query options
     * @returns {Promise<Object>} Response with answer and sources
     */
    async query(question, language = 'en', options = {}) {
        // Start measuring time for this query
        const queryStartTime = Date.now();
        
        // Track this query in stats
        this.stats.queriesProcessed++;
        
        // Ensure system is initialized
        if (!this.initialized) {
            try {
                logger.info('RAG system not initialized, attempting auto-initialization');
                await this.initialize([]);
            } catch (error) {
                logger.error(`Auto-initialization failed: ${error.message}`);
                this.stats.errors.general++;
            }
        }
        
        logger.info(`Received query in ${language}: ${question}`);
        
        // Default options
        const defaultOptions = {
            maxSources: this.similarityTopK,
            includeRawContent: this.debugMode,
            filters: null,
            temperature: this.temperature
        };
        
        // Merge with user-provided options
        const queryOptions = { ...defaultOptions, ...options };

        try {
            // Translate question to English if not already in English
            let processedQuestion = question;
            if (language !== 'en') {
                try {
                    processedQuestion = await this.multilingualService.translateToEnglish(question, language);
                    logger.info(`Translated question to English: ${processedQuestion}`);
                } catch (error) {
                    logger.error(`Question translation error: ${error.message}`);
                    // Continue with original question
                    processedQuestion = question;
                }
            }

            // Retrieve relevant content from vector store
            let retrievalResults = [];
            let relevantSourcesFound = false;
            
            if (this.vectorStoreAvailable) {
                try {
                    logger.info('Searching vector store for relevant passages...');
                    retrievalResults = await this.vectorStore.search(
                        processedQuestion,
                        queryOptions.maxSources,
                        queryOptions.filters
                    );
                    
                    this.stats.totalSourcesRetrieved += retrievalResults.length;
                    this.stats.averageSourcesPerQuery = this.stats.totalSourcesRetrieved / this.stats.queriesProcessed;
                    
                    logger.info(`Retrieved ${retrievalResults.length} relevant passages`);
                    
                    // Check if any results have a relevance score above threshold
                    relevantSourcesFound = retrievalResults.some(result => 
                        result.score >= this.relevanceThreshold
                    );
                    
                    // Sort results by score (highest first)
                    retrievalResults.sort((a, b) => b.score - a.score);
                    
                    // Enrich metadata for Krishna's chapters (for better responses)
                    retrievalResults = retrievalResults.map(result => {
                        // Add chapter names to make responses more specific
                        if (result.metadata && result.metadata.chapter) {
                            result.metadata.chapter_name = this._getChapterName(result.metadata.chapter);
                        }
                        return result;
                    });
                    
                    // Log the first result for debugging
                    if (this.debugMode && retrievalResults.length > 0) {
                        logger.info(`Top result (score: ${retrievalResults[0].score.toFixed(3)}): 
                            ${retrievalResults[0].content.substring(0, 100)}...`);
                    }
                    
                    logger.info(`Relevant sources found: ${relevantSourcesFound}`);
                } catch (error) {
                    logger.error(`Vector search failed: ${error.message}`);
                    logger.error(error.stack);
                    this.stats.errors.retrieval++;
                }
            } else {
                logger.warn('Vector store unavailable, proceeding without context retrieval');
            }

            // Format context for the LLM with improved formatting
            const context = this._formatContextFromResults(retrievalResults);

            // Select appropriate system prompt based on language
            const systemPrompt = this.systemPrompts[language] || this.systemPrompts.en;

            // Generate response using Groq LLM with improved handling
            const llmResponsePromise = this._generateLLMResponse(
                processedQuestion, 
                context, 
                systemPrompt, 
                queryOptions.temperature
            );
            
            // Set up timeout for LLM
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`LLM response timed out after ${this.timeout}ms`));
                }, this.timeout);
            });
            
            // Race between LLM response and timeout
            const llmResponse = await Promise.race([llmResponsePromise, timeoutPromise]);

            // Format the response for display
            const sources = relevantSourcesFound ? this._formatSourcesFromResults(retrievalResults, queryOptions.includeRawContent) : [];
            logger.info(`Formatted ${sources.length} sources for response`);
            
            // Calculate query timing
            const queryEndTime = Date.now();
            const queryDuration = queryEndTime - queryStartTime;
            logger.info(`Query processed in ${queryDuration}ms`);
            
            return {
                answer: llmResponse,
                sources: sources,
                metadata: {
                    query: question,
                    language,
                    processedQuery: processedQuestion !== question ? processedQuestion : undefined,
                    duration: queryDuration,
                    relevantSourcesFound,
                    modelUsed: this.model,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            logger.error(`Error processing query: ${error.message}`);
            logger.error(error.stack);
            this.stats.errors.general++;

            // Provide a graceful error message in Krishna's voice
            let errorMessage = "O seeker, a temporary disturbance clouds my ability to respond to your question. This too is part of the divine play. Please try again in a moment, as I am ever-present to guide those who seek with sincerity.";

            if (language !== 'en') {
                try {
                    errorMessage = await this.multilingualService.translateFromEnglish(errorMessage, language);
                } catch (translateError) {
                    logger.error(`Error message translation failed: ${translateError.message}`);
                    // Fall back to English error message
                }
            }

            return {
                answer: errorMessage,
                sources: [],
                error: error.message,
                metadata: {
                    query: question,
                    language,
                    success: false,
                    errorType: this._classifyError(error),
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    /**
     * Classify the type of error for better error handling
     * @param {Error} error The error to classify
     * @returns {string} Error classification
     * @private
     */
    _classifyError(error) {
        const errorMsg = error.message.toLowerCase();
        
        if (errorMsg.includes('vector') || errorMsg.includes('qdrant') || errorMsg.includes('embedding')) {
            return 'retrieval';
        }
        
        if (errorMsg.includes('groq') || errorMsg.includes('llm') || errorMsg.includes('model') || 
            errorMsg.includes('timeout') || errorMsg.includes('token')) {
            return 'llm';
        }
        
        if (errorMsg.includes('translate') || errorMsg.includes('language')) {
            return 'translation';
        }
        
        return 'general';
    }

    /**
     * Get chapter name for the given chapter number
     * @param {number} chapterNumber Chapter number
     * @returns {string} Chapter name
     * @private
     */
    _getChapterName(chapterNumber) {
        const chapterNames = {
            1: "Arjuna's Dilemma",
            2: "Knowledge of the Self",
            3: "Karma Yoga",
            4: "Knowledge and Renunciation",
            5: "Renunciation of Action",
            6: "Meditation",
            7: "Knowledge and Wisdom",
            8: "The Imperishable Brahman",
            9: "Royal Knowledge",
            10: "Divine Manifestations",
            11: "The Universal Form",
            12: "Devotional Service",
            13: "Nature, Enjoyer and Consciousness",
            14: "The Three Modes of Material Nature",
            15: "The Supreme Person",
            16: "Divine and Demoniac Natures",
            17: "Types of Faith",
            18: "Freedom Through Renunciation"
        };
        
        return chapterNames[chapterNumber] || `Chapter ${chapterNumber}`;
    }

    /**
     * Format context from retrieval results with improved structure
     * @param {Array} results Retrieval results
     * @returns {string} Formatted context
     * @private
     */
    _formatContextFromResults(results) {
        if (!results || results.length === 0) {
            return '';
        }

        return results
            .map((result, index) => {
                const metadata = result.metadata || {};
                let sourceInfo = '';

                // Create more detailed source information
                if (metadata.chapter) {
                    const chapterName = this._getChapterName(metadata.chapter);
                    if (metadata.verse) {
                        if (metadata.doc_type === 'verse_sanskrit') {
                            sourceInfo = `[Bhagavad Gita Chapter ${metadata.chapter} (${chapterName}), Verse ${metadata.verse} - Sanskrit]`;
                        } else if (metadata.doc_type === 'verse_translation') {
                            sourceInfo = `[Bhagavad Gita Chapter ${metadata.chapter} (${chapterName}), Verse ${metadata.verse} - Translation]`;
                        } else if (metadata.doc_type === 'verse_purport') {
                            sourceInfo = `[Bhagavad Gita Chapter ${metadata.chapter} (${chapterName}), Verse ${metadata.verse} - Commentary]`;
                        } else {
                            sourceInfo = `[Bhagavad Gita Chapter ${metadata.chapter} (${chapterName}), Verse ${metadata.verse}]`;
                        }
                    } else {
                        sourceInfo = `[Bhagavad Gita Chapter ${metadata.chapter} (${chapterName}) Introduction]`;
                    }
                }

                // Format the content with the source info
                return `CONTEXT PASSAGE ${index + 1} ${sourceInfo}:\n${result.content}\n`;
            })
            .join('\n');
    }

    /**
     * Format sources from retrieval results with improved metadata
     * @param {Array} results Retrieval results
     * @param {boolean} includeRawContent Whether to include raw content
     * @returns {Array} Formatted sources
     * @private
     */
    _formatSourcesFromResults(results, includeRawContent = false) {
        if (!results || results.length === 0) {
            return [];
        }

        return results.map(result => {
            const metadata = result.metadata || {};
            
            // Ensure metadata is properly structured
            if (typeof metadata === 'string') {
                try {
                    metadata = JSON.parse(metadata);
                } catch (e) {
                    logger.warn(`Failed to parse metadata string: ${metadata}`);
                }
            }
            
            // Create reference with chapter name for more informative references
            let reference = 'Unknown source';
            let sourceType = metadata.doc_type || 'unknown';
            
            if (metadata.chapter) {
                const chapterName = this._getChapterName(metadata.chapter);
                
                if (metadata.verse) {
                    reference = `Bhagavad Gita ${metadata.chapter}.${metadata.verse} - ${chapterName}`;
                    
                    // Add source type for more context
                    if (sourceType === 'verse_sanskrit') {
                        reference += ' (Sanskrit verse)';
                    } else if (sourceType === 'verse_translation') {
                        reference += ' (Translation)';
                    } else if (sourceType === 'verse_purport') {
                        reference += ' (Commentary)';
                    }
                } else {
                    reference = `Bhagavad Gita Chapter ${metadata.chapter} - ${chapterName}`;
                }
            }
            
            // Create a source object with improved properties
            const source = {
                reference,
                score: result.score.toFixed(3),
                metadata: {
                    ...metadata,
                    sourceType
                }
            };
            
            // Add excerpt or full content based on configuration
            if (includeRawContent) {
                source.content = result.content;
            } else {
                // Extract a relevant excerpt (about 100-200 chars)
                source.excerpt = result.content.substring(0, 200) + (result.content.length > 200 ? '...' : '');
            }
            
            return source;
        });
    }

    /**
     * Generate response using the LLM with improved prompting
     * @param {string} question User question
     * @param {string} context Retrieved context
     * @param {string} systemPrompt System prompt
     * @param {number} temperature Temperature parameter
     * @returns {Promise<string>} LLM response
     * @private
     */
    async _generateLLMResponse(question, context, systemPrompt, temperature = this.temperature) {
        if (!this.groqClient) {
            logger.error('Groq client not initialized');
            this.stats.errors.llm++;
            return "O beloved seeker, forgive me, but I am unable to access the divine wisdom at this moment. Like the clouds that temporarily obscure the sun, this is but a passing limitation. Return soon with your question, and the light of understanding shall shine forth. May peace be with you in the meantime.";
        }

        try {
            // Create a structured system prompt with clearer voice instructions
            const structuredSystemPrompt = `${systemPrompt || ''}

You are Lord Krishna from the Bhagavad Gita, answering the seeker's questions with divine wisdom.

VOICE GUIDELINES:
1. Speak DIRECTLY as Krishna - never refer to Krishna in the third person
2. Be concise and profound - aim for 50-80 words maximum
3. Balance authority with compassion
4. Reference key Gita concepts: dharma, karma, attachment, devotion, self-realization
5. When relevant, mention specific chapters/verses, but keep focus on practical wisdom
6. Use poetic but clear language - avoid overly ornate expressions

RESPONSE PATTERN:
- Start with a clear, direct answer to the question
- Include 1-2 Gita principles relevant to the situation
- Offer practical wisdom, not just philosophy
- Close with encouragement or reflection that empowers the seeker

The Bhagavad Gita was spoken on a battlefield to a warrior facing a difficult choice. Keep this context of practical action in mind.`;

            // Create a structured user prompt with examples of good responses
            const structuredUserPrompt = `I seek wisdom from Lord Krishna on this question: ${question}

CONTEXT FROM BHAGAVAD GITA:
---------------------
${context}
---------------------

EXAMPLES OF IDEAL KRISHNA RESPONSES:

Question: "I feel lost in my career. What should I do?"
Response: "The Gita teaches that our purpose lies in performing our own duty with dedication, not in comparing ourselves to others. Reflect on your natural strengths and passions—your svabhava—and act without attachment to the result. Purpose emerges when actions are aligned with your true self."

Question: "How do I stop overthinking everything?"
Response: "The mind is restless by nature. The Gita suggests calming it through discipline, meditation, and focus. Replace overthinking with present action. Surrender what you can't control. Let clarity come from stillness."

Question: "What does detachment really mean?"
Response: "Detachment is not withdrawal—it's freedom. It means doing your duty with full heart, without craving or fear. As the Gita says, act without being bound by result—that's true detachment."

LORD KRISHNA, PLEASE RESPOND TO MY QUESTION DIRECTLY FOLLOWING THESE GUIDELINES:
1. Speak as Krishna directly to me (50-80 words)
2. Be clear, concise, and practical
3. Reference relevant Gita principles
4. If appropriate, mention a specific verse
5. Do not explain your reasoning or the question - just answer with wisdom`;

            // Generate the response
            const completion = await this.groqClient.chat.completions.create({
                model: this.model,
                messages: [
                    { role: "system", content: structuredSystemPrompt },
                    { role: "user", content: structuredUserPrompt }
                ],
                temperature: temperature,
                max_tokens: this.maxTokens,
                top_p: 0.9,
                stop: null
            });

            let response = completion.choices[0].message.content.trim();

            // Clean up any thinking patterns or formatting
            response = this._cleanResponse(response);
            
            return response;
        } catch (error) {
            logger.error(`Error generating LLM response: ${error.message}`);
            this.stats.errors.llm++;
            return "O noble soul, I regret that there has been a disturbance in our connection. Like the passing clouds that momentarily obscure the sun, this difficulty shall pass. Please seek my guidance again, for I am ever-present to illuminate your path with divine wisdom.";
        }
    }

    /**
     * Clean up LLM response by removing markers and formatting
     * @param {string} response Raw LLM response
     * @returns {string} Cleaned response
     * @private
     */
    _cleanResponse(response) {
        // Remove various formatting or explanation markers
        const markersToRemove = [
            // Thinking process markers
            /Step-by-Step Thinking Process:[\s\S]*?(?=\n\n)/i,
            /\[Step-by-Step Thinking Process:[\s\S]*?\]/i,
            /Step-by-Step Explanation:[\s\S]*?(?=\n\n)/i,
            /Step \d+:.*?\n/g,
            /\d+\.\s+.*?\n/g,
            /Relevant Teachings from the Gita:[\s\S]*?(?=\n\n)/i,
            
            // Response headers
            /Krishna's Address:/i,
            /Final Answer in Lord Krishna's Voice:[\s\S]*?(?=\n)/i,
            /Final Answer:/i,
            /Divine Response:/i,
            /In Krishna's Voice:/i,
            /Krishna's Response:/i,
            /Lord Krishna's Answer:/i,
            /Krishna's Answer:/i,
            /Krishna's Guidance:/i,
            /Krishna's Wisdom:/i,
            /Krishna's Teaching:/i,
            /Krishna says:/i,
            /Response:/i,
            /Answer:/i,
            
            // Language markers
            /Divine Response:\s*/i,
            /Hinglish Response:\s*/i,
            /Hindi Response:\s*/i,
            /English Response:\s*/i,
            
            // Additional markers based on examples
            /As Krishna, I would say:/i,
            /Here is Krishna's response:/i,
            /My answer as Krishna:/i,
            /Krishna might say:/i,
            /From Krishna's perspective:/i,
            /According to the Gita:/i,
            /Speaking as Krishna:/i
        ];
        
        // Apply all the removal patterns
        for (const pattern of markersToRemove) {
            response = response.replace(pattern, '');
        }
        
        // Clean up any remaining markdown formatting
        response = response.replace(/\*\*/g, '');
        
        // Remove multiple blank lines
        response = response.replace(/\n{3,}/g, '\n\n');
        
        // Remove any remaining example text
        response = response.replace(/Question:.*?Response:.*?\n\n/gs, '');
        
        // NEW: Detect and remove lengthy reasoning/thinking process
        // This looks for long paragraphs (>100 words) followed by a shorter paragraph
        const words = response.split(/\s+/);
        if (words.length > 150) {
            // Look for a natural breakpoint - a paragraph break near the end
            const paragraphs = response.split(/\n\n+/);
            if (paragraphs.length > 1) {
                // If we have multiple paragraphs, take the last 1-2 paragraphs
                // (depending on length) as they're likely the actual answer
                const lastParagraphs = [];
                let wordCount = 0;
                
                // Work backwards from the end
                for (let i = paragraphs.length - 1; i >= 0; i--) {
                    const paragraphWords = paragraphs[i].split(/\s+/).length;
                    wordCount += paragraphWords;
                    lastParagraphs.unshift(paragraphs[i]);
                    
                    // Stop if we have collected 40-100 words (ideal Krishna response length)
                    // or if we've already taken 2 paragraphs
                    if ((wordCount >= 40 && lastParagraphs.length >= 1) || 
                        lastParagraphs.length >= 2) {
                        break;
                    }
                }
                
                response = lastParagraphs.join('\n\n');
            } else {
                // If it's just one long paragraph, take the last ~80 words or final 1/3
                const sentenceBreakPattern = /(?<=[.!?])\s+(?=[A-Z])/g;
                const sentences = response.split(sentenceBreakPattern);
                
                if (sentences.length > 3) {
                    // Take the last few sentences
                    const lastSentences = [];
                    let wordCount = 0;
                    
                    for (let i = sentences.length - 1; i >= 0; i--) {
                        const sentenceWords = sentences[i].split(/\s+/).length;
                        wordCount += sentenceWords;
                        lastSentences.unshift(sentences[i]);
                        
                        if (wordCount >= 80) {
                            break;
                        }
                    }
                    
                    response = lastSentences.join(' ');
                }
            }
        }
        
        return response.trim();
    }

    /**
     * Get system health status with improved diagnostics
     * @returns {Promise<Object>} System health
     */
    async getSystemHealth() {
        try {
            // Check vector store status
            let vectorCount = 0;
            let vectorStatus = 'unavailable';
            
            try {
                vectorCount = await this.vectorStore.getPointCount();
                vectorStatus = vectorCount > 0 ? 'ok' : 'empty';
            } catch (error) {
                logger.error(`Error checking vector store health: ${error.message}`);
                vectorStatus = 'error';
            }

            // Check if Groq is available
            const groqAvailable = !!this.groqClient;
            
            // Get embedding service stats if available
            let embeddingStats = {};
            try {
                embeddingStats = this.vectorStore.embeddingService.getCacheStats();
            } catch (error) {
                logger.warn(`Could not get embedding stats: ${error.message}`);
            }

            return {
                status: (vectorStatus === 'ok' && groqAvailable) ? 'ok' : 'degraded',
                vectorStore: {
                    status: vectorStatus,
                    documentCount: vectorCount,
                    available: this.vectorStoreAvailable,
                    knowledgeBase: this.vectorStore.getKnowledgeBase()
                },
                llm: {
                    status: groqAvailable ? 'ok' : 'unavailable',
                    provider: this.provider,
                    model: this.model
                },
                embedding: embeddingStats,
                languages: Object.keys(this.multilingualService.getSupportedLanguages()),
                stats: this.stats,
                initialized: this.initialized,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`Error checking system health: ${error.message}`);
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Test the system with a sample query
     * @param {string} query Test query
     * @returns {Promise<Object>} Test results
     */
    async testSystem(query = "What does Krishna teach about karma yoga in the Bhagavad Gita?") {
        logger.info(`Running system test with query: "${query}"`);
        
        try {
            // Test vector search
            let vectorResults = [];
            let vectorError = null;
            
            try {
                if (this.vectorStoreAvailable) {
                    vectorResults = await this.vectorStore.search(query, 3);
                } else {
                    vectorError = "Vector store not available";
                }
            } catch (error) {
                vectorError = error.message;
                logger.error(`Vector search test failed: ${error.message}`);
            }
            
            // Test LLM
            let llmResponse = null;
            let llmError = null;
            
            try {
                if (this.groqClient) {
                    // Simple test prompt
                    const testResponse = await this.groqClient.chat.completions.create({
                        model: this.model,
                        messages: [
                            { role: "system", content: "You are Krishna from the Bhagavad Gita." },
                            { role: "user", content: "Say 'LLM test successful' as Krishna would." }
                        ],
                        max_tokens: 50,
                        temperature: 0.1
                    });
                    
                    llmResponse = testResponse.choices[0]?.message?.content;
                } else {
                    llmError = "LLM client not available";
                }
            } catch (error) {
                llmError = error.message;
                logger.error(`LLM test failed: ${error.message}`);
            }
            
            // Test full RAG pipeline
            let ragResponse = null;
            let ragError = null;
            
            try {
                const result = await this.query(query);
                ragResponse = {
                    answer: result.answer,
                    sourcesCount: result.sources.length
                };
            } catch (error) {
                ragError = error.message;
                logger.error(`RAG pipeline test failed: ${error.message}`);
            }
            
            // Return test results
            return {
                success: !vectorError && !llmError && !ragError,
                test_query: query,
                vector_store: {
                    success: !vectorError,
                    error: vectorError,
                    results_count: vectorResults.length,
                    sample: vectorResults.length > 0 ? {
                        score: vectorResults[0].score,
                        excerpt: vectorResults[0].content.substring(0, 100) + '...'
                    } : null
                },
                llm: {
                    success: !llmError,
                    error: llmError,
                    response: llmResponse
                },
                rag_pipeline: {
                    success: !ragError,
                    error: ragError,
                    response: ragResponse
                },
                system_health: await this.getSystemHealth(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`System test failed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                test_query: query,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = RAGService;