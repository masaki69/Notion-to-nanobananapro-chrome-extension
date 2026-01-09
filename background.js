// Background service worker
console.log('Notion to Nanobanana Pro: Background service worker loaded');

// API Configuration
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateImage') {
    handleGenerateImage(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

// Handle image generation request
async function handleGenerateImage({ prompt, blockId, pageId }) {
  try {
    // Get API keys from storage
    const { geminiApiKey, notionApiKey } = await chrome.storage.sync.get([
      'geminiApiKey',
      'notionApiKey'
    ]);

    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured. Please set it in the extension popup.');
    }

    if (!notionApiKey) {
      throw new Error('Notion API key not configured. Please set it in the extension popup.');
    }

    if (!pageId) {
      throw new Error('Could not extract Notion page ID from URL.');
    }

    // Step 1: Generate image using Gemini Nanobanana Pro
    console.log('Generating image with prompt:', prompt);
    const imageUrl = await generateImageWithGemini(prompt, geminiApiKey);

    // Step 2: Add image to Notion page
    console.log('Adding image to Notion page:', pageId);
    await addImageToNotion(imageUrl, pageId, blockId, notionApiKey);

    return { success: true };
  } catch (error) {
    console.error('Error in handleGenerateImage:', error);
    return { success: false, error: error.message };
  }
}

// Generate image using Gemini Nanobanana Pro API
async function generateImageWithGemini(prompt, apiKey) {
  try {
    // Gemini API endpoint for image generation
    // Note: This is a placeholder - adjust based on actual Gemini Nanobanana Pro API
    const endpoint = `${GEMINI_API_BASE}/models/nanobanana-pro:generateImage`;

    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        // Add any additional parameters required by Nanobanana Pro
        numberOfImages: 1,
        aspectRatio: '16:9'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();

    // Extract image URL from response
    // Adjust based on actual API response structure
    if (data.images && data.images.length > 0) {
      return data.images[0].url || data.images[0].data;
    }

    if (data.generatedImages && data.generatedImages.length > 0) {
      return data.generatedImages[0].url;
    }

    throw new Error('No image URL in API response');
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Failed to generate image: ${error.message}`);
  }
}

// Add image to Notion page
async function addImageToNotion(imageUrl, pageId, afterBlockId, apiKey) {
  try {
    // Format page ID (remove hyphens if present)
    const formattedPageId = pageId.replace(/-/g, '');

    // Prepare the block to append
    const blockData = {
      children: [
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: {
              url: imageUrl
            }
          }
        }
      ]
    };

    // If we have a specific block ID, append after that block
    // Otherwise, append to the end of the page
    let endpoint;
    if (afterBlockId) {
      const formattedBlockId = afterBlockId.replace(/-/g, '');
      endpoint = `${NOTION_API_BASE}/blocks/${formattedBlockId}/children`;
    } else {
      endpoint = `${NOTION_API_BASE}/blocks/${formattedPageId}/children`;
    }

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION
      },
      body: JSON.stringify(blockData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Notion API error: ${response.status} - ${errorData.message || response.statusText}`
      );
    }

    const data = await response.json();
    console.log('Image added to Notion:', data);

    return data;
  } catch (error) {
    console.error('Notion API error:', error);
    throw new Error(`Failed to add image to Notion: ${error.message}`);
  }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
    // Open options page on install
    chrome.runtime.openOptionsPage();
  }
});
