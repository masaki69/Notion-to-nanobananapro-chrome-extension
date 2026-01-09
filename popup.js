// Popup script for settings management
document.addEventListener('DOMContentLoaded', init);

const elements = {
  geminiApiKey: null,
  saveBtn: null,
  statusMessage: null,
  btnText: null,
  btnLoader: null,
  presetName: null,
  presetPrompt: null,
  addPresetBtn: null,
  presetList: null
};

function init() {
  // Get DOM elements
  elements.geminiApiKey = document.getElementById('geminiApiKey');
  elements.saveBtn = document.getElementById('saveBtn');
  elements.statusMessage = document.getElementById('statusMessage');
  elements.btnText = document.querySelector('.btn-text');
  elements.btnLoader = document.querySelector('.btn-loader');
  elements.presetName = document.getElementById('presetName');
  elements.presetPrompt = document.getElementById('presetPrompt');
  elements.addPresetBtn = document.getElementById('addPresetBtn');
  elements.presetList = document.getElementById('presetList');

  // Load saved settings
  loadSettings();
  loadPresets();

  // Add event listeners
  elements.saveBtn.addEventListener('click', saveSettings);
  elements.addPresetBtn.addEventListener('click', addPreset);

  // Allow Enter key to save
  elements.geminiApiKey.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    }
  });
}

// Load settings from storage
async function loadSettings() {
  try {
    const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);

    if (geminiApiKey) {
      elements.geminiApiKey.value = geminiApiKey;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('設定の読み込みに失敗しました (Failed to load settings)', 'error');
  }
}

// Save settings to storage
async function saveSettings() {
  const geminiApiKey = elements.geminiApiKey.value.trim();

  // Validate input
  if (!geminiApiKey) {
    showStatus('Gemini API keyを入力してください (Please enter Gemini API key)', 'error');
    elements.geminiApiKey.focus();
    return;
  }

  // Show loading state
  setLoadingState(true);

  try {
    await chrome.storage.sync.set({
      geminiApiKey
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

// Preset management functions
async function loadPresets() {
  try {
    const { presets = [] } = await chrome.storage.sync.get(['presets']);
    renderPresets(presets);
  } catch (error) {
    console.error('Error loading presets:', error);
  }
}

function renderPresets(presets) {
  if (!presets || presets.length === 0) {
    elements.presetList.innerHTML = '<div class="preset-empty">プリセットがありません (No presets yet)</div>';
    return;
  }

  elements.presetList.innerHTML = presets.map((preset, index) => `
    <div class="preset-item">
      <div class="preset-info">
        <div class="preset-name">${escapeHtml(preset.name)}</div>
        <div class="preset-prompt">${escapeHtml(preset.prompt)}</div>
      </div>
      <div class="preset-actions">
        <button class="btn-icon delete" data-index="${index}" title="Delete">
          ✕
        </button>
      </div>
    </div>
  `).join('');

  // Add delete event listeners
  elements.presetList.querySelectorAll('.btn-icon.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      deletePreset(index);
    });
  });
}

async function addPreset() {
  const name = elements.presetName.value.trim();
  const prompt = elements.presetPrompt.value.trim();

  if (!name) {
    showStatus('プリセット名を入力してください (Please enter preset name)', 'error');
    elements.presetName.focus();
    return;
  }

  if (!prompt) {
    showStatus('プロンプトを入力してください (Please enter prompt)', 'error');
    elements.presetPrompt.focus();
    return;
  }

  try {
    const { presets = [] } = await chrome.storage.sync.get(['presets']);
    presets.push({ name, prompt });
    await chrome.storage.sync.set({ presets });

    // Clear inputs
    elements.presetName.value = '';
    elements.presetPrompt.value = '';

    // Reload presets
    renderPresets(presets);
    showStatus('プリセットを追加しました (Preset added)', 'success');
  } catch (error) {
    console.error('Error adding preset:', error);
    showStatus('プリセットの追加に失敗しました (Failed to add preset)', 'error');
  }
}

async function deletePreset(index) {
  try {
    const { presets = [] } = await chrome.storage.sync.get(['presets']);
    presets.splice(index, 1);
    await chrome.storage.sync.set({ presets });

    renderPresets(presets);
    showStatus('プリセットを削除しました (Preset deleted)', 'success');
  } catch (error) {
    console.error('Error deleting preset:', error);
    showStatus('プリセットの削除に失敗しました (Failed to delete preset)', 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
