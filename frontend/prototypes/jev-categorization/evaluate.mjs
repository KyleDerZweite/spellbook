// Offline interpretation of the frozen fixture. No inference or credentials.
import { readFileSync, writeFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('samples.json',import.meta.url)));
const result = JSON.parse(readFileSync(new URL('results.json',import.meta.url)));
const request = (kind,id) => result.requests.find(r=>r.kind===kind && r.id===id && r.status==='ok');
const threshold = 0.8;
const traitMap = {mana_acceleration:'ramp',card_draw:'draw',card_selection:'draw',spell_counter:'counterspells',targeted_removal:'removal',mass_removal:'board_wipes',protection:'protection',graveyard_return:'recursion',token_creation:'tokens',sacrifice_cost:'sacrifice',sacrifice_outlet:'sacrifice',counter_synergy:'counter_theme'};
const cards = fixture.cards.map(c=>{
  const r = request('card',c.id);
  const baseline = result.baseline[c.id];
  const required = [...new Set(c.expected.required_traits.map(t=>traitMap[t]).filter(Boolean))];
  const missed = required.filter(k=>(r?.answers[k]?.noul || 0)<threshold);
  return {id:c.id,name:c.name,expected:c.expected,primary:r?.answers.primary,
    pass:!!r && c.expected.acceptable_primary.includes(r.answers.primary.choice),
    baseline_pass:c.expected.acceptable_primary.includes(baseline?.primary),baseline,
    required_mapped_traits:required,missed_mapped_traits:missed,
    trait_recall_pass:!!r && !missed.length,
    traits:Object.fromEntries(Object.keys(result.criteria.traits).map(k=>[k,r?.answers[k]?.noul])),
    elapsed_ms:r?.elapsed_ms,usage:r?.usage,
  };
});
const decks = fixture.decks.map(d=>{
  const r = request('deck',d.id);
  const predicted = Object.keys(result.criteria.decks).filter(k=>(r?.answers[k]?.noul || 0)>=threshold);
  const missing = d.expected.required_categories.filter(k=>!predicted.includes(k));
  const extra = predicted.filter(k=>!d.expected.acceptable_categories.includes(k));
  return {id:d.id,expected:d.expected,predicted,missing,extra,pass:!!r && !missing.length && !extra.length,
    probabilities:Object.fromEntries(Object.keys(result.criteria.decks).map(k=>[k,r?.answers[k]?.noul])),
    elapsed_ms:r?.elapsed_ms,usage:r?.usage};
});
const order = result.requests.filter(r=>r.kind==='order_probe' && r.status==='ok').map(r=>({id:r.id,
  original:request('card',r.id)?.answers.primary.choice,reversed:r.answers.primary.choice,
  changed:request('card',r.id)?.answers.primary.choice!==r.answers.primary.choice,confidence:r.answers.primary.confidence}));
const contexts = result.requests.filter(r=>r.kind==='context_probe' && r.status==='ok').map(r=>({id:r.id,primary:r.answers.primary,probability:r.answers.infinite_counters.noul}));
const exploratory = result.requests.filter(r=>r.kind.startsWith('exploratory_')).map(r=>({kind:r.kind,id:r.id,answers:r.answers,status:r.status}));
const times = result.requests.filter(r=>r.status==='ok').map(r=>r.elapsed_ms).sort((a,b)=>a-b);
const summary = {fixture_sha256:result.fixture_sha256,model:result.model,threshold,
  card_primary:{passed:cards.filter(c=>c.pass).length,total:cards.length,baseline_passed:cards.filter(c=>c.baseline_pass).length,
    failures:cards.filter(c=>!c.pass).map(c=>({id:c.id,expected:c.expected.acceptable_primary,actual:c.primary?.choice,confidence:c.primary?.confidence})),
    high_confidence_failures:cards.filter(c=>!c.pass && c.primary?.confidence>=0.95).length},
  minimum_traits:{passed:cards.filter(c=>c.trait_recall_pass).length,total:cards.length,missed:cards.filter(c=>c.missed_mapped_traits.length).map(c=>({id:c.id,missed:c.missed_mapped_traits}))},
  deck_rubric:{passed:decks.filter(d=>d.pass).length,total:decks.length},
  order_probe:order,contexts,exploratory,
  integration:{attempts:result.requests.length,successful:result.requests.filter(r=>r.status==='ok').length,
    failures:result.requests.filter(r=>r.status!=='ok').map(r=>({kind:r.kind,id:r.id,status:r.status,http_status:r.http_status})),
    input_tokens:result.input_tokens,prior_smoke_input_tokens:3782,
    estimated_total_usd:result.total_estimated_usd,median_ms:times[Math.floor(times.length/2)],max_ms:times.at(-1)},
  cards,decks,
  interpretation_limits:['Small hand-selected fixture with synthetic decks; no population accuracy claim.',
    'Deck rubric is diagnostic for the matched loop contrast; aggro/midrange exclusions are subjective.',
    'Trait scoring checks mapped minimum traits only; additional correct traits are not penalized.',
    'Baseline uses a provisional fixed tie order and narrow token root, not an optimized Tagger classifier.',
    '0.8 Noul threshold is exploratory and uncalibrated; provider confidence is not verified correctness.'],
};
writeFileSync(new URL('summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,cards:undefined,decks:summary.decks.map(d=>({id:d.id,predicted:d.predicted,missing:d.missing,extra:d.extra,pass:d.pass})),interpretation_limits:undefined},null,2));
