import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Prompt builder for different use cases
function buildPromptByType({
  type,
  prompt,
  theme,
  commander,
  format,
  budgetLimit,
  decklist,
  colorIdentity,
}) {
  switch (type) {
    case 'deck':
      return {
        system: `You are a Magic: The Gathering deck builder. Build ${format || 'EDH'} decks with 1 commander and 99 cards.`,
        user: `Build a ${theme || ''} deck${commander ? ` with commander ${commander}` : ''}. ${prompt}`,
      };

    case 'combo':
      return {
        system: `You are an MTG combo finder. Suggest card combos based on strategy or color.`,
        user: `Find combos in ${format || 'EDH'} that match: ${prompt}`,
      };

    case 'synergy':
      return {
        system: `You are an MTG synergy expert.`,
        user: `Find synergy cards for ${commander || theme || format}. ${prompt}`,
      };

    case 'card-search':
      return {
        system: `You are an MTG card search engine.`,
        user: `Suggest cards that match this description: ${prompt}`,
      };

    case 'upgrade':
      return {
        system: `You are an MTG deck upgrader.`,
        user: `Given this decklist, suggest upgrades. Prompt: ${prompt}\nDeck:\n${decklist}`,
      };

    case 'commander-pick':
      return {
        system: `You are an MTG commander selector.`,
        user: `Suggest commanders for this playstyle: ${prompt} ${theme ? `Theme: ${theme}` : ''}`,
      };

    case 'tech':
      return {
        system: `You are a meta tech expert.`,
        user: `Suggest anti-meta cards for ${prompt}`,
      };

    case 'mana-base':
      return {
        system: `You are an MTG mana base optimizer.`,
        user: `Build a mana base for colors: ${colorIdentity?.join(', ') || prompt}`,
      };

    case 'budget':
      return {
        system: `You are a budget MTG deck builder.`,
        user: `Build a deck for theme "${theme}" with a maximum budget of $${budgetLimit}. ${prompt}`,
      };

    case 'cut-cards':
      return {
        system: `You help trim and optimize decklists.`,
        user: `Suggest 10 cards to cut from the following deck:\n${decklist}`,
      };

    case 'win-condition':
      return {
        system: `You are an MTG win-con advisor.`,
        user: `Suggest win conditions for a ${theme || commander || format} deck. ${prompt}`,
      };

    default:
      return {
        system: `You are an MTG assistant.`,
        user: `Respond to: ${prompt}`,
      };
  }
}

// Controller handler
const generateDeck = async (req, res) => {
  const {
    type,
    prompt,
    theme,
    commander,
    format,
    budgetLimit,
    decklist,
    colorIdentity,
  } = req.body;

  if (!type || !prompt) {
    return res.status(400).json({ error: 'Missing required fields: type and prompt' });
  }

  const { system, user } = buildPromptByType({
    type,
    prompt,
    theme,
    commander,
    format,
    budgetLimit,
    decklist,
    colorIdentity,
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    res.json({ result: content });
  } catch (error) {
    console.error('Error generating AI response:', error);
    res.status(500).json({ error: 'Failed to process request', details: error.message });
  }
};

export default generateDeck;
