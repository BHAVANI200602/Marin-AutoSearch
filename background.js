const OPENROUTER_API_KEY = "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";

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
      const result = await extractData(message.query, message.content);
      sendResponse(result);
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
      if (step.action === "go_to") {
        if (currentSteps.length > 0 && currentTabId) {
          executeStepsInTab(currentTabId, currentSteps, stepIndex, steps.length, sendResponse);
          currentSteps = [];
        }
        try {
          const url = new URL(step.url);
          if (url.protocol === "chrome:") {
            sendResponse({ message: `Cannot access chrome:// URLs: ${step.url}`, error: true });
            chrome.runtime.sendMessage({
              type: "action_error",
              error: `Cannot access chrome:// URLs: ${step.url}`,
              step: step
            });
            return;
          }
          chrome.tabs.create({ url: url.toString() }, (tab) => {
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
            currentSteps.push({ action: "wait", ms: 15000 });
            stepIndex += 2;
          });
        } catch (err) {
          sendResponse({ message: `Invalid URL: ${step.url}`, error: true });
          chrome.runtime.sendMessage({
            type: "action_error",
            error: `Invalid URL: ${step.url}`,
            step: step
          });
          return;
        }
      } else if (step.action === "switch_tab") {
        chrome.tabs.get(step.tab_id, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            sendResponse({ message: `No tab with ID ${step.tab_id}`, error: true });
            chrome.runtime.sendMessage({
              type: "action_error",
              error: `No tab with ID ${step.tab_id}`,
              step: step
            });
            return;
          }
          chrome.tabs.update(step.tab_id, { active: true }, (tab) => {
            if (chrome.runtime.lastError) {
              sendResponse({ message: `Failed to switch to tab ${step.tab_id}`, error: true });
              chrome.runtime.sendMessage({
                type: "action_error",
                error: `Failed to switch to tab ${step.tab_id}`,
                step: step
              });
              return;
            }
            currentTabId = tab.id;
            sendResponse({ message: `Switched to tab ${step.tab_id}` });
            stepIndex++;
          });
        });
      } else if (step.action === "close_tab") {
        chrome.tabs.get(step.tab_id, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            sendResponse({ message: `No tab with ID ${step.tab_id}`, error: true });
            chrome.runtime.sendMessage({
              type: "action_error",
              error: `No tab with ID ${step.tab_id}`,
              step: step
            });
            return;
          }
          chrome.tabs.remove(step.tab_id, () => {
            if (chrome.runtime.lastError) {
              sendResponse({ message: `Failed to close tab ${step.tab_id}`, error: true });
              chrome.runtime.sendMessage({
                type: "action_error",
                error: `Failed to close tab ${step.tab_id}`,
                step: step
              });
              return;
            }
            sendResponse({ message: `Closed tab ${step.tab_id}` });
            stepIndex++;
          });
        });
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