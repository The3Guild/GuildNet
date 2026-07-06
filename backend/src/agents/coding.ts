import { veniceChat } from "./venice.js";

const SYSTEM = `You are a senior fullstack engineer. Your ONLY output is a single complete HTML file that works by opening it in a browser — no build step, no npm, no server required.

CRITICAL: Start your response with <!DOCTYPE html> — nothing before it. No explanation, no markdown.

The HTML file must:
- Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Use Alpine.js via CDN for reactivity: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
- Be fully functional — forms submit (show success), buttons work, navigation works, modals open/close
- Have ALL pages/sections accessible via a navigation bar
- Use realistic placeholder data (product names, prices, user data, etc.)
- Dark theme: bg-zinc-950 or bg-gray-950
- Look like a real deployed product — not a mockup
- Include CRUD operations using localStorage for data persistence
- For e-commerce: working cart (add/remove/total), product grid, checkout form
- For dashboards: charts using vanilla JS canvas, live-updating stats
- For auth flows: login/signup forms with validation (store in localStorage)
- Replace all images with colored gradient divs or inline SVG icons

Output format — start EXACTLY like this, nothing before:
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>App</title>
<script src="https://cdn.tailwindcss.com"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>`;

export async function runCoding(taskDescription: string, context = ""): Promise<string> {
  const prompt = `Build this as a complete single-file HTML app: ${taskDescription}${context ? `\n\nContext: ${context.slice(0, 500)}` : ""}`;
  const raw = await veniceChat(SYSTEM, prompt, "mistral-small-3-2-24b-instruct");

  // Clean markdown fences
  const cleaned = raw.replace(/^```html\n?/i, "").replace(/^```\n?/, "").replace(/```$/, "").trim();

  if (cleaned.startsWith("<!DOCTYPE") || cleaned.startsWith("<html")) return cleaned;

  // Extract HTML block if buried in text
  const htmlMatch = cleaned.match(/<!DOCTYPE[\s\S]*<\/html>/i) ?? cleaned.match(/<html[\s\S]*<\/html>/i);
  if (htmlMatch) return htmlMatch[0];

  // Wrap in shell
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>App</title>
<script src="https://cdn.tailwindcss.com"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body class="bg-zinc-950 text-white min-h-screen p-8">
<div class="max-w-5xl mx-auto">
${cleaned}
</div>
</body>
</html>`;
}
