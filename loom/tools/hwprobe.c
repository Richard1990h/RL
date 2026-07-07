/* hwprobe.c — hardware truth probe. Measures THIS machine; no spec sheets.
 * Emits JSON to stdout. Build with -O3 -march=native so FMA/AVX are used.
 *
 * Metrics:
 *   - STREAM-triad RAM bandwidth (GB/s), single thread
 *   - fp64 / fp32 peak FMA GFLOP/s (independent-accumulator microkernel)
 *   - naive fp64 matmul GFLOP/s (a realistic, order-bound kernel)
 */
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>

static double now(void) {
    struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec + t.tv_nsec * 1e-9;
}

/* ---- STREAM triad: a = b + s*c, STREAM convention 3 arrays * 8 B ---- */
static double triad_gbs(void) {
    const long N = 8L * 1000 * 1000;      /* 3 x 64 MB = 192 MB > 33 MB L3 */
    double *a = malloc(N*sizeof(double));
    double *b = malloc(N*sizeof(double));
    double *c = malloc(N*sizeof(double));
    for (long i = 0; i < N; i++) { a[i]=0; b[i]=1.0+i*1e-9; c[i]=2.0+i*1e-9; }
    const double s = 3.0;
    double best = 0.0;
    for (int rep = 0; rep < 10; rep++) {
        double t0 = now();
        for (long i = 0; i < N; i++) a[i] = b[i] + s*c[i];
        double dt = now() - t0;
        double gbs = (3.0 * N * sizeof(double)) / dt / 1e9;
        if (gbs > best) best = gbs;
    }
    volatile double sink = a[N-1]; (void)sink;
    free(a); free(b); free(c);
    return best;
}

/* ---- peak FMA ----
 * Register-resident SIMD accumulators via GCC vector extensions guarantee
 * vectorization (AVX-512 = 8 fp64 / 16 fp32 per 64-byte vector). NV
 * independent vector chains expose enough ILP to saturate FMA throughput
 * rather than being bound by FMA latency. 2 flops per lane per FMA. */
#define NV 12
typedef double v8d  __attribute__((vector_size(64)));   /* 8 x fp64 */
typedef float  v16f __attribute__((vector_size(64)));   /* 16 x fp32 */

static double peak_fp64_gflops(void) {
    v8d acc[NV], vx, vy;
    for (int j = 0; j < NV; j++)
        for (int l = 0; l < 8; l++) acc[j][l] = 1.0 + (j*8+l)*1e-6;
    for (int l = 0; l < 8; l++) { vx[l] = 1.0000000001; vy[l] = 1e-9; }
    const long iters = 100L*1000*1000;
    double t0 = now();
    for (long i = 0; i < iters; i++)
        for (int j = 0; j < NV; j++) acc[j] = acc[j]*vx + vy;   /* FMA */
    double dt = now() - t0;
    double sink = 0; for (int j = 0; j < NV; j++) for (int l=0;l<8;l++) sink += acc[j][l];
    volatile double s2 = sink; (void)s2;
    return (2.0 * 8 * NV * (double)iters) / dt / 1e9;
}
static double peak_fp32_gflops(void) {
    v16f acc[NV], vx, vy;
    for (int j = 0; j < NV; j++)
        for (int l = 0; l < 16; l++) acc[j][l] = 1.0f + (j*16+l)*1e-6f;
    for (int l = 0; l < 16; l++) { vx[l] = 1.0000001f; vy[l] = 1e-7f; }
    const long iters = 100L*1000*1000;
    double t0 = now();
    for (long i = 0; i < iters; i++)
        for (int j = 0; j < NV; j++) acc[j] = acc[j]*vx + vy;
    double dt = now() - t0;
    double sink = 0; for (int j = 0; j < NV; j++) for (int l=0;l<16;l++) sink += acc[j][l];
    volatile double s2 = sink; (void)s2;
    return (2.0 * 16 * NV * (double)iters) / dt / 1e9;
}

/* ---- naive fp64 matmul: realistic, loop-order/cache bound ---- */
static double matmul_fp64_gflops(void) {
    const int N = 512;
    double *A = malloc((size_t)N*N*sizeof(double));
    double *B = malloc((size_t)N*N*sizeof(double));
    double *C = malloc((size_t)N*N*sizeof(double));
    for (int i = 0; i < N*N; i++) { A[i]=(i%7)*0.1; B[i]=(i%5)*0.2; C[i]=0; }
    double t0 = now();
    for (int i = 0; i < N; i++)
        for (int k = 0; k < N; k++) {           /* ikj order: friendlier to caches */
            double aik = A[i*N+k];
            for (int j = 0; j < N; j++)
                C[i*N+j] += aik * B[k*N+j];
        }
    double dt = now() - t0;
    volatile double sink = C[N*N-1]; (void)sink;
    free(A); free(B); free(C);
    return (2.0 * (double)N*N*N) / dt / 1e9;
}

int main(void) {
    double triad = triad_gbs();
    double p64   = peak_fp64_gflops();
    double p32   = peak_fp32_gflops();
    double mm64  = matmul_fp64_gflops();

    printf("{\n");
    printf("  \"machine\": \"Intel Xeon @ 2.80GHz, 4 vCPU, AVX-512\",\n");
    printf("  \"gpu\": null,\n");
    printf("  \"pcie_gbps\": null,\n");
    printf("  \"bf16_matmul_tflops\": null,\n");
    printf("  \"_note\": \"gpu/pcie/bf16 are null: no such hardware on this box\",\n");
    printf("  \"threads\": 1,\n");
    printf("  \"ram_triad_gbps\": %.2f,\n", triad);
    printf("  \"peak_fp64_gflops\": %.2f,\n", p64);
    printf("  \"peak_fp32_gflops\": %.2f,\n", p32);
    printf("  \"fp32_over_fp64\": %.3f,\n", p32/p64);
    printf("  \"naive_matmul_fp64_gflops\": %.2f,\n", mm64);
    printf("  \"peak_over_naive_fp64\": %.2f\n", p64/mm64);
    printf("}\n");
    return 0;
}
