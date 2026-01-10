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
    // Gemini API endpoint for Nano Banana Pro (Gemini 3 Pro Image)
    // Using gemini-2.5-flash-image for faster generation
    // Alternative: gemini-3-pro-image-preview for highest quality
    const modelName = 'gemini-2.5-flash-image';
    const endpoint = `${GEMINI_API_BASE}/models/${modelName}:generateContent`;

    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          temperature: 0.7,
          topP: 0.95
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    console.log('API Response:', data);

    // Extract image data from response
    // Gemini generateContent returns image data in candidates
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // Check for inline image data
          if (part.inlineData && part.inlineData.data) {
            const mimeType = part.inlineData.mimeType || 'image/jpeg';
            const imageData = part.inlineData.data;
            // Convert base64 to data URL
            return `data:${mimeType};base64,${imageData}`;
          }

          // Check for image URL
          if (part.fileData && part.fileData.fileUri) {
            return part.fileData.fileUri;
          }
        }
      }
    }

    throw new Error('No image data in API response. Response structure: ' + JSON.stringify(data));
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
        prompt: "シンプルでミニマルなデザインで視覚化してください。ホワイトスペースを活用し、クリーンで洗練されたレイアウト、控えめな色使い、明確な階層構造で表現してください"
      },
      {
        name: "モノトーン",
        prompt: "モノトーンスタイルで視覚化してください。白黒・グレースケールのみを使用し、高コントラスト、エレガントで洗練されたデザイン、タイポグラフィを重視してください"
      },
      {
        name: "カラフル・キャッチー",
        prompt: "鮮やかでキャッチーなデザインで視覚化してください。ビビッドな色使い、グラデーション、目を引くビジュアル、ポップで明るい雰囲気で表現してください"
      },
      {
        name: "プロフェッショナル",
        prompt: "プロフェッショナルなビジネススタイルで視覚化してください。コーポレートカラー、信頼感のある配色、整然としたレイアウト、ビジネスシーンに適した洗練されたデザインで表現してください"
      },
      {
        name: "イラスト風",
        prompt: "手描き風のイラストスタイルで視覚化してください。温かみのあるイラストレーション、アーティスティックなタッチ、親しみやすい雰囲気、手書き要素を取り入れてください"
      },
      {
        name: "モダン・スタイリッシュ",
        prompt: "モダンでスタイリッシュなデザインで視覚化してください。最新のデザイントレンド、グラデーション、ガラスモーフィズム、ニューモーフィズムなどの現代的なスタイルで表現してください"
      }
    ];

    chrome.storage.sync.set({ presets: defaultPresets });
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
