/**
 * Supabase service for authentication and database operations
 */
const { createClient } = require('@supabase/supabase-js');
const configService = require('../utils/configService');
const logger = require('../utils/logger');

class SupabaseService {
  constructor() {
    // Get Supabase config
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!this.supabaseUrl || !this.supabaseKey) {
      logger.warn('SUPABASE_URL or SUPABASE_ANON_KEY not found in environment variables');
    }

    // Initialize Supabase client
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    logger.info('Supabase service initialized');
  }

  /**
   * Sign up a new user with email and password
   * @param {string} email User email
   * @param {string} password User password
   * @param {Object} metadata Optional user metadata
   * @returns {Promise<Object>} Signup result
   */
  async signUp(email, password, metadata = {}) {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });

      if (error) {
        logger.error(`Signup error: ${error.message}`);
        throw error;
      }

      logger.info(`User signed up: ${email}`);
      return data;
    } catch (error) {
      logger.error(`Error signing up user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sign in a user with email and password
   * @param {string} email User email
   * @param {string} password User password
   * @returns {Promise<Object>} Sign in result
   */
  async signIn(email, password) {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        logger.error(`Sign in error: ${error.message}`);
        throw error;
      }

      logger.info(`User signed in: ${email}`);
      return data;
    } catch (error) {
      logger.error(`Error signing in user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sign out a user
   * @param {string} accessToken User access token
   * @returns {Promise<void>}
   */
  async signOut(accessToken) {
    try {
      const { error } = await this.supabase.auth.signOut({
        accessToken
      });

      if (error) {
        logger.error(`Sign out error: ${error.message}`);
        throw error;
      }

      logger.info('User signed out successfully');
    } catch (error) {
      logger.error(`Error signing out user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify a user's token
   * @param {string} token JWT token
   * @returns {Promise<Object>} User data
   */
  async verifyToken(token) {
    try {
      const { data, error } = await this.supabase.auth.getUser(token);

      if (error) {
        logger.error(`Token verification error: ${error.message}`);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Error verifying token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId User ID
   * @returns {Promise<Object>} User data
   */
  async getUserById(userId) {
    try {
      const { data, error } = await this.supabase.auth.admin.getUserById(userId);

      if (error) {
        logger.error(`Error fetching user by ID: ${error.message}`);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error(`Error getting user by ID: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update user metadata
   * @param {string} userId User ID
   * @param {Object} metadata User metadata
   * @returns {Promise<Object>} Updated user data
   */
  async updateUserMetadata(userId, metadata) {
    try {
      const { data, error } = await this.supabase.auth.admin.updateUserById(userId, {
        user_metadata: metadata
      });

      if (error) {
        logger.error(`Error updating user metadata: ${error.message}`);
        throw error;
      }

      logger.info(`User metadata updated for: ${userId}`);
      return data;
    } catch (error) {
      logger.error(`Error updating user metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset password with email
   * @param {string} email User email
   * @returns {Promise<void>}
   */
  async resetPassword(email) {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.FRONTEND_URL}/reset-password`
      });

      if (error) {
        logger.error(`Password reset error: ${error.message}`);
        throw error;
      }

      logger.info(`Password reset email sent to: ${email}`);
    } catch (error) {
      logger.error(`Error sending password reset: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get user profile
   * @param {string} userId User ID
   * @returns {Promise<Object>} User profile
   */
  async getUserProfile(userId) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error) {
        logger.error(`Error fetching user profile: ${error.message}`);
        throw error;
      }
        
      return data;
    } catch (error) {
      logger.error(`Error getting user profile: ${error.message}`);
      throw error;
    }
  }
    
  /**
   * Update user profile
   * @param {string} userId User ID
   * @param {Object} updates Profile updates
   * @returns {Promise<Object>} Updated profile
   */
  async updateUserProfile(userId, updates) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
        
      if (error) {
        logger.error(`Error updating user profile: ${error.message}`);
        throw error;
      }
        
      return data;
    } catch (error) {
      logger.error(`Error updating user profile: ${error.message}`);
      throw error;
    }
  }
    
  /**
   * Create user profile if it doesn't exist
   * @param {string} userId User ID
   * @param {Object} data Profile data
   * @returns {Promise<Object>} Created profile
   */
  async createUserProfile(userId, data = {}) {
    try {
      // Check if profile exists
      const { data: existingProfile } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (existingProfile) {
        logger.info(`Profile already exists for user: ${userId}`);
        return existingProfile;
      }
        
      // Create new profile
      const { data: newProfile, error } = await this.supabase
        .from('profiles')
        .insert({
          id: userId,
          ...data
        })
        .select()
        .single();
        
      if (error) {
        logger.error(`Error creating user profile: ${error.message}`);
        throw error;
      }
        
      logger.info(`Created profile for user: ${userId}`);
      return newProfile;
    } catch (error) {
      logger.error(`Error creating user profile: ${error.message}`);
      throw error;
    }
  }
    
  /**
   * Save query history
   * @param {string} userId User ID
   * @param {string} query User query
   * @param {string} response Bot response
   * @param {string} language Language code
   * @returns {Promise<Object>} Saved query record
   */
  async saveQueryHistory(userId, query, response, language = 'en') {
    try {
      const { data, error } = await this.supabase
        .from('query_history')
        .insert({
          user_id: userId,
          query,
          response,
          language
        })
        .select()
        .single();
        
      if (error) {
        logger.error(`Error saving query history: ${error.message}`);
        throw error;
      }
        
      return data;
    } catch (error) {
      logger.error(`Error saving query history: ${error.message}`);
      throw error;
    }
  }
    
  /**
   * Get user query history
   * @param {string} userId User ID
   * @param {number} limit Maximum number of records to return
   * @returns {Promise<Array>} Query history
   */
  async getUserQueryHistory(userId, limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('query_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
        
      if (error) {
        logger.error(`Error fetching query history: ${error.message}`);
        throw error;
      }
        
      return data;
    } catch (error) {
      logger.error(`Error getting query history: ${error.message}`);
      throw error;
    }
  }
    
  /**
   * Delete a query history record
   * @param {string} userId User ID
   * @param {string} recordId Record ID
   * @returns {Promise<void>}
   */
  async deleteQueryHistory(userId, recordId) {
    try {
      const { error } = await this.supabase
        .from('query_history')
        .delete()
        .match({ id: recordId, user_id: userId });
        
      if (error) {
        logger.error(`Error deleting query history: ${error.message}`);
        throw error;
      }
        
      logger.info(`Deleted query history record: ${recordId}`);
    } catch (error) {
      logger.error(`Error deleting query history: ${error.message}`);
      throw error;
    }
  }
    
  /**
   * Clear all query history for a user
   * @param {string} userId User ID
   * @returns {Promise<void>}
   */
  async clearQueryHistory(userId) {
    try {
      const { error } = await this.supabase
        .from('query_history')
        .delete()
        .eq('user_id', userId);
        
      if (error) {
        logger.error(`Error clearing query history: ${error.message}`);
        throw error;
      }
        
      logger.info(`Cleared query history for user: ${userId}`);
    } catch (error) {
      logger.error(`Error clearing query history: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new SupabaseService();