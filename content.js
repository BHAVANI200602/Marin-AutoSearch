async function waitForSelector(selector, timeout = 30000) {
  const start = Date.now();
  const selectors = Array.isArray(selector) ? selector : [selector];
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      const element = document.querySelector(sel);
      if (element) {
        return element;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Element not found: ${selectors.join(", ")}`);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "run_steps") {
    const steps = message.steps;
    const startIndex = message.startIndex || 0;
    const totalSteps = message.totalSteps || steps.length;
    let hasError = false;

    (async () => {
      console.log("📥 content.js received steps:", steps);

      try {
        await waitForDocumentComplete();
        console.log("✅ Document is fully loaded");
      } catch (err) {
        console.warn("⚠️ Document load timeout:", err.message);
        chrome.runtime.sendMessage({
          type: "action_error",
          error: err.message,
          step: { action: "document_load" }
        });
        sendResponse({ message: "Document load failed", error: true });
        return;
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log("➡️ Executing step:", step);

        try {
          if (step.action === "click") {
            const el = await waitForSelector(step.selector);
            el.click();
            console.log(`✅ Clicked element: ${step.selector}`);
          } else if (step.action === "type") {
            const el = await waitForSelector(step.selector);
            el.focus();
            el.value = step.text;
            el.dispatchEvent(new Event("input", { bubbles: true }));
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
          } else if (step.action === "press") {
            const el = await waitForSelector(step.selector);
            el.focus();
            el.dispatchEvent(new KeyboardEvent("keydown", {
              key: step.key || "Enter",
              code: step.key || "Enter",
              bubbles: true
            }));
            el.dispatchEvent(new KeyboardEvent("keyup", {
              key: step.key || "Enter",
              code: step.key || "Enter",
              bubbles: true
            }));
            console.log(`✅ Pressed key "${step.key}" on: ${step.selector}`);
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
            error: err.message,
            step: step
          });
          hasError = true;
        }
      }

      sendResponse({ message: "Steps execution completed", error: hasError });
    })();

    return true;
  }
});