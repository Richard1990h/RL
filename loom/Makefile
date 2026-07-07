# loom — pure C, no external deps
CC      ?= cc
CFLAGS  ?= -O2 -Wall -Wextra
LDLIBS  := -lm

.PHONY: all day1 hw roofline clean

all: zero/day1 tools/hwprobe kstarve/roofline

zero/day1: zero/day1.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

tools/hwprobe: tools/hwprobe.c
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

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
