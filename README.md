# CourtEscrow — Internet Court x x402 adjudication on GenLayer

A minimal working integration for the GenLayer **Internet Court: Partner Demo Lab**
mission (Mission 101): an x402-style escrow where a GenLayer Intelligent
Contract acts as the Internet Court adjudicator when an agent-to-agent delivery
is disputed.

## The idea

Two AI agents agree a paid delivery deal. The buyer pays into an x402-style
escrow. If delivery is disputed, the GenLayer Intelligent Contract adjudicates:

1. **Deal** — buyer creates the deal on-chain: seller, amount, deliverable URL
   (content-addressed by sha256), and the deal terms.
2. **Dispute** — buyer or seller opens a dispute with a claim.
3. **Adjudication** — GenLayer validators fetch the delivery evidence URL,
   judge it against the deal terms with LLM consensus (`strict_eq`), and record
   a verdict: `DELIVERED` or `NOT_DELIVERED`, with confidence and reasoning.
4. **Settlement** — the verdict drives the escrow ledger: release to the seller
   on `DELIVERED`, refund to the buyer on `NOT_DELIVERED`. This is the Internet
   Court model: verdict first, execution follows the verdict.

No tokens move between wallets inside the demo: the escrow ledger is
bookkeeping in contract state. The adjudication itself is fully on-chain and
real (Studio devnet, chain 61997).

## Partners

- **Internet Court** — the adjudication standard (mandate + rubric + evidence
  + decision), `internet-court/internet-court-skill`.
- **x402** — the payment protocol the escrow models (Coinbase x402).
- **GenLayer** — the judgment layer: Intelligent Contract + LLM validator
  consensus.

## Repo layout

```
contracts/court_escrow.py   Intelligent Contract (GenLayer, Python)
cli/deploy.mjs              Deploy to Studio devnet via genlayer-js
cli/demo.mjs                End-to-end demo: 2 deals, 2 disputes, 2 verdicts
cli/deploy.json             Deployed contract address + deploy tx
cli/demo-manifest.json      Every tx hash + verdict from the demo run
demo/index.html             Demo page (3 logos, live tx links, verdicts)
demo/assets/                Logos (GenLayer, Internet Court, x402 wordmark)
video/                      45-second demo video + build script + shot list
```

## Run it

```bash
# 1. Install deps (genlayer-js RC)
cd cli && npm install genlayer-js@2.0.0-rc.3

# 2. Fund the deployer on Studio devnet (free faucet):
#    POST sim_fundAccount via https://studio-dev.genlayer.com/api
#    (the same method Studio's faucet button uses)

# 3. Deploy
node deploy.mjs

# 4. Run the demo (creates 2 deals, disputes both, adjudicates both)
node demo.mjs
```

Requirements: Node 20+, a Studio devnet wallet with a few GEN for gas.

## Demo results (21 Nov 2026, Studio devnet 61997)

- Contract: `0x9Aa42eEB1eE57373A905747dF125885ECa57E6De`
- Deploy tx: `0x110d81c4ee59dc09fb44ed355d46c5173043bb5a03e17079eb3197fc3ef00198`
- Deal 1 (`ce-20261121-05`): deliverable = Internet Court Skill README,
  matches the terms -> verdict `DELIVERED`, seller payable +2 GEN.
- Deal 2 (`ce-20261121-06`): deliverable = football-bets boilerplate README,
  does not match the terms -> verdict `NOT_DELIVERED`, buyer refundable +2 GEN.
- Full tx hashes + verdicts: `cli/demo-manifest.json`.

## Known limits (honest)

- Settlement is ledger bookkeeping in the contract, not a token transfer:
  moving escrowed GEN out of the contract would need a payable/settle flow
  the demo does not implement.
- The adjudicator trusts the evidence URL content fetched by validators;
  a seller could in principle swap the content after the deal is created.
  The sha256 hash is recorded at deal creation so a swap is detectable
  off-chain; on-chain hash verification is future work.
- Demo video is assembled from the real CLI transcript (real tx hashes and
  verdicts) rather than a live screen capture.

## License

MIT
