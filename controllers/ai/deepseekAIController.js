import OpenAI from "openai";

const deepseekClient = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

export const generateDeckDeepSeek = async (req, res) => {
  try {
    const { filteredCards, format, colors, prompt } = req.body;
    console.log(req.body);
    
    const promptRes = `
    You are an expert Magic: The Gathering deck builder AI..
    Generate what the user ask from this prompt ${prompt}.
    `;

    const completion = await deepseekClient.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a helpful MTG deck generator." },
        { role: "user", content: promptRes }
      ]
    });
    console.log("test",promptRes);
    res.json({ deck: completion.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate deck via DeepSeek" });
  }
};
