import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = "AQ.Ab8RN6JHGDVr2RCh041Yhtjc237M_fdmyWovMJhuD6OtJ6ipNg";

async function testGeminiAPI() {
  try {
    console.log("Testing Gemini API key...");
    const genAI = new GoogleGenerativeAI(apiKey);

    // Use Gemini 2.5 Pro
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // Try a simple request
    const result = await model.generateContent("Say hello");
    const response = result.response;

    console.log("✅ API key is valid and working!");
    console.log("\nModel response:", response.text());

  } catch (error) {
    const message = error.message || String(error);
    if (message.includes("API key") || message.includes("INVALID_ARGUMENT")) {
      console.log("❌ API key is invalid or expired");
    } else if (message.includes("403") || message.includes("PERMISSION_DENIED")) {
      console.log("❌ API key doesn't have required permissions");
    } else if (message.includes("401") || message.includes("UNAUTHENTICATED")) {
      console.log("❌ Authentication failed");
    } else {
      console.log("❌ Error:", message);
    }
    process.exit(1);
  }
}

testGeminiAPI();
