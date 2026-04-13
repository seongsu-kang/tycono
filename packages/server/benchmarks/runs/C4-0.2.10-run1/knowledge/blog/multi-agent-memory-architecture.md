---
title: "Memory Architecture in AI Multi-Agent Systems"
akb_type: node
status: active
tags: [multi-agent, memory-architecture, AI, LLM, vector-store]
domain: tech
---

# Memory Architecture in AI Multi-Agent Systems

> How agents remember, share, and forget — a systems engineer's guide to building memory for multi-agent AI.

## Introduction

When you move from a single LLM call to a fleet of cooperating agents, memory stops being a simple conversation history and becomes a distributed systems problem. Each agent needs its own working context, but agents also need shared state to coordinate. Some memories matter for seconds; others must persist across sessions. Get the architecture wrong and your agents either forget critical context mid-task or drown in irrelevant history, blowing your token budget.

This post walks through the memory architecture patterns that work in production multi-agent systems — from individual agent memory types to shared blackboard architectures, hierarchical memory tiers, and consolidation strategies. We include concrete Python implementations you can adapt for your own systems.

---

## Core Concepts

### Memory Types in Cognitive Architecture

Each agent in a multi-agent system benefits from three distinct memory types, borrowed from cognitive science:

- **Episodic Memory**: Records of past interactions and experiences. "Last time I called the search API with this query, it returned stale results." This lets agents learn from their own history.
- **Semantic Memory**: Factual knowledge and relationships. "The user's preferred language is Python. The production database is read-only." These are durable facts that don't expire with a conversation.
- **Procedural Memory**: Learned skills and tool-usage patterns. "To deploy, run the CI pipeline first, then update the config." This encodes *how* to do things, often as tool-call sequences or prompt templates that have proven effective.

The key insight: these aren't just categories — they have different storage characteristics, retrieval patterns, and eviction policies. Episodic memory is append-heavy and time-decayed. Semantic memory is high-value and rarely evicted. Procedural memory is updated through reinforcement (successful tool calls reinforce; failures demote).

---

## Architecture Patterns

### 1. Individual Agent Memory

Each agent maintains a private memory store. This is the baseline — without it, agents are stateless functions with no ability to learn or maintain context within a task.

The private memory typically combines a rolling conversation buffer (short-term) with a retrieval-augmented store (long-term). The conversation buffer keeps the last N interactions in the context window. The retrieval store indexes all past interactions as embeddings, allowing semantic search when the buffer window is insufficient.

### 2. Shared Memory / Blackboard Architecture

The blackboard pattern is the workhorse of multi-agent coordination. A central shared state store acts as a communication hub — agents read from it to understand the current world state and write to it to publish their findings.

This decouples agents from each other. A research agent doesn't need to know about the code-writing agent; it just writes its findings to the blackboard. The code-writing agent reads the relevant entries when it needs context.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEMORY ARCHITECTURE OVERVIEW                  │
│                                                                 │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐                │
│  │  Agent A   │   │  Agent B   │   │  Agent C   │               │
│  │           │   │           │   │           │                │
│  │ ┌───────┐ │   │ ┌───────┐ │   │ ┌───────┐ │                │
│  │ │L1: Working│  │ │L1: Working│  │ │L1: Working│               │
│  │ │ Memory │ │   │ │ Memory │ │   │ │ Memory │ │                │
│  │ └───┬───┘ │   │ └───┬───┘ │   │ └───┬───┘ │                │
│  │     │     │   │     │     │   │     │     │                │
│  │ ┌───┴───┐ │   │ ┌───┴───┐ │   │ ┌───┴───┐ │                │
│  │ │L2: Episodic│ │ │L2: Episodic│ │ │L2: Episodic│              │
│  │ │ Memory │ │   │ │ Memory │ │   │ │ Memory │ │                │
│  │ └───┬───┘ │   │ └───┬───┘ │   │ └───┬───┘ │                │
│  └─────┼─────┘   └─────┼─────┘   └─────┼─────┘                │
│        │               │               │                        │
│        └───────────┬───┴───────────────┘                        │
│                    │                                             │
│         ┌──────────┴──────────┐                                  │
│         │   SHARED BLACKBOARD  │                                  │
│         │  (Coordination Hub)  │                                  │
│         └──────────┬──────────┘                                  │
│                    │                                             │
│         ┌──────────┴──────────┐                                  │
│         │  L3: Long-Term Store │                                  │
│         │  (Vector DB + KV)    │                                  │
│         └─────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Memory Hierarchy (L1 → L2 → L3)

This is directly analogous to CPU cache hierarchy, and the analogy is remarkably precise:

| Tier | CPU Analogy | Agent Memory | Capacity | Latency | Cost |
|------|-------------|-------------|----------|---------|------|
| **L1** | L1 Cache | Working memory (current context window) | Small (4-128K tokens) | Instant (in-prompt) | High (tokens/call) |
| **L2** | L2 Cache | Episodic memory (recent session history) | Medium (last N sessions) | Low (local retrieval) | Medium |
| **L3** | Main RAM / Disk | Long-term vector store (all historical data) | Large (millions of entries) | Higher (embedding + search) | Low (storage) |

Just like CPU caches, the key performance question is **hit rate**. If your L1 (context window) frequently lacks the information the agent needs, you're constantly paying the latency cost of L2/L3 retrieval. A well-designed memory architecture keeps the *right* information in L1 through intelligent promotion and eviction.

### 4. Memory Consolidation

Short-term memory can't grow forever — context windows have hard limits and retrieval degrades with noise. Consolidation is the process of promoting valuable short-term memories to long-term storage while discarding noise.

The consolidation pipeline typically involves:

1. **Importance Scoring**: Rate each memory entry by relevance (was it referenced again?), recency, and novelty (does it add new information?).
2. **Summarization**: Compress verbose interaction logs into dense semantic summaries before storage.
3. **Deduplication**: Merge memories that encode the same fact to avoid retrieval noise.
4. **Decay**: Apply time-based decay so old, unreferenced memories gradually lose retrieval priority.

---

## Code Examples

### Example 1: Short-Term Memory — Conversation Buffer

A minimal working memory implementation that maintains a bounded conversation history, automatically evicting the oldest entries when the buffer is full.

```python
class ConversationBuffer:
    """L1 working memory: bounded conversation history for an agent."""

    def __init__(self, max_entries: int = 50):
        self.max_entries = max_entries
        self._buffer: list[dict] = []

    def append(self, role: str, content: str, metadata: dict | None = None):
        entry = {
            "role": role,
            "content": content,
            "metadata": metadata or {},
            "timestamp": __import__("time").time(),
        }
        self._buffer.append(entry)
        # Evict oldest entries when buffer exceeds capacity
        if len(self._buffer) > self.max_entries:
            self._buffer = self._buffer[-self.max_entries :]

    def get(self, last_n: int | None = None) -> list[dict]:
        """Retrieve recent conversation history."""
        if last_n is None:
            return list(self._buffer)
        return list(self._buffer[-last_n:])

    def search(self, keyword: str) -> list[dict]:
        """Simple keyword search over buffer contents."""
        return [e for e in self._buffer if keyword.lower() in e["content"].lower()]

    def token_estimate(self) -> int:
        """Rough token count (4 chars per token heuristic)."""
        return sum(len(e["content"]) // 4 for e in self._buffer)


# Usage
memory = ConversationBuffer(max_entries=100)
memory.append("user", "What's the status of the deployment pipeline?")
memory.append("assistant", "The staging deploy completed. Production is pending approval.")
recent = memory.get(last_n=5)
```

### Example 2: Long-Term Memory — Vector Store with Embedding Retrieval

Long-term memory uses embeddings for semantic retrieval, allowing agents to find relevant past experiences even when exact keyword matches fail.

```python
import chromadb
from chromadb.utils import embedding_functions

class LongTermMemory:
    """L3 long-term memory: vector-indexed persistent store."""

    def __init__(self, collection_name: str = "agent_memory"):
        self.client = chromadb.PersistentClient(path="./memory_store")
        self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_fn,
        )
        self._counter = 0

    def store(self, content: str, metadata: dict | None = None):
        """Store a memory entry with auto-generated embedding."""
        self._counter += 1
        self.collection.add(
            documents=[content],
            metadatas=[metadata or {}],
            ids=[f"mem_{self._counter}"],
        )

    def retrieve(self, query: str, top_k: int = 5) -> list[dict]:
        """Semantic search: find memories most relevant to the query."""
        results = self.collection.query(query_texts=[query], n_results=top_k)
        return [
            {"content": doc, "metadata": meta, "distance": dist}
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]

    def consolidate(self, summarizer_fn, threshold: float = 0.85):
        """Merge near-duplicate memories using a summarizer function."""
        all_docs = self.collection.get()
        # Group similar documents and replace with summaries
        # (simplified — production would use clustering)
        for i, doc in enumerate(all_docs["documents"]):
            similar = self.retrieve(doc, top_k=3)
            dupes = [s for s in similar if s["distance"] < threshold and s["content"] != doc]
            if dupes:
                merged = summarizer_fn([doc] + [d["content"] for d in dupes])
                self.store(merged, metadata={"consolidated": True})


# Usage
ltm = LongTermMemory("research_agent")
ltm.store("User prefers Python over JavaScript for backend services.", {"type": "preference"})
ltm.store("The /api/v2/users endpoint requires Bearer token auth.", {"type": "fact"})
results = ltm.retrieve("How does the user API authenticate?")
```

### Example 3: Shared Memory — Blackboard Pattern

The blackboard pattern provides a shared memory space that multiple agents can read from and write to, enabling coordination without direct agent-to-agent communication.

```python
import threading
from typing import Any


class Blackboard:
    """Shared memory blackboard for multi-agent coordination.

    Thread-safe central state that any agent can read/write.
    Supports namespaced keys and change subscriptions.
    """

    def __init__(self):
        self._store: dict[str, Any] = {}
        self._lock = threading.RLock()
        self._history: list[dict] = []
        self._subscribers: dict[str, list] = {}

    def write(self, key: str, value: Any, author: str = "unknown"):
        """Write a value to the blackboard. Thread-safe."""
        with self._lock:
            self._store[key] = value
            entry = {
                "action": "write",
                "key": key,
                "author": author,
                "timestamp": __import__("time").time(),
            }
            self._history.append(entry)
            # Notify subscribers
            for callback in self._subscribers.get(key, []):
                callback(key, value, author)

    def read(self, key: str, default: Any = None) -> Any:
        """Read a value from the blackboard. Thread-safe."""
        with self._lock:
            return self._store.get(key, default)

    def read_namespace(self, prefix: str) -> dict[str, Any]:
        """Read all keys under a namespace prefix."""
        with self._lock:
            return {k: v for k, v in self._store.items() if k.startswith(prefix)}

    def subscribe(self, key: str, callback):
        """Subscribe to changes on a specific key."""
        with self._lock:
            self._subscribers.setdefault(key, []).append(callback)

    def get_history(self, author: str | None = None) -> list[dict]:
        """Get write history, optionally filtered by author."""
        with self._lock:
            if author:
                return [h for h in self._history if h["author"] == author]
            return list(self._history)


# Usage: Multiple agents sharing state
blackboard = Blackboard()

# Research agent publishes findings
blackboard.write("research.api_docs", {
    "endpoints": ["/users", "/orders"],
    "auth": "Bearer token",
}, author="research_agent")

# Code agent reads research findings to inform implementation
api_info = blackboard.read("research.api_docs")

# Planning agent writes task assignments
blackboard.write("plan.current_task", "Implement /users endpoint", author="planner_agent")

# Any agent can read the current plan
task = blackboard.read("plan.current_task")
```

---

## Best Practices

### Memory Eviction Strategies

- **LRU (Least Recently Used)**: Safe default for working memory buffers. Simple but effective.
- **Importance-Weighted Decay**: Score entries by access frequency, recency, and explicit importance flags. Evict low-scorers first. Better than pure LRU because a rarely-accessed but critical fact (like an API key format) survives.
- **Summarize-then-Evict**: Before dropping old entries from L1, summarize them into a compressed form and push to L2. You lose detail but preserve gist — often sufficient for downstream retrieval.
- **Token Budget**: Set a hard token ceiling per memory tier. When L1 exceeds its budget, aggressively consolidate. This prevents runaway context costs.

### Consistency in Shared Memory

- **Use namespaced keys** (`research.findings`, `plan.tasks`) to prevent collisions between agents writing to the same blackboard.
- **Append-only with versioning** is safer than overwrite in most multi-agent scenarios. Let agents read the latest version but keep history for debugging.
- **Optimistic concurrency**: If two agents might update the same key, use timestamps or version counters to detect conflicts rather than heavy locking.
- **Read-your-writes guarantee**: After an agent writes to the blackboard, its subsequent reads must reflect that write. This sounds obvious but can break in distributed deployments with eventual consistency.

### When to Use Which Memory Type

| Scenario | Recommended Tier | Reason |
|----------|-----------------|--------|
| Current conversation context | L1 (Working) | Needs to be in-prompt for coherent responses |
| "What did we discuss yesterday?" | L2 (Episodic) | Recent but outside current window |
| "What does the user generally prefer?" | L3 (Semantic / Vector) | Long-lived fact, semantic retrieval |
| Multi-agent task coordination | Shared Blackboard | Agents need real-time shared state |
| Tool usage patterns | L3 (Procedural) | Reinforced over many sessions |

---

## Conclusion

Memory architecture in multi-agent systems is fundamentally a distributed systems problem wearing a cognitive science hat. The patterns are well-understood — hierarchical tiers, shared blackboards, consolidation pipelines — but the implementation details matter enormously. A poorly tuned memory system either starves agents of context or drowns them in noise, and both failure modes are expensive in token costs and task quality.

Start with the simplest architecture that works: per-agent conversation buffers (L1) plus a shared blackboard for coordination. Add vector-backed long-term memory (L3) when agents need to recall information across sessions. Implement consolidation when your L2/L3 stores grow large enough that retrieval quality degrades.

The field is moving fast. As context windows grow and retrieval models improve, the boundaries between memory tiers will shift — but the fundamental architecture of hierarchical, typed, shared memory will remain the backbone of any serious multi-agent system.
