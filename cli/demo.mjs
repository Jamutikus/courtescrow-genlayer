// demo.mjs — CourtEscrow end-to-end demo on Studio Next devnet (61997).
// W1 (buyer) creates two x402-escrow deals with W2 (seller), disputes both,
// GenLayer adjudicates via LLM consensus, ledger settles off the verdict.
// Deal 1: deliverable matches terms -> DELIVERED -> seller payable.
// Deal 2: deliverable does NOT match terms -> NOT_DELIVERED -> buyer refundable.
// No tokens move between wallets: settlement is contract-ledger bookkeeping.
// Usage: node demo.mjs
// Writes cli/demo-manifest.json with every tx hash + verdict.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient, createAccount } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';

const DIR = '/home/hatch/workspace/testnet/genlayer/mission101-courtescrow';
const deploy = JSON.parse(readFileSync(`${DIR}/cli/deploy.json`, 'utf8'));
const CONTRACT = deploy.contract_address;
const W1_ADDR = '0xDA7D88c9Fb1b2A36cee9A1f19e6EF00Bf181F59e';
const W2_ADDR = '0x1c9A1a137805826084615cC47c32cD07e885dc85';
const keyHex = readFileSync('/home/hatch/workspace/wallets/eoa-testnet-backup.txt', 'utf8').trim();
const account = createAccount(keyHex.startsWith('0x') ? keyHex : `0x${keyHex}`);
const client = createClient({ chain: studioDevnet, account });
console.log('contract:', CONTRACT);
console.log('buyer (W1):', account.address);

async function sha256(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { hash: '0x' + createHash('sha256').update(text).digest('hex'), bytes: text.length };
}

async function write(fn, args, label) {
  const fees = await client.estimateTransactionFeesForWrite({ account, address: CONTRACT, functionName: fn, args });
  const tx = await client.writeContract({
    account, address: CONTRACT, functionName: fn, args,
    fees: { distribution: fees.distribution, feeValue: fees.feeValue },
  });
  const hash = typeof tx === 'string' ? tx : (tx?.hash || tx?.transactionHash || JSON.stringify(tx));
  console.log(`${label} TX:`, hash);
  const decided = await client.waitForDecision({ hash, interval: 5000, retries: 90 });
  console.log(`${label} decided:`, JSON.stringify(decided)?.slice(0, 200));
  return hash;
}

async function read(fn, args, label) {
  try {
    const r = await client.readContract({ address: CONTRACT, functionName: fn, args, account });
    console.log(`${label}:`, JSON.stringify(r)?.slice(0, 600));
    return r;
  } catch (e) {
    console.log(`${label} READ FAILED:`, (e?.message || '').slice(0, 300));
    return null;
  }
}

const manifest = { contract: CONTRACT, chain_id: 61997, started_at_utc: new Date().toISOString(), deals: {} };

// --- Deliverables (real public URLs, content-addressed) ---
const TERMS = 'The deliverable must be the Internet Court Skill README: it must describe agent-to-agent contracts, adjudication, and dispute resolution for agentic commerce.';
const urlDelivered = 'https://raw.githubusercontent.com/internet-court/internet-court-skill/main/README.md';
const urlNotDelivered = 'https://raw.githubusercontent.com/genlayerlabs/genlayer-project-boilerplate/main/README.md';
const d1 = await sha256(urlDelivered);
const d2 = await sha256(urlNotDelivered);
console.log('deliverable 1:', urlDelivered, d1.hash, d1.bytes, 'bytes');
console.log('deliverable 2:', urlNotDelivered, d2.hash, d2.bytes, 'bytes');

// --- Deal 1: should be DELIVERED ---
const deal1 = 'ce-20261121-05';
manifest.deals[deal1] = { terms: TERMS, deliverable_url: urlDelivered, deliverable_hash: d1.hash, seller: W2_ADDR, amount: 2, expected: 'DELIVERED' };
manifest.deals[deal1].create_tx = await write('create_deal', [deal1, W2_ADDR, 2, urlDelivered, d1.hash, TERMS], 'deal1 create');
manifest.deals[deal1].dispute_tx = await write('open_dispute', [deal1, 'Buyer disputes: seller claims the delivery matches the terms; buyer asks the Court to verify.'], 'deal1 dispute');
manifest.deals[deal1].adjudicate_tx = await write('adjudicate', [deal1], 'deal1 adjudicate');
manifest.deals[deal1].verdict = await read('get_verdict', [deal1], 'deal1 verdict');

// --- Deal 2: should be NOT_DELIVERED ---
const deal2 = 'ce-20261121-06';
manifest.deals[deal2] = { terms: TERMS, deliverable_url: urlNotDelivered, deliverable_hash: d2.hash, seller: W2_ADDR, amount: 2, expected: 'NOT_DELIVERED' };
manifest.deals[deal2].create_tx = await write('create_deal', [deal2, W2_ADDR, 2, urlNotDelivered, d2.hash, TERMS], 'deal2 create');
manifest.deals[deal2].dispute_tx = await write('open_dispute', [deal2, 'Buyer disputes: the delivered content looks like a football-bets boilerplate README, not the Internet Court Skill README promised.'], 'deal2 dispute');
manifest.deals[deal2].adjudicate_tx = await write('adjudicate', [deal2], 'deal2 adjudicate');
manifest.deals[deal2].verdict = await read('get_verdict', [deal2], 'deal2 verdict');

// --- Final ledger ---
manifest.ledger = await read('get_ledger', [], 'ledger');
manifest.finished_at_utc = new Date().toISOString();
writeFileSync(`${DIR}/cli/demo-manifest.json`, JSON.stringify(manifest, null, 2));
console.log('saved cli/demo-manifest.json');
console.log('DEAL1 verdict:', manifest.deals[deal1].verdict?.verdict, '| DEAL2 verdict:', manifest.deals[deal2].verdict?.verdict);
