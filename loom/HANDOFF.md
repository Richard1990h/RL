# loom — HANDOFF (new project, built from zero)

**Status:** NEW project. This is *not* a replication of any prior sandbox.
The original loom/zero sandbox referenced in the task brief was never
available to this session (no repo, no files). Rather than fabricate a
replication, this project is built honestly from scratch on the hardware
we actually have, keeping the *spirit* of the original brief:

- an autograd engine written from zero in C, verified by gradcheck
- a hardware truth probe (measure the machine, don't trust spec sheets)
- a pre-registered performance experiment where misses are published
  next to hits

## Ground rules (inherited as engineering discipline)

1. **No claim without an execution.** Every number in ZERO.md and in the
   commit messages comes from a command that actually ran on this box.
2. **Pre-register before running.** Predictions are written to ZERO.md
   *before* the measuring program is run. The prediction text is not
   edited afterwards.
3. **Publish misses next to hits.** Failed predictions stay in the log.
4. **ZERO.md is append-only.** Never rewrite its history.
5. Ask the operator before any run > 30 min or any download > 5 GB.

## Hardware reality (measured at session start — see hw.json for probed numbers)

- CPU: Intel Xeon @ 2.80 GHz, 4 vCPUs (4c / 1t), AVX-512 (f/dq/bw/vl/cd/vnni),
  FMA, AVX2, F16C. L1d 128 KiB, L2 4 MiB, L3 33 MiB.
- RAM: 15 GiB, no swap.
- GPU: **none.** No nvcc, no CUDA. All GPU-specific parts of the original
  brief (day1 on-GPU, CUDA kstarve port, PCIe probe, bf16 matmul) are
  replaced by honest CPU analogs. bf16 has no hardware path on this CPU
  (no avx512_bf16 flag), so it is not claimed.
- Toolchain: gcc/g++ 13.3.0, GNU make 4.3, Python 3.11.15 (no numpy/torch).

## Phases

- **PHASE 0** — Autograd from zero (`zero/day1.c`): reverse-mode autodiff in
  pure C. Deliverables: finite-difference gradcheck < 1e-6; a linear
  regression training loop that converges to the analytically-derived
  OLS minimum loss (pre-registered).
- **PHASE 1** — Hardware truth probe (`tools/hwprobe.c` -> `hw.json`):
  measured RAM bandwidth (STREAM triad), fp32 and fp64 matmul GFLOP/s.
- **PHASE 2** — Roofline / starvation study (`kstarve/`): pre-register the
  ridge point and bound predictions from the Phase 1 numbers, then measure
  kernels across a sweep of arithmetic intensity and report hits + misses.

## Build

Everything is pure C, no external deps:

```
cd loom
make            # builds zero/day1, tools/hwprobe, kstarve/roofline
make day1       # gradcheck + training
make hw         # probes hardware, writes hw.json
make roofline   # runs the pre-registered roofline experiment
```
