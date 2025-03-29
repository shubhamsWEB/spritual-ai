document.addEventListener('DOMContentLoaded', () => {
  const chatMessages = document.getElementById('chat-messages');
  const userInputElement = document.getElementById('user-input');
  const sendButton = document.getElementById('send-button');
  const languageSelect = document.getElementById('language');
  
  let isProcessing = false;

  document.getElementById('start-chat-button').addEventListener('click', function() {
    document.querySelector('.chat-container').style.display = 'flex';
    document.querySelector('.start-chat-container').style.display = 'none';
  });
  
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
    if (!userInputElement) return;
    
    const userInput = userInputElement.value.trim();
    
    if (!userInput || isProcessing) return;
    
    // Display user message
    addMessage(userInput, 'user');
    
    // Clear input and disable button
    userInputElement.value = '';
    isProcessing = true;
    sendButton.disabled = true;
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
      // Send request to API
      const response = await fetch('/api/v1/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: userInput,
          language: 'en'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response');
      }
      
      const data = await response.json();
      console.log("🚀 ~ sendMessage ~ data:", data);
      
      // Remove typing indicator
      removeTypingIndicator();
      
      if (!data.success) {
        throw new Error(data.error?.message || 'Unknown error');
      }
      
      // Format source references
      const sourceRefs = [];
      if (data.data.sources && data.data.sources.length > 0) {
        console.log("Sources received:", data.data.sources);
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
      
      console.log("Formatted source references:", sourceRefs);
      
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
  
  // Set up event listeners
  if (userInputElement && sendButton) {
    sendButton.addEventListener('click', () => sendMessage());
    userInputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  
  // Auto-resize textarea as user types
  userInputElement.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });
  
  // Focus input on page load
  userInputElement.focus();
}); 