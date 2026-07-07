/* day1.c — reverse-mode autograd from zero, in pure C (doubles, no libs).
 *
 * A "Value" is a node in a dynamically-built expression graph. Every op
 * appends its result node to a global tape in creation order. Because a
 * child is always created before its parent, creation order is a valid
 * topological order; backprop walks the tape in reverse.
 *
 * Deliverables (see loom/ZERO.md pre-registration):
 *   P0.1  gradcheck: analytic vs central finite-difference grads < 1e-6
 *   P0.2  linear regression converges to the closed-form OLS optimum
 *   P0.3  training loss decreases monotonically
 *
 * Build: cc -O2 -o day1 day1.c -lm
 */
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>

/* ----- ops ----- */
enum { OP_LEAF, OP_ADD, OP_MUL, OP_NEG, OP_TANH, OP_RELU, OP_EXP, OP_LOG, OP_POW };

typedef struct Value {
    double data;
    double grad;
    struct Value *a, *b;   /* operands (b unused for unary) */
    int op;
    double aux;            /* exponent for OP_POW */
} Value;

/* ----- tape (arena) ----- */
static Value **tape = NULL;
static int tape_len = 0, tape_cap = 0;

static Value *push(Value *v) {
    if (tape_len == tape_cap) {
        tape_cap = tape_cap ? tape_cap * 2 : 1024;
        tape = (Value **)realloc(tape, tape_cap * sizeof(Value *));
    }
    tape[tape_len++] = v;
    return v;
}

static void tape_clear(void) {
    for (int i = 0; i < tape_len; i++) free(tape[i]);
    tape_len = 0;
}

static Value *mk(double data, int op, Value *a, Value *b, double aux) {
    Value *v = (Value *)calloc(1, sizeof(Value));
    v->data = data; v->op = op; v->a = a; v->b = b; v->aux = aux;
    return push(v);
}

/* ----- constructors / ops (forward computes data immediately) ----- */
static Value *leaf(double x)            { return mk(x, OP_LEAF, NULL, NULL, 0); }
static Value *v_add(Value *a, Value *b) { return mk(a->data + b->data, OP_ADD, a, b, 0); }
static Value *v_mul(Value *a, Value *b) { return mk(a->data * b->data, OP_MUL, a, b, 0); }
static Value *v_neg(Value *a)           { return mk(-a->data, OP_NEG, a, NULL, 0); }
static Value *v_sub(Value *a, Value *b) { return v_add(a, v_neg(b)); }
static Value *v_tanh(Value *a)          { return mk(tanh(a->data), OP_TANH, a, NULL, 0); }
static Value *v_relu(Value *a)          { return mk(a->data > 0 ? a->data : 0.0, OP_RELU, a, NULL, 0); }
static Value *v_exp(Value *a)           { return mk(exp(a->data), OP_EXP, a, NULL, 0); }
static Value *v_log(Value *a)           { return mk(log(a->data), OP_LOG, a, NULL, 0); }
static Value *v_pow(Value *a, double c) { return mk(pow(a->data, c), OP_POW, a, NULL, c); }

/* ----- backward: reverse pass over the whole tape ----- */
static void backward(Value *out) {
    for (int i = 0; i < tape_len; i++) tape[i]->grad = 0.0;
    out->grad = 1.0;
    for (int i = tape_len - 1; i >= 0; i--) {
        Value *v = tape[i];
        double g = v->grad;
        switch (v->op) {
            case OP_ADD:  v->a->grad += g;              v->b->grad += g;              break;
            case OP_MUL:  v->a->grad += g * v->b->data; v->b->grad += g * v->a->data; break;
            case OP_NEG:  v->a->grad += -g;                                           break;
            case OP_TANH: v->a->grad += g * (1.0 - v->data * v->data);                break;
            case OP_RELU: v->a->grad += g * (v->a->data > 0 ? 1.0 : 0.0);             break;
            case OP_EXP:  v->a->grad += g * v->data;                                  break;
            case OP_LOG:  v->a->grad += g * (1.0 / v->a->data);                       break;
            case OP_POW:  v->a->grad += g * v->aux * pow(v->a->data, v->aux - 1.0);   break;
            case OP_LEAF: default: break;
        }
    }
}

/* =====================================================================
 * P0.1 — gradcheck
 * Composite function of 4 inputs exercising every op. log argument is
 * kept strictly positive by construction (x2*x2 + 2).
 * ===================================================================== */
#define NIN 4
static double eval_f(const double *x, int do_backward, double *grads_out) {
    tape_clear();
    Value *in[NIN];
    for (int i = 0; i < NIN; i++) in[i] = leaf(x[i]);

    /* f = (x0*x1 + tanh(x2)) * relu(x3 + 0.5)
     *     + exp(0.3*x0) - x1^2 + log(x2^2 + 2) */
    Value *t1 = v_add(v_mul(in[0], in[1]), v_tanh(in[2]));
    Value *t2 = v_relu(v_add(in[3], leaf(0.5)));
    Value *t3 = v_exp(v_mul(leaf(0.3), in[0]));
    Value *t4 = v_pow(in[1], 2.0);
    Value *t5 = v_log(v_add(v_pow(in[2], 2.0), leaf(2.0)));
    Value *f  = v_add(v_sub(v_add(v_mul(t1, t2), t3), t4), t5);

    if (do_backward) {
        backward(f);
        for (int i = 0; i < NIN; i++) grads_out[i] = in[i]->grad;
    }
    return f->data;
}

/* deterministic LCG so runs are reproducible without external state */
static unsigned long long rng_state = 0x2545F4914F6CDD1DULL;
static double urand(void) { /* uniform in [-2, 2) */
    rng_state = rng_state * 6364136223846793005ULL + 1442695040888963407ULL;
    unsigned long long r = rng_state >> 11;
    return ((double)r / (double)(1ULL << 53)) * 4.0 - 2.0;
}

static int gradcheck(void) {
    const double eps = 1e-6;
    const int N = 200;
    double max_rel = 0.0;
    double ga[NIN], x[NIN];
    for (int t = 0; t < N; t++) {
        for (int i = 0; i < NIN; i++) x[i] = urand();
        eval_f(x, 1, ga);                       /* analytic grads */
        for (int i = 0; i < NIN; i++) {
            double xi = x[i];
            x[i] = xi + eps; double fp = eval_f(x, 0, NULL);
            x[i] = xi - eps; double fm = eval_f(x, 0, NULL);
            x[i] = xi;
            double gn = (fp - fm) / (2.0 * eps);   /* numeric grad */
            double rel = fabs(ga[i] - gn) / (fabs(ga[i]) + fabs(gn) + 1e-12);
            if (rel > max_rel) max_rel = rel;
        }
    }
    printf("[P0.1] gradcheck: max relative error = %.3e over %d points x %d inputs\n",
           max_rel, N, NIN);
    int pass = max_rel < 1e-6;
    printf("[P0.1] %s (bar: < 1e-6)\n", pass ? "PASS" : "FAIL");
    return pass;
}

/* =====================================================================
 * P0.2 / P0.3 — linear regression via the autograd engine
 * Dataset fixed & hardcoded. Closed-form OLS optimum pre-registered in
 * ZERO.md: a=0.8, b=1.4, MSE=0.72.
 * ===================================================================== */
static int linreg(void) {
    const double xs[5] = {0, 1, 2, 3, 4};
    const double ys[5] = {1, 3, 2, 5, 4};
    const int n = 5;

    double a_val = 0.0, b_val = 0.0;     /* parameters (plain doubles) */
    const double lr = 0.02;
    const int steps = 20000;
    double prev_loss = 1e300;
    int monotone = 1;
    double loss_data = 0.0;

    for (int s = 0; s < steps; s++) {
        tape_clear();
        Value *A = leaf(a_val), *B = leaf(b_val);
        Value *sse = leaf(0.0);
        for (int i = 0; i < n; i++) {
            Value *pred = v_add(v_mul(A, leaf(xs[i])), B);
            Value *err  = v_sub(pred, leaf(ys[i]));
            sse = v_add(sse, v_pow(err, 2.0));
        }
        Value *mse = v_mul(sse, leaf(1.0 / n));
        backward(mse);
        loss_data = mse->data;
        if (loss_data > prev_loss + 1e-12) monotone = 0;
        prev_loss = loss_data;
        a_val -= lr * A->grad;
        b_val -= lr * B->grad;
    }

    /* independent closed-form OLS check computed here in-program */
    double sx=0, sy=0, sxx=0, sxy=0;
    for (int i=0;i<n;i++){ sx+=xs[i]; sy+=ys[i]; sxx+=xs[i]*xs[i]; sxy+=xs[i]*ys[i]; }
    double Sxx = sxx - sx*sx/n, Sxy = sxy - sx*sy/n;
    double a_ols = Sxy/Sxx, b_ols = sy/n - a_ols*sx/n;
    double sse_ols=0; for(int i=0;i<n;i++){ double r=ys[i]-(a_ols*xs[i]+b_ols); sse_ols+=r*r; }
    double mse_ols = sse_ols/n;

    printf("[P0.2] GD  : a=%.6f b=%.6f MSE=%.6f\n", a_val, b_val, loss_data);
    printf("[P0.2] OLS : a=%.6f b=%.6f MSE=%.6f (closed form, in-program)\n",
           a_ols, b_ols, mse_ols);
    int pass = fabs(a_val-0.8)<1e-3 && fabs(b_val-1.4)<1e-3 && fabs(loss_data-0.72)<1e-3;
    printf("[P0.2] %s (bars: a=0.8 b=1.4 MSE=0.72, tol 1e-3)\n", pass ? "PASS" : "FAIL");
    printf("[P0.3] loss monotonic over %d steps: %s\n", steps, monotone ? "YES" : "NO");
    return pass;
}

int main(void) {
    printf("=== loom PHASE 0: autograd from zero (day1.c) ===\n");
    int ok1 = gradcheck();
    int ok2 = linreg();
    printf("=== PHASE 0 %s ===\n", (ok1 && ok2) ? "PASS" : "FAIL");
    return (ok1 && ok2) ? 0 : 1;
}
