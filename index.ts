import { createGateway, generateText } from "ai";

const gateway = createGateway();

const { text } = await generateText({
  model: gateway("moonshotai/kimi-k3"),
  prompt: "Invent a new holiday and describe its traditions.",
});

console.log(text);
