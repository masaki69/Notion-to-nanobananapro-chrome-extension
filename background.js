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

    // Set up default presets for structured data (in Japanese)
    const defaultPresets = [
      {
        name: "リストからインフォグラフィック",
        prompt: "以下の情報を元にプロフェッショナルなインフォグラフィックを作成してください：\n{text}\n\n視覚的に魅力的で、アイコン、チャート、モダンなデザインを使用してください"
      },
      {
        name: "構造図・フローチャート",
        prompt: "以下の構造を視覚化した明確な図表またはフローチャートを作成してください：\n{text}\n\nボックス、矢印、ラベルを使用し、クリーンでプロフェッショナルなスタイルにしてください"
      },
      {
        name: "表データの視覚化",
        prompt: "以下のデータを視覚的に表現してください：\n{text}\n\nチャート、グラフ、またはビジュアルデータ表現を使用し、クリーンでモダンなスタイルにしてください"
      },
      {
        name: "コンセプトマップ",
        prompt: "以下からコンセプトマップまたはマインドマップを作成してください：\n{text}\n\n項目間の関係を示し、色を使い、階層構造を表現してください"
      },
      {
        name: "タイムライン・プロセス図",
        prompt: "以下からタイムラインまたはプロセスフローを作成してください：\n{text}\n\n順次的なステップまたは時系列順序を示し、矢印と明確なラベルを使用してください"
      }
    ];

    chrome.storage.sync.set({ presets: defaultPresets });

    // Open options page on install
    chrome.runtime.openOptionsPage();
  }

  // Create context menu
  chrome.contextMenus.create({
    id: 'nanobanana-generate-image',
    title: '画像を生成 (Generate Image)',
    contexts: ['selection'],
    documentUrlPatterns: ['https://*.notion.so/*']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'nanobanana-generate-image') {
    // Send message to content script
    chrome.tabs.sendMessage(tab.id, {
      action: 'showPromptModal',
      selectedText: info.selectionText
    });
  }
});
