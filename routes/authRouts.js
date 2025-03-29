/**
 * Routes for authentication operations
 */
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const requestValidator = require('../middleware/requestValidator');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route POST /api/auth/register
 * @description Register a new user
 * @access Public
 */
router.post(
  '/register',
  [
    body('email')
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    
    body('name')
      .optional()
      .isString()
      .withMessage('Name must be a string'),
    
    requestValidator
  ],
  authController.register
);

/**
 * @route POST /api/auth/login
 * @description Login a user
 * @access Public
 */
router.post(
  '/login',
  [
    body('email')
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    
    requestValidator
  ],
  authController.login
);

/**
 * @route POST /api/auth/logout
 * @description Logout a user
 * @access Public
 */
router.post('/logout', authController.logout);

/**
 * @route GET /api/auth/me
 * @description Get current user profile
 * @access Private
 */
router.get('/me', authenticate, authController.getCurrentUser);

/**
 * @route POST /api/auth/reset-password
 * @description Request password reset
 * @access Public
 */
router.post(
  '/reset-password',
  [
    body('email')
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email'),
    
    requestValidator
  ],
  authController.requestPasswordReset
);

/**
 * @route PUT /api/auth/profile
 * @description Update user profile
 * @access Private
 */
router.put(
  '/profile',
  authenticate,
  [
    body('name')
      .optional()
      .isString()
      .withMessage('Name must be a string'),
    
    requestValidator
  ],
  authController.updateProfile
);

module.exports = router;