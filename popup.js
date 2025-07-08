const OPENROUTER_API_KEY = "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";

async function queryOpenRouter(prompt, model = "meta-llama/llama-3-70b-instruct") {
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
          content: `You are a strict JSON-only web automation assistant.
Respond ONLY with a valid JSON array of actions. DO NOT include explanations, markdown, or comments. Use double quotes only.

Supported actions:
- "go_to": { "url": "..." }
- "click": { "selector": "..." }
- "type": { "selector": "...", "text": "..." }
- "wait": { "ms": 1000 }
- "scroll": { "selector": "..." }
- "submit": { "selector": "..." }
- "press_enter": { "selector": "..." }
- "press": { "selector": "...", "key": "..." }

⚠️ Important: For sites like Google or YouTube, include a "wait" action (2000–3000ms) after "go_to" to ensure elements have loaded before typing or clicking.

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
  return data?.choices?.[0]?.message?.content || "No response.";
}

function tryParseJsonArray(raw) {
  try {
    let cleaned = raw.trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]") + 1;
    if (start < 0 || end <= start) throw new Error("Response does not contain a valid JSON array.");

    cleaned = cleaned.slice(start, end)
      .replace(/```(?:json)?/gi, "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\r?\n|\r/g, " ")
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");

    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("❌ Failed to parse JSON:", err);
    return null;
  }
}

document.getElementById("submitBtn").addEventListener("click", async () => {
  const input = document.getElementById("commandInput").value;
  const outputBox = document.getElementById("responseOutput");

  outputBox.textContent = "🧠 Thinking...";

  let result = await queryOpenRouter(input);
  let actions = tryParseJsonArray(result);

  if (!actions) {
    outputBox.textContent = "⏳ Retrying with fallback model...";
    result = await queryOpenRouter(input, "openchat/openchat-3.5-1210");
    actions = tryParseJsonArray(result);
  }

  if (actions) {
    outputBox.textContent = "✅ Actions ready!";
    chrome.runtime.sendMessage({ type: "execute_steps", steps: actions });
  } else {
    outputBox.textContent = "⚠️ Final JSON Parse Error. Please try rewording the prompt.";
  }
});
