/* roofline.c — CPU "starvation" study (honest analog of the original kstarve).
 *
 * A vectorized fp64 kernel streams a 64 MB array (> L3) and performs W fused
 * multiply-adds per 8-wide AVX-512 vector before reducing. Arithmetic
 * intensity AI = W/4 FLOP/byte. Sweeping W walks the roofline from the
 * memory-bound region (starved: perf ~ AI*BW) through the ridge point into
 * the compute-bound region (perf ~ peak FLOP/s).
 *
 * Predictions are pre-registered in loom/ZERO.md. This program only measures.
 * Build: cc -O3 -march=native -funroll-loops -o roofline roofline.c -lm
 */
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

/* Phase-1 measured, per core */
#define PEAK_FP64_GFLOPS 82.17
#define TRIAD_GBPS       14.13

typedef double v8d __attribute__((vector_size(64)));   /* 8 x fp64 = AVX-512 */

static double now(void) {
    struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec + t.tv_nsec * 1e-9;
}

/* stream N doubles as N/8 vectors; W FMAs each; return best GFLOP/s + set *gbps */
static double run_W(v8d *v, long nv, int W, double *gbps_out) {
    v8d c1, c2;
    for (int l = 0; l < 8; l++) { c1[l] = 1.0000000001; c2[l] = 1e-9; }
    double best_g = 0.0, best_bw = 0.0;
    for (int rep = 0; rep < 6; rep++) {
        v8d sum; for (int l=0;l<8;l++) sum[l]=0.0;
        double t0 = now();
        for (long i = 0; i < nv; i++) {
            v8d acc = v[i];                      /* 64 bytes read */
            for (int w = 0; w < W; w++) acc = acc*c1 + c2;   /* W vector FMAs */
            sum += acc;
        }
        double dt = now() - t0;
        double sink = 0; for (int l=0;l<8;l++) sink += sum[l];
        volatile double s2 = sink; (void)s2;
        double bytes = 8.0 * 8.0 * (double)nv;   /* whole array read once */
        double flops = 2.0 * 8.0 * (double)W * (double)nv;
        double g  = flops / dt / 1e9;
        double bw = bytes / dt / 1e9;
        if (g > best_g) { best_g = g; best_bw = bw; }
    }
    *gbps_out = best_bw;
    return best_g;
}

int main(void) {
    const long N  = 8L*1000*1000;      /* 64 MB > 33 MB L3 */
    const long nv = N / 8;
    v8d *v = aligned_alloc(64, nv * sizeof(v8d));
    for (long i = 0; i < nv; i++) for (int l=0;l<8;l++) v[i][l] = 1.0 + (i*8+l)*1e-9;

    const double ridge_ai = PEAK_FP64_GFLOPS / TRIAD_GBPS;
    int Ws[] = {1,2,4,8,16,24,32,48,64,128};
    int nW = sizeof(Ws)/sizeof(Ws[0]);

    printf("# roofline sweep — peak=%.2f GF, BW=%.2f GB/s, ridge AI*=%.2f (W*=%.1f)\n",
           PEAK_FP64_GFLOPS, TRIAD_GBPS, ridge_ai, 4*ridge_ai);
    printf("# %-4s %-8s %-10s %-10s %-10s %-s\n",
           "W","AI","GFLOP/s","eff_GB/s","model_GF","bound");
    double plateau = 0.0;
    double results_g[32]; double results_ai[32];
    for (int k = 0; k < nW; k++) {
        int W = Ws[k];
        double ai = W / 4.0;
        double bw;
        double g = run_W(v, nv, W, &bw);
        double model = PEAK_FP64_GFLOPS < ai*TRIAD_GBPS ? PEAK_FP64_GFLOPS : ai*TRIAD_GBPS;
        const char *bound = ai < ridge_ai ? "mem" : "compute";
        printf("  %-4d %-8.2f %-10.2f %-10.2f %-10.2f %s\n", W, ai, g, bw, model, bound);
        results_g[k] = g; results_ai[k] = ai;
        if (g > plateau) plateau = g;
    }

    /* --- evaluate the pre-registered predictions --- */
    /* R1: effective BW for W<=4 within [10,16] */
    double bw1;
    (void)run_W(v, nv, 2, &bw1);          /* representative low-AI point */
    int R1 = (bw1 >= 10.0 && bw1 <= 16.0);
    /* R2: knee = smallest W reaching >=90% plateau; within [12,48] */
    int knee_W = Ws[nW-1];
    for (int k = 0; k < nW; k++) if (results_g[k] >= 0.90*plateau) { knee_W = Ws[k]; break; }
    int R2 = (knee_W >= 12 && knee_W <= 48);
    /* R3: plateau within 30% of peak (>=57.5) */
    int R3 = (plateau >= 0.70*PEAK_FP64_GFLOPS);

    printf("\n# --- pre-registered verdicts ---\n");
    printf("R1 mem-bound BW (W=2) = %.2f GB/s in [10,16]? %s\n", bw1, R1?"HIT":"MISS");
    printf("R2 knee W = %d in [12,48]? %s\n", knee_W, R2?"HIT":"MISS");
    printf("R3 plateau = %.2f GF >= 57.5 (70%% of peak)? %s\n", plateau, R3?"HIT":"MISS");

    /* JSON for the record */
    FILE *f = fopen("kstarve_gpu.json", "w");
    if (f) {
        fprintf(f, "{\n  \"_note\": \"CPU roofline analog of kstarve; no GPU on this box\",\n");
        fprintf(f, "  \"peak_fp64_gflops\": %.2f,\n  \"triad_gbps\": %.2f,\n", PEAK_FP64_GFLOPS, TRIAD_GBPS);
        fprintf(f, "  \"ridge_ai_flop_per_byte\": %.2f,\n", ridge_ai);
        fprintf(f, "  \"sweep\": [\n");
        for (int k = 0; k < nW; k++)
            fprintf(f, "    {\"W\": %d, \"ai\": %.2f, \"gflops\": %.2f}%s\n",
                    Ws[k], results_ai[k], results_g[k], k<nW-1?",":"");
        fprintf(f, "  ],\n  \"plateau_gflops\": %.2f,\n  \"knee_W\": %d,\n", plateau, knee_W);
        fprintf(f, "  \"R1_membw_hit\": %s,\n  \"R2_knee_hit\": %s,\n  \"R3_ceiling_hit\": %s\n}\n",
                R1?"true":"false", R2?"true":"false", R3?"true":"false");
        fclose(f);
    }
    free(v);
    return 0;
}
