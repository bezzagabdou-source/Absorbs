/**
 * Nexus Chat — GitHub Pages build
 *
 * A fully static chat page. The browser talks straight to a keyless free LLM
 * (Pollinations), so there is no server to keep alive, no tunnel, no cold start.
 * The API endpoint is a single constant: change PROVIDER if it ever stops working.
 */

const PROVIDER = {
  url: "https://text.pollinations.ai/openai",
  models: [
    { id: "openai", name: "OpenAI (مجاني)" },
    { id: "mistral", name: "Mistral (مجاني)" },
    { id: "llama", name: "Llama (مجاني)" },
  ],
};

export function providerUrl() {
  return PROVIDER.url;
}

export default PROVIDER;
