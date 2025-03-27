document.addEventListener('DOMContentLoaded', function() {
  // Health panel toggle functionality
  const healthToggle = document.getElementById('health-toggle');
  const healthContent = document.getElementById('health-content');
  
  console.log('Health toggle element:', healthToggle);
  console.log('Health content element:', healthContent);
  
  if (!healthToggle || !healthContent) {
    console.error('Could not find health panel elements!');
    return;
  }
  
  healthToggle.addEventListener('click', function() {
    console.log('Health toggle clicked');
    const isExpanded = healthToggle.getAttribute('aria-expanded') === 'true';
    console.log('Current expanded state:', isExpanded);
    
    healthToggle.setAttribute('aria-expanded', !isExpanded);
    healthToggle.textContent = isExpanded ? 'Show Details' : 'Hide Details';
    
    console.log('Setting health content display');
    healthContent.style.display = isExpanded ? 'none' : 'block';
    
    // Also try adding/removing the active class
    if (!isExpanded) {
      console.log('Adding active class');
      healthContent.classList.add('active');
    } else {
      console.log('Removing active class');
      healthContent.classList.remove('active');
    }
    
    // Fetch health data if opening the panel
    if (!isExpanded) {
      console.log('Fetching health data');
      fetchHealthData();
    }
  });
  
  // Refresh button functionality
  const refreshButton = document.getElementById('refresh-health');
  console.log('Refresh button:', refreshButton);
  
  if (refreshButton) {
    refreshButton.addEventListener('click', fetchHealthData);
  }
  
  // Initial health check
  console.log('Performing initial health check');
  fetchHealthData();
  
  // Function to fetch health data from API
  async function fetchHealthData() {
    console.log('Fetching health data from API');
    try {
      const response = await fetch('/api/v1/query/health');
      console.log('API response:', response);
      
      if (!response.ok) {
        throw new Error('Failed to fetch health data');
      }
      
      const data = await response.json();
      console.log('Health data:', data);
      updateHealthPanel(data.data);
    } catch (error) {
      console.error('Error fetching health data:', error);
      updateHealthStatus('error', 'System Error');
    }
  }
  
  // Function to update health panel with data
  function updateHealthPanel(health) {
    console.log('Updating health panel with data:', health);
    
    // Update status indicator
    updateHealthStatus(health.status, health.status === 'ok' ? 'Operational' : health.status === 'degraded' ? 'Partially Operational' : 'Error');
    
    // Update vector store info
    document.getElementById('vector-status').textContent = `Status: ${health.vectorStore.status}`;
    document.getElementById('vector-count').textContent = `Documents: ${health.vectorStore.documentCount}`;
    document.getElementById('vector-kb').textContent = `Knowledge Base: ${health.vectorStore.knowledgeBase}`;
    // Update LLM info
    document.getElementById('llm-status').textContent = `Status: ${health.llm.status}`;
    document.getElementById('llm-model').textContent = `Model: ${health.llm.model}`;
    
    // Update languages
    document.getElementById('languages-supported').textContent = `Supported: ${health.languages.join(', ')}`;
    
    // Update system info
    document.getElementById('system-initialized').textContent = `Initialized: ${health.initialized ? 'Yes' : 'No'}`;
    document.getElementById('system-updated').textContent = `Last Updated: ${new Date(health.lastUpdated).toLocaleString()}`;
  }
  
  // Function to update the health status indicator
  function updateHealthStatus(status, text) {
    console.log('Updating health status:', status, text);
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    // Remove all status classes
    indicator.classList.remove('status-ok', 'status-degraded', 'status-error');
    
    // Add appropriate class based on status
    if (status === 'ok') {
      indicator.classList.add('status-ok');
    } else if (status === 'degraded') {
      indicator.classList.add('status-degraded');
    } else {
      indicator.classList.add('status-error');
    }
    
    // Update status text
    statusText.textContent = text;
  }
}); 