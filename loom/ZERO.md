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

## 2026-07-07 — PHASE 1 PRE-REGISTRATION (written before running hwprobe)

Program: `tools/hwprobe.c` — measures this box. No spec-sheet claims.
Compiled with -O3 -march=native so AVX-512/FMA are actually used. All
measurements are SINGLE-THREADED unless stated (roofline peaks are
per-core; aggregate is noted separately).

Metrics: STREAM-triad RAM bandwidth (GB/s), fp64 & fp32 peak FMA GFLOP/s
(independent-accumulator microkernel), and naive fp64 matmul GFLOP/s.

Predictions (locked before first run):
- **H1.** Single-thread STREAM-triad bandwidth is in [5, 40] GB/s.
- **H2.** fp32 peak / fp64 peak ratio is in [1.7, 2.3] (2x SIMD width).
- **H3.** fp64 peak FMA GFLOP/s is at least 4x the naive fp64 matmul
  GFLOP/s (naive matmul is bound by memory/loop order, not the FPU).

No pass/fail gate on Phase 1 — it is a truth probe. H1–H3 are honesty
checks; hits and misses both get logged.

## 2026-07-07 — PHASE 1 RESULT #1 (instrument bug found, logged for honesty)

First run of hwprobe:
- ram_triad_gbps = 14.12  -> H1 [5,40] HIT.
- peak_fp64 = 1.65, peak_fp32 = 1.65, ratio = 1.000  -> H2 [1.7,2.3] MISS.
- peak_over_naive_fp64 = 0.24 (peak 1.65 < naive matmul 6.76) -> H3 MISS.

Diagnosis: H2/H3 "misses" are an INSTRUMENT BUG, not hardware truth. A
peak-FLOPs kernel that reports below a naive matmul cannot be measuring the
FPU ceiling. Root cause: 32 scalar accumulators spilled to the stack, so
the loop was L1-load-latency bound and never vectorized (hence fp32==fp64
exactly). Fix: rewrite the peak kernel with AVX-512 GCC vector accumulators
(register-resident, enough ILP to saturate FMA throughput) and re-measure.
The 14.12 GB/s triad number stands (that kernel was fine).

## 2026-07-07 — PHASE 1 RESULT #2 (fixed instrument, final)

hw.json (single thread, -O3 -march=native):
- ram_triad_gbps            = 14.13   -> H1 [5,40]      HIT
- peak_fp64_gflops          = 82.17
- peak_fp32_gflops          = 165.53
- fp32_over_fp64            = 2.015   -> H2 [1.7,2.3]   HIT
- naive_matmul_fp64_gflops  = 7.30
- peak_over_naive_fp64      = 11.26   -> H3 (>=4)       HIT

Sanity: 2.8 GHz x 8 fp64 lanes x 2 flops/FMA x 2 FMA units = 89.6 GFLOP/s
theoretical; measured 82.17 = ~92% of that. fp32 exactly 2x (double SIMD
width). Credible. Final tally H1-H3 after instrument fix: 3 HIT, 0 miss.
gpu/pcie/bf16 remain null (no hardware). These per-core numbers feed the
Phase 2 roofline: ridge = peak_fp64/triad = 82.17/14.13 = 5.82 FLOP/byte.
