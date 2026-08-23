# SkillGen Headless Benchmark

Ticks per bot: **1,000**

| Bot | Adapted branch | Branch share | Dominant action | Native modifier | Bounded |
|---|---|---:|---|---:|:---:|
| Speedster | mobility | 77.0% | Move | 0.8909 | yes |
| Tank | mitigation | 59.6% | Heavy Attack | 0.8909 | yes |
| Spammer | anti-exploit | 94.2% | Single Action | 0.8909 | yes |

## Interpretation

- Speedster's dominant actions are Move/Dash, producing the mobility branch.
- Tank's dominant actions are Block/Parry, producing the mitigation branch.
- Spammer remains capped by the native saturation curve; its hypothetical linear score is reported only as a comparison.

The report is generated from three independent native contexts running concurrently.
Baseline: `artifacts/global_baseline.json` (10,000 simulated profiles).
Audit: `artifacts/simulation_detailed_audit.log` (JSONL, one entry per bot tick).
