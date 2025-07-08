chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "run_steps") {
    const steps = message.steps;

    (async () => {
      console.log("📥 content.js received steps:", steps);

      for (const step of steps) {
        console.log("➡️ Executing step:", step);

        if (step.action === "click") {
          const el = document.querySelector(step.selector);
          if (el) el.click();
          else console.warn("⚠️ Click failed. Element not found:", step.selector);
        }

        if (step.action === "type") {
          const el = document.querySelector(step.selector);
          if (el) {
            el.focus();
            el.value = step.text;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            console.warn("⚠️ Type failed. Element not found:", step.selector);
          }
        }

        if (step.action === "wait") {
          const ms = step.ms || 1000;
          console.log(`⏳ Waiting ${ms}ms`);
          await new Promise((res) => setTimeout(res, ms));
        }

        if (step.action === "scroll") {
          const el = document.querySelector(step.selector);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          else console.warn("⚠️ Scroll failed. Element not found:", step.selector);
        }

        if (step.action === "submit") {
          const el = document.querySelector(step.selector);
          if (el) el.submit();
          else console.warn("⚠️ Submit failed. Element not found:", step.selector);
        }

        if (step.action === "press") {
          const el = document.querySelector(step.selector);
          if (el) {
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
          } else {
            console.warn("⚠️ Press failed. Element not found:", step.selector);
          }
        }
      }
    })();
  }
});
