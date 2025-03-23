/**
 * Controller for language-related operations
 */
const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');
const MultilingualService = require('../services/multilingualService');

// Initialize the multilingual service
const multilingualService = new MultilingualService();

/**
 * Get supported languages
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getSupportedLanguages = async (req, res, next) => {
  try {
    const supportedLanguages = multilingualService.getSupportedLanguages();
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        supported_languages: supportedLanguages
      }
    });
  } catch (error) {
    logger.error(`Error getting supported languages: ${error.message}`);
    next(error);
  }
};

/**
 * Detect language of text
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const detectLanguage = async (req, res, next) => {
  try {
    const { text } = req.body;
    
    // Validate input
    if (!text) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Text is required'
        }
      });
    }
    
    // Detect language
    const detectedLanguage = await multilingualService.detectLanguage(text);
    const languageName = multilingualService.getSupportedLanguages()[detectedLanguage] || 'unknown';
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        detected_language: detectedLanguage,
        language_name: languageName
      }
    });
  } catch (error) {
    logger.error(`Error detecting language: ${error.message}`);
    next(error);
  }
};

/**
 * Translate text to a target language
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const translateText = async (req, res, next) => {
  try {
    const { text, source_language, target_language } = req.body;
    
    // Validate input
    if (!text) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Text is required'
        }
      });
    }
    
    if (!target_language) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Target language is required'
        }
      });
    }
    
    let translatedText;
    
    if (source_language === 'en' || !source_language) {
      // Translate from English to target language
      translatedText = await multilingualService.translateFromEnglish(text, target_language);
    } else {
      // First translate to English
      const englishText = await multilingualService.translateToEnglish(text, source_language);
      
      // Then translate to target language if not English
      if (target_language === 'en') {
        translatedText = englishText;
      } else {
        translatedText = await multilingualService.translateFromEnglish(englishText, target_language);
      }
    }
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        original_text: text,
        translated_text: translatedText,
        source_language: source_language || await multilingualService.detectLanguage(text),
        target_language
      }
    });
  } catch (error) {
    logger.error(`Error translating text: ${error.message}`);
    next(error);
  }
};

/**
 * Format a Gita reference in the specified language
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const formatGitaReference = async (req, res, next) => {
  try {
    const { chapter, verse, language = 'en' } = req.body;
    
    // Validate input
    if (!chapter || !verse) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Chapter and verse are required'
        }
      });
    }
    
    // Format reference
    const formattedReference = multilingualService.formatGitaReference(
      parseInt(chapter, 10),
      parseInt(verse, 10),
      language
    );
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        formatted_reference: formattedReference,
        language
      }
    });
  } catch (error) {
    logger.error(`Error formatting Gita reference: ${error.message}`);
    next(error);
  }
};

module.exports = {
  getSupportedLanguages,
  detectLanguage,
  translateText,
  formatGitaReference
};