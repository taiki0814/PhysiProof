package com.physiproof.runner;

/** Only sensor deltas inside this run; never imports the day's historical count. */
public final class StepAccumulator {
    private long previous = -1;
    private long total = 0;
    public long accept(long counter) {
        if (counter < 0 || (previous >= 0 && counter < previous)) throw new IllegalStateException("歩数計がリセットされました。走行を再開してください。");
        if (previous >= 0) total += counter - previous;
        previous = counter;
        return total;
    }
    public long total() { return total; }
}
