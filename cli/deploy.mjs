// deploy.mjs — Deploy CourtEscrow on Studio Next devnet (61997) with W1.
// Usage: node deploy.mjs
// Writes cli/deploy.json { contract_address, deploy_tx, deployed_at_utc }.
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient, createAccount } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';

const DIR = '/home/hatch/workspace/testnet/genlayer/mission101-courtescrow';
const keyHex = readFileSync('/home/hatch/workspace/wallets/eoa-testnet-backup.txt', 'utf8').trim();
const account = createAccount(keyHex.startsWith('0x') ? keyHex : `0x${keyHex}`);
console.log('deployer:', account.address);

const client = createClient({ chain: studioDevnet, account });
console.log('chain:', client.chain.id);

const code = new Uint8Array(readFileSync(`${DIR}/contracts/court_escrow.py`));
console.log('code bytes:', code.length);

// 1. Validate contract schema (lint-level check, no tx)
try {
  const schema = await client.getContractSchemaForCode(code);
  console.log('schema OK. methods:', Object.keys(schema?.methods || schema || {}).join(',') || JSON.stringify(schema)?.slice(0, 300));
} catch (e) {
  console.log('getContractSchemaForCode ERROR:', e?.message?.slice(0, 500));
  throw e;
}

// 2. Estimate fees (deploy reverts FeeValueMustBeNonZero without explicit fees)
const fees = await client.estimateTransactionFees();
console.log('fee estimate: feeValue=', fees.feeValue?.toString());

// 3. Deploy
const hash = await client.deployContract({
  account,
  code,
  args: [],
  fees: { distribution: fees.distribution, feeValue: fees.feeValue },
});
console.log('DEPLOY TX:', hash);

// 3. Wait for acceptance/finalization
const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: 'finalized', interval: 5000, retries: 120 });
console.log('receipt status:', receipt.status, receipt.statusName);
const decoded = receipt.txDataDecoded || receipt.data || {};
const contractAddress = decoded.contractAddress || decoded.contract_address || null;
console.log('CONTRACT ADDRESS:', contractAddress);
console.log('receipt:', JSON.stringify(receipt)?.slice(0, 800));

if (!contractAddress) throw new Error('No contract address in receipt');
writeFileSync(`${DIR}/cli/deploy.json`, JSON.stringify({
  contract_address: contractAddress,
  deploy_tx: hash,
  deployer: account.address,
  chain_id: 61997,
  deployed_at_utc: new Date().toISOString(),
}, null, 2));
console.log('saved cli/deploy.json');
