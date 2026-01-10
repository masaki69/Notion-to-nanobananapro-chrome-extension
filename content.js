// Content script for Notion pages
console.log('Notion to Nanobanana Pro: Content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showPromptModal') {
    // Get markdown from current selection instead of plain text
    const markdownText = getSelectedMarkdown();
    handleGenerateImageFromContextMenu(markdownText || request.selectedText);
  }
});

// Get selected text as markdown format
function getSelectedMarkdown() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return null;

  const range = selection.getRangeAt(0);

  // Clone the selected content
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());

  // Try to extract markdown from Notion's structure
  const markdown = extractMarkdownFromNotionHtml(container);

  return markdown || selection.toString();
}

// Extract markdown from Notion's HTML structure
function extractMarkdownFromNotionHtml(container) {
  const lines = [];

  // Find all block-level elements (divs with data-block-id or notion classes)
  const blocks = container.querySelectorAll('[data-block-id]');

  if (blocks.length > 0) {
    // Filter to get only leaf blocks (blocks that don't contain other blocks)
    const leafBlocks = Array.from(blocks).filter(block => {
      return block.querySelector('[data-block-id]') === null;
    });

    for (const block of leafBlocks) {
      const line = convertBlockToMarkdownLine(block);
      if (line) lines.push(line);
    }
  }

  // If no blocks found, try to parse the HTML structure directly
  if (lines.length === 0) {
    parseNotionContent(container, lines);
  }

  return lines.join('\n');
}

// Parse Notion content recursively
function parseNotionContent(element, lines, depth = 0) {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        lines.push(text);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      const className = node.className || '';

      // Check for line breaks
      if (tagName === 'br') {
        continue;
      }

      // Check for block-level elements that should create new lines
      if (tagName === 'div' || tagName === 'p') {
        const text = getFormattedText(node);
        if (text.trim()) {
          // Detect list markers from Notion's structure
          const line = detectAndFormatLine(node, text, className);
          lines.push(line);
        }
      } else if (['span', 'a', 'strong', 'em', 'b', 'i', 'code'].includes(tagName)) {
        // Inline elements - check if parent is not already processed
        if (!node.closest('div[data-block-id], p')) {
          const text = getFormattedText(node);
          if (text.trim()) {
            lines.push(text);
          }
        }
      } else {
        // Recursively process other elements
        parseNotionContent(node, lines, depth + 1);
      }
    }
  }
}

// Detect line type and format accordingly
function detectAndFormatLine(node, text, className) {
  // Check for numbered list pattern (starts with number)
  const numberedMatch = text.match(/^(\d+)[.)\]]\s*/);
  if (numberedMatch) {
    return text; // Already formatted as numbered list
  }

  // Check for bullet point indicators in the DOM
  const hasBullet = node.querySelector('[style*="list-style"]') ||
                    className.includes('bulleted') ||
                    node.textContent.match(/^[•\-\*]\s/);
  if (hasBullet) {
    const cleanText = text.replace(/^[•\-\*]\s*/, '');
    return `- ${cleanText}`;
  }

  // Check for checkbox
  const checkbox = node.querySelector('[role="checkbox"], input[type="checkbox"]');
  if (checkbox || className.includes('to_do')) {
    const isChecked = checkbox && (checkbox.getAttribute('aria-checked') === 'true' || checkbox.checked);
    return `- [${isChecked ? 'x' : ' '}] ${text}`;
  }

  // Check for headers
  if (className.includes('header') || className.includes('heading')) {
    if (className.includes('sub_sub') || className.includes('heading_3')) {
      return `### ${text}`;
    }
    if (className.includes('sub') || className.includes('heading_2')) {
      return `## ${text}`;
    }
    return `# ${text}`;
  }

  // Check for quote
  if (className.includes('quote')) {
    return `> ${text}`;
  }

  return text;
}

// Get formatted text from an element, preserving inline formatting
function getFormattedText(element) {
  let result = '';

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      const style = node.style || {};
      let text = getFormattedText(node);

      if (!text) continue;

      // Apply formatting based on tag or style
      const isBold = tagName === 'strong' || tagName === 'b' ||
                     style.fontWeight === '600' || style.fontWeight === '700' || style.fontWeight === 'bold';
      const isItalic = tagName === 'em' || tagName === 'i' || style.fontStyle === 'italic';
      const isStrike = tagName === 's' || tagName === 'del' || (style.textDecoration && style.textDecoration.includes('line-through'));
      const isCode = tagName === 'code';

      if (isCode) text = `\`${text}\``;
      if (isBold) text = `**${text}**`;
      if (isItalic) text = `*${text}*`;
      if (isStrike) text = `~~${text}~~`;

      if (tagName === 'a') {
        const href = node.getAttribute('href');
        if (href) text = `[${text}](${href})`;
      }

      result += text;
    }
  }

  return result;
}

// Convert a single block element to markdown line
function convertBlockToMarkdownLine(block) {
  const className = block.className || '';
  const text = getFormattedText(block);

  if (!text.trim()) return '';

  return detectAndFormatLine(block, text.trim(), className);
}

// Convert HTML to Markdown
function htmlToMarkdown(element) {
  let markdown = '';

  function processNode(node, listLevel = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tagName = node.tagName.toLowerCase();
    let result = '';
    let childContent = '';

    // Process children first
    for (const child of node.childNodes) {
      childContent += processNode(child, listLevel);
    }

    switch (tagName) {
      // Headers
      case 'h1':
        result = `# ${childContent.trim()}\n\n`;
        break;
      case 'h2':
        result = `## ${childContent.trim()}\n\n`;
        break;
      case 'h3':
        result = `### ${childContent.trim()}\n\n`;
        break;

      // Text formatting
      case 'strong':
      case 'b':
        result = `**${childContent}**`;
        break;
      case 'em':
      case 'i':
        result = `*${childContent}*`;
        break;
      case 'u':
        result = `<u>${childContent}</u>`;
        break;
      case 's':
      case 'strike':
      case 'del':
        result = `~~${childContent}~~`;
        break;
      case 'code':
        result = `\`${childContent}\``;
        break;

      // Links
      case 'a':
        const href = node.getAttribute('href');
        result = href ? `[${childContent}](${href})` : childContent;
        break;

      // Lists
      case 'ul':
      case 'ol':
        result = childContent + '\n';
        break;
      case 'li':
        const parent = node.parentElement;
        const isOrdered = parent && parent.tagName.toLowerCase() === 'ol';
        const indent = '  '.repeat(listLevel);
        const bullet = isOrdered ? '1. ' : '- ';
        result = `${indent}${bullet}${childContent.trim()}\n`;
        break;

      // Block elements
      case 'p':
      case 'div':
        // Check for Notion-specific classes
        if (node.classList.contains('notion-bulleted_list-block')) {
          result = `- ${childContent.trim()}\n`;
        } else if (node.classList.contains('notion-numbered_list-block')) {
          result = `1. ${childContent.trim()}\n`;
        } else if (node.classList.contains('notion-to_do-block')) {
          const checkbox = node.querySelector('input[type="checkbox"]');
          const checked = checkbox && checkbox.checked ? 'x' : ' ';
          result = `- [${checked}] ${childContent.trim()}\n`;
        } else if (node.classList.contains('notion-quote-block')) {
          result = `> ${childContent.trim()}\n`;
        } else if (node.classList.contains('notion-code-block')) {
          result = `\`\`\`\n${childContent.trim()}\n\`\`\`\n`;
        } else {
          result = childContent.trim() ? `${childContent.trim()}\n\n` : '';
        }
        break;

      // Blockquote
      case 'blockquote':
        result = childContent.split('\n')
          .filter(line => line.trim())
          .map(line => `> ${line}`)
          .join('\n') + '\n\n';
        break;

      // Pre/Code blocks
      case 'pre':
        result = `\`\`\`\n${childContent.trim()}\n\`\`\`\n\n`;
        break;

      // Line break
      case 'br':
        result = '\n';
        break;

      // Default: just return content
      default:
        result = childContent;
    }

    return result;
  }

  markdown = processNode(element);

  // Clean up excessive newlines
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  return markdown;
}

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

// Get the last block element in the selection (for inserting below)
function getLastSelectedBlockElement() {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);

    // Get all blocks that intersect with selection
    const allBlocks = document.querySelectorAll('[data-block-id]');
    let lastBlock = null;

    for (const block of allBlocks) {
      if (range.intersectsNode(block)) {
        // Check if this is a leaf block (no nested blocks)
        if (!block.querySelector('[data-block-id]')) {
          lastBlock = block;
        }
      }
    }

    return lastBlock;
  }
  return null;
}

// Handle image generation from context menu
async function handleGenerateImageFromContextMenu(selectedText) {
  if (!selectedText || !selectedText.trim()) {
    showNotification('テキストが選択されていません (No text selected)', 'error');
    return;
  }

  // Get the LAST block element in selection (to insert BELOW it)
  const lastBlockElement = getLastSelectedBlockElement() || getCurrentBlockElement();

  // Show prompt selection modal
  const prompt = await showPromptModal(selectedText);

  if (!prompt) {
    // User cancelled
    return;
  }

  // Show persistent loading notification
  const dismissLoading = showLoadingNotification('画像を生成中... (Generating image...)');

  try {
    // Send message to background script to generate image
    const response = await chrome.runtime.sendMessage({
      action: 'generateImage',
      prompt: prompt
    });

    if (response.success && response.imageUrl) {
      // Insert image BELOW the selected text
      await insertImageIntoNotion(response.imageUrl, lastBlockElement);
      showNotification('画像を生成しました！ (Image generated!)', 'success');
    } else {
      dismissLoading();
      showNotification(`エラー: ${response.error}`, 'error');
    }
  } catch (error) {
    dismissLoading();
    console.error('Error generating image:', error);
    showNotification(`エラー: ${error.message}`, 'error');
  }
}

// Insert image into Notion page BELOW the target block
async function insertImageIntoNotion(imageUrl, targetBlock) {
  try {
    // Convert base64 data URL to Blob
    const blob = await dataUrlToBlob(imageUrl);

    // Create a File from the blob
    const file = new File([blob], 'generated-image.png', { type: blob.type });

    // Find and position cursor at the END of the target block
    let targetElement = null;

    if (targetBlock) {
      const editableElement = targetBlock.querySelector('[contenteditable="true"]') ||
                              targetBlock.querySelector('[data-content-editable-leaf]') ||
                              targetBlock;

      if (editableElement) {
        // Focus the element
        editableElement.focus();

        // Move cursor to the END of the block
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableElement);
        range.collapse(false); // false = collapse to END
        selection.removeAllRanges();
        selection.addRange(range);

        await new Promise(resolve => setTimeout(resolve, 100));

        // Press Enter to create a new line BELOW using execCommand
        document.execCommand('insertParagraph', false, null);

        await new Promise(resolve => setTimeout(resolve, 150));

        targetElement = editableElement;
      }
    }

    // If no target, find any editable element in Notion
    if (!targetElement) {
      targetElement = document.querySelector('.notion-page-content [contenteditable="true"]') ||
                      document.querySelector('[contenteditable="true"]') ||
                      document.activeElement;
    }

    // Create DataTransfer with the image file
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Create and dispatch paste event
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });

    // Dispatch to the active element
    const activeEl = document.activeElement || targetElement;
    const dispatched = activeEl.dispatchEvent(pasteEvent);

    console.log('Paste event dispatched:', dispatched);

    if (dispatched) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return true;
    }

    // Fallback: Try using clipboard API and then triggering paste
    try {
      const clipboardItem = new ClipboardItem({
        [blob.type]: blob
      });
      await navigator.clipboard.write([clipboardItem]);
      console.log('Image written to clipboard');

      // Create another paste event
      const fallbackDataTransfer = new DataTransfer();
      fallbackDataTransfer.items.add(file);

      const fallbackPasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: fallbackDataTransfer
      });

      document.dispatchEvent(fallbackPasteEvent);
      await new Promise(resolve => setTimeout(resolve, 300));

      return true;
    } catch (clipboardError) {
      console.error('Clipboard fallback failed:', clipboardError);
    }

    return true; // Return true anyway since image might have been pasted
  } catch (error) {
    console.error('Error inserting image:', error);
    return false;
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
function showNotification(message, type = 'info', duration = 3000) {
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
  }, duration);
}

// Show loading notification that persists until manually dismissed
function showLoadingNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'nanobanana-notification nanobanana-notification-loading';
  notification.innerHTML = `
    <div class="nanobanana-loading-content">
      <div class="nanobanana-spinner"></div>
      <span>${message}</span>
    </div>
  `;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Return a function to dismiss the notification
  return () => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  };
}

// Content script is now event-driven (no initialization needed)
