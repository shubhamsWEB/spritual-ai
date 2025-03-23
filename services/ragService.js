/**
 * RAG (Retrieval Augmented Generation) service
 * Core service for handling spiritual queries with Lord Krishna's voice
 */
const { Groq } = require('groq-sdk');
const config = require('config');
const logger = require('../utils/logger');
const VectorStore = require('./vectorStore');

class RAGService {
    constructor() {
        // Initialize configuration
        this.ragConfig = config.get('rag');
        this.llmConfig = config.get('llm');
        this.systemPrompts = config.get('systemPrompts');
        this.vectorStoreAvailable = true; // Flag to track vector store availability

        // Set API key from environment variables
        this.groqApiKey = process.env.GROQ_API_KEY;

        // Initialize components
        this.vectorStore = new VectorStore();
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
            // Initialize vector store
            try {
                await this.vectorStore.initializeCollection();

                // Add nodes if provided
                if (nodes && nodes.length > 0) {
                    await this.vectorStore.addDocuments(nodes);
                    logger.info(`Added ${nodes.length} document nodes to vector store`);
                }
                
                this.vectorStoreAvailable = true;
            } catch (error) {
                logger.error(`Vector store initialization failed: ${error.message}`);
                logger.warn('RAG system will operate with reduced functionality');
                this.vectorStoreAvailable = false;
            }

            logger.info('Divine Knowledge system initialized successfully');
        } catch (error) {
            logger.error(`Error initializing RAG system: ${error.message}`);
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
        console.log("🚀 ~ RAGService ~ query ~ language:", language);
        // Translate question to English if not already in English
        logger.info(`Received query in ${language}: ${question}`);

        try {
            // Retrieve relevant content from vector store
            let retrievalResults = [];
            if (this.vectorStoreAvailable) {
                try {
                    retrievalResults = await this.vectorStore.search(
                        question,
                        this.ragConfig.similarityTopK
                    );
                    logger.info(`Retrieved ${retrievalResults.length} relevant passages`);
                } catch (error) {
                    logger.error(`Vector search failed: ${error.message}`);
                }
            } else {
                logger.warn('Vector store unavailable, proceeding without context retrieval');
            }

            // Format context for the LLM
            const context = this._formatContextFromResults(retrievalResults);

            // Select appropriate system prompt based on language
            const systemPrompt = this.systemPrompts[language] || this.systemPrompts.en;

            // Generate response using Groq LLM
            const llmResponse = await this._generateLLMResponse(question, context, systemPrompt);

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
            return {
                answer: responseText,
                sources: this._formatSourcesFromResults(retrievalResults)
            };
        } catch (error) {
            logger.error(`Error processing query: ${error.message}`);

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
      
      CRITICAL FORMAT INSTRUCTIONS:
      You MUST structure your response in EXACTLY this format:
      
      <think>
      [Your step-by-step thinking process analyzing the question and relevant context]
      [Identify which verses or teachings from the Gita are most relevant]
      [Determine how Krishna would address this specific question]
      </think>
      
      [Your final answer in Lord Krishna's divine voice]
      
      The <think> section will be hidden from the user and is only for your internal reasoning.
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
                model: this.llmConfig.model,
                messages: [
                    { role: "system", content: structuredSystemPrompt },
                    { role: "user", content: structuredUserPrompt }
                ],
                temperature: this.llmConfig.temperature,
                max_tokens: this.llmConfig.maxTokens,
            });

            let response = completion.choices[0].message.content.trim();

            // Process the response to extract only the final answer
            const thinkPattern = /<think>[\s\S]*?<\/think>/;
            const thinkMatch = response.match(thinkPattern);

            if (thinkMatch) {
                // If the <think> tags are present, extract everything after </think>
                response = response.replace(thinkPattern, '').trim();
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
            console.log("🚀 ~ RAGService ~ _generateLLMResponse ~ response:", response);
            
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
                    provider: this.llmConfig.provider,
                    model: this.llmConfig.model
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