/**
 * Routes for language-related operations
 */
const express = require('express');
const { body } = require('express-validator');
const languageController = require('../controllers/languageController');
const requestValidator = require('../middleware/requestValidator');

const router = express.Router();

/**
 * @route GET /api/language
 * @description Get supported languages
 * @access Public
 */
router.get('/', languageController.getSupportedLanguages);

/**
 * @route POST /api/language/detect
 * @description Detect the language of text
 * @access Public
 */
router.post(
  '/detect',
  [
    body('text')
      .notEmpty()
      .withMessage('Text is required')
      .isString()
      .withMessage('Text must be a string'),
    
    requestValidator
  ],
  languageController.detectLanguage
);

/**
 * @route POST /api/language/translate
 * @description Translate text
 * @access Public
 */
router.post(
  '/translate',
  [
    body('text')
      .notEmpty()
      .withMessage('Text is required')
      .isString()
      .withMessage('Text must be a string'),
    
    body('source_language')
      .optional()
      .isString()
      .withMessage('Source language must be a string')
      .isLength({ min: 2, max: 5 })
      .withMessage('Language code must be between 2 and 5 characters'),
    
    body('target_language')
      .notEmpty()
      .withMessage('Target language is required')
      .isString()
      .withMessage('Target language must be a string')
      .isLength({ min: 2, max: 5 })
      .withMessage('Language code must be between 2 and 5 characters'),
    
    requestValidator
  ],
  languageController.translateText
);

/**
 * @route POST /api/language/format-gita-reference
 * @description Format a Gita reference in a specific language
 * @access Public
 */
router.post(
  '/format-gita-reference',
  [
    body('chapter')
      .notEmpty()
      .withMessage('Chapter is required')
      .isInt({ min: 1, max: 18 })
      .withMessage('Chapter must be an integer between 1 and 18'),
    
    body('verse')
      .notEmpty()
      .withMessage('Verse is required')
      .isInt({ min: 1 })
      .withMessage('Verse must be a positive integer'),
    
    body('language')
      .optional()
      .isString()
      .withMessage('Language must be a string')
      .isLength({ min: 2, max: 5 })
      .withMessage('Language code must be between 2 and 5 characters'),
    
    requestValidator
  ],
  languageController.formatGitaReference
);

module.exports = router;