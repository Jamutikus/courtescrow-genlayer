# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Deal:
    id: str
    buyer: str
    seller: str
    amount: u256
    deliverable_url: str
    deliverable_hash: str
    terms: str
    status: str  # OPEN | DISPUTED | RESOLVED
    claim: str


@allow_storage
@dataclass
class Verdict:
    deal_id: str
    verdict: str  # DELIVERED | NOT_DELIVERED
    confidence: u256
    reasoning: str
    settled_to: str  # seller address when released, buyer address when refunded


class CourtEscrow(gl.Contract):
    deals: TreeMap[str, Deal]
    verdicts: TreeMap[str, Verdict]
    # escrow ledger: what each address is owed after settlement (GEN units)
    payable: TreeMap[str, u256]
    refundable: TreeMap[str, u256]

    def __init__(self):
        pass

    def _judge_delivery(self, deal: Deal) -> dict:
        # Consensus-critical lesson: strict_eq compares the nondet output
        # EXACTLY across validators. Free-text reasoning never matches
        # byte-for-byte between different LLMs, so the equivalence block
        # returns ONLY the verdict label (one enum string). Confidence and
        # reasoning are derived deterministically afterwards: consensus
        # reached under strict_eq means every agreeing validator produced
        # this exact label.
        def fetch_and_judge() -> str:
            evidence = gl.nondet.web.render(deal.deliverable_url, mode="text")
            task = f"""
You are the Internet Court adjudicator for an agent-to-agent deal paid
through x402 escrow. Judge ONLY whether the delivered content matches the
deal terms. Do not judge anything else.

Deal terms (what the seller promised to deliver):
{deal.terms}

Claim that opened the dispute:
{deal.claim}

Delivered content fetched from {deal.deliverable_url}:
{evidence}

Respond with exactly one word, nothing else: DELIVERED or NOT_DELIVERED.
DELIVERED means the delivered content clearly satisfies the deal terms.
NOT_DELIVERED means it does not, or the content is missing / unrelated.
"""
            result = gl.nondet.exec_prompt(task)
            return str(result).strip().upper()

        verdict = gl.eq_principle.strict_eq(fetch_and_judge)
        if verdict != "DELIVERED" and verdict != "NOT_DELIVERED":
            raise Exception("Invalid verdict from adjudication")
        if verdict == "DELIVERED":
            reasoning = "Delivered content satisfies the deal terms (unanimous validator consensus)."
        else:
            reasoning = "Delivered content does not satisfy the deal terms (unanimous validator consensus)."
        return {"verdict": verdict, "confidence": 100, "reasoning": reasoning}

    @gl.public.write
    def create_deal(
        self,
        deal_id: str,
        seller: str,
        amount: u256,
        deliverable_url: str,
        deliverable_hash: str,
        terms: str,
    ) -> None:
        buyer = gl.message.sender_address.as_hex
        if deal_id in self.deals:
            raise Exception("Deal already exists")
        if amount <= 0:
            raise Exception("Amount must be positive")
        self.deals[deal_id] = Deal(
            id=deal_id,
            buyer=buyer,
            seller=seller,
            amount=amount,
            deliverable_url=deliverable_url,
            deliverable_hash=deliverable_hash,
            terms=terms,
            status="OPEN",
            claim="",
        )

    @gl.public.write
    def open_dispute(self, deal_id: str, claim: str) -> None:
        sender = gl.message.sender_address.as_hex
        if deal_id not in self.deals:
            raise Exception("Deal not found")
        deal = self.deals[deal_id]
        if deal.status != "OPEN":
            raise Exception("Deal is not open")
        if sender != deal.buyer and sender != deal.seller:
            raise Exception("Only buyer or seller can dispute")
        deal.status = "DISPUTED"
        deal.claim = claim
        self.deals[deal_id] = deal

    @gl.public.write
    def adjudicate(self, deal_id: str) -> None:
        if deal_id not in self.deals:
            raise Exception("Deal not found")
        deal = self.deals[deal_id]
        if deal.status != "DISPUTED":
            raise Exception("Deal is not disputed")
        judgement = self._judge_delivery(deal)
        verdict = judgement["verdict"]
        if verdict != "DELIVERED" and verdict != "NOT_DELIVERED":
            raise Exception("Invalid verdict from adjudication")
        confidence = int(judgement["confidence"])
        reasoning = str(judgement["reasoning"])
        if verdict == "DELIVERED":
            settled_to = deal.seller
            prev = self.payable.get(deal.seller, 0)
            self.payable[deal.seller] = prev + deal.amount
        else:
            settled_to = deal.buyer
            prev = self.refundable.get(deal.buyer, 0)
            self.refundable[deal.buyer] = prev + deal.amount
        self.verdicts[deal_id] = Verdict(
            deal_id=deal_id,
            verdict=verdict,
            confidence=confidence,
            reasoning=reasoning,
            settled_to=settled_to,
        )
        deal.status = "RESOLVED"
        self.deals[deal_id] = deal

    @gl.public.view
    def get_deal(self, deal_id: str) -> dict:
        if deal_id not in self.deals:
            raise Exception("Deal not found")
        d = self.deals[deal_id]
        return {
            "id": d.id,
            "buyer": d.buyer,
            "seller": d.seller,
            "amount": int(d.amount),
            "deliverable_url": d.deliverable_url,
            "deliverable_hash": d.deliverable_hash,
            "terms": d.terms,
            "status": d.status,
            "claim": d.claim,
        }

    @gl.public.view
    def get_verdict(self, deal_id: str) -> dict:
        if deal_id not in self.verdicts:
            raise Exception("No verdict yet")
        v = self.verdicts[deal_id]
        return {
            "deal_id": v.deal_id,
            "verdict": v.verdict,
            "confidence": int(v.confidence),
            "reasoning": v.reasoning,
            "settled_to": v.settled_to,
        }

    @gl.public.view
    def get_ledger(self) -> dict:
        # Flat dict with str keys (TreeMap[str, u256] keys are already str;
        # nested dicts do not encode cleanly in view returns).
        out = {}
        for k, v in self.payable.items():
            out["payable:" + k] = int(v)
        for k, v in self.refundable.items():
            out["refundable:" + k] = int(v)
        return out

    @gl.public.view
    def get_payable(self, addr: str) -> int:
        return int(self.payable.get(addr, 0))

    @gl.public.view
    def get_refundable(self, addr: str) -> int:
        return int(self.refundable.get(addr, 0))
