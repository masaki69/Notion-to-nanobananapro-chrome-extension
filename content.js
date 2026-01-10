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

  // Get all Notion blocks within or intersecting the selection
  const blocks = getSelectedNotionBlocks(range);

  if (blocks.length === 0) {
    // Fallback: try to convert cloned HTML
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    return htmlToMarkdown(container);
  }

  // Convert Notion blocks to markdown
  return notionBlocksToMarkdown(blocks);
}

// Get all Notion blocks that intersect with the selection range
function getSelectedNotionBlocks(range) {
  const blocks = [];
  const allBlocks = document.querySelectorAll('[data-block-id]');

  for (const block of allBlocks) {
    if (range.intersectsNode(block)) {
      blocks.push(block);
    }
  }

  return blocks;
}

// Convert Notion blocks to markdown
function notionBlocksToMarkdown(blocks) {
  const lines = [];

  for (const block of blocks) {
    const markdown = convertNotionBlockToMarkdown(block);
    if (markdown) {
      lines.push(markdown);
    }
  }

  return lines.join('\n').trim();
}

// Convert a single Notion block to markdown
function convertNotionBlockToMarkdown(block) {
  const className = block.className || '';
  const textContent = getBlockTextContent(block);

  if (!textContent.trim()) return '';

  // Detect block type from class name
  if (className.includes('header-block') || className.includes('heading')) {
    // Check for heading level
    if (className.includes('header-block') && !className.includes('sub')) {
      return `# ${textContent}`;
    }
    if (className.includes('sub_header') || className.includes('heading_2')) {
      return `## ${textContent}`;
    }
    if (className.includes('sub_sub_header') || className.includes('heading_3')) {
      return `### ${textContent}`;
    }
    return `# ${textContent}`;
  }

  if (className.includes('bulleted_list')) {
    return `- ${textContent}`;
  }

  if (className.includes('numbered_list')) {
    return `1. ${textContent}`;
  }

  if (className.includes('to_do')) {
    const checkbox = block.querySelector('[role="checkbox"], input[type="checkbox"]');
    const isChecked = checkbox && (checkbox.getAttribute('aria-checked') === 'true' || checkbox.checked);
    return `- [${isChecked ? 'x' : ' '}] ${textContent}`;
  }

  if (className.includes('quote')) {
    return `> ${textContent}`;
  }

  if (className.includes('code')) {
    return `\`\`\`\n${textContent}\n\`\`\``;
  }

  if (className.includes('callout')) {
    return `> 💡 ${textContent}`;
  }

  if (className.includes('toggle')) {
    return `<details>\n<summary>${textContent}</summary>\n</details>`;
  }

  // Default: plain paragraph
  return textContent;
}

// Get text content from a Notion block, preserving inline formatting
function getBlockTextContent(block) {
  // Find the content element
  const contentEl = block.querySelector('[contenteditable="true"]') ||
                    block.querySelector('[data-content-editable-leaf]') ||
                    block.querySelector('.notranslate');

  if (!contentEl) {
    return block.textContent?.trim() || '';
  }

  // Process inline formatting
  return processInlineFormatting(contentEl);
}

// Process inline formatting (bold, italic, code, links)
function processInlineFormatting(element) {
  let result = '';

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const style = node.style;
      const tagName = node.tagName.toLowerCase();
      let text = processInlineFormatting(node);

      // Check for bold
      if (style.fontWeight === '600' || style.fontWeight === '700' ||
          style.fontWeight === 'bold' || tagName === 'strong' || tagName === 'b') {
        text = `**${text}**`;
      }

      // Check for italic
      if (style.fontStyle === 'italic' || tagName === 'em' || tagName === 'i') {
        text = `*${text}*`;
      }

      // Check for strikethrough
      if (style.textDecoration?.includes('line-through') || tagName === 's' || tagName === 'del') {
        text = `~~${text}~~`;
      }

      // Check for code
      if (tagName === 'code' || node.classList?.contains('notion-text-code')) {
        text = `\`${text}\``;
      }

      // Check for links
      if (tagName === 'a') {
        const href = node.getAttribute('href');
        if (href) {
          text = `[${text}](${href})`;
        }
      }

      result += text;
    }
  }

  return result.trim();
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

  // Show persistent loading notification
  const dismissLoading = showLoadingNotification('画像を生成中... (Generating image...)');

  try {
    // Send message to background script to generate image
    const response = await chrome.runtime.sendMessage({
      action: 'generateImage',
      prompt: prompt
    });

    if (response.success && response.imageUrl) {
      // Insert image directly into Notion DOM
      await insertImageIntoNotion(response.imageUrl, blockElement);
      // Dismiss loading notification after insertion completes
      dismissLoading();
      showNotification('画像を生成しました！ (Image generated and added!)', 'success');
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

// Insert image into Notion page by simulating paste
async function insertImageIntoNotion(imageUrl, targetBlock) {
  try {
    // Convert base64 data URL to Blob
    const blob = await dataUrlToBlob(imageUrl);

    // Find the editable element within the target block and insert AFTER it
    if (targetBlock) {
      const editableElement = targetBlock.querySelector('[contenteditable="true"]') ||
                              targetBlock.querySelector('[data-content-editable-leaf]') ||
                              targetBlock;

      if (editableElement) {
        // Click to focus the block
        editableElement.focus();

        // Move cursor to the END of the block to insert AFTER the selected text
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableElement);
        range.collapse(false); // Collapse to END (false = end, true = start)
        selection.removeAllRanges();
        selection.addRange(range);

        // Small delay to ensure focus
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simulate pressing Enter to create a new line AFTER the current block
        document.execCommand('insertParagraph', false, null);

        // Wait for Notion to process the new block
        await new Promise(resolve => setTimeout(resolve, 150));

        // Now we should be in the new empty block, paste the image here
      }
    } else {
      // No target block found, try to find the last focused element or page content
      const pageContent = document.querySelector('.notion-page-content');
      if (pageContent) {
        const lastBlock = pageContent.querySelector('[data-block-id]:last-child');
        if (lastBlock) {
          const editableElement = lastBlock.querySelector('[contenteditable="true"]') || lastBlock;
          editableElement.focus();

          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editableElement);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);

          await new Promise(resolve => setTimeout(resolve, 100));
          document.execCommand('insertParagraph', false, null);
          await new Promise(resolve => setTimeout(resolve, 150));
        }
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
