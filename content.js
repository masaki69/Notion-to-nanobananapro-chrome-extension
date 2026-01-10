// Content script for Notion pages
console.log('Notion to Nanobanana Pro: Content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showPromptModal') {
    handleGenerateImageFromContextMenu(request.selectedText);
  }
});

// Get the current block element based on selection
function getCurrentBlockElement() {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const blockElement = container.nodeType === 3
      ? container.parentElement.closest('[data-block-id]')
      : container.closest('[data-block-id]');
    return blockElement;
  }
  return null;
}

// Handle image generation from context menu
async function handleGenerateImageFromContextMenu(selectedText) {
  if (!selectedText || !selectedText.trim()) {
    showNotification('テキストが選択されていません (No text selected)', 'error');
    return;
  }

  // Get current block element for insertion
  const blockElement = getCurrentBlockElement();

  // Show prompt selection modal
  const prompt = await showPromptModal(selectedText);

  if (!prompt) {
    // User cancelled
    return;
  }

  showNotification('画像を生成中... (Generating image...)', 'info');

  try {
    // Send message to background script to generate image
    const response = await chrome.runtime.sendMessage({
      action: 'generateImage',
      prompt: prompt
    });

    if (response.success && response.imageUrl) {
      // Insert image directly into Notion DOM
      insertImageIntoNotion(response.imageUrl, blockElement);
      showNotification('画像を生成しました！ (Image generated and added!)', 'success');
    } else {
      showNotification(`エラー: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Error generating image:', error);
    showNotification(`エラー: ${error.message}`, 'error');
  }
}

// Insert image into Notion page by simulating paste
async function insertImageIntoNotion(imageUrl, targetBlock) {
  try {
    // Convert base64 data URL to Blob
    const blob = await dataUrlToBlob(imageUrl);

    // Find the editable element within the target block (BEFORE the selected text)
    if (targetBlock) {
      // Focus on the beginning of the target block to insert ABOVE it
      const editableElement = targetBlock.querySelector('[contenteditable="true"]') ||
                              targetBlock.querySelector('[data-content-editable-leaf]') ||
                              targetBlock;

      if (editableElement) {
        // Click to focus the block
        editableElement.focus();

        // Move cursor to the beginning of the block
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableElement);
        range.collapse(true); // Collapse to start
        selection.removeAllRanges();
        selection.addRange(range);

        // Small delay to ensure focus
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simulate pressing Enter to create a new line above, then move up
        // This ensures the image is inserted ABOVE the selected text
        document.execCommand('insertParagraph', false, null);

        // Move cursor up to the new empty line
        const upEvent = new KeyboardEvent('keydown', {
          key: 'ArrowUp',
          code: 'ArrowUp',
          keyCode: 38,
          which: 38,
          bubbles: true
        });
        editableElement.dispatchEvent(upEvent);

        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Write image to clipboard and paste
    try {
      const clipboardItem = new ClipboardItem({
        [blob.type]: blob
      });
      await navigator.clipboard.write([clipboardItem]);

      // Trigger paste
      document.execCommand('paste');

      console.log('Image pasted into Notion');
    } catch (clipboardError) {
      console.log('Clipboard API failed, trying alternative method:', clipboardError);
      // Fallback: Create a paste event with the image data
      await pasteImageFallback(blob, targetBlock);
    }
  } catch (error) {
    console.error('Error inserting image:', error);
    showNotification('画像の挿入に失敗しました。手動でペーストしてください。', 'error');
  }
}

// Convert data URL to Blob
async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

// Fallback method: Create and dispatch a paste event with image
async function pasteImageFallback(blob, targetBlock) {
  try {
    // Create a file from the blob
    const file = new File([blob], 'generated-image.png', { type: blob.type });

    // Create a DataTransfer object
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Find the target element
    const targetElement = targetBlock?.querySelector('[contenteditable="true"]') ||
                          document.querySelector('.notion-page-content [contenteditable="true"]') ||
                          document.activeElement;

    if (targetElement) {
      // Create and dispatch paste event
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });

      targetElement.dispatchEvent(pasteEvent);
      console.log('Paste event dispatched');
    }
  } catch (error) {
    console.error('Fallback paste failed:', error);
    throw error;
  }
}

// Show prompt selection modal
async function showPromptModal(selectedText) {
  return new Promise(async (resolve) => {
    // Get presets from storage
    const { presets = [] } = await chrome.storage.sync.get(['presets']);

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'nanobanana-prompt-modal-overlay';
    overlay.className = 'nanobanana-modal-overlay';

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'nanobanana-modal';
    modal.innerHTML = `
      <div class="nanobanana-modal-header">
        <h3>プロンプトを選択 (Select Prompt)</h3>
        <button class="nanobanana-modal-close" title="Close">✕</button>
      </div>
      <div class="nanobanana-modal-body">
        <div class="nanobanana-prompt-option">
          <input type="radio" id="prompt-selected-text" name="prompt-type" value="selected" checked>
          <label for="prompt-selected-text">
            <strong>そのまま生成 (Generate as-is)</strong>
            <div class="prompt-preview">${escapeHtml(selectedText)}</div>
          </label>
        </div>

        ${presets.length > 0 ? `
          <div class="nanobanana-prompt-option">
            <input type="radio" id="prompt-preset" name="prompt-type" value="preset">
            <label for="prompt-preset">
              <strong>プリセットを使用 (Use preset)</strong>
            </label>
            <select id="preset-selector" class="nanobanana-select" disabled>
              ${presets.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
        ` : ''}

        <div class="nanobanana-prompt-option">
          <input type="radio" id="prompt-custom" name="prompt-type" value="custom">
          <label for="prompt-custom">
            <strong>カスタムプロンプト (Custom prompt)</strong>
          </label>
          <textarea id="custom-prompt-input" class="nanobanana-textarea" rows="4" placeholder="Enter your custom prompt..." disabled></textarea>
        </div>
      </div>
      <div class="nanobanana-modal-footer">
        <button class="nanobanana-btn nanobanana-btn-secondary" id="modal-cancel">キャンセル (Cancel)</button>
        <button class="nanobanana-btn nanobanana-btn-primary" id="modal-generate">生成 (Generate)</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Setup event listeners
    const closeBtn = modal.querySelector('.nanobanana-modal-close');
    const cancelBtn = modal.querySelector('#modal-cancel');
    const generateBtn = modal.querySelector('#modal-generate');
    const radioButtons = modal.querySelectorAll('input[name="prompt-type"]');
    const presetSelector = modal.querySelector('#preset-selector');
    const customInput = modal.querySelector('#custom-prompt-input');

    // Enable/disable inputs based on radio selection
    radioButtons.forEach(radio => {
      radio.addEventListener('change', () => {
        if (presetSelector) {
          presetSelector.disabled = radio.value !== 'preset';
        }
        if (customInput) {
          customInput.disabled = radio.value !== 'custom';
        }
      });
    });

    // Close modal
    const closeModal = () => {
      overlay.remove();
      resolve(null);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Generate button
    generateBtn.addEventListener('click', () => {
      const selectedType = modal.querySelector('input[name="prompt-type"]:checked').value;
      let finalPrompt = '';

      if (selectedType === 'selected') {
        // Use selected text as-is
        finalPrompt = selectedText;
      } else if (selectedType === 'preset' && presetSelector) {
        const presetIndex = parseInt(presetSelector.value);
        const preset = presets[presetIndex];
        // Automatically append selected text after preset prompt
        finalPrompt = `${preset.prompt}\n\n対象は以下のテキストです：\n${selectedText}`;
      } else if (selectedType === 'custom' && customInput) {
        const customPrompt = customInput.value.trim();
        if (!customPrompt) {
          showNotification('カスタムプロンプトを入力してください (Please enter custom prompt)', 'error');
          return;
        }
        // Automatically append selected text after custom prompt
        finalPrompt = `${customPrompt}\n\n対象は以下のテキストです：\n${selectedText}`;
      }

      overlay.remove();
      resolve(finalPrompt);
    });

    // Focus on modal
    setTimeout(() => overlay.classList.add('show'), 10);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `nanobanana-notification nanobanana-notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Content script is now event-driven (no initialization needed)
