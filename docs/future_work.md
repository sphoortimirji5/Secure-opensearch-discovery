# Feedback Pipeline (Today) + Path to RLHF - Reinforcement Learning from Human Feedback (Future)

Collect structured human feedback on grounding decisions to improve accuracy, retrieval quality, and future training datasets.

**Model weights are not updated online.**

---

## S3 Contracts Vertical (Planned Extension)

Ground LLM responses against location contract documents stored in S3.

### Architecture

```
S3 (PDFs) → Textract → OpenSearch `contracts` index → Agent context → Grounded response
```

### Use Case

> "Is location loc-042 still within contract terms?"

**Response with contract grounding:**
```json
{
  "summary": "Location loc-042 is within contract terms.",
  "reasoning": "Contract s3://contracts/loc-042.pdf effective 2024-01-01 to 2025-12-31. Current date within range. Rate: $25/visit, matching member billing records."
}
```

### Implementation

| Component | Detail |
|-----------|--------|
| **Trigger** | S3 upload event → Lambda |
| **Extraction** | AWS Textract for PDFs |
| **Index** | OpenSearch `contracts` (contract_id, location_id, effective_dates, terms) |
| **Grounding** | Include contract snippets in LLM context |

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  User Query                                                        │
│      │                                                             │
│      ▼                                                             │
│  Agent Service                                                     │
│      │                                                             │
│      ▼                                                             │
│  Grounding Service ──┬──▶ Grounding Result (score + verdict)       │
│      │               │                                             │
│      ▼               ▼                                             │
│  LLM Response    Grounding Audit                                   │
│                                                                    │
│──────────────────────── Feedback Capture ──────────────────────────│
│                                                                    │
│  Human Review ──▶ Feedback API ──▶ PostgreSQL (feedback store)     │
│                                                                    │
│──────────────────── Offline Improvement Loop ──────────────────────│
│                                                                    │
│  Feedback Export ──▶ Eval / Training Dataset ──▶ Reward / Analysis │
│                                                                    │
│  (threshold tuning, reranking experiments, future RLHF pipeline)   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Key principle**: Inference is immutable. All learning happens offline.

---

## Data Flow

| Step | Component | Action |
|------|-----------|--------|
| 1 | User | Submits query |
| 2 | Agent Service | Calls LLM and grounding |
| 3 | Grounding Service | Verifies response against authoritative sources |
| 4 | Result | Returns grounded response + score + response_id |
| 5 | Human Reviewer | Classifies accuracy and provides corrections |
| 6 | Feedback API | Persists structured feedback |
| 7 | Export Job | Produces eval / training datasets |
| 8 | ML Pipeline | Used for analysis, reranking, or future RLHF |

---

## Feedback Schema (v1)

```sql
CREATE TABLE grounding_feedback (
    id UUID PRIMARY KEY,
    response_id VARCHAR(255) NOT NULL,
    context_refs JSONB NOT NULL,
    response TEXT NOT NULL,
    model_confidence_score DECIMAL(3,2) NOT NULL,
    human_verdict VARCHAR(20) NOT NULL,
    corrections JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

Notes:
- `context_refs` stores document IDs, entity IDs, or index names
- Full context snapshots are optional and redactable
- Schema is optimized for audits and offline analysis

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/agent/feedback` | POST | Submit human feedback |
| `/agent/feedback/export` | GET | Export datasets for evaluation or training |

---

## Feedback Types

| Verdict | Meaning | Usage |
|---------|---------|-------|
| `accurate` | Fully grounded | Positive signal |
| `hallucinated` | Fabricated or incorrect facts | Negative signal |
| `partial` | Missing evidence or mixed accuracy | Threshold / retrieval tuning |

Verdicts are intentionally coarse in v1 and extensible later.

---

## Threshold Calibration (Offline)

Thresholds are tuned via batch analysis, never at inference time.

```
t* = argmax_t accuracy(t)

accuracy(t) = correct_predictions / total_feedback
```

Used to:
- Adjust grounding cutoffs
- Improve reranking
- Detect retrieval regressions

---

## What This Enables

- Grounding accuracy measurement
- Retrieval and prompt improvements
- Reranking experiments
- High-quality RLHF / RLAIF datasets
- Auditability for regulated domains

---

## Explicitly Out of Scope (Today)

- Online model updates
- Self-modifying inference behavior
- Real-time threshold changes
- Autonomous active learning

---

## Path to RLHF (Future Work)

This system currently captures human feedback and produces RLHF-ready datasets. To evolve into true RLHF, add an offline training loop that updates model weights and deploys them safely.

### Step 1: Convert feedback into preference pairs

From each `response_id`, create:

```
(prompt, chosen_response, rejected_response)
```

Sources:
- Human corrections
- Multiple sampled answers (n=3) with human pick
- "Hallucinated" becomes rejected vs corrected

### Step 2: Train a reward model (or use DPO first)

| Option | Approach | Complexity |
|--------|----------|------------|
| DPO | Train directly on preference pairs, no explicit reward model | Simpler, good first step |
| Reward + PPO | Train reward model R(prompt, response), fine-tune policy with PPO | More complex, more knobs |

### Step 3: Offline evaluation gate

Before deployment:
- Regression suite on golden datasets
- Hallucination rate must drop
- Evidence-citation coverage must increase
- Cost/latency budgets respected

### Step 4: Safe deployment

- Canary rollout by tenant / traffic %
- Shadow mode first (compare outputs, no user impact)
- Feature flags + rollback
- Monitor: hallucination rate, user override rate, escalation rate, support tickets

### Step 5: Continuous loop

- Periodic export → train → eval → deploy
- Keep human review for high-risk cases only

### Why online RLHF is avoided

Online self-adjustment is unsafe in regulated workflows. All learning stays offline with explicit gates.
