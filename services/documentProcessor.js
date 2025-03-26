/**
 * Document processor service for the Bhagavad Gita
 * Processes the PDF and extracts structured content
 */
const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const configService = require('../utils/configService');
const logger = require('../utils/logger');

class DocumentProcessor {
  constructor(pdfPath = null) {
    this.pdfPath = pdfPath || configService.get('documents.pdfPath');
    this.rawText = '';
    this.structuredDocs = [];
    this.nodes = [];
    
    logger.info(`DocumentProcessor initialized with PDF path: ${this.pdfPath}`);
  }

  /**
   * Extract text from the Bhagavad Gita PDF
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromPdf() {
    try {
      logger.info(`Extracting text from ${this.pdfPath}`);
      
      // Verify file exists before trying to read it
      try {
        await fs.access(this.pdfPath);
      } catch (error) {
        logger.error(`PDF file not found at ${this.pdfPath}: ${error.message}`);
        throw new Error(`PDF file not found at ${this.pdfPath}`);
      }
      
      // Read the PDF file
      const dataBuffer = await fs.readFile(this.pdfPath);
      
      if (!dataBuffer || dataBuffer.length === 0) {
        logger.error('PDF file is empty or could not be read');
        throw new Error('PDF file is empty or could not be read');
      }
      
      logger.info(`Read ${dataBuffer.length} bytes from PDF file`);
      
      // Extract text from the PDF
      try {
        const pdfData = await pdf(dataBuffer);
        
        if (!pdfData || !pdfData.text) {
          logger.error('Failed to extract text from PDF');
          throw new Error('Failed to extract text from PDF');
        }
        
        this.rawText = pdfData.text;
        
        // Log a sample of the extracted text for debugging
        const sampleText = this.rawText.substring(0, 300).replace(/\n/g, ' ');
        logger.info(`Successfully extracted ${this.rawText.length} characters from PDF`);
        logger.info(`Text sample: ${sampleText}...`);
        
        return this.rawText;
      } catch (pdfError) {
        logger.error(`Error parsing PDF: ${pdfError.message}`);
        throw pdfError;
      }
    } catch (error) {
      logger.error(`Error extracting text from PDF: ${error.message}`);
      logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Clean and structure the extracted text
   * @returns {Promise<Array>} Structured documents
   */
  async cleanAndStructureText() {
    if (!this.rawText || this.rawText.length === 0) {
      logger.warn('No text to structure. Call extractTextFromPdf first.');
      return [];
    }
    
    logger.info('Cleaning and structuring text...');
    
    try {
      // Clean the text - replace multiple whitespaces with a single space
      const cleanedText = this.rawText.replace(/\s+/g, ' ').trim();
      
      // Extract chapters and verses
      const structuredDocs = [];
      
      // This is a simplified approach - you may need to adjust these patterns
      // based on the actual format of your PDF
      
      // Chapter pattern - adjust based on your specific PDF format
      const chapterRegex = /Chapter (\d+)[:\s]+(.*?)(?=Chapter \d+:|$)/gs;
      let chapterMatches = [...cleanedText.matchAll(chapterRegex)];
      
      // If no chapters found, try alternative patterns
      if (chapterMatches.length === 0) {
        logger.warn('No chapters found with standard pattern, trying alternatives...');
        
        // Alternative patterns - customize based on your PDF
        const alternativePatterns = [
          /CHAPTER (\d+)[:\s]+(.*?)(?=CHAPTER \d+:|$)/gs,
          /Chapter (\d+)\s*[-–—]\s*(.*?)(?=Chapter \d+\s*[-–—]|$)/gs,
          /CHAPTER (\d+)\s*[-–—]\s*(.*?)(?=CHAPTER \d+\s*[-–—]|$)/gs
        ];
        
        for (const pattern of alternativePatterns) {
          chapterMatches = [...cleanedText.matchAll(pattern)];
          if (chapterMatches.length > 0) {
            logger.info(`Found ${chapterMatches.length} chapters using alternative pattern`);
            break;
          }
        }
        
        // If still no chapters found, create a single chapter for the entire text
        if (chapterMatches.length === 0) {
          logger.warn('No chapters found with any pattern, creating single document');
          
          structuredDocs.push({
            type: 'chapter_intro',
            chapter: 1,
            content: cleanedText.substring(0, 1000), // First 1000 chars as intro
            metadata: {
              chapter: 1,
              content_type: 'introduction'
            }
          });
          
          // Create a single verse for the rest of the content
          structuredDocs.push({
            type: 'verse',
            chapter: 1,
            verse: 1,
            content: cleanedText,
            commentary: '',
            metadata: {
              chapter: 1,
              verse: 1,
              content_type: 'verse'
            }
          });
        }
      }
      
      // Process chapter matches if found
      for (const chapterMatch of chapterMatches) {
        const chapterNum = parseInt(chapterMatch[1], 10);
        const chapterContent = chapterMatch[2].trim();
        
        logger.info(`Processing Chapter ${chapterNum} with ${chapterContent.length} characters`);
        
        // Extract chapter introduction (text before first verse)
        const chapterParts = chapterContent.split(/Verse \d+:|VERSE \d+:/);
        const chapterIntro = chapterParts[0].trim();
        
        // Add chapter introduction to structured docs
        structuredDocs.push({
          type: 'chapter_intro',
          chapter: chapterNum,
          content: chapterIntro,
          metadata: {
            chapter: chapterNum,
            content_type: 'introduction'
          }
        });
        
        // Extract verses - try different patterns
        let verseMatches = [];
        const versePatterns = [
          /Verse (\d+):[:\s]+(.*?)(?=Verse \d+:|$)/gs,
          /VERSE (\d+):[:\s]+(.*?)(?=VERSE \d+:|$)/gs
        ];
        
        for (const pattern of versePatterns) {
          verseMatches = [...chapterContent.matchAll(pattern)];
          if (verseMatches.length > 0) break;
        }
        
        if (verseMatches.length === 0) {
          logger.warn(`No verses found in Chapter ${chapterNum}, creating paragraph chunks`);
          
          // If no verse structure found, split by paragraphs
          const paragraphs = chapterContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
          
          paragraphs.forEach((paragraph, idx) => {
            if (idx === 0 && paragraph === chapterIntro) return; // Skip intro
            
            structuredDocs.push({
              type: 'verse',
              chapter: chapterNum,
              verse: idx,
              content: paragraph,
              commentary: '',
              metadata: {
                chapter: chapterNum,
                verse: idx,
                content_type: 'paragraph'
              }
            });
          });
        } else {
          // Process extracted verses
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
      }
      
      // Check if any documents were structured
      if (structuredDocs.length === 0) {
        logger.warn('Document structuring failed, creating fallback chunks');
        
        // Create fallback chunks by splitting text into paragraphs
        const paragraphs = cleanedText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        paragraphs.forEach((paragraph, idx) => {
          structuredDocs.push({
            type: 'verse',
            chapter: 1,
            verse: idx + 1,
            content: paragraph,
            commentary: '',
            metadata: {
              chapter: 1,
              verse: idx + 1,
              content_type: 'paragraph'
            }
          });
        });
      }
      
      this.structuredDocs = structuredDocs;
      logger.info(`Structured document into ${structuredDocs.length} sections`);
      
      return structuredDocs;
    } catch (error) {
      logger.error(`Error structuring text: ${error.message}`);
      logger.error(error.stack);
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
    
    logger.info(`Creating nodes for indexing with chunkSize=${chunkSize}, chunkOverlap=${chunkOverlap}...`);
    
    try {
      const nodes = [];
      let nodeCount = 0;
      
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
          nodeCount++;
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
      logger.info(`Created ${nodes.length} nodes for indexing from ${this.structuredDocs.length} documents`);
      
      // Log a sample node for debugging
      if (nodes.length > 0) {
        const sampleNode = { ...nodes[0] };
        if (sampleNode.text && sampleNode.text.length > 200) {
          sampleNode.text = sampleNode.text.substring(0, 200) + '...';
        }
        logger.info(`Sample node: ${JSON.stringify(sampleNode)}`);
      }
      
      return nodes;
    } catch (error) {
      logger.error(`Error creating nodes: ${error.message}`);
      logger.error(error.stack);
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
    
    // Use a more memory-efficient approach for large texts
    while (startIndex < text.length) {
      // Get the chunk, ensuring we don't go past the end of text
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      
      // Extract the current segment we're working with
      const segment = text.substring(startIndex, endIndex);
      
      let splitPoint = chunkSize;
      
      // If we're not at the end of the text, try to find a good split point
      if (endIndex < text.length) {
        // Look for the last period, question mark, or exclamation point followed by a space
        const lastSentenceEnd = segment.lastIndexOf('. ');
        
        if (lastSentenceEnd !== -1 && lastSentenceEnd > chunkSize / 2) {
          // Found a good sentence boundary
          splitPoint = lastSentenceEnd + 2; // +2 to include the period and space
        } else {
          // If no good sentence boundary, look for the last space
          const lastSpace = segment.lastIndexOf(' ');
          
          if (lastSpace > 0) {
            splitPoint = lastSpace + 1;
          }
        }
      }
      
      // Add the chunk
      chunks.push(text.substring(startIndex, startIndex + splitPoint).trim());
      
      // Move the start index for the next chunk, accounting for overlap
      startIndex = startIndex + splitPoint - chunkOverlap;
      
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
    try {
      logger.info('Starting document processing pipeline...');
      
      // Extract text from PDF
      await this.extractTextFromPdf();
      
      // Structure the text
      await this.cleanAndStructureText();
      
      // Get chunk settings from config
      const chunkSize = configService.get('rag.chunkSize') || 512;
      const chunkOverlap = configService.get('rag.chunkOverlap') || 50;
      
      // Process documents in batches to avoid memory issues
      const batchSize = 50; // Process 50 documents at a time
      const nodes = [];
      
      logger.info(`Processing ${this.structuredDocs.length} documents in batches of ${batchSize}`);
      
      for (let i = 0; i < this.structuredDocs.length; i += batchSize) {
        const batch = this.structuredDocs.slice(i, i + batchSize);
        logger.info(`Processing batch ${Math.floor(i/batchSize) + 1} (documents ${i+1} to ${Math.min(i+batchSize, this.structuredDocs.length)})`);
        
        // Process each document in the batch
        for (const doc of batch) {
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
          chunks.forEach((chunk, idx) => {
            nodes.push({
              id: `${doc.type}_${doc.chapter}_${doc.verse || 0}_${idx}`,
              text: chunk,
              metadata: {
                ...doc.metadata,
                chunk_id: idx,
                source_type: doc.type
              }
            });
          });
        }
        
        // Force garbage collection between batches (if running with --expose-gc)
        if (global.gc) {
          global.gc();
          logger.info('Garbage collection triggered');
        }
      }
      
      this.nodes = nodes;
      logger.info(`Document processing complete. Created ${nodes.length} nodes.`);
      return nodes;
    } catch (error) {
      logger.error(`Document processing pipeline failed: ${error.message}`);
      logger.error(error.stack);
      throw error;
    }
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
      
      if (this.nodes.length === 0) {
        logger.warn('No nodes to save. Process document first.');
      }
      
      // Save the processed data in a more memory-efficient way
      const metadata = {
        createdAt: new Date().toISOString(),
        pdfPath: this.pdfPath,
        documentCount: this.structuredDocs.length,
        nodeCount: this.nodes.length
      };
      
      // Write metadata first
      await fs.writeFile(
        outputPath,
        `{"metadata":${JSON.stringify(metadata)},\n"structuredDocs":[\n`
      );
      
      // Write structured docs in chunks
      for (let i = 0; i < this.structuredDocs.length; i++) {
        const comma = i < this.structuredDocs.length - 1 ? ',' : '';
        await fs.appendFile(
          outputPath,
          `${JSON.stringify(this.structuredDocs[i])}${comma}\n`
        );
      }
      
      // Start nodes array
      await fs.appendFile(outputPath, `],\n"nodes":[\n`);
      
      // Write nodes in chunks
      for (let i = 0; i < this.nodes.length; i++) {
        const comma = i < this.nodes.length - 1 ? ',' : '';
        await fs.appendFile(
          outputPath,
          `${JSON.stringify(this.nodes[i])}${comma}\n`
        );
      }
      
      // Close the JSON object
      await fs.appendFile(outputPath, `]}`);
      
      logger.info(`Saved processed data to ${outputPath}`);
      logger.info(`Saved ${this.nodes.length} nodes from ${this.structuredDocs.length} documents`);
    } catch (error) {
      logger.error(`Error saving processed data: ${error.message}`);
      logger.error(error.stack);
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
      const fileContent = await fs.readFile(inputPath, 'utf8');
      
      if (!fileContent || fileContent.trim().length === 0) {
        logger.warn(`Processed data file at ${inputPath} is empty`);
        return false;
      }
      
      try {
        const data = JSON.parse(fileContent);
        
        // Validate the data structure
        if (!data.structuredDocs || !data.nodes) {
          logger.warn(`Invalid data structure in ${inputPath}`);
          return false;
        }
        
        // Set the data
        this.structuredDocs = data.structuredDocs || [];
        this.nodes = data.nodes || [];
        
        logger.info(`Loaded processed data from ${inputPath}: ${this.structuredDocs.length} documents, ${this.nodes.length} nodes`);
        
        // Log a sample node for debugging
        if (this.nodes.length > 0) {
          const sampleNode = { ...this.nodes[0] };
          if (sampleNode.text && sampleNode.text.length > 200) {
            sampleNode.text = sampleNode.text.substring(0, 200) + '...';
          }
          logger.info(`Sample node: ${JSON.stringify(sampleNode)}`);
        }
        
        return true;
      } catch (parseError) {
        logger.error(`Error parsing JSON from ${inputPath}: ${parseError.message}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error loading processed data: ${error.message}`);
      logger.error(error.stack);
      return false;
    }
  }
}

module.exports = DocumentProcessor;