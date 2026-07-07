# ZERO.md — append-only lab log

Every entry is timestamped and append-only. Predictions are written BEFORE
the measuring run. Never edit or delete prior entries.

---

## 2026-07-07 — baseline: new project from zero

The original loom/zero sandbox was never accessible to this session (no
repo, no files). Decision (operator-approved): build a genuinely new,
CPU-only project from scratch rather than fabricate a replication.

Environment detected (measured, not assumed):
- CPU: Intel Xeon @ 2.80 GHz, 4 vCPUs, AVX-512 (f/dq/bw/vl/cd/vnni), FMA, AVX2.
- RAM: 15 GiB, no swap. GPU: none. Toolchain: gcc 13.3.0, make 4.3,
  python 3.11.15 (no numpy/torch).

Consequence: all GPU-specific goals from the original brief are replaced
by honest CPU analogs. bf16 matmul and PCIe bandwidth are NOT claimed —
no hardware path exists on this machine.

---

## 2026-07-07 — PHASE 0 PRE-REGISTRATION (written before running day1)

Program: `zero/day1.c` — reverse-mode autograd in pure C (doubles).

Predictions (locked before first run):

- **P0.1 gradcheck.** For a composite scalar function exercising
  add/mul/neg/tanh/relu/exp/log/pow, over 200 deterministic random input
  points, the maximum relative error between analytic (reverse-mode) and
  central finite-difference gradients (eps = 1e-6) will be **< 1e-6**.

- **P0.2 linear regression optimum.** Dataset (fixed, hardcoded):
  x = [0,1,2,3,4], y = [1,3,2,5,4]. The ordinary-least-squares fit of
  y = a·x + b has a closed-form solution I derived by hand:
  a = Sxy/Sxx = 8/10 = **0.8**, b = ȳ − a·x̄ = 3 − 1.6 = **1.4**,
  minimum MSE (mean over 5 points) = SSE/5 = 3.60/5 = **0.72**.
  Prediction: gradient descent driven purely by the autograd engine will
  converge to a ∈ 0.8 ± 1e-3, b ∈ 1.4 ± 1e-3, and final MSE within 1e-3
  of **0.72**.

- **P0.3 monotonicity.** With a suitably small learning rate the training
  MSE decreases monotonically (no step increases the loss).

Success = P0.1 AND P0.2 both hold. P0.3 is a softer diagnostic.

## 2026-07-07 — PHASE 0 RESULT (after running day1)

Build: `cc -O2 -Wall -o day1 day1.c -lm` (clean, no warnings). Ran ./day1.

- **P0.1 gradcheck — HIT.** max relative error = **3.570e-08** over
  200 points × 4 inputs (bar: < 1e-6). Analytic reverse-mode grads match
  central finite differences.
- **P0.2 linear regression — HIT.** GD via autograd: a=0.800000,
  b=1.400000, MSE=0.720000. In-program closed-form OLS: a=0.800000,
  b=1.400000, MSE=0.720000. Matches the hand-derived pre-registration
  (a=0.8, b=1.4, MSE=0.72) to 6 dp.
- **P0.3 monotonicity — HIT.** loss decreased monotonically over 20000
  steps (lr=0.02).

PHASE 0 verdict: **PASS**. 0 misses. Autograd engine is correct.
