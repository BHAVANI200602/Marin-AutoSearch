const OPENROUTER_API_KEY = "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";

// Enhanced extraction function with improved data extraction capabilities
async function extractData(query, content) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-70b-instruct",
        messages: [
          {
            role: "system",
            content: `Extract structured information from the provided page content based on the query. Respond in JSON format with the extracted data or an explanation if the information is not available.

Query: {{query}}
Content: {{content}}`
              .replace("{{query}}", query)
              .replace("{{content}}", content)
          }
        ]
      })
    });

    const data = await response.json();
    const result = data?.choices?.[0]?.message?.content;
    if (!result) {
      throw new Error("No content in response");
    }

    try {
      return JSON.parse(result);
    } catch (err) {
      return { error: "Failed to parse extracted data", raw: result };
    }
  } catch (err) {
    console.error("Error extracting data:", err);
    return { error: err.message };
  }
}

// Function to get detailed DOM inspection for better element targeting
function getDomInspection() {
  const elements = Array.from(document.querySelectorAll("input, textarea, button, select, div[contenteditable]")).map(el => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    name: el.name || null,
    classes: el.className ? el.className.split(" ") : [],
    attributes: Array.from(el.attributes).reduce((acc, attr) => {
      if (attr.name !== "id" && attr.name !== "class") acc[attr.name] = attr.value;
      return acc;
    }, {}),
    placeholder: el.placeholder || null,
    ariaLabel: el.getAttribute("aria-label") || null,
    role: el.getAttribute("role") || null,
    value: el.value || null,
    innerText: el.innerText ? el.innerText.substring(0, 100) : null,
    parentClasses: el.parentElement ? el.parentElement.className.split(" ") : []
  }));
  return JSON.stringify(elements.slice(0, 200)); // Increased to 200 elements
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'popup.html',
    enabled: true
  });
});

// Handle all extension message types
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get_browser_context") {
    chrome.tabs.query({}, (tabs) => {
      const currentTab = tabs.find(tab => tab.active);
      let context = {
        current_tab: currentTab ? `Tab ${currentTab.id}: ${currentTab.url} - ${currentTab.title || "No title"}` : "No active tab",
        tabs: tabs.map(tab => `Tab ${tab.id}: ${tab.url} - ${tab.title || "No title"}`).join("\n") || "No tabs available",
        page_content: "Content extraction not available",
        dom_inspection: "DOM inspection not available",
        screenshots: "No screenshots available"
      };

      if (currentTab && currentTab.id) {
        chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          func: () => document.body.innerText.substring(0, 30000)
        }, (results) => {
          if (results && results[0]) {
            context.page_content = results[0].result;
          }
          chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: getDomInspection
          }, (domResults) => {
            if (domResults && domResults[0]) {
              context.dom_inspection = domResults[0].result;
            }
            chrome.tabs.captureVisibleTab(currentTab.id, { format: "png" }, (dataUrl) => {
              if (dataUrl) {
                context.screenshots = dataUrl.replace("data:image/png;base64,", "");
              }
              sendResponse(context);
            });
          });
        });
      } else {
        sendResponse(context);
      }
    });
    return true;
  }

  if (message.type === "extract_data") {
    (async () => {
      try {
        // If content is provided, use it directly
        if (message.content && message.content !== "Use the current page content") {
          const result = await extractData(message.query, message.content);
          sendResponse(result);
        } else {
          // Otherwise, get content from the active tab
          chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
            if (!tabs || !tabs[0] || !tabs[0].id) {
              sendResponse({error: "No active tab found"});
              return;
            }
            
            // Send message to content script to extract data
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "extract_page_data",
              query: message.query
            }, (response) => {
              if (chrome.runtime.lastError) {
                sendResponse({error: chrome.runtime.lastError.message});
                return;
              }
              
              if (!response || !response.success) {
                sendResponse({error: response?.error || "Failed to extract data from page"});
                return;
              }
              
              // Process the extracted data with the AI
              (async () => {
                const result = await extractData(message.query, response.data.pageContent);
                // Enhance the result with structured data from the page
                result.pageMetadata = {
                  url: response.data.url,
                  title: response.data.title,
                  metaTags: response.data.metaTags,
                  structuredData: response.data.structuredData
                };
                sendResponse(result);
              })();
            });
          });
        }
      } catch (err) {
        console.error("Error in extract_data handler:", err);
        sendResponse({error: err.message});
      }
    })();
    return true;
  }

  if (message.type === "keep_popup_open") {
    console.log("Popup pinned, maintaining focus");
    sendResponse({ message: "Popup pinned" });
    return true;
  }

  if (message.type === "execute_steps") {
    const steps = message.steps;
    if (!Array.isArray(steps)) {
      sendResponse({ message: "Invalid steps format", error: true });
      chrome.runtime.sendMessage({
        type: "action_error",
        error: "Invalid steps format",
        step: { action: "execute_steps" }
      });
      return;
    }

    let currentTabId = null;
    let currentSteps = [];
    let stepIndex = 0;

    for (const step of steps) {
      if (step.action === "press" && currentTabId) {
        // Add to current steps to be executed in the content script
        currentSteps.push(step);
      } else if (step.action === "go_to") {
        if (currentSteps.length > 0 && currentTabId) {
          executeStepsInTab(currentTabId, currentSteps, stepIndex, steps.length, sendResponse);
          currentSteps = [];
        }
        try {
          // Normalize the URL
          let url = step.url;
          
          // Add https:// if no protocol is specified
          if (!/^https?:\/\//i.test(url)) {
            url = "https://" + url;
          }
          
          // Create URL object to validate
          const urlObj = new URL(url);
          
          // Check for restricted protocols
          if (urlObj.protocol === "chrome:") {
            sendResponse({ message: `Cannot access chrome:// URLs: ${step.url}`, error: true });
            chrome.runtime.sendMessage({
              type: "action_error",
              error: `Cannot access chrome:// URLs: ${step.url}`,
              step: step
            });
            return;
          }
          
          // First check if there's already a tab with this URL
          chrome.tabs.query({}, (tabs) => {
            const existingTab = tabs.find(tab => tab.url && tab.url.includes(urlObj.hostname));
            
            if (existingTab) {
              // If tab exists, activate it
              chrome.tabs.update(existingTab.id, { active: true }, (tab) => {
                if (chrome.runtime.lastError) {
                  console.error("Error activating existing tab:", chrome.runtime.lastError);
                  // Fall back to creating a new tab
                  createNewTab(urlObj.toString());
                } else {
                  currentTabId = tab.id;
                  // Add a wait step to ensure page is loaded
                  currentSteps.push({ action: "wait", ms: 3000 });
                  stepIndex += 2;
                  chrome.runtime.sendMessage({
                    type: "action_progress",
                    message: `Switched to existing tab with ${urlObj.hostname}`
                  });
                }
              });
            } else {
              // Create a new tab
              createNewTab(urlObj.toString());
            }
          });
          
          function createNewTab(finalUrl) {
            chrome.tabs.create({ url: finalUrl }, (tab) => {
              if (!tab || !tab.id) {
                sendResponse({ message: "Failed to create tab", error: true });
                chrome.runtime.sendMessage({
                  type: "action_error",
                  error: "Failed to create tab",
                  step: step
                });
                return;
              }
              currentTabId = tab.id;
              // Add a wait step to ensure page is loaded
              currentSteps.push({ action: "wait", ms: 5000 });
              stepIndex += 2;
              chrome.runtime.sendMessage({
                type: "action_progress",
                message: `Navigated to ${finalUrl}`
              });
            });
          }
        } catch (err) {
          sendResponse({ message: `Invalid URL: ${step.url} - ${err.message}`, error: true });
          chrome.runtime.sendMessage({
            type: "action_error",
            error: `Invalid URL: ${step.url} - ${err.message}`,
            step: step
          });
          return;
        }
      } else if (step.action === "switch_tab") {
        if (currentSteps.length > 0 && currentTabId) {
          executeStepsInTab(currentTabId, currentSteps, stepIndex, steps.length, sendResponse);
          currentSteps = [];
        }
        try {
          // Get all tabs
          chrome.tabs.query({}, (tabs) => {
            let targetTab = null;
            
            // First try to find by exact URL if provided
            if (step.url) {
              // Normalize the URL
              let url = step.url;
              
              // Add https:// if no protocol is specified
              if (!/^https?:\/\//i.test(url)) {
                url = "https://" + url;
              }
              
              try {
                // Create URL object to validate
                const urlObj = new URL(url);
                
                // Try to find tab with matching URL or hostname
                targetTab = tabs.find(tab => {
                  if (!tab.url) return false;
                  
                  // Check for exact match first
                  if (tab.url === urlObj.toString()) return true;
                  
                  // Then check if hostname is included
                  return tab.url.includes(urlObj.hostname);
                });
              } catch (err) {
                console.error(`Invalid URL in switch_tab: ${step.url} - ${err.message}`);
                // Continue with other matching methods
              }
            }
            
            // If no match by URL, try to find by title
            if (!targetTab && step.title) {
              const titleLower = step.title.toLowerCase();
              targetTab = tabs.find(tab => 
                tab.title && tab.title.toLowerCase().includes(titleLower)
              );
            }
            
            // If no match by title, try to find by index
            if (!targetTab && step.index !== undefined) {
              const index = parseInt(step.index);
              if (!isNaN(index) && index >= 0 && index < tabs.length) {
                targetTab = tabs[index];
              }
            }
            
            if (targetTab) {
              chrome.tabs.update(targetTab.id, { active: true }, (tab) => {
                if (chrome.runtime.lastError) {
                  const errorMsg = `Error switching to tab: ${chrome.runtime.lastError.message}`;
                  console.error(errorMsg);
                  sendResponse({ message: errorMsg, error: true });
                  chrome.runtime.sendMessage({
                    type: "action_error",
                    error: errorMsg,
                    step: step
                  });
                  return;
                }
                
                currentTabId = tab.id;
                // Add a wait step to ensure UI is ready
                currentSteps.push({ action: "wait", ms: 1000 });
                stepIndex += 2;
                
                const successMsg = `Switched to tab: ${tab.title || 'Untitled'}`;
                chrome.runtime.sendMessage({
                  type: "action_progress",
                  message: successMsg
                });
              });
            } else {
              const errorMsg = "Could not find a matching tab";
              sendResponse({ message: errorMsg, error: true });
              chrome.runtime.sendMessage({
                type: "action_error",
                error: errorMsg,
                step: step
              });
            }
          });
        } catch (err) {
          const errorMsg = `Error in switch_tab: ${err.message}`;
          sendResponse({ message: errorMsg, error: true });
          chrome.runtime.sendMessage({
            type: "action_error",
            error: errorMsg,
            step: step
          });
        }
      } else if (step.action === "close_tab") {
        if (currentSteps.length > 0 && currentTabId) {
          executeStepsInTab(currentTabId, currentSteps, stepIndex, steps.length, sendResponse);
          currentSteps = [];
        }
        try {
          // Get all tabs
          chrome.tabs.query({}, (tabs) => {
            let targetTab = null;
            
            // First try to find by tab_id if provided
            if (step.tab_id) {
              const tabId = parseInt(step.tab_id);
              if (!isNaN(tabId)) {
                targetTab = tabs.find(tab => tab.id === tabId);
              }
            }
            
            // If no match by tab_id, try to find by URL
            if (!targetTab && step.url) {
              // Normalize the URL
              let url = step.url;
              
              // Add https:// if no protocol is specified
              if (!/^https?:\/\//i.test(url)) {
                url = "https://" + url;
              }
              
              try {
                // Create URL object to validate
                const urlObj = new URL(url);
                
                // Try to find tab with matching URL or hostname
                targetTab = tabs.find(tab => {
                  if (!tab.url) return false;
                  
                  // Check for exact match first
                  if (tab.url === urlObj.toString()) return true;
                  
                  // Then check if hostname is included
                  return tab.url.includes(urlObj.hostname);
                });
              } catch (err) {
                console.error(`Invalid URL in close_tab: ${step.url} - ${err.message}`);
                // Continue with other matching methods
              }
            }
            
            // If no match by URL, try to find by title
            if (!targetTab && step.title) {
              const titleLower = step.title.toLowerCase();
              targetTab = tabs.find(tab => 
                tab.title && tab.title.toLowerCase().includes(titleLower)
              );
            }
            
            // If no match by title, try to find by index
            if (!targetTab && step.index !== undefined) {
              const index = parseInt(step.index);
              if (!isNaN(index) && index >= 0 && index < tabs.length) {
                targetTab = tabs[index];
              }
            }
            
            if (targetTab) {
              // Check if this is the last tab
              if (tabs.length === 1) {
                // Don't close the last tab, just navigate to a blank page
                chrome.tabs.update(targetTab.id, { url: "about:blank" }, () => {
                  if (chrome.runtime.lastError) {
                    const errorMsg = `Error navigating tab to blank page: ${chrome.runtime.lastError.message}`;
                    console.error(errorMsg);
                    sendResponse({ message: errorMsg, error: true });
                    chrome.runtime.sendMessage({
                      type: "action_error",
                      error: errorMsg,
                      step: step
                    });
                    return;
                  }
                  
                  const successMsg = "Cleared tab content (cannot close last tab)";
                  chrome.runtime.sendMessage({
                    type: "action_progress",
                    message: successMsg
                  });
                  stepIndex++;
                });
              } else {
                // Close the tab
                chrome.tabs.remove(targetTab.id, () => {
                  if (chrome.runtime.lastError) {
                    const errorMsg = `Error closing tab: ${chrome.runtime.lastError.message}`;
                    console.error(errorMsg);
                    sendResponse({ message: errorMsg, error: true });
                    chrome.runtime.sendMessage({
                      type: "action_error",
                      error: errorMsg,
                      step: step
                    });
                    return;
                  }
                  
                  // Get the current active tab
                  chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                    if (activeTabs && activeTabs.length > 0) {
                      currentTabId = activeTabs[0].id;
                    }
                    
                    const successMsg = `Closed tab: ${targetTab.title || 'Untitled'}`;
                    chrome.runtime.sendMessage({
                      type: "action_progress",
                      message: successMsg
                    });
                    stepIndex++;
                  });
                });
              }
            } else {
              const errorMsg = "Could not find a matching tab to close";
              sendResponse({ message: errorMsg, error: true });
              chrome.runtime.sendMessage({
                type: "action_error",
                error: errorMsg,
                step: step
              });
            }
          });
        } catch (err) {
          const errorMsg = `Error in close_tab: ${err.message}`;
          sendResponse({ message: errorMsg, error: true });
          chrome.runtime.sendMessage({
            type: "action_error",
            error: errorMsg,
            step: step
          });
        }
      } else {
        currentSteps.push(step);
        stepIndex++;
      }
    }

    if (currentSteps.length > 0 && currentTabId) {
      executeStepsInTab(currentTabId, currentSteps, stepIndex - currentSteps.length, steps.length, sendResponse);
    } else if (currentSteps.length > 0) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          executeStepsInTab(tabs[0].id, currentSteps, stepIndex - currentSteps.length, steps.length, sendResponse);
        } else {
          sendResponse({ message: "No active tab found", error: true });
          chrome.runtime.sendMessage({
            type: "action_error",
            error: "No active tab found",
            step: { action: "execute_steps" }
          });
        }
      });
    }

    sendResponse({ message: "Steps dispatched successfully" });
    return true;
  }

  if (message.type === "scroll_down") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => window.scrollBy(0, window.innerHeight)
        }, () => {
          if (chrome.runtime.lastError) {
            sendResponse({ message: "Failed to scroll down", error: true });
            chrome.runtime.sendMessage({
              type: "action_error",
              error: "Failed to scroll down",
              step: { action: "scroll_down" }
            });
          } else {
            sendResponse({ message: "Scrolled down" });
          }
        });
      } else {
        sendResponse({ message: "No active tab found", error: true });
        chrome.runtime.sendMessage({
          type: "action_error",
          error: "No active tab found",
          step: { action: "scroll_down" }
        });
      }
    });
    return true;
  }
});

function executeStepsInTab(tabId, steps, startIndex, totalSteps, parentSendResponse) {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      parentSendResponse({ message: `No tab with ID ${tabId}`, error: true });
      chrome.runtime.sendMessage({
        type: "action_error",
        error: `No tab with ID ${tabId}`,
        step: { action: "execute_steps" }
      });
      return;
    }

    chrome.tabs.onUpdated.addListener(function listener(tabIdUpdated, info) {
      if (tabIdUpdated === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["content.js"]
        }, () => {
          if (chrome.runtime.lastError) {
            parentSendResponse({ message: `Could not inject content.js: ${chrome.runtime.lastError.message}`, error: true });
            chrome.runtime.sendMessage({
              type: "action_error",
              error: `Could not inject content.js: ${chrome.runtime.lastError.message}`,
              step: { action: "execute_steps" }
            });
            return;
          }
          chrome.tabs.sendMessage(tabId, {
            type: "run_steps",
            steps: steps,
            startIndex: startIndex,
            totalSteps: totalSteps
          }, (response) => {
            if (chrome.runtime.lastError) {
              parentSendResponse({ message: `Failed to send steps: ${chrome.runtime.lastError.message}`, error: true });
              chrome.runtime.sendMessage({
                type: "action_error",
                error: `Failed to send steps: ${chrome.runtime.lastError.message}`,
                step: { action: "execute_steps" }
              });
            } else {
              parentSendResponse(response);
            }
          });
        });
      }
    });
  });
}