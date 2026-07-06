import axios from "axios";
import { config } from "../config.js";

const venice = axios.create({
  baseURL: config.veniceBaseUrl,
  headers: {
    Authorization: `Bearer ${config.veniceApiKey}`,
    "Content-Type": "application/json",
  },
  timeout: 240_000,
});

export async function veniceChat(
  systemPrompt: string,
  userMessage: string,
  model = "llama-3.3-70b"
): Promise<string> {
  const res = await venice.post<{
    choices: Array<{ message: { content: string } }>;
  }>("/chat/completions", {
    model,
    messages: [
      { role: "system",  content: systemPrompt },
      { role: "user",    content: userMessage  },
    ],
  });
  return res.data.choices[0].message.content.trim();
}
