// Enhanced selector waiting function with better error handling and retry mechanism
async function waitForSelector(selector, timeout = 30000, retries = 3) {
  const start = Date.now();
  const selectors = Array.isArray(selector) ? selector : [selector];
  
  for (let attempt = 0; attempt < retries; attempt++) {
    const attemptStart = Date.now();
    while (Date.now() - attemptStart < timeout / retries) {
      for (const sel of selectors) {
        try {
          const element = document.querySelector(sel);
          if (element && element.offsetParent !== null) { // Check if element is visible
            console.log(`✅ Found element with selector: ${sel}`);
            return element;
          }
        } catch (err) {
          console.warn(`⚠️ Error finding selector ${sel}:`, err.message);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.warn(`⚠️ Retry ${attempt + 1}/${retries} for selectors: ${selectors.join(", ")}`);
  }
  
  throw new Error(`Element not found after ${retries} attempts: ${selectors.join(", ")}`);
}

async function waitForDocumentComplete(timeout = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (document.readyState === "complete") {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Document did not reach complete state");
}

// Function to extract specific data from the page based on a query
async function extractPageData(query) {
  // Get the page content
  const pageContent = document.body.innerText.substring(0, 30000);
  
  // Get structured data if available
  const structuredData = [];
  const scriptElements = document.querySelectorAll('script[type="application/ld+json"]');
  scriptElements.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      structuredData.push(data);
    } catch (e) {
      console.warn('Error parsing structured data:', e);
    }
  });
  
  // Get meta tags
  const metaTags = {};
  document.querySelectorAll('meta').forEach(meta => {
    const name = meta.getAttribute('name') || meta.getAttribute('property');
    const content = meta.getAttribute('content');
    if (name && content) {
      metaTags[name] = content;
    }
  });
  
  // Return the extracted data
  return {
    query,
    url: window.location.href,
    title: document.title,
    metaTags,
    structuredData,
    pageContent
  };
}

// Handle messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "extract_page_data") {
    (async () => {
      try {
        const data = await extractPageData(message.query);
        sendResponse({ success: true, data });
      } catch (err) {
        console.error("Error extracting page data:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  } else if (message.type === "run_steps") {
    const steps = message.steps;
    const startIndex = message.startIndex || 0;
    const totalSteps = message.totalSteps || steps.length;
    let hasError = false;

    (async () => {
      console.log("📥 content.js received steps:", steps);

      try {
        await waitForDocumentComplete();
      } catch (err) {
        console.error("⚠️ Document load timeout:", err.message);
        chrome.runtime.sendMessage({
          type: "action_error",
          error: `Document load timeout: ${err.message}`,
          step: { action: "wait_for_document" }
        });
        hasError = true;
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        try {
          if (step.action === "click") {
            const el = await waitForSelector(step.selector);
            
            // Try standard click first
            try {
              el.click();
            } catch (clickErr) {
              console.warn(`⚠️ Standard click failed, trying MouseEvent:`, clickErr.message);
              
              // Try MouseEvent click as fallback
              try {
                // Get element position for more accurate clicking
                const rect = el.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                // Scroll element into view first
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                
                // Wait a moment for scroll to complete
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Create and dispatch mouse events
                const mousedown = new MouseEvent('mousedown', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: centerX, clientY: centerY
                });
                
                const mouseup = new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: centerX, clientY: centerY
                });
                
                el.dispatchEvent(mousedown);
                el.dispatchEvent(mouseup);
              } catch (mouseEventErr) {
                console.warn(`⚠️ MouseEvent click failed, trying JavaScript click:`, mouseEventErr.message);
                
                // Last resort: try to trigger click via JavaScript
                const clickFunction = el.onclick || function() {};
                clickFunction.apply(el);
              }
            }
            console.log(`✅ Clicked element: ${step.selector}`);
            // Wait a moment after clicking to allow page to respond
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else if (step.action === "press") {
            const el = await waitForSelector(step.selector);
            el.focus();
            
            // Map common key names to their corresponding key codes
            const keyMap = {
              'enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
              'tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
              'escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
              'space': { key: ' ', code: 'Space', keyCode: 32 },
              'arrowup': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
              'arrowdown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
              'arrowleft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
              'arrowright': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 }
            };
            
            // Normalize the key name
            const keyName = (step.key || 'enter').toLowerCase();
            const keyInfo = keyMap[keyName] || { 
              key: step.key || 'Enter', 
              code: step.key || 'Enter', 
              keyCode: 13 
            };
            
            // Create keyboard events with all properties
            const keydownEvent = new KeyboardEvent('keydown', {
              key: keyInfo.key,
              code: keyInfo.code,
              keyCode: keyInfo.keyCode,
              which: keyInfo.keyCode,
              bubbles: true,
              cancelable: true
            });
            
            const keypressEvent = new KeyboardEvent('keypress', {
              key: keyInfo.key,
              code: keyInfo.code,
              keyCode: keyInfo.keyCode,
              which: keyInfo.keyCode,
              bubbles: true,
              cancelable: true
            });
            
            const keyupEvent = new KeyboardEvent('keyup', {
              key: keyInfo.key,
              code: keyInfo.code,
              keyCode: keyInfo.keyCode,
              which: keyInfo.keyCode,
              bubbles: true,
              cancelable: true
            });
            
            // Dispatch all events in sequence
            el.dispatchEvent(keydownEvent);
            el.dispatchEvent(keypressEvent);
            el.dispatchEvent(keyupEvent);
            
            // For Enter key on form elements, also try to submit the form
            if (keyName === 'enter' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
              const form = el.closest('form');
              if (form) {
                try {
                  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                  console.log(`✅ Submitted form after pressing ${step.key}`);
                } catch (submitErr) {
                  console.warn(`⚠️ Form submit failed:`, submitErr.message);
                }
              }
            }
            
            console.log(`✅ Pressed key "${step.key}" on: ${step.selector}`);
            // Wait a moment after key press to allow page to respond
            await new Promise(resolve => setTimeout(resolve, 500));
          } else if (step.action === "type") {
            const el = await waitForSelector(step.selector);
            // Focus the element first
            el.focus();
            // Clear existing value if any
            el.value = "";
            // Type the text character by character for more reliability
            const text = step.text || "";
            for (let j = 0; j < text.length; j++) {
              el.value += text[j];
              el.dispatchEvent(new Event("input", { bubbles: true }));
              // Small delay between characters for more natural typing
              await new Promise(resolve => setTimeout(resolve, 30));
            }
            // Dispatch change event after typing is complete
            el.dispatchEvent(new Event("change", { bubbles: true }));
            console.log(`✅ Typed "${step.text}" into: ${step.selector}`);
          } else if (step.action === "wait") {
            const ms = step.ms || 1000;
            console.log(`⏳ Waiting ${ms}ms`);
            await new Promise((res) => setTimeout(res, ms));
          } else if (step.action === "scroll") {
            const el = await waitForSelector(step.selector);
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            console.log(`✅ Scrolled to: ${step.selector}`);
          } else if (step.action === "submit") {
            const el = await waitForSelector(step.selector);
            el.submit();
            console.log(`✅ Submitted form: ${step.selector}`);
          } else if (step.action === "extract") {
            const pageContent = document.body.innerText.substring(0, 30000);
            chrome.runtime.sendMessage({
              type: "extract_data",
              query: step.query,
              content: pageContent
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn("⚠️ Failed to send extracted data:", chrome.runtime.lastError.message);
              } else {
                console.log("✅ Extracted data:", response);
              }
            });
          } else if (step.action === "done") {
            console.log(`✅ Task completed: ${step.text}, Success: ${step.success && !hasError}`);
            chrome.runtime.sendMessage({
              type: "task_completed",
              text: step.text,
              success: step.success && !hasError
            });
            sendResponse({ message: "Steps execution completed" });
            return;
          } else {
            console.warn(`⚠️ Unsupported action: ${step.action}`);
            chrome.runtime.sendMessage({
              type: "action_error",
              error: `Unsupported action: ${step.action}`,
              step: step
            });
            hasError = true;
          }

          chrome.runtime.sendMessage({
            type: "progress_update",
            progress: ((startIndex + i + 1) / totalSteps) * 100
          });
        } catch (err) {
          console.warn(`⚠️ Error executing step ${step.action}:`, err.message);
          chrome.runtime.sendMessage({
            type: "action_error",
            error: `Error executing ${step.action}: ${err.message}`,
            step: step
          });
          hasError = true;
        }
      }

      if (!hasError) {
        sendResponse({ message: "Steps execution completed successfully" });
      } else {
        sendResponse({ message: "Steps execution completed with errors", error: true });
      }
    })();
    return true;
  }
  return false;
});