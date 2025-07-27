// API key for OpenRouter
const OPENROUTER_API_KEY = "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";

// Helper function to determine if a message is an automation request
function isAutomationRequest(message) {
  const automationKeywords = [
    /open\s+[\w\s]+(\.com|\.org|\.net|\.io|\.ai|https?:\/\/)/i,
    /go\s+to\s+[\w\s]+(\.com|\.org|\.net|\.io|\.ai|https?:\/\/)/i,
    /navigate\s+to/i,
    /click\s+on/i,
    /type\s+[\w\s]+\s+in/i,
    /fill\s+[\w\s]+\s+form/i,
    /search\s+for\s+[\w\s]+\s+on\s+[\w\s]+(\.com|\.org|\.net|\.io|\.ai)/i,
    /log\s+in\s+to/i,
    /sign\s+in\s+to/i,
    /submit\s+the\s+form/i,
    /scroll\s+down/i,
    /scroll\s+to/i,
    /switch\s+to\s+tab/i,
    /close\s+tab/i,
    /close\s+the\s+current\s+tab/i,
    /press\s+enter/i,
    /press\s+the\s+button/i
  ];
  
  return automationKeywords.some(keyword => keyword.test(message));
}

// Helper function to determine if a message is a data extraction request
function isExtractionRequest(message) {
  const extractionKeywords = [
    /extract\s+data/i,
    /scrape\s+/i,
    /get\s+data\s+from/i,
    /find\s+information\s+about/i,
    /pull\s+data/i,
    /extract\s+information/i,
    /get\s+details\s+about/i,
    /summarize\s+this\s+page/i,
    /what\s+does\s+this\s+page\s+say\s+about/i,
    /what\s+information\s+is\s+on\s+this\s+page/i,
    /tell\s+me\s+about\s+this\s+page/i,
    /analyze\s+this\s+page/i,
    /extract\s+the\s+main\s+points/i
  ];
  
  return extractionKeywords.some(keyword => keyword.test(message));
}

// Helper function to determine if a message is a data extraction request
function isExtractionRequest(message) {
   const extractionKeywords = [
    'extract', 'scrape', 'get data', 'pull data', 'collect data',
    'find information', 'gather information', 'extract information',
    'what does this page say about', 'what information is on this page about',
    'summarize this page', 'get details about'
  ];
  
  const lowerMessage = message.toLowerCase();
  return extractionKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

// Helper function to determine if a message is a browser automation request
function isAutomationRequest(message) {
  const automationKeywords = [
    'go to', 'navigate to', 'open', 'click', 'type', 'fill', 'submit',
    'search for', 'find', 'scroll', 'press', 'automate', 'perform',
    'can you', 'please', 'help me', 'I want to', 'I need to',
    'switch tab', 'close tab', 'refresh', 'back', 'forward'
  ];
  
  const lowerMessage = message.toLowerCase();
  return automationKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

// Unified system prompt for both chat and automation
const UNIFIED_SYSTEM_PROMPT = `You are Marin, an intelligent AI assistant in a Chrome extension that can both have conversations and automate browser tasks based on user requests.

You can see the current browser context, including the URL, title, and content of the active tab. Use this information to provide relevant answers and actions.

When the user asks for browser automation (like opening websites, searching, clicking, filling forms), you MUST generate a JSON array of actions. When they ask general questions or want to extract data from the current page, respond conversationally.

IMPORTANT: For browser automation requests, you MUST ONLY respond with a valid JSON array of actions. Do not include any explanatory text, markdown formatting, or code blocks around the JSON. The response must be a raw JSON array that can be parsed directly.

Supported browser automation actions:
- go_to: Navigate to a URL. Params: url (string) - Can be a domain name or full URL
- click: Click on an element. Params: selector (string) - CSS selector for the element to click
- type: Type text into an input field. Params: selector (string), text (string)
- submit: Submit a form. Params: selector (string) - CSS selector for the form
- extract: Extract data from the page. Params: query (string) - What to extract
- scroll: Scroll the page. Params: direction ("up" or "down"), amount (optional, number)
- wait: Wait for a specified time. Params: ms (number) - Milliseconds to wait
- press: Press a keyboard key. Params: selector (string), key (string, e.g., "Enter", "Tab", "ArrowDown")
- switch_tab: Switch to another tab. Params: url (string) or title (string) or index (number)
- close_tab: Close a tab. Params: url (string) or title (string) or index (number)
- done: Indicate that the task is complete. Params: text (string) - Summary of what was accomplished, success (boolean, default true)

Rules for automation:
1. ALWAYS return message of progress , talk naturally.
2. Start with understanding the current page context.
3. Include a "done" action at the end with a summary of what was accomplished.
4. Keep the sequence of actions minimal and efficient.
5. ALWAYS use proper JSON format with double quotes around property names and string values.
6. For selectors, prefer IDs (#element-id) and specific classes (.specific-class) over generic tags.
7. If you're unsure about a selector, use more general selectors or include multiple actions with different selector attempts.
8. For navigation, you can use domain names without http/https (e.g., "example.com").
9. When clicking or typing, always wait for the page to load completely first.
10. For complex tasks, break them down into smaller, sequential steps.
11. NEVER include any text, explanations, or code blocks around the JSON array.
12. Your response for automation requests must be ONLY the JSON array, nothing else.

Example automation output format:
[
  {"action": "go_to", "url": "example.com"},
  {"action": "wait", "ms": 2000},
  {"action": "click", "selector": "#search-input"},
  {"action": "type", "selector": "#search-input", "text": "search query"},
  {"action": "press", "selector": "#search-input", "key": "Enter"},
  {"action": "wait", "ms": 3000},
  {"action": "click", "selector": ".result-item:first-child"},
  {"action": "done", "text": "Searched for 'search query' on example.com and clicked the first result.", "success": true}
]

For data extraction requests:
1. When asked to extract or scrape data, I will analyze the current page content.
2. I'll provide structured information from the page in a clear, organized format.
3. For complex data, I'll use tables or lists to organize the information.
4. I'll summarize key points when the extracted data is extensive.

For general questions or data extraction requests, respond conversationally and helpfully.
`;

// Function to get browser context
async function getBrowserContext() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "get_browser_context" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting browser context:", chrome.runtime.lastError);
        resolve({
          url: "Unknown",
          title: "Unknown",
          content: "Could not retrieve page content"
        });
        return;
      }
      
      // Extract the URL and title from the current_tab string
      let url = "Unknown";
      let title = "Unknown";
      
      if (response.current_tab) {
        const match = response.current_tab.match(/Tab \d+: (.*?) - (.*)/);
        if (match) {
          url = match[1];
          title = match[2];
        }
      }
      
      resolve({
        url: url,
        title: title,
        content: response.page_content?.substring(0, 2000) || "No content available",
        dom: response.dom_inspection || "No DOM inspection available"
      });
    });
  });
}

// Unified function to query OpenRouter API for both chat and automation
async function queryUnifiedOpenRouter(prompt, model, history = [], customTemperature = null) {
  try {
    const context = await getBrowserContext();
    
    const messages = [
      {
        role: "system",
        content: UNIFIED_SYSTEM_PROMPT + "\n\nCurrent browser context:\n" + 
                 `URL: ${context.url}\n` +
                 `Title: ${context.title}\n` +
                 (context.content ? `Content preview: ${context.content}` : "")
      },
      ...history,
      { role: "user", content: prompt }
    ];
    
    // Use custom temperature if provided, otherwise adjust based on request type
    let temperature;
    if (customTemperature !== null) {
      temperature = customTemperature;
    } else {
      // Adjust temperature based on whether it looks like an automation request
      const isAutomation = isAutomationRequest(prompt);
      temperature = isAutomation ? 0.2 : 0.7; // Lower for automation, higher for chat
    }
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://github.com/yourusername/marin-extension",
        "X-Title": "Marin Browser Assistant"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: 1500
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error("OpenRouter API error:", data.error);
      return `Error: ${data.error.message || "Unknown error"}`;
    }
    
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error querying OpenRouter API:", error);
    return `Error: ${error.message}`;
  }
}

// Function to extract data from web pages
async function extractWebData(query) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: "extract_data",
      query: query,
      content: "Use the current page content"
    }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

// Execute browser automation actions
async function executeBrowserActions(actions) {
  return new Promise((resolve) => {
    // Validate actions before sending
    if (!Array.isArray(actions) || actions.length === 0) {
      console.error("Invalid actions format:", actions);
      resolve({
        success: false,
        message: "Error: Invalid actions format. Expected non-empty array."
      });
      return;
    }
    
    // Log the actions being executed
    console.log("Executing browser actions:", JSON.stringify(actions, null, 2));
    
    // Send the actions to the background script
    chrome.runtime.sendMessage({
      type: "execute_steps",
      steps: actions
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error executing actions:", chrome.runtime.lastError);
        resolve({
          success: false,
          message: `Error executing actions: ${chrome.runtime.lastError.message}`
        });
      } else if (response.error) {
        console.error("Error in action execution:", response.error);
        resolve({
          success: false,
          message: response.message || `Error: ${response.error}`
        });
      } else {
        console.log("Actions completed successfully:", response);
        resolve({
          success: true,
          message: response.message || "Actions completed successfully!"
        });
      }
    });
  });
}

function tryParseJsonArray(raw) {
  try {
    console.log("Raw model result:", raw);
    
    // First try to parse the entire string as JSON
    try {
      const directParse = JSON.parse(raw);
      if (Array.isArray(directParse)) {
        console.log("Direct JSON parse successful");
        return directParse;
      }
    } catch (directErr) {
      console.log("Direct parse failed, trying with cleaning", directErr);
    }
    
    // If direct parsing fails, try cleaning the string
    let cleaned = raw
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .replace(/[â€œâ€]/g, '"')
      .replace(/[â€˜â€™]/g, "'")
      .replace(/\r?\n|\r/g, " ")
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");

    console.log("Cleaned:", cleaned);
    
    // Try to extract JSON array from the cleaned text
    const arrayMatch = cleaned.match(/\[\s*\{.*\}\s*\]/s);
    if (arrayMatch) {
      const extractedArray = arrayMatch[0];
      console.log("Extracted array:", extractedArray);
      const parsed = JSON.parse(extractedArray);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    
    // If no array found, try parsing the whole cleaned string
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("Parsed result is not a JSON array.");
    return parsed;
  } catch (err) {
    console.warn("Failed to parse JSON:", err);
    return null;
  }
}

// Detect if we're running in a side panel or popup context
function detectContext() {
  // Check if we're in a side panel (typically wider and taller)
  const isSidePanel = window.innerWidth > 450 || window.innerHeight > 650;
  document.body.classList.toggle('side-panel', isSidePanel);
  document.body.classList.toggle('popup', !isSidePanel);
  
  // Adjust UI based on context
  if (isSidePanel) {
    // In side panel mode, we can show more content
    document.body.style.width = '100%';
    document.body.style.height = '100vh';
  } else {
    // In popup mode, we keep it compact
    document.body.style.width = '400px';
    document.body.style.height = '600px';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Detect context on load
  detectContext();
  
  // Also detect on resize
  window.addEventListener('resize', detectContext);
  
  // Unified interface elements
  const chatInput = document.getElementById('chatInput');
  const chatSubmitBtn = document.getElementById('chatSubmitBtn');
  const chatContainer = document.getElementById('chatContainer');
  const modelSelect = document.getElementById('modelSelect');
  const scrollBtn = document.getElementById('scrollBtn');
  const clearBtn = document.getElementById('clearBtn');
  const pinBtn = document.getElementById('pinBtn');
  const progressBar = document.getElementById('progressBar');
  
  // Store chat history
  let chatHistory = [];
  
  // Function to add a message to the chat UI
  function addMessageToChat(message, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    
    // Format the message with proper line breaks and links
    if (isUser) {
      messageDiv.textContent = message;
    } else {
      // Convert URLs to clickable links
      const formattedMessage = message.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank">$1</a>'
      );
      messageDiv.innerHTML = formattedMessage.replace(/\n/g, '<br>');
    }
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = 'Just now';
    messageDiv.appendChild(timeDiv);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Update chat history for context
    chatHistory.push({
      role: isUser ? 'user' : 'assistant',
      content: message
    });
    
    // Keep chat history at a reasonable size
    if (chatHistory.length > 10) {
      chatHistory = chatHistory.slice(chatHistory.length - 10);
    }
  }
  
  // Function to show progress in the chat
  function showProgress(progress) {
    progressBar.style.width = `${progress}%`;
  }
  
  // Function to add a system message to the chat
  function addSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message system-message';
    messageDiv.textContent = message;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Remove system messages after a delay
    setTimeout(() => {
      try {
        chatContainer.removeChild(messageDiv);
      } catch (e) {
        // Message might have been removed already
      }
    }, 5000);
  }
  
  // Handle unified message submission
  chatSubmitBtn.addEventListener('click', async () => {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addMessageToChat(message, true);
    chatInput.value = '';
    showProgress(10);
    
    // Determine the type of request
    const isExtraction = isExtractionRequest(message);
    const isAutomation = isAutomationRequest(message);
    
    try {
      if (isExtraction) {
        // Web scraping request
        addSystemMessage('Extracting data from the current page...');
        showProgress(30);
        
        const extractionResult = await extractWebData(message);
        showProgress(100);
        
        // Format and display the extraction result
        let responseText;
        if (extractionResult.error) {
          responseText = `Sorry, I couldn't extract the data: ${extractionResult.error}`;
        } else {
          responseText = `Here's what I found about your query:\n\n${extractionResult.answer || JSON.stringify(extractionResult, null, 2)}`;
        }
        
        addMessageToChat(responseText);
      } else if (isAutomation) {
        // Browser automation request
        addSystemMessage('Processing automation request...');
        showProgress(30);
        
        // Get AI response with potential actions
        const model = modelSelect.value;
        // Use a lower temperature for automation requests for more precise responses
        const aiResponse = await queryUnifiedOpenRouter(message, model, chatHistory, 0.2);
        showProgress(60);
        
        // Try to parse JSON actions from the response
        const actions = tryParseJsonArray(aiResponse);
        
        if (actions) {
          // Execute the actions
          addSystemMessage('Executing browser actions...');
          
          // Add the AI response to chat history
          chatHistory.push({
            role: 'assistant',
            content: `I'll help you with that. Here's what I'm going to do:\n\n${actions.map(a => `- ${a.action}: ${a.action === 'go_to' ? a.url : a.action === 'click' ? a.selector : a.action === 'done' ? a.text : JSON.stringify(a)}`).join('\n')}`
          });
          
          // Execute the actions
          const result = await executeBrowserActions(actions);
          showProgress(result.success ? 100 : 50);
          
          if (result.success) {
            // Add the result to the chat
            const doneAction = actions.find(a => a.action === 'done');
            const responseText = doneAction?.text || result.message;
            addMessageToChat(responseText);
          } else {
            // If execution failed, retry as a regular chat message
            addSystemMessage(`Error executing actions: ${result.message}. Retrying as a regular chat message...`);
            
            // Retry as a regular chat message with higher temperature
            const response = await queryUnifiedOpenRouter(
              `I tried to ${message}, but it failed with error: ${result.message}. Please provide a different approach or explain what might be wrong.`, 
              model, 
              chatHistory,
              0.7
            );
            showProgress(100);
            addMessageToChat(response);
          }
        } else {
          // Failed to parse actions
          showProgress(50);
          addSystemMessage('Failed to parse automation actions. Retrying as a regular chat message...');
          
          // Add the raw AI response to chat history so the model knows what it generated
          chatHistory.push({
            role: 'assistant',
            content: aiResponse
          });
          
          // Retry as a regular chat message
          const response = await queryUnifiedOpenRouter(
            `I asked you to ${message}, but you didn't provide a valid JSON array of actions. Please try again with proper JSON format or explain why this can't be automated.`,
            model, 
            chatHistory,
            0.7
          );
          showProgress(100);
          addMessageToChat(response);
        }
      } else {
        // Regular chat message
        const model = modelSelect.value;
        showProgress(50);
        const response = await queryUnifiedOpenRouter(message, model, chatHistory);
        showProgress(100);
        addMessageToChat(response);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      showProgress(0);
      addMessageToChat(`Sorry, an error occurred: ${error.message}. Please try again.`);
    }
  });
  
  // Handle Enter key in chat input
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatSubmitBtn.click();
    }
  });
  
  // Handle scroll button
  scrollBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'scroll_down' }, (response) => {
      if (chrome.runtime.lastError) {
        addSystemMessage(`Error scrolling: ${chrome.runtime.lastError.message}`);
      } else {
        addSystemMessage(response.message || 'Scrolled down');
      }
    });
  });
  
  // Handle clear button
  clearBtn.addEventListener('click', () => {
    // Clear the chat input
    chatInput.value = '';
    
    // Clear the chat history (but keep the initial AI greeting)
    while (chatContainer.children.length > 1) {
      chatContainer.removeChild(chatContainer.lastChild);
    }
    
    // Reset chat history
    chatHistory = [];
    
    // Reset progress bar
    showProgress(0);
  });
  
  // Handle pin button
  let isPinned = false;
  pinBtn.addEventListener('click', () => {
    isPinned = !isPinned;
    pinBtn.classList.toggle('active', isPinned);
    pinBtn.querySelector('span').textContent = isPinned ? 'Unpin' : 'Pin';
    if (isPinned) {
      chrome.runtime.sendMessage({ type: 'keep_popup_open' });
    }
  });

  // Listen for progress updates from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "progress_update") {
      showProgress(message.progress);
      
      if (message.progress === 100) {
        // Reset progress after a delay
        setTimeout(() => {
          showProgress(0);
        }, 2000);
      }
    } else if (message.type === "action_error") {
      addSystemMessage(`Error: ${message.error}`);
      showProgress(0);
    } else if (message.type === "action_result") {
      // Add the result to the chat
      addMessageToChat(message.result);
    } else if (message.type === "task_completed") {
      const responseText = message.text;
      addMessageToChat(responseText);
      showProgress(message.success ? 100 : 0);
    }
  });
  
  // These helper functions (isAutomationRequest, isExtractionRequest, and executeBrowserActions) 
  // are already defined earlier in the file, so we don't need to redefine them here.
});
