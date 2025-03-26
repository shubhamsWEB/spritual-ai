/**
 * Custom document processor specifically for the Bhagavad Gita PDF format
 * Handles the specific structure of verse, translation, and purport
 */
const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const config = require('config');
const logger = require('../utils/logger');

class GitaDocumentProcessor {
  constructor(pdfPath = null) {
    this.pdfPath = pdfPath || config.get('documents.pdfPath');
    this.rawText = '';
    this.structuredDocs = [];
    this.nodes = [];
    
    logger.info(`GitaDocumentProcessor initialized with PDF path: ${this.pdfPath}`);
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
        
        // Save raw text to file for examination (helpful for debugging)
        await fs.writeFile(path.join(__dirname, '../data/raw_text.txt'), this.rawText);
        logger.info(`Saved raw text to data/raw_text.txt for examination`);
        
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
   * Identify chapters, verses, translations and purports in the Bhagavad Gita
   * @returns {Promise<Array>} Structured documents
   */
  async structureGitaText() {
    if (!this.rawText || this.rawText.length === 0) {
      logger.warn('No text to structure. Call extractTextFromPdf first.');
      return [];
    }
    
    logger.info('Structuring Bhagavad Gita text...');
    
    try {
      const structuredDocs = [];
      
      // Split text into lines to process chapter by chapter
      const lines = this.rawText.split('\n');
      let currentLine = 0;
      
      // Variables to track current context
      let currentChapter = 0;
      let currentVerse = 0;
      let inTranslation = false;
      let inPurport = false;
      let verseText = '';
      let translationText = '';
      let purportText = '';
      
      // Regular expressions for identifying different parts
      const chapterPattern = /CHAPTER\s+(\d+)/i;
      const textPatternA = /TEXT\s+(\d+)/i;
      const textPatternB = /^TEXT\s+(\d+)$/i;
      const translationPattern = /TRANSLATION/i;
      const purportPattern = /PURPORT/i;
      
      while (currentLine < lines.length) {
        const line = lines[currentLine].trim();
        
        // Check for chapter heading
        const chapterMatch = line.match(chapterPattern);
        if (chapterMatch) {
          currentChapter = parseInt(chapterMatch[1], 10);
          logger.info(`Found Chapter ${currentChapter}`);
          
          // Add chapter introduction
          let chapterTitle = line;
          let chapterIntro = '';
          
          // Collect the chapter title and introduction
          currentLine++;
          while (currentLine < lines.length && 
                 !lines[currentLine].match(textPatternA) && 
                 !lines[currentLine].match(textPatternB)) {
            if (lines[currentLine].trim().length > 0) {
              if (chapterTitle.length < 100) {
                chapterTitle += ' ' + lines[currentLine].trim();
              } else {
                chapterIntro += lines[currentLine].trim() + ' ';
              }
            }
            currentLine++;
          }
          
          structuredDocs.push({
            type: 'chapter_intro',
            chapter: currentChapter,
            title: chapterTitle.trim(),
            content: chapterIntro.trim(),
            metadata: {
              chapter: currentChapter,
              content_type: 'chapter_introduction'
            }
          });
          
          continue;
        }
        
        // Check for text/verse
        const textMatchA = line.match(textPatternA);
        const textMatchB = line.match(textPatternB);
        if (textMatchA || textMatchB) {
          // If we were processing a previous verse, save it
          if (currentVerse > 0 && (translationText.length > 0 || purportText.length > 0)) {
            structuredDocs.push({
              type: 'verse',
              chapter: currentChapter,
              verse: currentVerse,
              content: verseText.trim(),
              translation: translationText.trim(),
              purport: purportText.trim(),
              metadata: {
                chapter: currentChapter,
                verse: currentVerse,
                content_type: 'verse'
              }
            });
            
            // Reset for the next verse
            verseText = '';
            translationText = '';
            purportText = '';
          }
          
          currentVerse = parseInt((textMatchA ? textMatchA[1] : textMatchB[1]), 10);
          logger.info(`Found Verse ${currentChapter}:${currentVerse}`);
          
          inTranslation = false;
          inPurport = false;
          
          // Collect Sanskrit verse text
          currentLine++;
          while (currentLine < lines.length && 
                 !lines[currentLine].match(translationPattern) &&
                 !lines[currentLine].match(purportPattern) &&
                 !lines[currentLine].match(textPatternA) &&
                 !lines[currentLine].match(textPatternB)) {
            if (lines[currentLine].trim().length > 0) {
              verseText += lines[currentLine].trim() + ' ';
            }
            currentLine++;
          }
          
          continue;
        }
        
        // Check for translation section
        if (line.match(translationPattern)) {
          inTranslation = true;
          inPurport = false;
          currentLine++;
          continue;
        }
        
        // Check for purport section
        if (line.match(purportPattern)) {
          inTranslation = false;
          inPurport = true;
          currentLine++;
          continue;
        }
        
        // Collect text for the current section
        if (inTranslation) {
          if (line.length > 0 && !line.match(textPatternA) && !line.match(textPatternB)) {
            translationText += line + ' ';
          }
        } else if (inPurport) {
          if (line.length > 0 && !line.match(textPatternA) && !line.match(textPatternB)) {
            purportText += line + ' ';
          }
        }
        
        currentLine++;
      }
      
      // Add the last verse if needed
      if (currentVerse > 0 && (translationText.length > 0 || purportText.length > 0)) {
        structuredDocs.push({
          type: 'verse',
          chapter: currentChapter,
          verse: currentVerse,
          content: verseText.trim(),
          translation: translationText.trim(),
          purport: purportText.trim(),
          metadata: {
            chapter: currentChapter,
            verse: currentVerse,
            content_type: 'verse'
          }
        });
      }
      
      // Fallback if no regular structure was detected
      if (structuredDocs.length === 0) {
        logger.warn('No structured verses found. Creating fallback content chunks.');
        
        // Split into chunks of approximately 500 characters
        const chunks = [];
        const tempText = this.rawText;
        const chunkSize = 500;
        
        for (let i = 0; i < tempText.length; i += chunkSize) {
          const chunk = tempText.substring(i, i + chunkSize);
          
          // Find a proper break point (end of sentence or paragraph)
          let breakPoint = chunk.lastIndexOf('.');
          if (breakPoint === -1 || breakPoint < chunkSize * 0.7) {
            breakPoint = chunk.lastIndexOf('\n');
          }
          if (breakPoint === -1 || breakPoint < chunkSize * 0.7) {
            breakPoint = chunkSize;
          } else {
            breakPoint += 1; // Include the period or newline
          }
          
          chunks.push(tempText.substring(i, i + breakPoint));
          i -= (chunkSize - breakPoint); // Adjust for the next chunk
        }
        
        // Create document nodes from chunks
        chunks.forEach((chunk, index) => {
          structuredDocs.push({
            type: 'content',
            chapter: 1, // Default chapter
            content: chunk,
            metadata: {
              chapter: 1,
              paragraph_id: index,
              content_type: 'gita_content'
            }
          });
        });
      }
      
      this.structuredDocs = structuredDocs;
      logger.info(`Structured Bhagavad Gita into ${structuredDocs.length} documents`);
      
      return structuredDocs;
    } catch (error) {
      logger.error(`Error structuring Bhagavad Gita text: ${error.message}`);
      logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Create embeddings-ready nodes for the Bhagavad Gita
   * @returns {Promise<Array>} Nodes for indexing
   */
  async createGitaNodes() {
    if (!this.structuredDocs || this.structuredDocs.length === 0) {
      logger.warn('No structured documents. Call structureGitaText first.');
      return [];
    }
    
    logger.info(`Creating embeddings-ready nodes for Bhagavad Gita...`);
    
    try {
      const nodes = [];
      
      this.structuredDocs.forEach((doc, index) => {
        if (doc.type === 'chapter_intro') {
          // Create a node for chapter introduction
          nodes.push({
            id: `chapter_${doc.chapter}_intro`,
            text: `Chapter ${doc.chapter}: ${doc.title}\n\n${doc.content}`,
            metadata: {
              ...doc.metadata,
              doc_type: 'chapter_introduction',
              chapter: doc.chapter
            }
          });
        } else if (doc.type === 'verse') {
          // Create multiple nodes for verses: one for Sanskrit, one for translation, one for purport
          
          // Sanskrit verse
          if (doc.content && doc.content.length > 0) {
            nodes.push({
              id: `chapter_${doc.chapter}_verse_${doc.verse}_sanskrit`,
              text: `Chapter ${doc.chapter}, Verse ${doc.verse} (Sanskrit):\n\n${doc.content}`,
              metadata: {
                ...doc.metadata,
                doc_type: 'verse_sanskrit',
                chapter: doc.chapter,
                verse: doc.verse
              }
            });
          }
          
          // Translation
          if (doc.translation && doc.translation.length > 0) {
            nodes.push({
              id: `chapter_${doc.chapter}_verse_${doc.verse}_translation`,
              text: `Chapter ${doc.chapter}, Verse ${doc.verse} (Translation):\n\n${doc.translation}`,
              metadata: {
                ...doc.metadata,
                doc_type: 'verse_translation',
                chapter: doc.chapter,
                verse: doc.verse
              }
            });
          }
          
          // Purport (Commentary)
          if (doc.purport && doc.purport.length > 0) {
            // Split purport into smaller chunks if it's too large
            const purportText = doc.purport;
            const maxChunkSize = 1000;
            
            if (purportText.length <= maxChunkSize) {
              nodes.push({
                id: `chapter_${doc.chapter}_verse_${doc.verse}_purport`,
                text: `Chapter ${doc.chapter}, Verse ${doc.verse} (Purport):\n\n${purportText}`,
                metadata: {
                  ...doc.metadata,
                  doc_type: 'verse_purport',
                  chapter: doc.chapter,
                  verse: doc.verse
                }
              });
            } else {
              // Split the purport into smaller chunks
              let startPos = 0;
              let chunkIndex = 0;
              
              while (startPos < purportText.length) {
                let endPos = startPos + maxChunkSize;
                if (endPos >= purportText.length) {
                  endPos = purportText.length;
                } else {
                  // Find a good breaking point (sentence or paragraph)
                  const periodPos = purportText.lastIndexOf('. ', endPos);
                  const newlinePos = purportText.lastIndexOf('\n', endPos);
                  
                  if (periodPos > startPos + (maxChunkSize / 2)) {
                    endPos = periodPos + 1; // Include the period
                  } else if (newlinePos > startPos + (maxChunkSize / 2)) {
                    endPos = newlinePos + 1; // Include the newline
                  }
                }
                
                const chunkText = purportText.substring(startPos, endPos).trim();
                
                nodes.push({
                  id: `chapter_${doc.chapter}_verse_${doc.verse}_purport_${chunkIndex}`,
                  text: `Chapter ${doc.chapter}, Verse ${doc.verse} (Purport, Part ${chunkIndex + 1}):\n\n${chunkText}`,
                  metadata: {
                    ...doc.metadata,
                    doc_type: 'verse_purport',
                    chapter: doc.chapter,
                    verse: doc.verse,
                    chunk_index: chunkIndex
                  }
                });
                
                startPos = endPos;
                chunkIndex++;
              }
            }
          }
        } else {
          // For generic content chunks
          nodes.push({
            id: `content_${doc.chapter}_${index}`,
            text: doc.content,
            metadata: {
              ...doc.metadata,
              doc_type: 'generic_content',
              index: index
            }
          });
        }
      });
      
      this.nodes = nodes;
      logger.info(`Created ${nodes.length} nodes for vector embedding from ${this.structuredDocs.length} documents`);
      
      return nodes;
    } catch (error) {
      logger.error(`Error creating nodes: ${error.message}`);
      logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Process the Bhagavad Gita PDF from start to finish
   * @returns {Promise<Array>} Nodes for indexing
   */
  async processGitaDocument() {
    try {
      logger.info('Starting Bhagavad Gita document processing...');
      
      // Extract text from PDF
      await this.extractTextFromPdf();
      
      // Structure the text into chapters, verses, etc.
      await this.structureGitaText();
      
      // Create nodes for vector embedding
      const nodes = await this.createGitaNodes();
      
      logger.info(`Bhagavad Gita processing complete. Created ${nodes.length} nodes.`);
      return nodes;
    } catch (error) {
      logger.error(`Error processing Bhagavad Gita document: ${error.message}`);
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
      
      // Save the processed data
      const dataToSave = {
        structuredDocs: this.structuredDocs,
        nodes: this.nodes,
        metadata: {
          createdAt: new Date().toISOString(),
          pdfPath: this.pdfPath,
          documentCount: this.structuredDocs.length,
          nodeCount: this.nodes.length,
          processorVersion: '1.0'
        }
      };
      
      await fs.writeFile(
        outputPath,
        JSON.stringify(dataToSave, null, 2)
      );
      
      logger.info(`Saved processed Bhagavad Gita data to ${outputPath}`);
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
        
        logger.info(`Loaded processed Bhagavad Gita data from ${inputPath}: ${this.structuredDocs.length} documents, ${this.nodes.length} nodes`);
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

module.exports = GitaDocumentProcessor;