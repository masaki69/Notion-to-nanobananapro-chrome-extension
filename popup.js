// Popup script for settings management
document.addEventListener('DOMContentLoaded', init);

const elements = {
  geminiApiKey: null,
  notionApiKey: null,
  saveBtn: null,
  statusMessage: null,
  btnText: null,
  btnLoader: null
};

function init() {
  // Get DOM elements
  elements.geminiApiKey = document.getElementById('geminiApiKey');
  elements.notionApiKey = document.getElementById('notionApiKey');
  elements.saveBtn = document.getElementById('saveBtn');
  elements.statusMessage = document.getElementById('statusMessage');
  elements.btnText = document.querySelector('.btn-text');
  elements.btnLoader = document.querySelector('.btn-loader');

  // Load saved settings
  loadSettings();

  // Add event listeners
  elements.saveBtn.addEventListener('click', saveSettings);

  // Allow Enter key to save
  [elements.geminiApiKey, elements.notionApiKey].forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveSettings();
      }
    });
  });
}

// Load settings from storage
async function loadSettings() {
  try {
    const { geminiApiKey, notionApiKey } = await chrome.storage.sync.get([
      'geminiApiKey',
      'notionApiKey'
    ]);

    if (geminiApiKey) {
      elements.geminiApiKey.value = geminiApiKey;
    }

    if (notionApiKey) {
      elements.notionApiKey.value = notionApiKey;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('設定の読み込みに失敗しました (Failed to load settings)', 'error');
  }
}

// Save settings to storage
async function saveSettings() {
  const geminiApiKey = elements.geminiApiKey.value.trim();
  const notionApiKey = elements.notionApiKey.value.trim();

  // Validate inputs
  if (!geminiApiKey) {
    showStatus('Gemini API keyを入力してください (Please enter Gemini API key)', 'error');
    elements.geminiApiKey.focus();
    return;
  }

  if (!notionApiKey) {
    showStatus('Notion API keyを入力してください (Please enter Notion API key)', 'error');
    elements.notionApiKey.focus();
    return;
  }

  // Show loading state
  setLoadingState(true);

  try {
    await chrome.storage.sync.set({
      geminiApiKey,
      notionApiKey
    });

    showStatus('設定を保存しました！ (Settings saved successfully!)', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('設定の保存に失敗しました (Failed to save settings)', 'error');
  } finally {
    setLoadingState(false);
  }
}

// Show status message
function showStatus(message, type = 'info') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-${type} show`;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    elements.statusMessage.classList.remove('show');
  }, 3000);
}

// Set loading state for save button
function setLoadingState(isLoading) {
  elements.saveBtn.disabled = isLoading;

  if (isLoading) {
    elements.btnText.style.display = 'none';
    elements.btnLoader.style.display = 'inline-block';
  } else {
    elements.btnText.style.display = 'inline';
    elements.btnLoader.style.display = 'none';
  }
}
