// Content script for Notion pages
console.log('Notion to Nanobanana Pro: Content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);
  alert('Message received: ' + request.action); // Debug alert
  if (request.action === 'showPromptModal') {
    // Read from clipboard instead of selection
    handleGenerateImageFromClipboard();
    sendResponse({ received: true });
  }
  return true; // Keep the message channel open for async response
});

// Read text from clipboard
async function readClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    return text;
  } catch (error) {
    console.error('Failed to read clipboard:', error);
    // Fallback: try to get selected text
    const selection = window.getSelection();
    return selection ? selection.toString() : null;
  }
}

// Handle image generation using clipboard content
async function handleGenerateImageFromClipboard() {
  console.log('handleGenerateImageFromClipboard started');

  try {
    // Save current cursor position BEFORE showing modal
    const cursorInfo = saveCursorPosition();
    console.log('Cursor position saved:', cursorInfo);

    // Read clipboard content
    let clipboardText = await readClipboard();
    console.log('Clipboard text:', clipboardText ? clipboardText.substring(0, 100) + '...' : 'null');

    if (!clipboardText || !clipboardText.trim()) {
      showNotification('クリップボードにテキストがありません。テキストをコピーしてから実行してください。\n(No text in clipboard. Please copy text first.)', 'error', 5000);
      return;
    }

    // Convert to markdown format
    const markdownText = convertTextToMarkdown(clipboardText);

    // Show prompt selection modal with clipboard content
    const prompt = await showPromptModal(markdownText);

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
        // Insert image at saved cursor position
        await insertImageAtCursor(response.imageUrl, cursorInfo);
        dismissLoading();
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
  } catch (outerError) {
    console.error('Error in handleGenerateImageFromClipboard:', outerError);
    showNotification(`エラー: ${outerError.message}`, 'error');
  }
}

// Save current cursor position
function saveCursorPosition() {
  const activeElement = document.activeElement;
  const selection = window.getSelection();

  let cursorInfo = {
    activeElement: activeElement,
    blockElement: null,
    hasSelection: false
  };

  // Find the Notion block containing the cursor
  if (activeElement) {
    const block = activeElement.closest('[data-block-id]');
    if (block) {
      cursorInfo.blockElement = block;
    }
  }

  // Save selection if any
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    cursorInfo.hasSelection = true;
    cursorInfo.range = range.cloneRange();

    // Also try to find block from selection
    if (!cursorInfo.blockElement) {
      const container = range.commonAncestorContainer;
      const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
      cursorInfo.blockElement = element?.closest('[data-block-id]');
    }
  }

  // Fallback: find focused editable element
  if (!cursorInfo.blockElement) {
    const focused = document.querySelector('[contenteditable="true"]:focus');
    if (focused) {
      cursorInfo.activeElement = focused;
      cursorInfo.blockElement = focused.closest('[data-block-id]');
    }
  }

  return cursorInfo;
}

// Insert image at the saved cursor position
async function insertImageAtCursor(imageUrl, cursorInfo) {
  try {
    // Convert base64 data URL to Blob
    const blob = await dataUrlToBlob(imageUrl);
    const file = new File([blob], 'generated-image.png', { type: blob.type });

    // Find target element to insert
    let targetElement = null;

    // Try to use saved cursor position
    if (cursorInfo && cursorInfo.blockElement) {
      const editableElement = cursorInfo.blockElement.querySelector('[contenteditable="true"]') ||
                              cursorInfo.blockElement;

      if (editableElement) {
        editableElement.focus();
        targetElement = editableElement;

        // Move cursor to end of block (image will be inserted as new block below)
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);

        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Fallback: use active element or find any editable
    if (!targetElement) {
      targetElement = document.activeElement;

      if (!targetElement || targetElement === document.body) {
        targetElement = document.querySelector('.notion-page-content [contenteditable="true"]') ||
                        document.querySelector('[contenteditable="true"]');

        if (targetElement) {
          targetElement.focus();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    // Create and dispatch paste event
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });

    const activeEl = document.activeElement || targetElement;
    activeEl.dispatchEvent(pasteEvent);

    await new Promise(resolve => setTimeout(resolve, 300));
    return true;

  } catch (error) {
    console.error('Error inserting image:', error);
    return false;
  }
}

// Get selected text as markdown format
function getSelectedMarkdown() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return null;

  const range = selection.getRangeAt(0);

  // Try to extract markdown from Notion blocks first
  const markdownFromBlocks = extractMarkdownFromSelection(range);
  if (markdownFromBlocks && markdownFromBlocks.trim()) {
    // Check if we got reasonable content (not just headers without content)
    const lines = markdownFromBlocks.split('\n').filter(l => l.trim());
    const hasContent = lines.some(l => !l.startsWith('#'));
    if (hasContent) {
      return markdownFromBlocks;
    }
  }

  // Fallback: Try aggressive text extraction from the selection
  try {
    const aggressiveText = extractAllTextFromSelection(range);
    if (aggressiveText && aggressiveText.trim()) {
      return convertTextToMarkdown(aggressiveText);
    }
  } catch (e) {
    console.log('Aggressive extraction failed:', e);
  }

  // Fallback: Try to get HTML content and convert to markdown
  try {
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    // Try extracting from Notion HTML structure
    const markdownFromHtml = extractMarkdownFromNotionHtml(container);
    if (markdownFromHtml && markdownFromHtml.trim()) {
      return markdownFromHtml;
    }

    // Use generic HTML to markdown converter
    const genericMarkdown = htmlToMarkdown(container);
    if (genericMarkdown && genericMarkdown.trim()) {
      return genericMarkdown;
    }
  } catch (e) {
    console.log('HTML extraction failed, using plain text:', e);
  }

  // Final fallback: try to extract with forced line breaks between blocks
  try {
    const textWithBreaks = extractTextWithLineBreaks(range);
    if (textWithBreaks && textWithBreaks.trim()) {
      return convertTextToMarkdown(textWithBreaks);
    }
  } catch (e) {
    console.log('Line break extraction failed:', e);
  }

  // Last resort: convert plain text with pattern detection
  const plainText = selection.toString();
  return convertTextToMarkdown(plainText);
}

// Extract text from selection while forcing line breaks between blocks
function extractTextWithLineBreaks(range) {
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());

  // Get all block-level elements and text nodes
  const lines = [];

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        lines.push(text);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = node.tagName.toLowerCase();
    const isBlock = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre'].includes(tagName);

    if (isBlock) {
      // Process children and add as a single line
      const childTexts = [];
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent.trim();
          if (text) childTexts.push(text);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const childTag = child.tagName.toLowerCase();
          if (['span', 'a', 'strong', 'em', 'b', 'i', 'code'].includes(childTag)) {
            const text = child.textContent.trim();
            if (text) childTexts.push(text);
          } else {
            // Nested block - process separately
            processNode(child);
          }
        }
      }
      if (childTexts.length > 0) {
        lines.push(childTexts.join(' '));
      }
    } else {
      // Process children
      for (const child of node.childNodes) {
        processNode(child);
      }
    }
  }

  processNode(container);

  return lines.join('\n');
}

// Aggressively extract all text from selected Notion blocks
function extractAllTextFromSelection(range) {
  const lines = [];

  // Get the common ancestor and find all text-containing elements
  const container = range.commonAncestorContainer;
  const rootElement = container.nodeType === Node.TEXT_NODE
    ? container.parentElement
    : container;

  // Find the Notion page content area
  const notionContent = rootElement.closest('.notion-page-content') ||
                        rootElement.closest('[class*="notion"]') ||
                        rootElement;

  // Find all blocks that might contain selected text
  const allBlocks = notionContent.querySelectorAll('[data-block-id]');

  for (const block of allBlocks) {
    // Check if this block or any of its content is in the selection
    if (!range.intersectsNode(block)) continue;

    // Get all text from this block, including nested contenteditable elements
    const blockText = extractAllBlockText(block);
    if (blockText && blockText.trim()) {
      const blockType = getNotionBlockType(block);
      const formatted = formatBlockAsMarkdown(blockType, blockText.trim(), block);
      lines.push(formatted);
    }
  }

  // If no blocks found, try to get text from all contenteditable elements in selection
  if (lines.length === 0) {
    const editables = notionContent.querySelectorAll('[contenteditable="true"]');
    for (const editable of editables) {
      if (range.intersectsNode(editable)) {
        const text = editable.textContent?.trim();
        if (text) {
          lines.push(text);
        }
      }
    }
  }

  return lines.join('\n');
}

// Extract all text from a block, including nested elements
function extractAllBlockText(block) {
  // First try the standard method
  const standardText = getBlockText(block);
  if (standardText && standardText.trim()) {
    return standardText;
  }

  // If that fails, try getting all contenteditable text
  const editables = block.querySelectorAll('[contenteditable="true"]');
  const texts = [];
  for (const editable of editables) {
    const text = editable.textContent?.trim();
    if (text) {
      texts.push(text);
    }
  }

  if (texts.length > 0) {
    return texts.join(' ');
  }

  // Last resort: get all text content
  const clone = block.cloneNode(true);
  // Remove nested blocks to avoid duplication
  clone.querySelectorAll('[data-block-id]').forEach(el => el.remove());
  return clone.textContent?.trim() || '';
}

// Convert plain text to markdown by detecting common patterns
function convertTextToMarkdown(text) {
  if (!text || !text.trim()) return text;

  const lines = text.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip empty lines but preserve them
    if (!line.trim()) {
      result.push('');
      continue;
    }

    // Detect section headers like "1-4." or "1-5." at the beginning
    const sectionMatch = line.match(/^(\d+[-\.]\d+\.?)\s*(.+)/);
    if (sectionMatch) {
      const [, sectionNum, content] = sectionMatch;
      result.push(`## ${sectionNum} ${content}`);
      continue;
    }

    // Detect standalone numbered items like "1." "2." at the beginning of line
    const numberedMatch = line.match(/^(\d+)[.)\]]\s+(.+)/);
    if (numberedMatch) {
      const [, num, content] = numberedMatch;
      result.push(`${num}. ${content}`);
      continue;
    }

    // Detect bullet points (Japanese and Western)
    const bulletMatch = line.match(/^[・•●○◆◇■□▪▫※]\s*(.+)/);
    if (bulletMatch) {
      result.push(`- ${bulletMatch[1]}`);
      continue;
    }

    // Detect lines starting with "-" or "*" (already markdown-like)
    const dashMatch = line.match(/^[-*]\s+(.+)/);
    if (dashMatch) {
      result.push(`- ${dashMatch[1]}`);
      continue;
    }

    // Detect key-value pairs with colon (common in Japanese docs)
    // e.g., "期間：8～12週" -> "**期間**: 8～12週"
    const keyValueMatch = line.match(/^([^：:]{1,20})[：:](.+)/);
    if (keyValueMatch && !line.includes('http')) {
      const [, key, value] = keyValueMatch;
      // Only format if key looks like a label (short, no spaces at start)
      if (key.trim() === key && key.length <= 15) {
        result.push(`**${key.trim()}**: ${value.trim()}`);
        continue;
      }
    }

    // Check if line looks like a header (short, standalone, possibly followed by content)
    const isShortLine = line.trim().length <= 30;
    const nextLineExists = i + 1 < lines.length && lines[i + 1].trim();
    const prevLineEmpty = i === 0 || !lines[i - 1].trim();

    if (isShortLine && prevLineEmpty && nextLineExists && !line.includes('：') && !line.includes(':')) {
      // Might be a header
      result.push(`### ${line.trim()}`);
      continue;
    }

    // Default: keep as is
    result.push(line);
  }

  return result.join('\n');
}

// Extract markdown from actual Notion blocks in selection
function extractMarkdownFromSelection(range) {
  const lines = [];

  // Find all Notion blocks in the document
  const allBlocks = document.querySelectorAll('[data-block-id]');

  for (const block of allBlocks) {
    // Check if this block intersects with the selection
    if (!range.intersectsNode(block)) continue;

    // Skip if this block contains other blocks (not a leaf)
    if (block.querySelector('[data-block-id]')) continue;

    // Get the block type and text
    const blockType = getNotionBlockType(block);
    const text = getBlockText(block);

    if (!text.trim()) continue;

    // Format based on block type
    const formattedLine = formatBlockAsMarkdown(blockType, text, block);
    if (formattedLine) {
      lines.push(formattedLine);
    }
  }

  return lines.join('\n');
}

// Detect Notion block type from class names and DOM structure
function getNotionBlockType(block) {
  const className = block.className || '';

  // Check for headers - various Notion class name patterns
  if (className.includes('header') || className.includes('heading')) {
    if (className.includes('sub_sub') || className.includes('heading_3') || className.includes('sub-sub-header')) return 'h3';
    if (className.includes('sub_header') || className.includes('heading_2') || className.includes('sub-header')) return 'h2';
    return 'h1';
  }

  // Also check for notion-specific block classes
  if (className.includes('notion-header-block')) return 'h1';
  if (className.includes('notion-sub_header-block')) return 'h2';
  if (className.includes('notion-sub_sub_header-block')) return 'h3';

  // Check for list types
  if (className.includes('bulleted_list') || className.includes('bulleted-list')) return 'bullet';
  if (className.includes('numbered_list') || className.includes('numbered-list')) return 'number';
  if (className.includes('to_do') || className.includes('to-do') || className.includes('todo')) return 'todo';

  // Check for quote/callout
  if (className.includes('quote')) return 'quote';
  if (className.includes('callout')) return 'callout';

  // Check for code blocks
  if (className.includes('code')) return 'code';

  // Check for toggle
  if (className.includes('toggle')) return 'toggle';

  // Check by examining child elements for list markers
  const bulletMarker = block.querySelector('[style*="disc"], [style*="circle"], [style*="square"]');
  if (bulletMarker) return 'bullet';

  // Check for numbered list by looking at pseudo-elements or list-style
  const numberMarker = block.querySelector('[style*="decimal"], [style*="list-style-type"]');
  if (numberMarker) return 'number';

  // Check for checkbox
  const checkbox = block.querySelector('[role="checkbox"], input[type="checkbox"], [class*="checkbox"]');
  if (checkbox) return 'todo';

  return 'paragraph';
}

// Get text content from a Notion block
function getBlockText(block) {
  // Find the content element
  const contentEl = block.querySelector('[contenteditable="true"]') ||
                    block.querySelector('[data-content-editable-leaf]') ||
                    block.querySelector('[placeholder]');

  if (contentEl) {
    return extractInlineFormatting(contentEl);
  }

  // Fallback: get text from the block itself, excluding nested blocks
  const clone = block.cloneNode(true);
  // Remove nested blocks
  clone.querySelectorAll('[data-block-id]').forEach(el => el.remove());

  return clone.textContent?.trim() || '';
}

// Extract text with inline formatting preserved
function extractInlineFormatting(element) {
  let result = '';

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      const computedStyle = window.getComputedStyle(node);
      let text = extractInlineFormatting(node);

      if (!text) continue;

      // Check for formatting
      const fontWeight = computedStyle.fontWeight;
      const isBold = tagName === 'strong' || tagName === 'b' ||
                     fontWeight === '600' || fontWeight === '700' || fontWeight === 'bold';

      const isItalic = tagName === 'em' || tagName === 'i' ||
                       computedStyle.fontStyle === 'italic';

      const isStrike = tagName === 's' || tagName === 'del' ||
                       computedStyle.textDecorationLine?.includes('line-through');

      const isCode = tagName === 'code' ||
                     computedStyle.fontFamily?.includes('monospace') ||
                     node.classList?.contains('notion-text-equation');

      // Apply formatting (order matters: code first, then bold/italic)
      if (isCode) text = `\`${text}\``;
      if (isBold) text = `**${text}**`;
      if (isItalic) text = `*${text}*`;
      if (isStrike) text = `~~${text}~~`;

      // Links
      if (tagName === 'a') {
        const href = node.getAttribute('href');
        if (href) text = `[${text}](${href})`;
      }

      result += text;
    }
  }

  return result;
}

// Format a block as markdown based on its type
function formatBlockAsMarkdown(blockType, text, block = null) {
  switch (blockType) {
    case 'h1': return `# ${text}`;
    case 'h2': return `## ${text}`;
    case 'h3': return `### ${text}`;
    case 'bullet': return `- ${text}`;
    case 'number': return `1. ${text}`;
    case 'todo':
      // Check if todo is checked by examining the block element
      let isChecked = false;
      if (block) {
        const checkbox = block.querySelector('[role="checkbox"], input[type="checkbox"], [class*="checkbox"]');
        if (checkbox) {
          isChecked = checkbox.getAttribute('aria-checked') === 'true' ||
                      checkbox.checked ||
                      checkbox.classList.contains('checked');
        }
        // Also check for checked class on the block itself
        if (!isChecked && block.className) {
          isChecked = block.className.includes('checked');
        }
      }
      return `- [${isChecked ? 'x' : ' '}] ${text}`;
    case 'quote': return `> ${text}`;
    case 'code': return `\`\`\`\n${text}\n\`\`\``;
    case 'callout': return `> ${text}`;
    default: return text;
  }
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
      let stylePrompt = '';

      if (selectedType === 'selected') {
        // Use selected text as-is (no style override)
        finalPrompt = selectedText;
      } else if (selectedType === 'preset' && presetSelector) {
        const presetIndex = parseInt(presetSelector.value);
        const preset = presets[presetIndex];
        // Send style as separate instruction
        stylePrompt = preset.prompt;
        finalPrompt = `[STYLE]: ${stylePrompt}\n\n[CONTENT]:\n${selectedText}`;
      } else if (selectedType === 'custom' && customInput) {
        const customPrompt = customInput.value.trim();
        if (!customPrompt) {
          showNotification('カスタムプロンプトを入力してください (Please enter custom prompt)', 'error');
          return;
        }
        // Send custom style as separate instruction
        finalPrompt = `[STYLE]: ${customPrompt}\n\n[CONTENT]:\n${selectedText}`;
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
