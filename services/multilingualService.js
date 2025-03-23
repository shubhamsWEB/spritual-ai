/**
 * Multilingual service for language detection and translation
 */
const axios = require('axios');
const translate = require('@vitalets/google-translate-api');
const config = require('config');
const logger = require('../utils/logger');

class MultilingualService {
  constructor() {
    this.supportedLanguages = {
      en: 'english',
      hi: 'hindi', 
      sa: 'sanskrit'
    };
    
    logger.info(`Initialized multilingual service with support for: ${Object.values(this.supportedLanguages).join(', ')}`);
  }

  /**
   * Detect the language of the provided text
   * @param {string} text Text to detect
   * @returns {Promise<string>} Language code
   */
  async detectLanguage(text) {
    if (!text) {
      return 'en'; // Default to English for empty text
    }
    
    try {
      // Check for Devanagari script (used in Hindi and Sanskrit)
      if (/[\u0900-\u097F]/.test(text)) {
        // Simplified detection between Hindi and Sanskrit
        // In reality, you'd want a more sophisticated approach
        
        // Sanskrit often has specific endings and patterns
        const sanskritPatterns = [
          /\b(aha|ami|asi|ati|atu|antu|bhih|bhyah|bhyam|esu|ena|ebhih|sya|smin)\b/,
          /\b(tvam|aham|tasya|tasmai|tena|tasmaat|tasmin|sarve|sarveshu)\b/
        ];
        
        for (const pattern of sanskritPatterns) {
          if (pattern.test(text)) {
            return 'sa';
          }
        }
        
        return 'hi'; // Default to Hindi for Devanagari if not detected as Sanskrit
      }
      
      // Default to English for non-Devanagari text
      return 'en';
    } catch (error) {
      logger.error(`Error detecting language: ${error.message}`);
      return 'en'; // Default to English on error
    }
  }

  /**
   * Translate text from source language to English
   * @param {string} text Text to translate
   * @param {string} sourceLang Source language code
   * @returns {Promise<string>} Translated text
   */
  async translateToEnglish(text, sourceLang = null) {
    if (!text) {
      return ''; // Return empty string for empty input
    }
    
    // If language not provided, detect it
    if (!sourceLang) {
      sourceLang = await this.detectLanguage(text);
    }
    
    // If already English, return as is
    if (sourceLang === 'en') {
      return text;
    }
    
    try {
      // Handle Sanskrit special case
      if (sourceLang === 'sa') {
        return this._translateSanskritToEnglish(text);
      }
      
      // For Hindi and other supported languages
      const result = await translate(text, {
        from: sourceLang,
        to: 'en'
      });
      
      logger.info(`Translated from ${sourceLang} to English`);
      return result.text;
    } catch (error) {
      logger.error(`Translation error: ${error.message}`);
      // Fall back to original text on error
      return text;
    }
  }

  /**
   * Translate text from English to target language
   * @param {string} text Text to translate
   * @param {string} targetLang Target language code
   * @returns {Promise<string>} Translated text
   */
  async translateFromEnglish(text, targetLang) {
    if (!text) {
      return '';
    }
    
    // If target is English, return as is
    if (targetLang === 'en') {
      return text;
    }
    
    try {
      // Handle Sanskrit special case
      if (targetLang === 'sa') {
        return this._translateEnglishToSanskrit(text);
      }
      
      // For Hindi and other supported languages
      const result = await translate(text, {
        from: 'en',
        to: targetLang
      });
      
      logger.info(`Translated from English to ${targetLang}`);
      return result.text;
    } catch (error) {
      logger.error(`Translation error: ${error.message}`);
      // Fall back to original text on error
      return text;
    }
  }

  /**
   * Special handler for Sanskrit to English translation
   * @param {string} text Sanskrit text
   * @returns {Promise<string>} English text
   * @private
   */
  async _translateSanskritToEnglish(text) {
    try {
      // For basic support, we'll use Hindi as an intermediate language
      const result = await translate(text, {
        from: 'hi', // Using Hindi as an approximation
        to: 'en'
      });
      
      logger.info('Translated Sanskrit to English via Hindi');
      return result.text;
    } catch (error) {
      logger.error(`Sanskrit translation error: ${error.message}`);
      // Fall back to original text
      return text;
    }
  }

  /**
   * Special handler for English to Sanskrit translation
   * @param {string} text English text
   * @returns {Promise<string>} Sanskrit text
   * @private
   */
  async _translateEnglishToSanskrit(text) {
    try {
      // This is a simplified approximation using Hindi as a bridge
      const result = await translate(text, {
        from: 'en',
        to: 'hi'
      });
      
      // Here you would normally apply Sanskrit-specific transformations
      // For now, we'll use Hindi as an approximation
      const sanskritText = result.text;
      
      logger.info('Translated English to Sanskrit (approximation)');
      return sanskritText;
    } catch (error) {
      logger.error(`Sanskrit generation error: ${error.message}`);
      
      // Fall back to Hindi as closest approximation
      try {
        const result = await translate(text, {
          from: 'en',
          to: 'hi'
        });
        return result.text;
      } catch {
        // Fall back to original text as last resort
        return text;
      }
    }
  }

  /**
   * Format a Bhagavad Gita reference in the appropriate language
   * @param {number} chapter Chapter number
   * @param {number} verse Verse number
   * @param {string} language Language code
   * @returns {string} Formatted reference
   */
  formatGitaReference(chapter, verse, language = 'en') {
    if (language === 'en') {
      return `Bhagavad Gita, Chapter ${chapter}, Verse ${verse}`;
    } else if (language === 'hi') {
      return `भगवद्गीता, अध्याय ${chapter}, श्लोक ${verse}`;
    } else if (language === 'sa') {
      // Sanskrit numerals for common chapters (simplified)
      const sanskritNumerals = {
        1: 'प्रथम', 2: 'द्वितीय', 3: 'तृतीय', 4: 'चतुर्थ', 
        5: 'पञ्चम', 6: 'षष्ठ', 7: 'सप्तम', 8: 'अष्टम',
        9: 'नवम', 10: 'दशम', 11: 'एकादश', 12: 'द्वादश',
        13: 'त्रयोदश', 14: 'चतुर्दश', 15: 'पञ्चदश', 16: 'षोडश',
        17: 'सप्तदश', 18: 'अष्टादश'
      };
      
      const chNum = sanskritNumerals[chapter] || chapter;
      return `श्रीमद्भगवद्गीता, ${chNum} अध्यायः, श्लोकः ${verse}`;
    } else {
      return `Bhagavad Gita ${chapter}:${verse}`;
    }
  }

  /**
   * Get the list of supported languages
   * @returns {Object} Supported languages
   */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }
}

module.exports = MultilingualService;