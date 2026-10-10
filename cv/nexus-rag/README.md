# nexus-rag — Long-Term Vector Memory & RAG engine

Zero-dependency, isomorphic TypeScript RAG core for Nexus AI.

## Pipeline
1. **Chunking** — `chunkText()` sentence-aware, bilingual (AR/EN/FR) with overlap.
2. **Embeddings** — `embedTexts()` provider chain: Gemini `text-embedding-004`
   → OpenAI `text-embedding-3-small` → deterministic local hashing embedder (512d).
   Can never fail: the local provider always answers.
3. **Vector stores** — Pinecone (REST, no SDK) → Postgres (`barq.ai_memory_vectors`,
   JSON vectors, cosine in JS — no pgvector extension needed) → in-process LRU.
4. **Retrieval** — per-backend cosine ranking fused with Reciprocal Rank Fusion
   and a 45-day-half-life recency boost (`fuseHits`).

## High-level API (`src/lib/memory.ts`)
| fn | what |
| --- | --- |
| `rememberFact(userId, fact)` | embed + upsert everywhere |
| `semanticRecall(userId, query, k)` | fused top-k recall |
| `buildMemoryContext(userId, query)` | prompt-ready block (auto-injected in chat) |
| `autoDistillAndStore(userId, text)` | passive fact distillation from chat |
| `compactHistory(turns)` | dynamic long-session compression |

## Diagnostics
- `GET /api/memory/recall` — engine status (auth required)
- `POST /api/memory/recall { query, k }` — semantic recall
- `POST /api/memory/recall { save }` — store one fact

`nexus_rag.py` remains as the Python reference implementation of the same pipeline.
