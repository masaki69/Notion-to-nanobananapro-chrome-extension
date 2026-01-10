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

    // Set up default presets for design/style variations (in Japanese)
    const defaultPresets = [
      {
        name: "シンプル・ミニマル",
        prompt: "以下の内容をシンプルでミニマルなデザインで視覚化してください：\n{text}\n\nホワイトスペースを活用し、クリーンで洗練されたレイアウト、控えめな色使い、明確な階層構造で表現してください"
      },
      {
        name: "モノトーン",
        prompt: "以下の内容をモノトーンスタイルで視覚化してください：\n{text}\n\n白黒・グレースケールのみを使用し、高コントラスト、エレガントで洗練されたデザイン、タイポグラフィを重視してください"
      },
      {
        name: "カラフル・キャッチー",
        prompt: "以下の内容を鮮やかでキャッチーなデザインで視覚化してください：\n{text}\n\nビビッドな色使い、グラデーション、目を引くビジュアル、ポップで明るい雰囲気で表現してください"
      },
      {
        name: "プロフェッショナル",
        prompt: "以下の内容をプロフェッショナルなビジネススタイルで視覚化してください：\n{text}\n\nコーポレートカラー、信頼感のある配色、整然としたレイアウト、ビジネスシーンに適した洗練されたデザインで表現してください"
      },
      {
        name: "イラスト風",
        prompt: "以下の内容を手描き風のイラストスタイルで視覚化してください：\n{text}\n\n温かみのあるイラストレーション、アーティスティックなタッチ、親しみやすい雰囲気、手書き要素を取り入れてください"
      },
      {
        name: "モダン・スタイリッシュ",
        prompt: "以下の内容をモダンでスタイリッシュなデザインで視覚化してください：\n{text}\n\n最新のデザイントレンド、グラデーション、ガラスモーフィズム、ニューモーフィズムなどの現代的なスタイルで表現してください"
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
