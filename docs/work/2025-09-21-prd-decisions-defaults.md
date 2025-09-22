# PRD: Added section 15. Decisions and Defaults

Date: 2025-09-21T19:53:03Z
Author: Agent Mode

Summary
- Inserted a new section (15. Decisions and Defaults) into docs/PRD.md to codify baseline technical/product choices, control ranges, lens/BH specifics, volumetric budgets, fallback/quality policy, accessibility, assets, telemetry/QA/CI, device tiers, acceptance protocol, and shipped presets.

Why this solution
- Keeps a single source of truth inside the PRD, reducing ambiguity during implementation.
- Moves prior open questions into concrete defaults to unblock milestones M1–M3.

Alternatives considered (and why not used)
- Keep decisions in Appendix or separate DECISIONS.md: splits context; reviewers have to cross-reference during PRD reviews.
- Leave as open questions until later: blocks engineering and acceptance criteria clarity.

Exact change
- File: D:\Github\abyss\docs\PRD.md
- Lines added: 246–320 (new section header and content).

Snippet (beginning of the inserted section):
```md path=D:\Github\abyss\docs\PRD.md start=246
15. Decisions and Defaults
- App shell: Vue 3 + Vite + TypeScript. Export a Web Component <abyss-veil> for embedding.
- Graphics policy: WebGPU-first; WebGL2 fallback.
  - WebGPU target: Chrome/Edge ≥113, Safari ≥17.4. Firefox currently falls back to WebGL2.
- Reference hardware baselines:
  - Mid-tier: NVIDIA RTX 3060 Laptop GPU (1080p), Apple M2 (base), Intel Iris Xe (11th-gen i5).
- Priority tradeoffs: Favor aesthetics when physics fidelity conflicts and performance is at risk; degrade heavy features first.
```

Verification
- Manually reviewed the PRD: section appears between Acceptance Criteria and Appendix A.
- Confirms alignment with subsequent scaffold (Vue + Vite + TS; WebGPU-first).
