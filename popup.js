const OPENROUTER_API_KEY = "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";

const SYSTEM_PROMPT = `
You are Marin, an AI-powered browser automation assistant. Respond ONLY with a VALID JSON array of actions. DO NOT include markdown, explanations, or comments.

Supported actions:
- {"action": "go_to", "url": "..."}: Navigate to a URL.
- {"action": "wait", "ms": 1000}: Wait for specified milliseconds.
- {"action": "click", "selector": "..."}: Click an element by CSS selector.
- {"action": "type", "selector": "...", "text": "..."}: Type text into an element.
- {"action": "scroll", "selector": "..."}: Scroll to an element.
- {"action": "submit", "selector": "..."}: Submit a form.
- {"action": "press", "selector": "...", "key": "..."}: Press a key on an element.
- {"action": "extract", "query": "..."}: Extract data from the page based on a query.
- {"action": "switch_tab", "tab_id": 0}: Switch to a tab by ID.
- {"action": "close_tab", "tab_id": 0}: Close a tab by ID.
- {"action": "done", "text": "...", "success": true}: Complete the task with a summary.

Rules:
- Always include a {"action": "wait", "ms": 15000} after every "go_to" action for dynamic pages.
- Use precise CSS selectors based on DOM inspection data. Prioritize attributes like id, name, placeholder, aria-label, class, or data-* attributes. For ChatGPT, try selectors like ["textarea#prompt-textarea", "textarea[placeholder*='message']", "textarea[class*='textarea']", "textarea[aria-label*='chat']", "div[contenteditable]"].
- Avoid generic selectors like "button", "input", or "textarea" unless no specific attributes are available.
- Map ambiguous terms to correct URLs (e.g., "chatGpt" to "https://chatgpt.com"). Never use "chrome://" URLs.
- For "switch_tab" and "close_tab", use valid tab IDs from <tabs> context.
- For "extract", return structured data relevant to the query.
- Set "success": false in "done" if the task is incomplete.
- Check for login page elements (e.g., button[data-testid='login-button']) and include a click action if present.

Browser Context:
<current_tab>{{current_tab}}</current_tab>
<tabs>{{tabs}}</tabs>
<page_content>{{page_content}}</page_content>
<dom_inspection>{{dom_inspection}}</dom_inspection>
<screenshots>{{screenshots}}</screenshots>
<task>{{task}}</task>

Example:
[
  {"action": "go_to", "url": "https://chatgpt.com"},
  {"action": "wait", "ms": 15000},
  {"action": "click", "selector": "button[data-testid='login-button']", "if_exists": true},
  {"action": "type", "selector": ["textarea#prompt-textarea", "textarea[placeholder*='message']", "textarea[aria-label*='chat']"], "text": "hello"},
  {"action": "press", "selector": ["textarea#prompt-textarea", "textarea[placeholder*='message']", "textarea[aria-label*='chat']"], "key": "Enter"},
  {"action": "done", "text": "Typed hello in ChatGPT", "success": true}
]
`;

async function getBrowserContext() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "get_browser_context" }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Error getting browser context:", chrome.runtime.lastError.message);
        resolve({
          current_tab: "Unknown",
          tabs: "No tabs available",
          page_content: "No page content available",
          dom_inspection: "No DOM inspection available",
          screenshots: "No screenshots available"
        });
      } else {
        console.log("DOM Inspection:", response.dom_inspection); // Debug log
        resolve(response);
      }
    });
  });
}

async function queryOpenRouter(prompt, model) {
  const browserContext = await getBrowserContext();
  const formattedPrompt = SYSTEM_PROMPT
    .replace("{{current_tab}}", browserContext.current_tab || "Unknown")
    .replace("{{tabs}}", browserContext.tabs || "No tabs available")
    .replace("{{page_content}}", browserContext.page_content || "No page content available")
    .replace("{{dom_inspection}}", browserContext.dom_inspection || "No DOM inspection available")
    .replace("{{screenshots}}", browserContext.screenshots || "No screenshots available")
    .replace("{{task}}", prompt);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: formattedPrompt },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${data.error?.message || response.statusText}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in response");
    }

    return content;
  } catch (err) {
    console.error("Error calling OpenRouter:", err);
    return null;
  }
}

function tryParseJsonArray(raw) {
  try {
    console.log("Raw model result:", raw);
    let cleaned = raw
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\r?\n|\r/g, " ")
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");

    console.log("Cleaned:", cleaned);
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("Parsed result is not a JSON array.");
    return parsed;
  } catch (err) {
    console.warn("Failed to parse JSON:", err);
    return null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const submitBtn = document.getElementById("submitBtn");
  const scrollBtn = document.getElementById("scrollBtn");
  const clearBtn = document.getElementById("clearBtn");
  const pinBtn = document.getElementById("pinBtn");
  const commandInput = document.getElementById("commandInput");
  const modelSelect = document.getElementById("modelSelect");
  const responseOutput = document.getElementById("responseOutput");
  const progressBar = document.getElementById("progressBar");

  if (!submitBtn || !scrollBtn || !clearBtn || !pinBtn || !commandInput || !modelSelect || !responseOutput || !progressBar) {
    console.error("Required DOM elements not found");
    return;
  }

  let isPinned = false;

  pinBtn.addEventListener("click", () => {
    isPinned = !isPinned;
    pinBtn.classList.toggle("active", isPinned);
    pinBtn.querySelector("span").textContent = isPinned ? "Unpin" : "Pin";
    if (isPinned) {
      chrome.runtime.sendMessage({ type: "keep_popup_open" });
    }
  });

  submitBtn.addEventListener("click", async () => {
    const prompt = commandInput.value.trim();
    if (!prompt) {
      responseOutput.textContent = "Please enter a command.";
      responseOutput.classList.add("error");
      progressBar.style.width = "0%";
      return;
    }

    responseOutput.textContent = "Processing...";
    responseOutput.classList.remove("error");
    progressBar.style.width = "10%";

    let actions = null;
    const model = modelSelect.value;

    responseOutput.textContent = `Trying model: ${model}`;
    const result = await queryOpenRouter(prompt, model);
    if (result) {
      actions = tryParseJsonArray(result);
    }

    if (actions) {
      responseOutput.textContent = "Executing actions...";
      progressBar.style.width = "50%";
      chrome.runtime.sendMessage({
        type: "execute_steps",
        steps: actions
      }, (response) => {
        if (chrome.runtime.lastError) {
          responseOutput.textContent = `Error executing actions: ${chrome.runtime.lastError.message}`;
          responseOutput.classList.add("error");
          progressBar.style.width = "0%";
        } else {
          responseOutput.textContent = response.message || "Actions completed!";
          responseOutput.classList.toggle("error", response.error);
          progressBar.style.width = response.error ? "0%" : "100%";
          if (!response.error) {
            commandInput.value = ""; // Clear input on success
          }
        }
      });
    } else {
      responseOutput.textContent = "Failed to generate valid actions. Try rewording your command.";
      responseOutput.classList.add("error");
      progressBar.style.width = "0%";
      console.error("Final failure. Raw output:", result);
    }
  });

  scrollBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "scroll_down" }, (response) => {
      if (chrome.runtime.lastError) {
        responseOutput.textContent = `Error scrolling: ${chrome.runtime.lastError.message}`;
        responseOutput.classList.add("error");
      } else {
        responseOutput.textContent = response.message || "Scrolled down";
        responseOutput.classList.remove("error");
      }
    });
  });

  clearBtn.addEventListener("click", () => {
    commandInput.value = "";
    responseOutput.textContent = "Waiting for input...";
    responseOutput.classList.remove("error");
    progressBar.style.width = "0%";
  });

  commandInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      submitBtn.click();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "progress_update") {
      progressBar.style.width = `${message.progress}%`;
    } else if (message.type === "action_error") {
      responseOutput.textContent = `Error in step "${message.step.action}" on "${message.step.selector || message.step.url || 'N/A'}": ${message.error}\nDOM Inspection: ${message.dom_inspection || 'N/A'}`;
      responseOutput.classList.add("error");
      progressBar.style.width = "0%";
    } else if (message.type === "task_completed") {
      responseOutput.textContent = message.text;
      responseOutput.classList.toggle("error", !message.success);
      progressBar.style.width = message.success ? "100%" : "0%";
      if (message.success) {
        commandInput.value = ""; // Clear input on success
      }
    }
  });
});