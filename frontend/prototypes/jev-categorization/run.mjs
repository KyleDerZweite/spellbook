// Throwaway provider experiment. No application imports, account data or SDK.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs, parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const { values } = parseArgs({ options: {
  'env-file': { type: 'string' }, tags: { type: 'string' },
  output: { type: 'string', default: 'results.json' },
  limit: { type: 'string', default: '100' },
  'budget-usd': { type: 'string', default: '4' },
  'prior-estimated-usd': { type: 'string', default: '0' },
  'cards-only': { type: 'boolean', default: false },
} });
const MODEL = 'jev-1.13.0';
const USD_PER_TOKEN = 0.042 / 1_000_000;
// Reserve the documented maximum input before every attempt, including retries.
const MAX_ATTEMPT_USD = 65_536 * USD_PER_TOKEN;
const budget = Number(values['budget-usd']);
if (!(budget > 0 && budget <= 4)) throw new Error('Budget must be between 0 and 4 USD.');
const priorSpend = Number(values['prior-estimated-usd']);
if (!(priorSpend >= 0 && priorSpend < budget)) throw new Error('Prior spend must fit the budget.');
const env = values['env-file'] ? parseEnv(readFileSync(values['env-file'], 'utf8')) : process.env;
const key = env.TYPESAFE_API_KEY;
if (!key) throw new Error('Missing protected TYPESAFE_API_KEY.');
const bytes = readFileSync(new URL('samples.json', import.meta.url));
const fixtureHash = createHash('sha256').update(bytes).digest('hex');
const fixture = JSON.parse(bytes);
const cards = new Map(fixture.cards.map(c => [c.id, c]));

export const primaryCriteria = {
  lands: 'A land card, including a land with other abilities. Lands stay Lands rather than Ramp.',
  ramp: 'Mana acceleration: mana rocks, mana creatures, land acceleration, extra land drops or temporary mana. Ordinary land mana production alone is not Ramp.',
  draw: 'Drawing cards or selecting cards from the library as a main function.',
  counterspells: 'Countering spells on the stack as a main function.',
  removal: 'Targeted removal: destroying, exiling, bouncing or taking control of opposing permanents, or targeted damage. Mass removal belongs to Board wipes.',
  board_wipes: 'Mass removal of many permanents or creatures at once, rather than an ordinary targeted removal spell.',
  protection: 'Protecting your permanents from removal or combat, through hexproof, indestructible, protection, regeneration or similar effects.',
  recursion: 'Returning cards from your graveyard to hand, battlefield or another usable zone.',
  tokens: 'Creating tokens as a main function. Do not prefer this for a removal spell that compensates its target controller with a token.',
  sacrifice: 'A reusable sacrifice outlet, or a spell whose central function is converting your sacrificed permanent into a resource.',
  creatures: 'A creature that fits none of the more specific functional categories well. This is a fallback, not the default for functional creatures.',
  artifacts: 'An artifact that fits none of the functional categories well. Artifact creatures may instead use Creatures.',
  enchantments: 'An enchantment that fits none of the functional categories well.',
  other: 'A card that fits none of these categories well, for example a counter-amplification enchantment or a team pump spell without another fitting function.',
};
export const traitCriteria = {
  ramp: 'The card increases available mana through acceleration, additional land drops or temporary mana. Ordinary land mana production alone does not count.',
  draw: 'The card can explicitly draw cards or select cards from the library.',
  counterspells: 'The card can counter a spell on the stack.',
  removal: 'The card can target and remove, bounce, gain control of or damage an opposing permanent. Do not count mass-only removal here.',
  board_wipes: 'The card can remove or damage many permanents or creatures at once.',
  protection: 'The card protects your permanents with hexproof, indestructible, protection, regeneration or a similar protective effect.',
  recursion: 'The card returns cards from your graveyard to hand, battlefield or another usable zone.',
  tokens: 'The card creates tokens, including conditional token creation and tokens given to an opponent. This is a trait, not a primary recommendation.',
  sacrifice: 'The card lets you sacrifice your own permanents as a cost or effect.',
  counter_theme: 'The card places, moves or amplifies counters on permanents or explicitly rewards them. Countering a spell is unrelated.',
};
export const deckCriteria = {
  aggro: 'An aggressive strategy centered on cheap creatures and fast combat pressure.',
  burn: 'A strategy with a meaningful density of spells or repeatable abilities that directly damage the opponent, not merely their creatures.',
  control: 'A controlling strategy with substantial countermagic, removal, sweepers and card advantage.',
  midrange: 'A strategy centered on resource value, durable creatures and incremental advantage rather than fast aggro, dedicated ramp or a specific combo.',
  ramp: 'A strategy with substantial mana acceleration used to cast more expensive payoffs.',
  combo: 'A concrete interaction between cards supports a repeatable engine or a decisive combo. Generic synergy or counter amplification alone is insufficient.',
  tokens: 'Token creation is a meaningful plan, with producers and/or payoffs.',
  counter_theme: 'Building, amplifying or rewarding +1/+1 counters is a meaningful plan. This is distinct from counterspells.',
  infinite_counters: 'The listed cards support a concrete repeatable loop that can put an arbitrarily large number of +1/+1 counters on a permanent without a finite resource stopping it. A prerequisite initial trigger and optional repetition are allowed. Merely generating counters or amplifying them is insufficient. Do not assume unlisted combo pieces.',
};
const cardInstructions = 'Classify this Magic: The Gathering card into exactly one useful deck entry category from the supplied criteria. Read all card faces. Prefer its central functional role over its card type, except that a land stays Lands. For multi-purpose cards choose a defensible useful primary; do not invent deck context.';
const noul = (instructions, criterion) => ({ type: 'noul', instructions,
  criteria: { true: criterion, false: 'The stated condition is not supported by the supplied Oracle text and composition. Do not assume unlisted effects or cards.' } });
const cardState = c => Object.fromEntries(['name', 'mana_cost', 'cmc', 'type_line', 'oracle_text', 'keywords', 'colors', 'color_identity', 'layout', 'card_faces'].map(k => [k, c[k]]));
const deckState = d => ({ total_cards: d.cards.reduce((n,c) => n+c.quantity,0), cards: d.cards.map(c => ({ quantity: c.quantity, ...cardState(cards.get(c.id)) })) });
const primaryQuestion = criteria => ({ type: 'choice', instructions: cardInstructions, criteria });
const cardQuestions = {
  primary: primaryQuestion(primaryCriteria),
  ...Object.fromEntries(Object.entries(traitCriteria).map(([k,v]) => [k, noul('Does the supplied Magic: The Gathering card have this trait? Read every face and every mode. Evaluate only the trait in the criteria, independently of its primary category.', v)])),
};
const deckQuestions = Object.fromEntries(Object.entries(deckCriteria).map(([k,v]) => [k, noul('Does this complete Magic: The Gathering deck composition support the strategy in the criteria? Use the actual Oracle texts, quantities and interactions. Do not assume unlisted cards or infer a combo from the category name alone. A supported strategy need not be the only strategy.',v)]));
let results = existsSync(values.output) ? JSON.parse(readFileSync(values.output,'utf8')) : {
  schema_version: 1, model: MODEL, fixture_sha256: fixtureHash,
  started_at: new Date().toISOString(), price_usd_per_million_input: 0.042,
  budget_usd: budget, requests: [], baseline: {},
  prior_estimated_usd: priorSpend,
  question_version: '1.0.0-frozen-before-inference',
  criteria: { primary: primaryCriteria, traits: traitCriteria, decks: deckCriteria },
  limits: ['Handwritten rubric and synthetic decks, not a representative accuracy benchmark.', 'Reported token spend is a calculated estimate, not a provider invoice.', 'No account data, production integration or private deck content.'],
};
if (results.fixture_sha256 !== fixtureHash || results.model !== MODEL) throw new Error('Resume requires the original frozen fixture and model.');
const save = () => writeFileSync(values.output, JSON.stringify(results,null,2)+'\n');
const charged = () => results.requests.reduce((sum,r) => sum+r.estimated_usd,results.prior_estimated_usd || 0);
function validateAnswer(q,a) {
  if (a?.type !== q.type) return false;
  if (q.type === 'noul') return Number.isFinite(a.noul) && a.noul >= 0 && a.noul <= 1;
  return Object.hasOwn(q.criteria,a.choice) && Number.isFinite(a.confidence)
    && a.confidence >= 0 && a.confidence <= 1
    && Object.keys(q.criteria).every(k => Number.isFinite(a.probabilities?.[k]) && a.probabilities[k] >= 0 && a.probabilities[k] <= 1);
}
async function evaluate(kind,id,state,questions) {
  if (results.requests.some(r => r.kind === kind && r.id === id && r.status === 'ok')) return;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (charged()+MAX_ATTEMPT_USD > budget) throw new Error('Experiment budget exhausted.');
    const started = performance.now();
    const r = { kind, id, attempt, state, questions, status: 'pending', estimated_usd: MAX_ATTEMPT_USD };
    // Write the reservation first. An interrupted request remains budgeted on resume.
    results.requests.push(r); save();
    try {
      const response = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, state, questions }), signal: AbortSignal.timeout(45_000),
      });
      r.http_status = response.status;
      if (!response.ok) {
        r.status = 'http_error'; r.elapsed_ms = Math.round(performance.now()-started); save();
        if (response.status === 429 && attempt < 2) { await delay(Math.min(15_000, Math.max(1000, Number(response.headers.get('retry-after'))*1000 || 3000))); continue; }
        if ([401,403,402].includes(response.status)) throw new Error(`Provider authorization or balance failure (${response.status}).`);
        console.log(JSON.stringify({kind,id,status:r.status,http_status:r.http_status})); return;
      }
      const body = await response.json();
      const usage = body.usage;
      if (Number.isInteger(usage?.input_tokens) && usage.input_tokens >= 0) {
        r.usage = usage; r.estimated_usd = usage.input_tokens*USD_PER_TOKEN;
      }
      r.returned_model = body.model;
      r.answers = body.answers;
      r.status = body.model === MODEL && Object.entries(questions).every(([k,q]) => validateAnswer(q,body.answers?.[k])) ? 'ok' : 'invalid_answer';
      r.elapsed_ms = Math.round(performance.now()-started); save();
      console.log(JSON.stringify({kind,id,status:r.status,elapsed_ms:r.elapsed_ms,tokens:usage?.input_tokens,estimated_total_usd:charged()}));
      return;
    } catch (e) {
      if (r.status === 'pending') { r.status = 'transport_error'; r.elapsed_ms = Math.round(performance.now()-started); save(); }
      if ([401,403,402].includes(r.http_status)) throw new Error(`Provider authorization or balance failure (${r.http_status}).`);
      console.log(JSON.stringify({kind,id,status:r.status,elapsed_ms:r.elapsed_ms})); return;
    }
  }
}

// Deterministic local comparison: provisional roots, prominence, fixed tie order.
if (values.tags && !Object.keys(results.baseline).length) {
  const tags = readFileSync(values.tags,'utf8').trim().split('\n').map(l => JSON.parse(l));
  const byId = new Map(tags.map(t => [t.id,t]));
  const rootSlugs = { ramp:'ramp',draw:'draw',counterspells:'counterspell',removal:'spot-removal',board_wipes:'sweeper',protection:'protection',recursion:'recursion',sacrifice:'sacrifice-outlet',tokens:'repeatable-token-generator' };
  const weights = { median:1,strong:2,very_strong:3 };
  for (const c of fixture.cards) {
    const scores = {};
    for (const [category,slug] of Object.entries(rootSlugs)) {
      const root = tags.find(t => t.slug === slug);
      const visited = new Set(); const pending = root ? [root.id] : [];
      while (pending.length) {
        const id = pending.pop(); if (visited.has(id)) continue; visited.add(id);
        const tag = byId.get(id); if (!tag) continue;
        pending.push(...(tag.child_ids || []));
        for (const tagging of tag.taggings || []) if (tagging.oracle_id === c.oracle_id) scores[category] = Math.max(scores[category] || 0,weights[tagging.weight] || 1);
      }
    }
    const line = c.type_line || '';
    const primary = /\bLand\b/.test(line) ? 'lands' : Object.keys(rootSlugs).filter(k=>scores[k]).sort((a,b)=>scores[b]-scores[a])[0]
      || (/\bCreature\b/.test(line)?'creatures':/\bArtifact\b/.test(line)?'artifacts':/\bEnchantment\b/.test(line)?'enchantments':'other');
    results.baseline[c.id] = { primary, scores, matched_traits: Object.keys(scores) };
  }
  results.baseline_source = { filename: values.tags.split('/').at(-1), sha256:createHash('sha256').update(readFileSync(values.tags)).digest('hex'), roots:rootSlugs, tie_order:Object.keys(rootSlugs), note:'Provisional mapping. Type fallback and this tie order are not accepted production rules. Repeatable token root misses one-shot token creators.' };
  save();
}
let count = 0;
for (const c of fixture.cards) {
  if (count++ >= Number(values.limit)) break;
  await evaluate('card',c.id,cardState(c),cardQuestions);
}
if (!values['cards-only']) {
  for (const d of fixture.decks) await evaluate('deck',d.id,deckState(d),deckQuestions);
  for (const id of ['solemn-simulacrum','archmage-s-charm','cryptic-command','village-rites','ashnod-s-altar','growth-spiral'].filter(id=>cards.has(id))) {
    await evaluate('order_probe',id,cardState(cards.get(id)),{primary:primaryQuestion(Object.fromEntries(Object.entries(primaryCriteria).reverse()))});
  }
  const custom = { ...primaryCriteria, infinite_counters: 'A card that participates directly in a supported repeatable +1/+1-counter loop with the cards actually listed in this deck. Prefer this custom category over generic Tokens or Creatures when supported. Do not assume missing pieces.' };
  for (const id of ['d04','d05']) await evaluate('context_probe',id,{candidate:cardState(cards.get('scurry-oak')),deck:deckState(fixture.decks.find(d=>d.id===id))},{
    primary:{type:'choice',instructions:'Assign the candidate card one primary deck entry category in the supplied complete deck context. Evaluate the custom Infinite Counters criterion carefully. Choose that custom category when the candidate really participates in such a loop, rather than merely counter synergy. Otherwise choose a generic appropriate category.',criteria:custom},
    infinite_counters:noul('Does the candidate participate directly in a repeatable infinite +1/+1-counter loop supported by the listed deck?',deckCriteria.infinite_counters),
  });
  // Exploratory follow-up after observing the baseline. Not holdout accuracy.
  const simpleQuestions = {
    infinite_counters: {type:'noul', instructions:'Can any combination of the listed cards create an arbitrarily large number of +1/+1 counters through a repeatable loop?',criteria:{true:'A supported repeatable loop creates unlimited +1/+1 counters.',false:'The listed cards can create only finitely many counters without additional unlisted cards.'}},
    category: {type:'choice',instructions:'Choose the most specific supported +1/+1-counter strategy for these cards. Infinite Counters needs an actual repeatable interaction, not just counter amplification.',criteria:{infinite_counters:'A repeatable loop can create an unlimited number of +1/+1 counters.',counter_theme:'Finite counter generation or amplification, without a supported infinite counter loop.',neither:'Neither strategy is supported.'}},
  };
  for (const id of ['d04','d05']) {
    const d = fixture.decks.find(d=>d.id===id);
    await evaluate('exploratory_simple',id,deckState(d),simpleQuestions);
    // Remove unrelated lands, mana and draw, retaining all five counter/protection cards.
    const focused = d.cards.filter(c=>['scurry-oak','hardened-scales','conclave-mentor','snakeskin-veil','heroic-intervention','ivy-lane-denizen'].includes(c.id));
    await evaluate('exploratory_focused',id,{cards:focused.map(c=>({...cardState(cards.get(c.id)),quantity:c.quantity}))},simpleQuestions);
    // Reviewer identified omitted top-level power/toughness in the frozen baseline.
    // Keep the baseline intact and record complete-state probes separately.
    const complete = { total_cards:60,cards:d.cards.map(c=>({quantity:c.quantity,...cardState(cards.get(c.id)),...Object.fromEntries(['power','toughness','loyalty','defense'].filter(k=>cards.get(c.id)[k]!==undefined).map(k=>[k,cards.get(c.id)[k]]))})) };
    await evaluate('exploratory_complete',id,complete,{...simpleQuestions,original_loop:deckQuestions.infinite_counters,combo:deckQuestions.combo});
  }
}
results.completed_at = new Date().toISOString();
results.total_estimated_usd = charged();
results.input_tokens = results.requests.reduce((n,r)=>n+(r.usage?.input_tokens || 0),0);
save();
console.log(JSON.stringify({complete:true,requests:results.requests.length,estimated_usd:charged(),input_tokens:results.input_tokens,fixture_sha256:fixtureHash}));
