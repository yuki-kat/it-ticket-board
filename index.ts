import { createGateway, generateText } from "ai";

const gateway = createGateway();

const { text } = await generateText({
  model: gateway("anthropic/claude-haiku-4.5"),
  prompt: "Invent a new holiday and describe its traditions.",
});

console.log(text);
