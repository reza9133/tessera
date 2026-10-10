// Demo scenarios: one pact, four deliveries. The rubric leans on criteria that code decides,
// so the outcomes are predictable on the network and in the sandbox alike.

export const DEMO_TERMS = 'Write the hero, three feature blurbs and a closing call to action for the Lumen notes app. Plain and warm, no hype. It must mention offline mode.';

export const DEMO_CRITERIA = [
  { type: 'live', weight: 1, required: true },
  { type: 'contains', arg: 'offline mode', weight: 2, required: true },
  { type: 'min_words', arg: '120', weight: 1 },
  { type: 'judge', text: 'The copy covers notes, search and syncing', weight: 2 },
];

export const SCENARIOS = [
  {
    id: 'clean', tag: 'Fulfilled', tone: 'mint', title: 'The clean delivery',
    blurb: 'Everything asked for, plainly written. All four criteria are met and the full escrow goes to the deliverer.',
    file: 'clean.html', expect: 'Fulfilled · 100% to the deliverer',
  },
  {
    id: 'short', tag: 'Partial', tone: 'brass', title: 'The short draft',
    blurb: 'Right content, too short. One criterion fails, so the deliverer is paid in proportion to the weight that was met.',
    file: 'partial.html', expect: 'Partial · 83% to the deliverer, the rest back',
  },
  {
    id: 'dead', tag: 'Breached', tone: 'coral', title: 'The dead link',
    blurb: 'The evidence link does not open. A required criterion fails, so nothing is paid and the escrow returns.',
    file: 'not-found.html', expect: 'Breached · the escrow returns to the maker',
  },
  {
    id: 'hijack', tag: 'Breached', tone: 'coral', title: 'The hijacker',
    blurb: 'The page tells the judge to mark everything as met. It is treated as evidence, never as instructions.',
    file: 'hijack.html', expect: 'Breached · the injected instruction is ignored',
  },
];

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id);
export const evidenceUrl = (s) => `${location.origin}/demo/evidence/${s.file}`;

export function scenarioForm(s) {
  return { title: `Lumen landing copy: ${s.title.toLowerCase()}`, terms: DEMO_TERMS, criteria: DEMO_CRITERIA.map((c) => ({ ...c })), stake: '5', days: 7, contest: 0 };
}
