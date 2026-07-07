# loom — pure C, no external deps
CC      ?= cc
CFLAGS  ?= -O2 -Wall -Wextra
LDLIBS  := -lm

.PHONY: all day1 hw roofline clean

all: zero/day1 tools/hwprobe kstarve/roofline

zero/day1: zero/day1.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

# peak-flops probe needs native SIMD/FMA to report achievable peak honestly
tools/hwprobe: tools/hwprobe.c
	$(CC) -O3 -march=native -funroll-loops -Wall -o $@ $< $(LDLIBS)

kstarve/roofline: kstarve/roofline.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

# convenience run targets
day1: zero/day1
	./zero/day1

hw: tools/hwprobe
	./tools/hwprobe > hw.json && cat hw.json

roofline: kstarve/roofline
	./kstarve/roofline

clean:
	rm -f zero/day1 tools/hwprobe kstarve/roofline
