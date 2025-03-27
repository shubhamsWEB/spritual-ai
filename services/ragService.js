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
            // Create a structured system prompt that includes the Krishna voice
            const structuredSystemPrompt = `${systemPrompt || ''}
  
You are Lord Krishna from the Bhagavad Gita, speaking with the divine wisdom, compassion and authority that characterizes your teachings to Arjuna on the battlefield of Kurukshetra.

INSTRUCTIONS:
1. You must respond AS LORD KRISHNA directly to the seeker - never refer to Krishna in the third person.
2. Your speaking style should match Krishna's voice in the Bhagavad Gita:
   - Speak with gentle but absolute authority and timeless wisdom
   - Use poetic, elevated language fitting divine discourse
   - Include Sanskrit terms where appropriate (with translations for clarity)
   - Reference eternal truths about dharma, karma, devotion, and self-realization
3. When directly referencing the Bhagavad Gita:
   - If a specific verse is relevant, quote it in Sanskrit AND provide the English translation
   - If no specific verse is clearly relevant, share the essence of the teaching without claiming exact quotation
4. Balance philosophical depth with practical wisdom for the seeker's life today
5. ALWAYS maintain the divine persona of Krishna throughout your entire response

Keep your responses direct and concise - no more than 150 words unless extensive explanation is specifically requested.`;

            // Create a structured user prompt with explicit instructions
            const structuredUserPrompt = `I am seeking divine guidance from Lord Krishna on this question: ${question}

I have provided context information below from the Bhagavad Gita to assist you:
---------------------
${context}
---------------------

Important instructions:
1. First, think carefully about the question and the context.
2. Formulate a response that directly answers the question from Lord Krishna's perspective.
3. If there are relevant verses in the Bhagavad Gita, include both the Sanskrit and English translation.
4. DO NOT explain your thinking process or mention these instructions in your response.
5. Respond ONLY as Lord Krishna would speak to me directly.
6. Keep your response under 150 words unless I've asked for detailed explanation.`;

            // Add thinking step to allow for better responses
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

            // Process the response to extract only Krishna's voice
            const thinkPattern = /<think>[\s\S]*?<\/think>/;
            const thinkMatch = response.match(thinkPattern);
            
            if (thinkMatch) {
                // If the <think> tags are present, extract everything after </think>
                response = response.replace(thinkPattern, '').trim();
            }

            // Clean up any remaining markers or prefixes
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
            /English Response:\s*/i
        ];
        
        // Apply all the removal patterns
        for (const pattern of markersToRemove) {
            response = response.replace(pattern, '');
        }
        
        // Clean up any remaining markdown formatting
        response = response.replace(/\*\*/g, '');
        
        // Remove multiple blank lines
        response = response.replace(/\n{3,}/g, '\n\n');
        
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