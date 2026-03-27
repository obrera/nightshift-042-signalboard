const POSITIVE_WORDS = ['surge', 'gain', 'breakthrough', 'improve', 'record', 'win', 'growth', 'launch', 'funding'];
const NEGATIVE_WORDS = ['breach', 'drop', 'decline', 'lawsuit', 'outage', 'hack', 'crash', 'layoff', 'fraud', 'delay'];
const URGENT_WORDS = ['urgent', 'alert', 'warning', 'exploit', 'breach', 'outage', 'ban', 'recall', 'lawsuit', 'hack'];
const MODERATE_WORDS = ['investigation', 'policy', 'leak', 'shift', 'volatility', 'risk', 'pressure', 'debate'];

function countMatches(text: string, words: string[]) {
  const value = text.toLowerCase();
  return words.reduce((total, word) => total + (value.includes(word) ? 1 : 0), 0);
}

export function scoreSentiment(title: string) {
  const positiveHits = countMatches(title, POSITIVE_WORDS);
  const negativeHits = countMatches(title, NEGATIVE_WORDS);
  const score = Math.max(-5, Math.min(5, positiveHits * 2 - negativeHits * 2));

  if (score > 1) {
    return { score, label: 'Positive' as const };
  }

  if (score < -1) {
    return { score, label: 'Negative' as const };
  }

  return { score, label: 'Neutral' as const };
}

export function scoreUrgency(title: string) {
  const urgentHits = countMatches(title, URGENT_WORDS);
  const moderateHits = countMatches(title, MODERATE_WORDS);
  const score = Math.max(1, Math.min(10, 1 + urgentHits * 3 + moderateHits * 2));

  if (score >= 7) {
    return { score, label: 'High' as const };
  }

  if (score >= 4) {
    return { score, label: 'Moderate' as const };
  }

  return { score, label: 'Low' as const };
}
