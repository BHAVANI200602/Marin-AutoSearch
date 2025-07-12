const OPENROUTER_API_KEY = "Paste your OpenRouter API key here idiot :)";

const models = [
  "meta-llama/llama-3-70b-instruct",
  "openchat/openchat-3.5-1210",
  "gryphe/mythomax-l2-13b",
  "nousresearch/nous-capybara-7b"
];

async function queryOpenRouter(prompt, model) {
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
          {
            role: "system",
            content: `You are a JSON-only web automation assistant.

⚠️ STRICT RULE:
Respond ONLY with a VALID JSON array. DO NOT include:
- markdown (like \`\`\`json)
- explanations
- comments
- surrounding text

Just return: [ {...}, {...} ]

If unsure, return: []

Supported actions:
- "go_to": { "url": "..." }
- "click": { "selector": "..." }
- "type": { "selector": "...", "text": "..." }
- "wait": { "ms": 1000 }
- "scroll": { "selector": "..." }
- "submit": { "selector": "..." }
- "press_enter": { "selector": "..." }
- "press": { "selector": "...", "key": "..." }

⚠️ Always include a wait after "go_to" (2000–3000ms) for dynamic pages.

Example:
[
  { "action": "go_to", "url": "https://www.google.com" },
  { "action": "wait", "ms": 3000 },
  { "action": "type", "selector": "input[name='q']", "text": "Marin extension test" },
  { "action": "press_enter", "selector": "input[name='q']" }
]`
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("No content in response:", data);
      return null;
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

document.getElementById("submitBtn").addEventListener("click", async () => {
  const input = document.getElementById("commandInput").value;
  const outputBox = document.getElementById("responseOutput");

  outputBox.textContent = "Thinking...";

  let actions = null;
  let result = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    outputBox.textContent = `Trying: ${model}`;
    result = await queryOpenRouter(input, model);
    if (result) {
      actions = tryParseJsonArray(result);
      if (actions) break; // success
    }
  }

  if (actions) {
    outputBox.textContent = "Actions ready!";
    chrome.runtime.sendMessage({ type: "execute_steps", steps: actions });
  } else {
    outputBox.textContent = "All models failed. Try rewording your command.";
    console.error("Final failure. Raw output:", result);
  }
});
