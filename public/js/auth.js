/**
 * Authentication functionality for the Spiritual AI Bot
 */
document.addEventListener('DOMContentLoaded', () => {
    // Authentication state
    let currentUser = null;
    let authToken = null;
  
    // DOM Elements
    const authContainer = document.getElementById('auth-container');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const logoutButton = document.getElementById('logout-button');
    const userInfo = document.getElementById('user-info');
    const authToggle = document.getElementById('auth-toggle');
    const authError = document.getElementById('auth-error');
  
    // API base URL
    const API_BASE = '/api/v1';
  
    /**
     * Initialize authentication
     */
    const initAuth = async () => {
      try {
        // Check for token in localStorage
        const savedToken = localStorage.getItem('authToken');
        
        if (savedToken) {
          authToken = savedToken;
          await getCurrentUser();
        }
        
        updateAuthUI();
      } catch (error) {
        console.error('Authentication initialization error:', error);
        clearAuth();
      }
    };
  
    /**
     * Get current user from API
     */
    const getCurrentUser = async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        });
  
        if (response.ok) {
          const data = await response.json();
          currentUser = data.data.user;
          return true;
        } else {
          // If 401 or other error, clear auth
          clearAuth();
          return false;
        }
      } catch (error) {
        console.error('Error getting current user:', error);
        clearAuth();
        return false;
      }
    };
  
    /**
     * Login user
     * @param {string} email User email
     * @param {string} password User password
     */
    const login = async (email, password) => {
      try {
        const response = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password }),
          credentials: 'include' // Include cookies
        });
  
        const data = await response.json();
  
        if (response.ok) {
          authToken = data.data.token;
          currentUser = data.data.user;
          localStorage.setItem('authToken', authToken);
          updateAuthUI();
          return { success: true };
        } else {
          return { 
            success: false, 
            message: data.error?.message || 'Login failed' 
          };
        }
      } catch (error) {
        console.error('Login error:', error);
        return { 
          success: false, 
          message: 'Network error. Please try again.' 
        };
      }
    };
  
    /**
     * Register new user
     * @param {string} email User email
     * @param {string} password User password
     * @param {string} name User name
     */
    const register = async (email, password, name) => {
      try {
        const response = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password, name }),
          credentials: 'include' // Include cookies
        });
  
        const data = await response.json();
  
        if (response.ok) {
          // If registration requires email confirmation
          if (data.data.confirmed === false) {
            return { 
              success: true, 
              confirmed: false, 
              message: data.data.message 
            };
          }
  
          // If registration is immediate
          authToken = data.data.token;
          currentUser = data.data.user;
          localStorage.setItem('authToken', authToken);
          updateAuthUI();
          return { success: true, confirmed: true };
        } else {
          return { 
            success: false, 
            message: data.error?.message || 'Registration failed' 
          };
        }
      } catch (error) {
        console.error('Registration error:', error);
        return { 
          success: false, 
          message: 'Network error. Please try again.' 
        };
      }
    };
  
    /**
     * Logout user
     */
    const logout = async () => {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          credentials: 'include' // Include cookies
        });
        
        clearAuth();
      } catch (error) {
        console.error('Logout error:', error);
        clearAuth();
      }
    };
  
    /**
     * Clear authentication state
     */
    const clearAuth = () => {
      authToken = null;
      currentUser = null;
      localStorage.removeItem('authToken');
      updateAuthUI();
    };
  
    /**
     * Update UI based on authentication state
     */
    const updateAuthUI = () => {
      if (currentUser) {
        // User is logged in
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'none';
        if (authToggle) authToggle.style.display = 'none';
        
        if (userInfo) {
          userInfo.style.display = 'block';
          userInfo.innerHTML = `
            <p>Welcome, <strong>${currentUser.name || currentUser.email}</strong></p>
          `;
        }
        
        if (logoutButton) {
          logoutButton.style.display = 'block';
        }
        
        // Update chat container if available
        const startChatButton = document.getElementById('start-chat-button');
        const chatContainer = document.querySelector('.chat-container');
        
        if (startChatButton && chatContainer) {
          startChatButton.textContent = 'Continue Your Spiritual Journey';
        }
  
        // Enable query sending
        enableQuerySending();
      } else {
        // User is not logged in
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
        if (authToggle) authToggle.style.display = 'block';
        
        if (userInfo) {
          userInfo.style.display = 'none';
        }
        
        if (logoutButton) {
          logoutButton.style.display = 'none';
        }
  
        // Disable query sending
        disableQuerySending();
      }
    };
  
    /**
     * Enable query sending functionality
     */
    const enableQuerySending = () => {
      const sendButton = document.getElementById('send-button');
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.title = '';
      }
    };
  
    /**
     * Disable query sending functionality
     */
    const disableQuerySending = () => {
      const sendButton = document.getElementById('send-button');
      if (sendButton) {
        sendButton.disabled = true;
        sendButton.title = 'Please log in to ask questions';
      }
    };
  
    /**
     * Modify sendMessage function in app.js to include auth token
     */
    const modifySendMessage = () => {
      // Keep reference to the original sendMessage if it exists
      if (window.originalSendMessage) return;
      
      const appScript = document.querySelector('script[src="js/app.js"]');
      
      if (appScript) {
        // Wait for app.js to load
        appScript.addEventListener('load', () => {
          // Check if sendMessage exists and save original
          if (typeof window.sendMessage === 'function') {
            window.originalSendMessage = window.sendMessage;
            
            // Override with new function that adds auth
            window.sendMessage = async function() {
              // If not authenticated, show login prompt
              if (!authToken) {
                const chatMessages = document.getElementById('chat-messages');
                if (chatMessages) {
                  const messageDiv = document.createElement('div');
                  messageDiv.className = 'message system';
                  messageDiv.innerHTML = 'Please log in to ask questions.';
                  chatMessages.appendChild(messageDiv);
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                return;
              }
              
              // Get userInput element
              const userInputElement = document.getElementById('user-input');
              if (!userInputElement) return;
              
              const userInput = userInputElement.value.trim();
              
              if (!userInput || window.isProcessing) return;
              
              // Display user message
              const chatMessages = document.getElementById('chat-messages');
              if (chatMessages) {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message user';
                messageDiv.innerHTML = userInput;
                chatMessages.appendChild(messageDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
              }
              
              // Clear input and disable button
              userInputElement.value = '';
              window.isProcessing = true;
              
              const sendButton = document.getElementById('send-button');
              if (sendButton) {
                sendButton.disabled = true;
              }
              
              // Show typing indicator
              if (typeof window.showTypingIndicator === 'function') {
                window.showTypingIndicator();
              } else {
                const typingDiv = document.createElement('div');
                typingDiv.className = 'message bot typing-indicator';
                typingDiv.id = 'typing-indicator';
                typingDiv.innerHTML = 'Thinking <span></span><span></span><span></span>';
                if (chatMessages) {
                  chatMessages.appendChild(typingDiv);
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
              }
              
              try {
                // Send request to API with auth token
                const response = await fetch('/api/v1/query', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                  },
                  body: JSON.stringify({
                    question: userInput,
                    language: 'en'
                  })
                });
                
                if (!response.ok) {
                  if (response.status === 401) {
                    // Unauthorized - token expired
                    clearAuth();
                    throw new Error('Session expired. Please log in again.');
                  }
                  throw new Error('Failed to get response');
                }
                
                const data = await response.json();
                
                // Remove typing indicator
                if (typeof window.removeTypingIndicator === 'function') {
                  window.removeTypingIndicator();
                } else {
                  const typingIndicator = document.getElementById('typing-indicator');
                  if (typingIndicator) {
                    typingIndicator.remove();
                  }
                }
                
                if (!data.success) {
                  throw new Error(data.error?.message || 'Unknown error');
                }
                
                // Format source references
                const sourceRefs = [];
                if (data.data.sources && data.data.sources.length > 0) {
                  data.data.sources.forEach(source => {
                    if (source.reference) {
                      sourceRefs.push(source.reference);
                    } else if (source.metadata && source.metadata.chapter) {
                      if (source.metadata.verse) {
                        sourceRefs.push(`Chapter ${source.metadata.chapter}, Verse ${source.metadata.verse}`);
                      } else {
                        sourceRefs.push(`Chapter ${source.metadata.chapter}`);
                      }
                    } else if (source.metadata && source.metadata.paragraph_id !== undefined) {
                      sourceRefs.push(`Paragraph ${source.metadata.paragraph_id}`);
                    }
                  });
                }
                
                // Display bot response
                if (chatMessages) {
                  const messageDiv = document.createElement('div');
                  messageDiv.className = 'message bot';
                  messageDiv.innerHTML = data.data.answer;
                  
                  // Add sources if provided
                  if (sourceRefs.length > 0) {
                    const sourceDiv = document.createElement('div');
                    sourceDiv.className = 'source';
                    sourceDiv.innerHTML = `<strong>Sources:</strong> ${sourceRefs.join(', ')}`;
                    messageDiv.appendChild(sourceDiv);
                  }
                  
                  chatMessages.appendChild(messageDiv);
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                
              } catch (error) {
                console.error('Error:', error);
                
                // Remove typing indicator
                if (typeof window.removeTypingIndicator === 'function') {
                  window.removeTypingIndicator();
                } else {
                  const typingIndicator = document.getElementById('typing-indicator');
                  if (typingIndicator) {
                    typingIndicator.remove();
                  }
                }
                
                // Display error message
                if (chatMessages) {
                  const messageDiv = document.createElement('div');
                  messageDiv.className = 'message bot';
                  messageDiv.innerHTML = `I apologize, but I encountered an error: ${error.message}`;
                  chatMessages.appendChild(messageDiv);
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
              } finally {
                window.isProcessing = false;
                if (sendButton) {
                  sendButton.disabled = false;
                }
              }
            };
          }
        });
      }
    };
  
    // Event listeners
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (authError) authError.textContent = '';
        
        const result = await login(email, password);
        
        if (!result.success && authError) {
          authError.textContent = result.message;
        }
      });
    }
  
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const name = document.getElementById('register-name').value;
        
        if (authError) authError.textContent = '';
        
        const result = await register(email, password, name);
        
        if (!result.success && authError) {
          authError.textContent = result.message;
        } else if (result.success && !result.confirmed && authError) {
          authError.textContent = result.message;
          authError.classList.add('success-message');
        }
      });
    }
  
    if (logoutButton) {
      logoutButton.addEventListener('click', logout);
    }
  
    if (authToggle) {
      authToggle.addEventListener('click', () => {
        const isLoginVisible = loginForm.style.display === 'block';
        
        if (isLoginVisible) {
          loginForm.style.display = 'none';
          registerForm.style.display = 'block';
          authToggle.textContent = 'Already have an account? Log in';
        } else {
          loginForm.style.display = 'block';
          registerForm.style.display = 'none';
          authToggle.textContent = 'Need an account? Register';
        }
        
        if (authError) {
          authError.textContent = '';
          authError.classList.remove('success-message');
        }
      });
    }
  
    // Initialize authentication
    initAuth();
    
    // Modify sendMessage function
    modifySendMessage();
  
    // Expose authentication functions globally
    window.auth = {
      login,
      register,
      logout,
      getCurrentUser,
      clearAuth
    };
  });