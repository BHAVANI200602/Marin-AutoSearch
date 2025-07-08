chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "execute_steps") {
    const steps = message.steps;

    const groupedSteps = [];
    let currentGroup = null;

    for (const step of steps) {
      if (step.action === "go_to") {
        currentGroup = { goTo: step, followUps: [] };
        groupedSteps.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.followUps.push(step);
      }
    }

    for (const group of groupedSteps) {
      try {
        const url = new URL(group.goTo.url);

        chrome.tabs.create({ url: url.toString() }, (tab) => {
          if (!tab || !tab.id) {
            console.warn("❌ Failed to create tab or retrieve tab ID.");
            return;
          }

          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);

              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["content.js"]
              }, () => {
                if (chrome.runtime.lastError) {
                  console.warn("⚠️ Could not inject content.js:", chrome.runtime.lastError.message);
                  return;
                }

                // Inject a wait if needed
                if (
                  group.followUps.length > 0 &&
                  group.followUps[0].action !== "wait"
                ) {
                  group.followUps.unshift({ action: "wait", ms: 3000 });
                }

                chrome.tabs.sendMessage(tab.id, {
                  type: "run_steps",
                  steps: group.followUps
                });
              });
            }
          });
        });
      } catch (err) {
        console.warn("❌ Invalid URL in go_to step:", group.goTo.url);
      }
    }
  }
});
