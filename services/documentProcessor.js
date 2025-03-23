/**
 * Document processor service for the Bhagavad Gita
 * Processes the PDF and extracts structured content
 */
const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const config = require('config');
const logger = require('../utils/logger');

class DocumentProcessor {
  constructor(pdfPath = null) {
    this.pdfPath = pdfPath || config.get('documents.pdfPath');
    this.rawText = '';
    this.structuredDocs = [];
    this.nodes = [];
  }

  /**
   * Extract text from the Bhagavad Gita PDF
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromPdf() {
    try {
      logger.info(`Extracting text from ${this.pdfPath}`);
      
      const dataBuffer = await fs.readFile(this.pdfPath);
      const pdfData = await pdf(dataBuffer);
      
      this.rawText = pdfData.text;
      logger.info(`Successfully extracted ${this.rawText.length} characters from PDF`);
      
      return this.rawText;
    } catch (error) {
      logger.error(`Error extracting text from PDF: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean and structure the extracted text
   * @returns {Promise<Array>} Structured documents
   */
  async cleanAndStructureText() {
    if (!this.rawText) {
      logger.warn('No text to structure. Call extractTextFromPdf first.');
      return [];
    }
    
    logger.info('Cleaning and structuring text...');
    
    try {
      // Clean the text
      const cleanedText = this.rawText.replace(/\s+/g, ' ').trim();
      
      // Extract chapters and verses
      const structuredDocs = [];
      
      // Chapter pattern (adjust based on actual PDF format)
      const chapterRegex = /Chapter (\d+)[:\s]+(.*?)(?=Chapter \d+:|$)/gs;
      const chapterMatches = [...cleanedText.matchAll(chapterRegex)];
      
      for (const chapterMatch of chapterMatches) {
        const chapterNum = parseInt(chapterMatch[1], 10);
        const chapterContent = chapterMatch[2].trim();
        
        // Extract chapter introduction (text before first verse)
        const chapterParts = chapterContent.split(/Verse \d+:/);
        const chapterIntro = chapterParts[0].trim();
        
        structuredDocs.push({
          type: 'chapter_intro',
          chapter: chapterNum,
          content: chapterIntro,
          metadata: {
            chapter: chapterNum,
            content_type: 'introduction'
          }
        });
        
        // Extract verses
        const verseRegex = /Verse (\d+):[:\s]+(.*?)(?=Verse \d+:|$)/gs;
        const verseMatches = [...chapterContent.matchAll(verseRegex)];
        
        for (const verseMatch of verseMatches) {
          const verseNum = parseInt(verseMatch[1], 10);
          const verseContent = verseMatch[2].trim();
          
          // Split verse text from commentary if possible
          const verseParts = verseContent.split(/\n\s*\n/);
          const verseText = verseParts[0].trim();
          const commentary = verseParts.length > 1 ? verseParts.slice(1).join('\n\n').trim() : '';
          
          structuredDocs.push({
            type: 'verse',
            chapter: chapterNum,
            verse: verseNum,
            content: verseText,
            commentary,
            metadata: {
              chapter: chapterNum,
              verse: verseNum,
              content_type: 'verse'
            }
          });
        }
      }
      
      this.structuredDocs = structuredDocs;
      logger.info(`Structured document into ${structuredDocs.length} sections`);
      
      return structuredDocs;
    } catch (error) {
      logger.error(`Error structuring text: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create nodes for indexing
   * @param {number} chunkSize Size of each text chunk
   * @param {number} chunkOverlap Overlap between chunks
   * @returns {Promise<Array>} Nodes for indexing
   */
  async createNodesForIndexing(chunkSize = 512, chunkOverlap = 50) {
    if (!this.structuredDocs || this.structuredDocs.length === 0) {
      logger.warn('No structured documents. Call cleanAndStructureText first.');
      return [];
    }
    
    logger.info('Creating nodes for indexing...');
    
    try {
      const nodes = [];
      
      for (const doc of this.structuredDocs) {
        let content = '';
        
        if (doc.type === 'verse') {
          // For verses, combine text and commentary
          content = `Chapter ${doc.chapter}, Verse ${doc.verse}:\n\n${doc.content}`;
          if (doc.commentary) {
            content += `\n\nCommentary:\n${doc.commentary}`;
          }
        } else {
          // For chapter introductions
          content = `Chapter ${doc.chapter} Introduction:\n\n${doc.content}`;
        }
        
        // Split content into chunks
        const chunks = this.splitTextIntoChunks(content, chunkSize, chunkOverlap);
        
        // Create nodes for each chunk
        chunks.forEach((chunk, i) => {
          nodes.push({
            id: `${doc.type}_${doc.chapter}_${doc.verse || 0}_${i}`,
            text: chunk,
            metadata: {
              ...doc.metadata,
              chunk_id: i,
              source_type: doc.type
            }
          });
        });
      }
      
      this.nodes = nodes;
      logger.info(`Created ${nodes.length} nodes for indexing`);
      
      return nodes;
    } catch (error) {
      logger.error(`Error creating nodes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Split text into chunks with overlap
   * @param {string} text Text to split
   * @param {number} chunkSize Size of each chunk
   * @param {number} chunkOverlap Overlap between chunks
   * @returns {Array<string>} Array of text chunks
   */
  splitTextIntoChunks(text, chunkSize, chunkOverlap) {
    if (!text) return [];
    
    // If the text is shorter than the chunk size, return it as a single chunk
    if (text.length <= chunkSize) {
      return [text];
    }
    
    const chunks = [];
    let startIndex = 0;
    
    while (startIndex < text.length) {
      // Get the chunk, ensuring we don't go past the end of text
      let endIndex = Math.min(startIndex + chunkSize, text.length);
      
      // If we're not at the end of the text, try to find a good split point
      if (endIndex < text.length) {
        // Look for the last period, question mark, or exclamation point followed by a space
        const lastSentenceEnd = text.substring(startIndex, endIndex).search(/[.!?]\s+[A-Z]/g);
        
        if (lastSentenceEnd !== -1 && lastSentenceEnd > chunkSize / 2) {
          // Found a good sentence boundary
          endIndex = startIndex + lastSentenceEnd + 2; // +2 to include the punctuation and space
        } else {
          // If no good sentence boundary, look for the last space
          const lastSpace = text.lastIndexOf(' ', endIndex);
          
          if (lastSpace > startIndex) {
            endIndex = lastSpace;
          }
        }
      }
      
      // Add the chunk
      chunks.push(text.substring(startIndex, endIndex).trim());
      
      // Move the start index for the next chunk, accounting for overlap
      startIndex = endIndex - chunkOverlap;
      
      // Ensure we're making forward progress
      if (startIndex <= 0 || startIndex >= text.length - 1) {
        break;
      }
    }
    
    return chunks;
  }

  /**
   * Process the document from PDF to nodes in one function
   * @returns {Promise<Array>} Nodes for indexing
   */
  async processDocument() {
    await this.extractTextFromPdf();
    await this.cleanAndStructureText();
    return this.createNodesForIndexing(
      config.get('rag.chunkSize'),
      config.get('rag.chunkOverlap')
    );
  }

  /**
   * Extract Sanskrit verses for specialized processing
   * @returns {Array} Sanskrit verses
   */
  extractSanskritVerses() {
    const sanskritVerses = [];
    
    for (const doc of this.structuredDocs) {
      if (doc.type === 'verse') {
        // Look for Sanskrit text (usually at the beginning of verses)
        // This is a simplified approach - may need refinement
        const content = doc.content;
        
        // Try to identify Sanskrit by looking at the first line or section
        const lines = content.split('\n');
        const sanskritText = lines[0] || '';
        
        sanskritVerses.push({
          chapter: doc.chapter,
          verse: doc.verse,
          sanskrit: sanskritText,
          translation: lines.length > 1 ? lines.slice(1).join('\n') : ''
        });
      }
    }
    
    logger.info(`Extracted ${sanskritVerses.length} Sanskrit verses`);
    return sanskritVerses;
  }

  /**
   * Save processed data to disk for faster loading
   * @param {string} outputPath Path to save the data
   * @returns {Promise<void>}
   */
  async saveProcessedData(outputPath = './data/processed_gita.json') {
    try {
      const outputDir = path.dirname(outputPath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(outputDir, { recursive: true });
      
      // Save the processed data
      await fs.writeFile(
        outputPath,
        JSON.stringify({
          structuredDocs: this.structuredDocs,
          nodes: this.nodes
        }, null, 2)
      );
      
      logger.info(`Saved processed data to ${outputPath}`);
    } catch (error) {
      logger.error(`Error saving processed data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load processed data from disk
   * @param {string} inputPath Path to load the data from
   * @returns {Promise<boolean>} Success status
   */
  async loadProcessedData(inputPath = './data/processed_gita.json') {
    try {
      // Check if the file exists
      try {
        await fs.access(inputPath);
      } catch (error) {
        logger.warn(`Processed data file not found at ${inputPath}`);
        return false;
      }
      
      // Read and parse the file
      const data = JSON.parse(await fs.readFile(inputPath, 'utf8'));
      
      // Set the data
      this.structuredDocs = data.structuredDocs || [];
      this.nodes = data.nodes || [];
      
      logger.info(`Loaded processed data from ${inputPath}: ${this.structuredDocs.length} documents, ${this.nodes.length} nodes`);
      return true;
    } catch (error) {
      logger.error(`Error loading processed data: ${error.message}`);
      return false;
    }
  }
}

module.exports = DocumentProcessor;