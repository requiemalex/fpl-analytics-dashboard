/**
 * Help's topics (<help_guides>), in the order they're listed when nothing
 * is typed. A second source's topic, unknown here, goes before The app.
 */
export const TOPIC = {
  numbers: "Reading the numbers",
  finding: "Finding players",
  fixtures: "Fixtures & gameweeks",
  dashboard: "Dashboard",
  tables: "Player & Team Explorer",
  teams: "Teams",
  profiles: "Player Profile",
  comparison: "Player Comparison",
  building: "Team Building",
  app: "The app",
} as const;

const ORDER: string[] = Object.values(TOPIC);

/** Topics in listing order: known ones as above, any others (a second source's) just before The app. */
export function sortTopics(topics: string[]): string[] {
  const rank = (t: string) => {
    const i = ORDER.indexOf(t);
    return i >= 0 ? (t === TOPIC.app ? ORDER.length + 1 : i) : ORDER.length;
  };
  return [...topics].sort((a, b) => rank(a) - rank(b));
}
