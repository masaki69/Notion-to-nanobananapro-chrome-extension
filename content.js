// Content script for Notion pages
console.log('Notion to Nanobanana Pro: Content script loaded');

let floatingButton = null;
let selectedBlock = null;

// Create floating button for image generation
function createFloatingButton() {
  if (floatingButton) return;

  floatingButton = document.createElement('div');
  floatingButton.id = 'nanobanana-generate-btn';
  floatingButton.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor"/>
    </svg>
    <span>Generate Image</span>
  `;
  floatingButton.style.display = 'none';
  document.body.appendChild(floatingButton);

  floatingButton.addEventListener('click', handleGenerateImage);
}

// Get text content from Notion block
function getBlockContent(element) {
  // Try to find the text content in various Notion block structures
  const textElement = element.querySelector('[data-content-editable-leaf="true"]') ||
                      element.querySelector('[contenteditable="true"]') ||
                      element.querySelector('.notion-text-block') ||
                      element;

  return textElement.innerText || textElement.textContent || '';
}

// Get block ID from Notion block element
function getBlockId(element) {
  // Notion blocks have data-block-id attribute
  let blockElement = element.closest('[data-block-id]');
  if (blockElement) {
    return blockElement.getAttribute('data-block-id');
  }
  return null;
}

// Handle block selection
function handleBlockSelection() {
  const selection = window.getSelection();

  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const blockElement = container.nodeType === 3
      ? container.parentElement.closest('[data-block-id]')
      : container.closest('[data-block-id]');

    if (blockElement) {
      selectedBlock = {
        element: blockElement,
        content: getBlockContent(blockElement),
        blockId: getBlockId(blockElement)
      };

      // Show floating button near selection
      if (selectedBlock.content.trim()) {
        showFloatingButton(range);
      }
    }
  }
}

// Show floating button near the selection
function showFloatingButton(range) {
  if (!floatingButton) createFloatingButton();

  const rect = range.getBoundingClientRect();
  floatingButton.style.display = 'flex';
  floatingButton.style.top = `${rect.bottom + window.scrollY + 10}px`;
  floatingButton.style.left = `${rect.left + window.scrollX}px`;
}

// Hide floating button
function hideFloatingButton() {
  if (floatingButton) {
    floatingButton.style.display = 'none';
  }
  selectedBlock = null;
}

// Handle image generation
async function handleGenerateImage() {
  if (!selectedBlock || !selectedBlock.content.trim()) {
    showNotification('Please select a block with text content', 'error');
    return;
  }

  showNotification('Generating image...', 'info');
  hideFloatingButton();

  try {
    // Get current page URL to extract page ID
    const pageUrl = window.location.href;
    const pageId = extractPageId(pageUrl);

    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'generateImage',
      prompt: selectedBlock.content,
      blockId: selectedBlock.blockId,
      pageId: pageId
    });

    if (response.success) {
      showNotification('Image generated and added to Notion!', 'success');
      // Reload the page to show the new image
      setTimeout(() => location.reload(), 2000);
    } else {
      showNotification(`Error: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Error generating image:', error);
    showNotification(`Error: ${error.message}`, 'error');
  }
}

// Extract page ID from Notion URL
function extractPageId(url) {
  // Notion URLs have format: https://www.notion.so/Page-Title-{pageId}
  const match = url.match(/([a-f0-9]{32})/);
  if (match) {
    return match[1];
  }

  // Try to get from page metadata
  const metaTag = document.querySelector('meta[name="notion:page-id"]');
  if (metaTag) {
    return metaTag.content;
  }

  return null;
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

// Initialize
function init() {
  createFloatingButton();

  // Listen for text selection
  document.addEventListener('mouseup', handleBlockSelection);
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      hideFloatingButton();
    }
  });

  // Hide button when clicking elsewhere
  document.addEventListener('mousedown', (e) => {
    if (floatingButton && !floatingButton.contains(e.target)) {
      const selection = window.getSelection();
      if (!selection.toString()) {
        hideFloatingButton();
      }
    }
  });
}

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
