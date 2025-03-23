/**
 * Simple script to test the embedding service
 */
require('dotenv').config();
const EmbeddingService = require('../services/customEmbeddingService');

async function testEmbedding() {
  console.log('Testing embedding service...');
  
  try {
    // Initialize the embedding service
    const embeddingService = new EmbeddingService();
    
    // Test texts
    const texts = [
      'What is the meaning of karma according to Bhagavad Gita?',
      'How does Krishna define dharma in the Gita?',
      'Tell me about the concept of duty in Hindu philosophy.',
      'What is the relationship between action and intention?',
      'How can I find inner peace through spiritual practice?'
    ];
    
    console.log('Generating embeddings for test texts...');
    
    // Generate embeddings for each text
    for (const text of texts) {
      console.log(`\nProcessing: "${text}"`);
      
      const startTime = Date.now();
      const embedding = await embeddingService.getEmbedding(text);
      const endTime = Date.now();
      
      console.log(`Embedding generated in ${endTime - startTime}ms`);
      console.log(`Dimensions: ${embedding.length}`);
      console.log(`First 5 values: ${embedding.slice(0, 5).join(', ')}`);
    }
    
    // Test similarity calculation
    console.log('\nTesting similarity between texts:');
    
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const similarity = await embeddingService.calculateSimilarity(texts[i], texts[j]);
        console.log(`Similarity between text ${i+1} and ${j+1}: ${similarity.toFixed(4)}`);
      }
    }
    
    console.log('\nEmbedding service test completed successfully!');
  } catch (error) {
    console.error('Error testing embedding service:', error);
  }
}

// Run the test
testEmbedding();