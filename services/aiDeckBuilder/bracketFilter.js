export function isGameChanger(card, gameChangers) {
  return gameChangers.includes(card.name);
}

export function filterByBracket(cards, bracket, gameChangers) {
  if (bracket >= 4) return cards;
  return cards.filter(c => !isGameChanger(c, gameChangers));
}
