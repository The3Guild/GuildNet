import { veniceChat } from "./venice.js";

const SYSTEM = `You are a frontend engineer. Your ONLY job is to output a complete, working HTML file.

CRITICAL: Start your response with <!DOCTYPE html> — nothing before it. No explanation, no markdown, no text.

The HTML file must:
- Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Be a fully interactive UI with dark theme (bg-gray-950 or bg-zinc-950)
- Include ALL screens as tab-switchable sections using vanilla JS
- Have working buttons, forms, modals, hover effects — all with JavaScript
- Use realistic placeholder data (product names, prices, user names, descriptions)
- Look exactly like a real deployed product — not a wireframe, not a mockup
- Use gradients, shadows, rounded corners, proper spacing
- Replace images with colored gradient divs or SVG icons

Output format — MUST start exactly like this:
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
...`;

export async function runDesign(taskDescription: string, context = ""): Promise<string> {
  const prompt = `Build the UI for: ${taskDescription}${context ? `\n\nContext: ${context.slice(0, 500)}` : ""}`;
  const raw = await veniceChat(SYSTEM, prompt, "mistral-small-3-2-24b-instruct");

  // If model still returns non-HTML, extract HTML block or wrap it
  const cleaned = raw.replace(/^```html\n?/i, "").replace(/^```\n?/, "").replace(/```$/, "").trim();

  if (cleaned.startsWith("<!DOCTYPE") || cleaned.startsWith("<html")) {
    return cleaned;
  }

  // Extract HTML block if buried in text
  const htmlMatch = cleaned.match(/<!DOCTYPE[\s\S]*<\/html>/i) ?? cleaned.match(/<html[\s\S]*<\/html>/i);
  if (htmlMatch) return htmlMatch[0];

  // Last resort: wrap whatever came back in a minimal HTML shell with Tailwind
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<title>Design Preview</title>
</head>
<body class="bg-zinc-950 text-white min-h-screen p-8">
<div class="max-w-4xl mx-auto">
${cleaned}
</div>
</body>
</html>`;
}
