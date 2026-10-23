package com.physiproof.runner;
import org.junit.Test;
import static org.junit.Assert.*;
public class StepAccumulatorTest {
    @Test public void startsAtZeroRatherThanImportingDailySteps(){StepAccumulator s=new StepAccumulator();assertEquals(0,s.accept(10000));assertEquals(15,s.accept(10015));assertEquals(15,s.accept(10015));assertEquals(20,s.accept(10020));}
    @Test(expected=IllegalStateException.class) public void rebootCannotBackCreditSteps(){StepAccumulator s=new StepAccumulator();s.accept(10000);s.accept(100);}
}
