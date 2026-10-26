import { solveRepairs } from './domain';
import type { Roster } from './domain';
self.onmessage = (event: MessageEvent<{roster: Roster}>) => {
  try {
    const result = solveRepairs(event.data.roster, { maxNodes: 200_000, maxMs: 1500, maxOptions: 4 });
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Search failed.' });
  }
};
