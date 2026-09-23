# NODAL (working title)

Randomized pixel cymatics NFT collection — luxury artifacts of visible sound, generated deterministically at 64×64, reproducible from each token's own parameters.

Status: design phase. See `docs/plans/` for the design doc and implementation plan.

## Structure

- `generator/` — Python generator (deterministic PRNG, pattern engines, renderer, traits, rarity, CLI)
- `viewer/` — browser re-render / verification viewer
- `tests/` — golden-seed tests, rarity stats, uniqueness checks, contrast audits
- `output/` — generated images + metadata (regenerable, gitignored)
- `docs/plans/` — design docs and implementation plans
