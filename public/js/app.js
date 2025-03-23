document.addEventListener('DOMContentLoaded', function() {
  const chatMessages = document.getElementById('chat-messages');
  const userInput = document.getElementById('user-input');
  const sendButton = document.getElementById('send-button');
  const languageSelect = document.getElementById('language');
  
  let isProcessing = false;
  
  // Function to add a message to the chat
  function addMessage(text, type, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = text;
    
    // Add sources if provided and it's a bot message
    if (type === 'bot' && sources.length > 0) {
      const sourceDiv = document.createElement('div');
      sourceDiv.className = 'source';
      sourceDiv.innerHTML = `<strong>Sources:</strong> ${sources.join(', ')}`;
      messageDiv.appendChild(sourceDiv);
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Function to show typing indicator
  function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = 'Thinking <span></span><span></span><span></span>';
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Function to remove typing indicator
  function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }
  
  // Function to send a message to the API
  async function sendMessage() {
    const message = userInput.value.trim();
    console.log("🚀 ~ sendMessage ~ message:", message);
    const language = languageSelect.value;
    
    if (!message || isProcessing) return;
    
    // Display user message
    addMessage(message, 'user');
    
    // Clear input and disable button
    userInput.value = '';
    isProcessing = true;
    sendButton.disabled = true;
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
      // Send request to API
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: message,
          language: language
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response');
      }
      
      const data = await response.json();
      
      // Remove typing indicator
      removeTypingIndicator();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Unknown error');
      }
      
      // Format source references
      const sourceRefs = [];
      if (data.data.sources && data.data.sources.length > 0) {
        data.data.sources.forEach(source => {
          if (source.metadata && source.metadata.chapter) {
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
      addMessage(data.data.answer, 'bot', sourceRefs);
      
    } catch (error) {
      console.error('Error:', error);
      removeTypingIndicator();
      addMessage('I apologize, but I encountered an error processing your question. Please try again.', 'bot');
    } finally {
      isProcessing = false;
      sendButton.disabled = false;
    }
  }
  
  // Event listeners
  sendButton.addEventListener('click', sendMessage);
  
  userInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  
  // Auto-resize textarea as user types
  userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });
  
  // Focus input on page load
  userInput.focus();
}); 