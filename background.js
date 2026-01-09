// Background service worker
console.log('Notion to Nanobanana Pro: Background service worker loaded');

// API Configuration
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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
async function handleGenerateImage({ prompt }) {
  try {
    // Get API key from storage
    const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);

    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured. Please set it in the extension popup.');
    }

    // Generate image using Gemini Nanobanana Pro
    console.log('Generating image with prompt:', prompt);
    const imageUrl = await generateImageWithGemini(prompt, geminiApiKey);

    return { success: true, imageUrl };
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

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');

    // Set up default presets for structured data
    const defaultPresets = [
      {
        name: "Infographic from List",
        prompt: "Create a professional infographic based on this information:\n{text}\n\nMake it visually appealing, use icons, charts if applicable, modern design"
      },
      {
        name: "Diagram from Structure",
        prompt: "Create a clear diagram or flowchart visualizing this structure:\n{text}\n\nUse boxes, arrows, and labels. Clean, professional style"
      },
      {
        name: "Table Visualization",
        prompt: "Create a visual representation of this data:\n{text}\n\nUse charts, graphs, or visual data representation. Clean, modern style"
      },
      {
        name: "Concept Map",
        prompt: "Create a concept map or mind map from:\n{text}\n\nShow relationships between items, use colors, hierarchical structure"
      },
      {
        name: "Timeline/Process",
        prompt: "Create a timeline or process flow from:\n{text}\n\nShow sequential steps or chronological order, use arrows and clear labels"
      }
    ];

    chrome.storage.sync.set({ presets: defaultPresets });

    // Open options page on install
    chrome.runtime.openOptionsPage();
  }
});
