/**
 * Enhanced document processor specifically for the Bhagavad Gita PDF format
 * Handles the specific structure of verse, translation, and purport with improved patterns
 */
const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const configService = require('../utils/configService');
const logger = require('../utils/logger');

class GitaDocumentProcessor {
  constructor(pdfPath = null) {
    this.pdfPath = pdfPath || configService.get('documents.pdfPath');
    this.rawText = '';
    this.structuredDocs = [];
    this.nodes = [];
    this.debugInfo = {
      patterns: {},
      matches: {},
      errors: []
    };
    
    logger.info(`GitaDocumentProcessor initialized with PDF path: ${this.pdfPath}`);
  }

  /**
   * Extract text from the Bhagavad Gita PDF with improved error handling
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
      
      // Extract text from the PDF with improved options
      try {
        const pdfData = await pdf(dataBuffer, {
          // Use better options for text extraction
          pagerender: this._customPageRenderer,
          max: 0, // No page limit
          version: 'v2.0.550'
        });
        
        if (!pdfData || !pdfData.text) {
          logger.error('Failed to extract text from PDF');
          throw new Error('Failed to extract text from PDF');
        }
        
        this.rawText = pdfData.text;
        
        // Clean up the raw text by removing redundant whitespace and page breaks
        this.rawText = this._cleanRawText(this.rawText);
        
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
   * Custom page renderer function for better text extraction
   * @private
   */
  _customPageRenderer(pageData) {
    let render_options = {
      normalizeWhitespace: false,
      disableCombineTextItems: false
    };
    return pageData.getTextContent(render_options)
      .then(function(textContent) {
        let lastY, text = '';
        for (let item of textContent.items) {
          if (lastY == item.transform[5] || !lastY) {
            text += item.str;
          } else {
            text += '\n' + item.str;
          }
          lastY = item.transform[5];
        }
        return text;
      });
  }

  /**
   * Clean the raw text to make it more process-friendly
   * @param {string} text The raw text to clean
   * @returns {string} Cleaned text
   * @private
   */
  _cleanRawText(text) {
    // Remove copyright notices
    text = text.replace(/Copyright © \d+ The Bhaktivedanta Book Trust Int'l\. All Rights Reserved\./g, '');
    text = text.replace(/Copyright © 1998 The Bhaktivedanta Book Trust Int'l. All Rights Reserved./g, '');
    
    // Normalize newlines
    text = text.replace(/\r\n/g, '\n');
    
    // Remove excess blank lines (more than 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n');
    
    // Restore paragraph breaks
    text = text.replace(/\. ([A-Z])/g, '.\n$1');
    
    // Ensure proper spacing around chapter headers
    text = text.replace(/(CHAPTER \d+)/g, '\n\n$1\n');
    
    // Ensure proper spacing around section headers
    text = text.replace(/(TEXT \d+|TRANSLATION|PURPORT)/g, '\n\n$1\n');
    
    // Special handling for Sanskrit transliteration sections
    // These lines typically contain the Sanskrit verses with transliteration
    const transliterationPattern = /([a-zA-Z]+)\s+([a-zA-Z]+)\s+([a-zA-Z]+)\s+([a-zA-Z]+)/g;
    text = text.replace(transliterationPattern, '$1 $2 $3 $4\n');
    
    // Handle Sanskrit verse numbers which often appear as )) 1 )) or similar
    text = text.replace(/\)\)\s+(\d+)\s+\)\)/g, ')) $1 ))');
    
    // Replace special typographic characters with standard ones
    text = text.replace(/[""]/g, '"')
               .replace(/['']/g, "'")
               .replace(/—/g, '-')
               .replace(/…/g, '...')
               .replace(/–/g, '-');
    
    // Ensure SYNONYMS section is properly formatted
    text = text.replace(/SYNONYMS/g, '\nSYNONYMS\n');
    
    // Clean up special Sanskrit characters better
    text = text.replace(/\\/, ''); // Remove backslashes that often appear in Sanskrit names
    
    // Fix specific patterns in your text that might be causing issues
    text = text.replace(/Da\*Taraí/g, 'Dhritarashtra');
    text = text.replace(/SaMaveTaa/g, 'Samaveta');
    text = text.replace(/YauYauTSav/g, 'Yuyutsava');
    text = text.replace(/Paa<@va/g, 'Pandava');
    text = text.replace(/ik-Maku-vRTa/g, 'kimakurvata');
    text = text.replace(/Kåñëa/g, 'Krishna');
    text = text.replace(/Çré Kåñëa/g, 'Sri Krishna');
    text = text.replace(/Arjuna/g, 'Arjuna');
    text = text.replace(/Bhéñma/g, 'Bhishma');
    text = text.replace(/Dhåtaräñöra/g, 'Dhritarashtra');
    text = text.replace(/Päëòu/g, 'Pandu');
    text = text.replace(/Paëòu/g, 'Pandu');
    text = text.replace(/P\naëòu/g, 'Pandu');
    text = text.replace(/Päëòava/g, 'Pandava');
    text = text.replace(/Yudhiñöhira/g, 'Yudhishthira');
    text = text.replace(/Droëäcärya/g, 'Dronacharya');
    text = text.replace(/Droëa/g, 'Drona');
    text = text.replace(/Saïjaya/g, 'Sanjaya');
    text = text.replace(/Açvatthämä/g, 'Ashvatthama');
    
    // Titles and terms
    text = text.replace(/Bhagavad-gétä/g, 'Bhagavad Gita')
    text = text.replace(/Bhagavad-Gétä/g, 'Bhagavad Gita')
    text = text.replace(/Gétä/g, 'Gita')
    text = text.replace(/dharma-kñetre/g, 'dharma-kshetra')
    text = text.replace(/kuru-kñetre/g, 'kuru-kshetra')
    text = text.replace(/Kurukñetra/g, 'Kurukshetra')
    text = text.replace(/kñatriya/g, 'kshatriya')
    text = text.replace(/brähmaëa/g, 'brahmana')
    
    // Common Sanskrit terms
    text = text.replace(/ätmä/g, 'atma')
    text = text.replace(/buddhi-yoga/g, 'buddhi yoga')
    text = text.replace(/karma-yoga/g, 'karma yoga')
    text = text.replace(/jïäna/g, 'jnana')
    text = text.replace(/väsudeva/g, 'vasudeva')
    text = text.replace(/puruña/g, 'purusha')
    text = text.replace(/prakåti/g, 'prakriti')
    
    // Fix common diacritical patterns
    text = text.replace(/ä/g, 'a')
    text = text.replace(/ö/g, 't')
    text = text.replace(/ñ/g, 'sh')
    text = text.replace(/é/g, 'i')
    text = text.replace(/è/g, 'e')
    text = text.replace(/ï/g, 'n')
    text = text.replace(/ü/g, 'u')
    text = text.replace(/ù/g, 'h');
    
    return text;
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
    
    logger.info('Structuring Bhagavad Gita text with enhanced pattern recognition...');
    
    try {
      const structuredDocs = [];
      
      // Split text into lines to process chapter by chapter
      const lines = this.rawText.split('\n');
      
      // Enhanced patterns based on debug extraction
      const chapterPatterns = [
        /CHAPTER\s+(\d+)/i,  // This is matching well (18 chapters found)
        /-\s*CHAPTER\s+(\d+)\s*-/i  // Also a good match
      ];
      
      const textPatterns = [
        /TEXT\s+(\d+)/i,  // This is working perfectly (627 matches)
        /^TEXT (\d+)$/im  // Also good match
      ];
      
      const translationPatterns = [
        /TRANSLATION/i,  // This is matching well (657 matches)
        /^TRANSLATION$/im  // Also good
      ];
      
      const purportPatterns = [
        /PURPORT/i,  // This is matching well (661 matches)
        /^PURPORT$/im  // Also matching (625 matches)
      ];
      
      this.debugInfo.patterns = {
        chapter: chapterPatterns.map(p => p.toString()),
        text: textPatterns.map(p => p.toString()),
        translation: translationPatterns.map(p => p.toString()),
        purport: purportPatterns.map(p => p.toString())
      };
      
      // Variables to track current context
      let currentLine = 0;
      let currentChapter = 0;
      let currentVerse = 0;
      let inTranslation = false;
      let inPurport = false;
      let verseText = '';
      let translationText = '';
      let purportText = '';
      let chapterTitles = {};
      
      // First pass: identify chapter titles
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of chapterPatterns) {
          const match = lines[i].match(pattern);
          if (match) {
            const chapterNum = parseInt(match[1], 10);
            
            // Look ahead for the chapter title
            let title = lines[i];
            let nextLine = i + 1;
            
            // Get the full chapter title which may span multiple lines
            while (nextLine < lines.length && 
                   nextLine < i + 5 && 
                   !textPatterns.some(p => lines[nextLine].match(p)) &&
                   !chapterPatterns.some(p => lines[nextLine].match(p))) {
              if (lines[nextLine].trim().length > 0) {
                title += ' ' + lines[nextLine].trim();
              }
              nextLine++;
            }
            
            chapterTitles[chapterNum] = title.trim();
            break;
          }
        }
      }
      
      this.debugInfo.chapterTitles = chapterTitles;
      logger.info(`Found ${Object.keys(chapterTitles).length} chapter titles`);
  
      // Second pass: process verses
      while (currentLine < lines.length) {
        const line = lines[currentLine].trim();
        
        // Check for chapter heading
        let chapterMatch = null;
        for (const pattern of chapterPatterns) {
          const match = line.match(pattern);
          if (match) {
            chapterMatch = match;
            break;
          }
        }
        
        if (chapterMatch) {
          // If we were processing a verse, save it before moving to the new chapter
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
          
          currentChapter = parseInt(chapterMatch[1], 10);
          logger.info(`Processing Chapter ${currentChapter}: ${chapterTitles[currentChapter] || 'No title'}`);
          
          // Add chapter introduction
          let chapterIntro = '';
          
          // Collect the chapter introduction
          currentLine++;
          while (currentLine < lines.length) {
            // Check if we've reached a verse
            let isVerse = false;
            for (const pattern of textPatterns) {
              if (lines[currentLine].match(pattern)) {
                isVerse = true;
                break;
              }
            }
            
            if (isVerse) break;
            
            if (lines[currentLine].trim().length > 0) {
              chapterIntro += lines[currentLine].trim() + ' ';
            }
            currentLine++;
          }
          
          structuredDocs.push({
            type: 'chapter_intro',
            chapter: currentChapter,
            title: chapterTitles[currentChapter] || `Chapter ${currentChapter}`,
            content: chapterIntro.trim(),
            metadata: {
              chapter: currentChapter,
              content_type: 'chapter_introduction'
            }
          });
          
          continue;
        }
        
        // Check for text/verse
        let textMatch = null;
        for (const pattern of textPatterns) {
          const match = line.match(pattern);
          if (match) {
            textMatch = match;
            break;
          }
        }
        
        if (textMatch) {
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
          
          currentVerse = parseInt(textMatch[1], 10);
          
          inTranslation = false;
          inPurport = false;
          
          // Collect Sanskrit verse text - continue until TRANSLATION
          currentLine++;
          while (currentLine < lines.length) {
            // Check if we've reached a TRANSLATION or PURPORT section or next verse
            let isTranslation = false;
            let isPurport = false;
            let isNextVerse = false;
            
            for (const pattern of translationPatterns) {
              if (lines[currentLine].match(pattern)) {
                isTranslation = true;
                break;
              }
            }
            
            for (const pattern of purportPatterns) {
              if (lines[currentLine].match(pattern)) {
                isPurport = true;
                break;
              }
            }
            
            for (const pattern of textPatterns) {
              if (lines[currentLine].match(pattern)) {
                isNextVerse = true;
                break;
              }
            }
            
            if (isTranslation || isPurport || isNextVerse) break;
            
            if (lines[currentLine].trim().length > 0) {
              verseText += lines[currentLine].trim() + ' ';
            }
            currentLine++;
          }
          
          continue;
        }
        
        // Check for translation section
        let isTranslation = false;
        for (const pattern of translationPatterns) {
          if (line.match(pattern)) {
            isTranslation = true;
            break;
          }
        }
        
        if (isTranslation) {
          inTranslation = true;
          inPurport = false;
          currentLine++;
          continue;
        }
        
        // Check for purport section
        let isPurport = false;
        for (const pattern of purportPatterns) {
          if (line.match(pattern)) {
            isPurport = true;
            break;
          }
        }
        
        if (isPurport) {
          inTranslation = false;
          inPurport = true;
          currentLine++;
          continue;
        }
        
        // Collect text for the current section
        if (inTranslation) {
          // Check if we've reached the next section
          let isNextSection = false;
          
          for (const pattern of purportPatterns) {
            if (line.match(pattern)) {
              isNextSection = true;
              break;
            }
          }
          
          for (const pattern of textPatterns) {
            if (line.match(pattern)) {
              isNextSection = true;
              break;
            }
          }
          
          for (const pattern of chapterPatterns) {
            if (line.match(pattern)) {
              isNextSection = true;
              break;
            }
          }
          
          if (!isNextSection && line.length > 0) {
            translationText += line + ' ';
          } else if (isNextSection) {
            // We've reached the next section, so stay on this line
            continue;
          }
        } else if (inPurport) {
          // Check if we've reached the next section
          let isNextSection = false;
          
          for (const pattern of textPatterns) {
            if (line.match(pattern)) {
              isNextSection = true;
              break;
            }
          }
          
          for (const pattern of chapterPatterns) {
            if (line.match(pattern)) {
              isNextSection = true;
              break;
            }
          }
          
          if (!isNextSection && line.length > 0) {
            purportText += line + ' ';
          } else if (isNextSection) {
            // We've reached the next section, so stay on this line
            continue;
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
      
      // Collect statistics
      const stats = {
        chapters: 0,
        verses: 0,
        translationsFound: 0,
        purportsFound: 0,
        averageVerseLength: 0,
        averageTranslationLength: 0,
        averagePurportLength: 0
      };
      
      let totalVerseLength = 0;
      let totalTranslationLength = 0;
      let totalPurportLength = 0;
      let uniqueChapters = new Set();
      
      for (const doc of structuredDocs) {
        if (doc.type === 'chapter_intro') {
          uniqueChapters.add(doc.chapter);
        } else if (doc.type === 'verse') {
          stats.verses++;
          totalVerseLength += doc.content ? doc.content.length : 0;
          
          if (doc.translation && doc.translation.length > 0) {
            stats.translationsFound++;
            totalTranslationLength += doc.translation.length;
          }
          
          if (doc.purport && doc.purport.length > 0) {
            stats.purportsFound++;
            totalPurportLength += doc.purport.length;
          }
        }
      }
      
      stats.chapters = uniqueChapters.size;
      stats.averageVerseLength = stats.verses > 0 ? Math.round(totalVerseLength / stats.verses) : 0;
      stats.averageTranslationLength = stats.translationsFound > 0 ? Math.round(totalTranslationLength / stats.translationsFound) : 0;
      stats.averagePurportLength = stats.purportsFound > 0 ? Math.round(totalPurportLength / stats.purportsFound) : 0;
      
      this.debugInfo.stats = stats;
      
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
      logger.info(`Found ${stats.chapters} chapters, ${stats.verses} verses, ${stats.translationsFound} translations, ${stats.purportsFound} purports`);
      
      return structuredDocs;
    } catch (error) {
      logger.error(`Error structuring Bhagavad Gita text: ${error.message}`);
      logger.error(error.stack);
      this.debugInfo.errors.push({
        phase: 'structureGitaText',
        error: error.message,
        stack: error.stack
      });
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
      let totalCharacters = 0;
      
      this.structuredDocs.forEach((doc, index) => {
        if (doc.type === 'chapter_intro') {
          // Create a node for chapter introduction
          const introText = `Chapter ${doc.chapter}: ${doc.title}\n\n${doc.content}`;
          totalCharacters += introText.length;
          
          nodes.push({
            id: `chapter_${doc.chapter}_intro`,
            text: introText,
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
            const sanskritText = `Chapter ${doc.chapter}, Verse ${doc.verse} (Sanskrit):\n\n${doc.content}`;
            totalCharacters += sanskritText.length;
            
            nodes.push({
              id: `chapter_${doc.chapter}_verse_${doc.verse}_sanskrit`,
              text: sanskritText,
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
            const translationText = `Chapter ${doc.chapter}, Verse ${doc.verse} (Translation):\n\n${doc.translation}`;
            totalCharacters += translationText.length;
            
            nodes.push({
              id: `chapter_${doc.chapter}_verse_${doc.verse}_translation`,
              text: translationText,
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
            const maxChunkSize = 800; // Increasing chunk size for better context
            
            if (purportText.length <= maxChunkSize) {
              const fullPurportText = `Chapter ${doc.chapter}, Verse ${doc.verse} (Purport):\n\n${purportText}`;
              totalCharacters += fullPurportText.length;
              
              nodes.push({
                id: `chapter_${doc.chapter}_verse_${doc.verse}_purport`,
                text: fullPurportText,
                metadata: {
                  ...doc.metadata,
                  doc_type: 'verse_purport',
                  chapter: doc.chapter,
                  verse: doc.verse
                }
              });
            } else {
              // Create semantic chunks based on paragraph or sentence boundaries
              const purportChunks = this._createSemanticChunks(purportText, maxChunkSize);
              
              purportChunks.forEach((chunk, chunkIndex) => {
                const chunkText = `Chapter ${doc.chapter}, Verse ${doc.verse} (Purport, Part ${chunkIndex + 1} of ${purportChunks.length}):\n\n${chunk}`;
                totalCharacters += chunkText.length;
                
                nodes.push({
                  id: `chapter_${doc.chapter}_verse_${doc.verse}_purport_${chunkIndex}`,
                  text: chunkText,
                  metadata: {
                    ...doc.metadata,
                    doc_type: 'verse_purport',
                    chapter: doc.chapter,
                    verse: doc.verse,
                    chunk_index: chunkIndex,
                    total_chunks: purportChunks.length
                  }
                });
              });
            }
          }
        } else {
          // For generic content chunks
          totalCharacters += doc.content.length;
          
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
      logger.info(`Total character count: ${totalCharacters} (average ${Math.round(totalCharacters / nodes.length)} per node)`);
      
      // Generate stats about node distribution
      const nodeTypes = {};
      nodes.forEach(node => {
        const type = node.metadata.doc_type;
        nodeTypes[type] = (nodeTypes[type] || 0) + 1;
      });
      
      logger.info(`Node type distribution: ${JSON.stringify(nodeTypes)}`);
      this.debugInfo.nodeStats = {
        totalNodes: nodes.length,
        totalCharacters,
        averageChars: Math.round(totalCharacters / nodes.length),
        typeDistribution: nodeTypes
      };
      
      return nodes;
    } catch (error) {
      logger.error(`Error creating nodes: ${error.message}`);
      logger.error(error.stack);
      this.debugInfo.errors.push({
        phase: 'createGitaNodes',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

/**
 * Create semantic chunks from text based on paragraphs or sentences
 * Optimized for Bhagavad Gita content
 * Replace this method in your GitaProcessor.js
 */
_createSemanticChunks(text, maxChunkSize) {
  // Remove excess whitespace
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  
  // First detect if the text has natural paragraph breaks
  const paragraphs = cleanedText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  // If there are multiple paragraphs, use them as the base for chunking
  if (paragraphs.length > 1) {
    return this._combineTextSegments(paragraphs, maxChunkSize);
  }
  
  // If no paragraphs, look for sentence breaks
  // This pattern better matches sentence endings in philosophical text
  const sentencePattern = /(?<=[.!?])\s+(?=[A-Z"\'])/g;
  const sentences = cleanedText.split(sentencePattern).filter(s => s.trim().length > 0);
  
  // For Bhagavad Gita purports, sentences are often quite long
  // If sentences are very long, we might need to break them further
  const processedSentences = [];
  for (const sentence of sentences) {
    if (sentence.length > maxChunkSize * 0.8) {
      // For very long sentences, break on logical separators like commas
      const fragments = sentence.split(/,\s+(?=[A-Z])/);
      if (fragments.length > 1) {
        // Recombine fragments that are too small
        let currentFragment = '';
        for (const fragment of fragments) {
          if (currentFragment.length + fragment.length + 2 <= maxChunkSize * 0.8) {
            currentFragment += (currentFragment ? ', ' : '') + fragment;
          } else {
            if (currentFragment) {
              processedSentences.push(currentFragment);
            }
            currentFragment = fragment;
          }
        }
        if (currentFragment) {
          processedSentences.push(currentFragment);
        }
      } else {
        // If we can't break on commas, just add the long sentence
        processedSentences.push(sentence);
      }
    } else {
      processedSentences.push(sentence);
    }
  }
  
  // Now combine the processed sentences into chunks
  return this._combineTextSegments(processedSentences, maxChunkSize);
}

/**
 * Combine text segments into semantic chunks with better boundaries
 * Optimized for Bhagavad Gita content
 */
_combineTextSegments(segments, maxChunkSize) {
  const chunks = [];
  let currentChunk = '';
  
  // Special handling for the first segment to maintain context
  if (segments.length > 0) {
    const firstSegment = segments[0];
    
    // Check if the first segment contains key context (like chapter/verse reference)
    const containsContext = 
      /Chapter \d+|Verse \d+|TEXT \d+|TRANSLATION|PURPORT/.test(firstSegment);
    
    // If first segment contains context and is not too large, always include it
    if (containsContext && firstSegment.length <= maxChunkSize * 0.5) {
      currentChunk = firstSegment;
      segments = segments.slice(1);
    }
  }
  
  for (const segment of segments) {
    // If the segment alone is larger than maxChunkSize, we need to split it
    if (segment.length > maxChunkSize) {
      // If we have content in currentChunk, add it as a chunk
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      // Split the long segment
      let startIndex = 0;
      while (startIndex < segment.length) {
        // Try to find a good breaking point
        let endIndex = startIndex + maxChunkSize;
        if (endIndex >= segment.length) {
          endIndex = segment.length;
        } else {
          // Look for a sentence end or space as break point
          const periodPos = segment.lastIndexOf('. ', endIndex);
          const spacePos = segment.lastIndexOf(' ', endIndex);
          
          if (periodPos > startIndex + maxChunkSize * 0.7) {
            endIndex = periodPos + 1;
          } else if (spacePos > startIndex + maxChunkSize * 0.7) {
            endIndex = spacePos + 1;
          }
        }
        
        // Add this part as a chunk
        chunks.push(segment.substring(startIndex, endIndex).trim());
        startIndex = endIndex;
      }
    } else if (currentChunk.length + segment.length + 1 > maxChunkSize) {
      // If adding this segment would exceed maxChunkSize, start a new chunk
      chunks.push(currentChunk);
      currentChunk = segment;
    } else {
      // Add segment to current chunk
      if (currentChunk.length > 0) {
        // Add a space or appropriate punctuation between segments
        // Use a period if it seems like separate sentences
        const lastChar = currentChunk[currentChunk.length - 1];
        const firstChar = segment[0];
        
        if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
          currentChunk += ' ';
        } else if (firstChar !== ',' && firstChar !== ';' && firstChar !== ':') {
          currentChunk += '. ';
        } else {
          currentChunk += ' ';
        }
      }
      currentChunk += segment;
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  // Make sure no chunk is empty and each has a sensible ending
  return chunks.map(chunk => {
    chunk = chunk.trim();
    // Add period if the chunk doesn't end with punctuation
    if (!/[.!?]$/.test(chunk)) {
      chunk += '.';
    }
    return chunk;
  }).filter(chunk => chunk.length > 0);
}

  /**
   * Process the Bhagavad Gita PDF from start to finish
   * @returns {Promise<Array>} Nodes for indexing
   */
  async processGitaDocument() {
    try {
      logger.info('Starting Bhagavad Gita document processing with enhanced patterns...');
      
      // Extract text from PDF
      await this.extractTextFromPdf();
      
      // Structure the text into chapters, verses, etc.
      await this.structureGitaText();
      
      // Create nodes for vector embedding
      const nodes = await this.createGitaNodes();
      
      // Save debug info
      await this.saveDebugInfo();
      
      logger.info(`Bhagavad Gita processing complete. Created ${nodes.length} nodes.`);
      return nodes;
    } catch (error) {
      logger.error(`Error processing Bhagavad Gita document: ${error.message}`);
      logger.error(error.stack);
      this.debugInfo.errors.push({
        phase: 'processGitaDocument',
        error: error.message,
        stack: error.stack
      });
      await this.saveDebugInfo();
      throw error;
    }
  }

/**
   * Save debug information
   * @returns {Promise<void>}
   * @private
   */
async saveDebugInfo() {
  try {
    const debugPath = path.join(__dirname, '../data/gita_processing_debug.json');
    await fs.writeFile(
      debugPath,
      JSON.stringify(this.debugInfo, null, 2)
    );
    logger.info(`Saved debug information to ${debugPath}`);
  } catch (error) {
    logger.error(`Error saving debug info: ${error.message}`);
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
        processorVersion: '2.0',
        stats: this.debugInfo.stats || {},
        nodeStats: this.debugInfo.nodeStats || {}
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
      
      // Check if the data is from the enhanced processor
      const version = data.metadata?.processorVersion || '1.0';
      if (version !== '2.0') {
        logger.warn(`Data was processed with an older version (${version}). Consider reprocessing.`);
      }
      
      // Copy statistics into debug info if available
      if (data.metadata?.stats) {
        this.debugInfo.stats = data.metadata.stats;
      }
      
      if (data.metadata?.nodeStats) {
        this.debugInfo.nodeStats = data.metadata.nodeStats;
      }
      
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

/**
 * Debug utility to extract and analyze specific sections
 * @param {string} outputPath Path to save debug information
 * @returns {Promise<Object>} Debug information
 */
async debugExtraction(outputPath = './data/debug_extraction.json') {
  try {
    // Extract text if not already done
    if (!this.rawText || this.rawText.length === 0) {
      await this.extractTextFromPdf();
    }
    
    // Attempt structure recognition
    const structureAttempt = {
      // Sample from the beginning, middle, and end of the text
      textSample: {
        beginning: this.rawText.substring(0, 5000),
        middle: this.rawText.substring(Math.floor(this.rawText.length / 2) - 2500, Math.floor(this.rawText.length / 2) + 2500),
        end: this.rawText.substring(this.rawText.length - 5000)
      }
    };
    
    // Try different regex patterns on the text
    const patternTests = {
      chapters: [],
      verses: [],
      translations: [],
      purports: []
    };
    
    // Test chapter patterns
    const chapterPatterns = [
      /-\s*CHAPTER\s+(\d+)\s*-/gi,
      /CHAPTER\s+(\d+)/gi,
      /- CHAPTER (\d+) -/gi
    ];
    
    for (const pattern of chapterPatterns) {
      const matches = [...this.rawText.matchAll(pattern)];
      patternTests.chapters.push({
        pattern: pattern.toString(),
        matchCount: matches.length,
        firstMatches: matches.slice(0, 3).map(m => ({
          fullMatch: m[0],
          chapter: m[1],
          position: m.index
        }))
      });
    }
    
    // Test verse patterns
    const versePatterns = [
      /TEXT\s+(\d+)/gi,
      /^TEXT (\d+)$/gim
    ];
    
    for (const pattern of versePatterns) {
      const matches = [...this.rawText.matchAll(pattern)];
      patternTests.verses.push({
        pattern: pattern.toString(),
        matchCount: matches.length,
        firstMatches: matches.slice(0, 3).map(m => ({
          fullMatch: m[0],
          verse: m[1],
          position: m.index
        }))
      });
    }
    
    // Test translation patterns
    const translationPatterns = [
      /TRANSLATION/gi,
      /^TRANSLATION$/gim
    ];
    
    for (const pattern of translationPatterns) {
      const matches = [...this.rawText.matchAll(pattern)];
      patternTests.translations.push({
        pattern: pattern.toString(),
        matchCount: matches.length,
        firstMatches: matches.slice(0, 3).map(m => ({
          fullMatch: m[0],
          position: m.index
        }))
      });
    }
    
    // Test purport patterns
    const purportPatterns = [
      /PURPORT/gi,
      /^PURPORT$/gim
    ];
    
    for (const pattern of purportPatterns) {
      const matches = [...this.rawText.matchAll(pattern)];
      patternTests.purports.push({
        pattern: pattern.toString(),
        matchCount: matches.length,
        firstMatches: matches.slice(0, 3).map(m => ({
          fullMatch: m[0],
          position: m.index
        }))
      });
    }
    
    structureAttempt.patternTests = patternTests;
    
    // Extract some representative sections for manual inspection
    const sections = {};
    
    // Find a chapter start
    const chapterMatch = this.rawText.match(/-\s*CHAPTER\s+(\d+)\s*-/i);
    if (chapterMatch) {
      const startPos = chapterMatch.index;
      sections.chapterSample = this.rawText.substring(startPos, startPos + 2000);
    }
    
    // Find a verse
    const verseMatch = this.rawText.match(/TEXT\s+(\d+)/i);
    if (verseMatch) {
      const startPos = verseMatch.index;
      sections.verseSample = this.rawText.substring(startPos, startPos + 1000);
    }
    
    // Find a translation
    const translationMatch = this.rawText.match(/TRANSLATION/i);
    if (translationMatch) {
      const startPos = translationMatch.index;
      sections.translationSample = this.rawText.substring(startPos, startPos + 500);
    }
    
    // Find a purport
    const purportMatch = this.rawText.match(/PURPORT/i);
    if (purportMatch) {
      const startPos = purportMatch.index;
      sections.purportSample = this.rawText.substring(startPos, startPos + 1500);
    }
    
    structureAttempt.sections = sections;
    
    // Save the debug information
    await fs.writeFile(
      outputPath,
      JSON.stringify(structureAttempt, null, 2)
    );
    
    logger.info(`Debug extraction information saved to ${outputPath}`);
    return structureAttempt;
  } catch (error) {
    logger.error(`Error in debug extraction: ${error.message}`);
    logger.error(error.stack);
    throw error;
  }
}

/**
 * Run a test extraction and chunking process on a small section
 * @param {number} chapter Chapter number to test
 * @param {number} verse Verse number to test
 * @returns {Promise<Object>} Test results
 */
async testExtraction(chapter = 1, verse = 1) {
  try {
    // Extract text if not already done
    if (!this.rawText || this.rawText.length === 0) {
      await this.extractTextFromPdf();
    }
    
    logger.info(`Running test extraction for Chapter ${chapter}, Verse ${verse}`);
    
    // Find the specified chapter and verse
    const chapterPattern = new RegExp(`-\\s*CHAPTER\\s+${chapter}\\s*-`, 'i');
    const versePattern = new RegExp(`TEXT\\s+${verse}`, 'i');
    
    const chapterMatch = this.rawText.match(chapterPattern);
    
    if (!chapterMatch) {
      logger.warn(`Chapter ${chapter} not found in the text`);
      return { success: false, error: `Chapter ${chapter} not found` };
    }
    
    // Find the verse within the chapter text
    const chapterStartPos = chapterMatch.index;
    const nextChapterPattern = /-\s*CHAPTER\s+(\d+)\s*-/i;
    const nextChapterMatch = this.rawText.substring(chapterStartPos + 1).match(nextChapterPattern);
    
    const chapterEndPos = nextChapterMatch 
      ? chapterStartPos + 1 + nextChapterMatch.index 
      : this.rawText.length;
    
    const chapterText = this.rawText.substring(chapterStartPos, chapterEndPos);
    
    const verseMatch = chapterText.match(versePattern);
    
    if (!verseMatch) {
      logger.warn(`Verse ${verse} not found in Chapter ${chapter}`);
      return { success: false, error: `Verse ${verse} not found in Chapter ${chapter}` };
    }
    
    // Extract the verse and surrounding context
    const verseStartPos = verseMatch.index;
    const nextVersePattern = /TEXT\s+(\d+)/i;
    const nextVerseMatch = chapterText.substring(verseStartPos + 1).match(nextVersePattern);
    
    const verseEndPos = nextVerseMatch 
      ? verseStartPos + 1 + nextVerseMatch.index 
      : chapterText.length;
    
    const verseFullText = chapterText.substring(verseStartPos, verseEndPos);
    
    // Extract Sanskrit, translation, and purport
    const translationMatch = verseFullText.match(/TRANSLATION/i);
    const purportMatch = verseFullText.match(/PURPORT/i);
    
    let sanskritText = '';
    let translationText = '';
    let purportText = '';
    
    if (translationMatch) {
      // Sanskrit is between verse header and translation
      sanskritText = verseFullText.substring(
        versePattern.toString().length,
        translationMatch.index
      ).trim();
      
      // Translation is between translation header and purport (or end)
      const translationStartPos = translationMatch.index + 'TRANSLATION'.length;
      const translationEndPos = purportMatch ? purportMatch.index : verseFullText.length;
      
      translationText = verseFullText.substring(translationStartPos, translationEndPos).trim();
      
      // Purport is after purport header
      if (purportMatch) {
        purportText = verseFullText.substring(
          purportMatch.index + 'PURPORT'.length
        ).trim();
      }
    }
    
    // Create test chunks
    const purportChunks = this._createSemanticChunks(purportText, 800);
    
    return {
      success: true,
      chapter,
      verse,
      sanskrit: {
        text: sanskritText,
        length: sanskritText.length
      },
      translation: {
        text: translationText,
        length: translationText.length
      },
      purport: {
        text: purportText.substring(0, 200) + (purportText.length > 200 ? '...' : ''),
        length: purportText.length,
        chunks: purportChunks.map((chunk, i) => ({
          index: i,
          length: chunk.length,
          text: chunk.substring(0, 100) + (chunk.length > 100 ? '...' : '')
        }))
      }
    };
  } catch (error) {
    logger.error(`Error in test extraction: ${error.message}`);
    logger.error(error.stack);
    return { success: false, error: error.message };
  }
}
}

module.exports = GitaDocumentProcessor;