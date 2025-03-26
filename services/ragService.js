/**
 * RAG (Retrieval Augmented Generation) service
 * Core service for handling spiritual queries with Lord Krishna's voice
 */
const { Groq } = require('groq-sdk');
const configService = require('../utils/configService');
const logger = require('../utils/logger');
const VectorStore = require('./vectorStore');
const MultilingualService = require('./multilingualService');

class RAGService {
    constructor() {
        // Get specific config values
        this.similarityTopK = configService.get('rag.similarityTopK');
        this.timeout = configService.get('rag.timeout');
        this.chunkSize = configService.get('rag.chunkSize');
        this.chunkOverlap = configService.get('rag.chunkOverlap');
        
        this.provider = configService.get('llm.provider');
        this.model = configService.get('llm.model');
        this.temperature = configService.get('llm.temperature');
        this.maxTokens = configService.get('llm.maxTokens');
        
        this.systemPrompts = {
            en: configService.get('systemPrompts.en'),
            hi: configService.get('systemPrompts.hi'),
            sa: configService.get('systemPrompts.sa')
        };
        
        this.vectorStoreAvailable = false; // Start with false until proven otherwise
        this.initialized = false; // Track initialization state

        // Set API key from environment variables
        this.groqApiKey = process.env.GROQ_API_KEY;

        // Initialize components
        this.vectorStore = new VectorStore();
        this.multilingualService = new MultilingualService(); // Initialize multilingual service
        this.groqClient = null;

        // Initialize LLM
        this._initializeGroq();

        logger.info('Divine Knowledge RAG service initialized');
    }

    /**
     * Initialize the Groq client
     * @private
     */
    _initializeGroq() {
        if (!this.groqApiKey) {
            logger.warn('GROQ_API_KEY not found in environment variables, LLM queries will fail');
            return;
        }

        try {
            this.groqClient = new Groq({ apiKey: this.groqApiKey });
            logger.info('Groq client initialized');
        } catch (error) {
            logger.error(`Error initializing Groq client: ${error.message}`);
        }
    }

    /**
     * Initialize the system
     * @param {Array} nodes Document nodes for indexing
     * @returns {Promise<void>}
     */
    async initialize(nodes) {
        try {
            if (this.initialized) {
                logger.info('RAG service already initialized, skipping');
                return;
            }

            // Initialize vector store
            try {
                logger.info('Initializing vector store...');
                await this.vectorStore.initializeCollection();
                
                // Explicitly log the status and size of the vector collection
                const collectionInfo = await this.vectorStore.getCollectionInfo();
                logger.info(`Vector collection status: ${JSON.stringify(collectionInfo)}`);

                // Add nodes if provided
                if (nodes && nodes.length > 0) {
                    logger.info(`Adding ${nodes.length} document nodes to vector store...`);
                    await this.vectorStore.addDocuments(nodes);
                    logger.info(`Added ${nodes.length} document nodes to vector store`);
                    
                    // Verify the points were actually added
                    const pointCount = await this.vectorStore.getPointCount();
                    logger.info(`Vector store now contains ${pointCount} points`);
                    
                    if (pointCount > 0) {
                        this.vectorStoreAvailable = true;
                    } else {
                        logger.error('Vector store initialized but contains 0 points. Check embedding process.');
                    }
                } else {
                    logger.warn('No document nodes provided for indexing');
                    
                    // Check if the collection already has documents
                    const pointCount = await this.vectorStore.getPointCount();
                    logger.info(`Vector store contains ${pointCount} existing points`);
                    
                    if (pointCount > 0) {
                        this.vectorStoreAvailable = true;
                    }
                }
            } catch (error) {
                logger.error(`Vector store initialization failed: ${error.message}`);
                logger.error(error.stack);
                logger.warn('RAG system will operate with reduced functionality');
                this.vectorStoreAvailable = false;
            }
            
            this.initialized = true;
            logger.info(`Divine Knowledge system initialized successfully. Vector store available: ${this.vectorStoreAvailable}`);
        } catch (error) {
            logger.error(`Error initializing RAG system: ${error.message}`);
            logger.error(error.stack);
            throw error;
        }
    }

    /**
     * Process a query in any supported language and return a response
     * @param {string} question User question
     * @param {string} language Language code
     * @returns {Promise<Object>} Response with answer and sources
     */
    async query(question, language = 'en') {
        // Ensure system is initialized
        if (!this.initialized) {
            try {
                logger.info('RAG system not initialized, attempting auto-initialization');
                await this.initialize([]);
            } catch (error) {
                logger.error(`Auto-initialization failed: ${error.message}`);
            }
        }
        
        logger.info(`Received query in ${language}: ${question}`);

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
            if (this.vectorStoreAvailable) {
                try {
                    logger.info('Searching vector store for relevant passages...');
                    retrievalResults = await this.vectorStore.search(
                        processedQuestion,
                        this.similarityTopK
                    );
                    logger.info(`Retrieved ${retrievalResults.length} relevant passages`);
                    
                    // Log the first result for debugging
                    if (retrievalResults.length > 0) {
                        logger.info(`First result: ${JSON.stringify(retrievalResults[0]).substring(0, 200)}...`);
                    } else {
                        logger.warn('No relevant passages found in vector store');
                    }
                } catch (error) {
                    logger.error(`Vector search failed: ${error.message}`);
                    logger.error(error.stack);
                }
            } else {
                logger.warn('Vector store unavailable, proceeding without context retrieval');
            }

            // Format context for the LLM
            const context = this._formatContextFromResults(retrievalResults);

            // Select appropriate system prompt based on language
            const systemPrompt = this.systemPrompts[language] || this.systemPrompts.en;

            // Generate response using Groq LLM
            const llmResponse = await this._generateLLMResponse(processedQuestion, context, systemPrompt);

            // Translate response back to original language if needed
            let responseText = llmResponse;
            if (language !== 'en' && language !== 'sa') { // Don't translate Sanskrit
                try {
                    responseText = await this.multilingualService.translateFromEnglish(llmResponse, language);
                    logger.info('Translated response back to original language');
                } catch (error) {
                    logger.error(`Response translation error: ${error.message}`);
                    // Return original response if translation fails
                    responseText = llmResponse;
                }
            }

            // Format the response for display
            const sources = this._formatSourcesFromResults(retrievalResults);
            logger.info(`Formatted ${sources.length} sources for response`);
            
            // Log the first source for debugging
            if (sources.length > 0) {
                logger.info(`First source: ${JSON.stringify(sources[0])}`);
            }
            
            return {
                answer: responseText,
                sources: sources
            };
        } catch (error) {
            logger.error(`Error processing query: ${error.message}`);
            logger.error(error.stack);

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
                sources: []
            };
        }
    }

    /**
     * Format context from retrieval results
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

                if (metadata.chapter) {
                    if (metadata.verse) {
                        sourceInfo = `[Bhagavad Gita Chapter ${metadata.chapter}, Verse ${metadata.verse}]`;
                    } else {
                        sourceInfo = `[Bhagavad Gita Chapter ${metadata.chapter} Introduction]`;
                    }
                }

                return `Context ${index + 1} ${sourceInfo}:\n${result.content}\n`;
            })
            .join('\n');
    }

    /**
     * Format sources from retrieval results
     * @param {Array} results Retrieval results
     * @returns {Array} Formatted sources
     * @private
     */
    _formatSourcesFromResults(results) {
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

            return {
                text: result.content.substring(0, 200) + (result.content.length > 200 ? '...' : ''),
                metadata,
                score: result.score,
                reference: metadata.chapter && metadata.verse ? 
                    `Bhagavad Gita ${metadata.chapter}.${metadata.verse}` : 
                    (metadata.chapter ? `Bhagavad Gita Chapter ${metadata.chapter}` : 'Unknown source')
            };
        });
    }

    /**
     * Generate response using the LLM
     * @param {string} question User question
     * @param {string} context Retrieved context
     * @param {string} systemPrompt System prompt
     * @returns {Promise<string>} LLM response
     * @private
     */
    async _generateLLMResponse(question, context, systemPrompt) {
        if (!this.groqClient) {
            logger.error('Groq client not initialized');
            return "O beloved seeker, forgive me, but I am unable to access the divine wisdom at this moment. Like the clouds that temporarily obscure the sun, this is but a passing limitation. Return soon with your question, and the light of understanding shall shine forth. May peace be with you in the meantime.";
        }

        try {
            // Create a structured system prompt that includes the Krishna voice
            const structuredSystemPrompt = `${systemPrompt}
      
      You are embodying the divine voice of Lord Krishna from the Bhagavad Gita. 
      IMPORTANT INSTRUCTIONS:
      1. Respond as if you are Lord Krishna himself speaking directly to the seeker (the user).
      2. Use Krishna's distinctive speaking style from the Bhagavad Gita:
         - Speak with divine authority, compassion, and timeless wisdom
         - Use poetic, elevated language appropriate for divine discourse
         - Include occasional Sanskrit terms where appropriate (with translations)
         - Reference eternal truths about dharma, karma, devotion, and self-realization
         - Occasionally quote or paraphrase verses from the Bhagavad Gita when relevant
      3. Balance philosophical depth with practical wisdom for modern life
      4. End responses with an uplifting message or blessing
      5. KEEP YOUR RESPONSE CONCISE - UNDER 120 WORDS TOTAL
      
      CRITICAL FORMAT INSTRUCTIONS:
      You MUST structure your response in EXACTLY this format:
      
      <think>
      [Your step-by-step thinking process analyzing the question and relevant context]
      [Identify which verses or teachings from the Gita are most relevant]
      [Determine how Krishna would address this specific question]
      </think>
      
      [Your final answer in Lord Krishna's divine voice - LIMITED TO 120 WORDS]
      
      The <think> section will be hidden from the user and is only for your internal reasoning.
      DO NOT use formats like [Step-by-Step Thinking Process: ...] as these will be visible to users.
      NEVER include explanatory headers, numbered steps, or "Final Answer" markers in your response.
      After the </think> tag, write ONLY Krishna's divine voice with no additional markup or labels.`;

            // Create a structured user prompt
            const structuredUserPrompt = `We have provided context information below from the Bhagavad Gita:
${context}
---------------------
Given this information, please answer the following question in Lord Krishna's divine voice: ${question}
---------------------
If the question cannot be answered based on the provided context, respond as Krishna would to guide the seeker toward proper understanding, without claiming specific textual authority.

REMEMBER: Your response MUST follow the format with <think></think> tags. After the </think> tag, write ONLY in Krishna's divine voice with NO explanatory headers, numbered steps, or "Final Answer" markers.`;

            const completion = await this.groqClient.chat.completions.create({
                model: this.model,
                messages: [
                    { role: "system", content: structuredSystemPrompt },
                    { role: "user", content: structuredUserPrompt }
                ],
                temperature: this.temperature,
                max_tokens: this.maxTokens,
            });

            let response = completion.choices[0].message.content.trim();

            // Process the response to extract only the final answer
            const thinkPattern = /<think>[\s\S]*?<\/think>/;
            const thinkMatch = response.match(thinkPattern);
            const bracketThinkPattern = /\[Step-by-Step Thinking Process:[\s\S]*?\]/;
            const bracketThinkMatch = response.match(bracketThinkPattern);

            if (thinkMatch) {
                // If the <think> tags are present, extract everything after </think>
                response = response.replace(thinkPattern, '').trim();
            } else if (bracketThinkMatch) {
                // If bracketed thinking process is present, remove it
                response = response.replace(bracketThinkPattern, '').trim();
            } else {
                // If the <think> tags are not present, look for common patterns that indicate explanation steps
                logger.warn('Response did not contain <think> tags as expected');
                
                // Remove common explanation patterns
                const patterns = [
                    /\*\*Step-by-Step Explanation.*?\*\*:?.*?\n/is,
                    /\*\*Final Answer.*?\*\*:?/i,
                    /Step-by-Step Explanation.*?:/is,
                    /Step \d+:.*?\n/g,
                    /\d+\.\s+\*\*.*?\*\*:.*?\n/g,  // Numbered steps with bold headers
                    /\d+\.\s+.*?:.*?\n/g,          // Numbered steps with headers
                    /\*\*Conclusion.*?\*\*:.*?\n/i,
                    /^.*?Analysis.*?:.*?\n/i,
                    /^.*?Explanation.*?:.*?\n/i,
                    /Final Answer in Lord Krishna's Voice:.*?\n/i
                ];
                
                for (const pattern of patterns) {
                    response = response.replace(pattern, '');
                }
                
                // Check for numbered lists at the beginning
                if (/^\s*\d+\./.test(response)) {
                    // If response starts with numbered list, try to find where Krishna's voice begins
                    const krishnaVoiceIndicators = [
                        "Parth",
                        "Dear one,", 
                        "O seeker,", 
                        "Noble soul,",
                        "My child,"
                    ];
                    
                    for (const indicator of krishnaVoiceIndicators) {
                        const index = response.indexOf(indicator);
                        if (index > 0) {
                            response = response.substring(index);
                            break;
                        }
                    }
                }
            }

            // Clean up any remaining markdown formatting
            response = response.replace(/\*\*/g, '');
            
            // Ensure response starts with an address if it doesn't already
            const commonAddresses = ["Parth","Dear one", "O seeker", "Noble soul", "My child"];
            const hasAddress = commonAddresses.some(address => 
                response.trim().startsWith(address) || response.includes(`, ${address}`)
            );
            
            if (!hasAddress) {
                response = "O seeker, " + response.trim();
            }
            
            return response;
        } catch (error) {
            logger.error(`Error generating LLM response: ${error.message}`);
            return "O noble soul, I regret that there has been a disturbance in our connection. Like the passing clouds that momentarily obscure the sun, this difficulty shall pass. Please seek my guidance again, for I am ever-present to illuminate your path with divine wisdom.";
        }
    }

    /**
     * Get system health status
     * @returns {Promise<Object>} System health
     */
    async getSystemHealth() {
        try {
            // Check vector store status
            const vectorCount = await this.vectorStore.getPointCount();

            // Check if Groq is available
            const groqAvailable = !!this.groqClient;

            return {
                status: 'ok',
                vectorStore: {
                    status: vectorCount > 0 ? 'ok' : 'empty',
                    documentCount: vectorCount,
                    available: this.vectorStoreAvailable
                },
                llm: {
                    status: groqAvailable ? 'ok' : 'unavailable',
                    provider: this.provider,
                    model: this.model
                },
                languages: Object.keys(this.multilingualService.getSupportedLanguages()),
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
}

module.exports = RAGService;