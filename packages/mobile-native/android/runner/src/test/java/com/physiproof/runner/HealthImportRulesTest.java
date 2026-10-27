package com.physiproof.runner;
import org.junit.Test;
import static org.junit.Assert.*;
public class HealthImportRulesTest {
    @Test public void onlyCompletedNonManualRunsWithAnIdentifiableSourceAreEligible(){
        assertTrue(HealthImportRules.eligible(true,false,"watch.app","id",200,400,100,500));
        assertFalse(HealthImportRules.eligible(false,false,"watch.app","id",200,400,100,500));
        assertFalse(HealthImportRules.eligible(true,true,"watch.app","id",200,400,100,500));
        assertFalse(HealthImportRules.eligible(true,false,null,"id",200,400,100,500));
        assertFalse(HealthImportRules.eligible(true,false,"watch.app","",200,400,100,500));
        assertFalse(HealthImportRules.eligible(true,false,"watch.app","id",200,600,100,500));
        assertFalse(HealthImportRules.eligible(true,false,"watch.app","id",200,400,300,500));
    }
    @Test public void neverEstimateMissingDistanceFromSteps(){
        assertTrue(HealthImportRules.validDistance(5000d));
        assertFalse(HealthImportRules.validDistance(null));assertFalse(HealthImportRules.validDistance(Double.NaN));
        assertFalse(HealthImportRules.validDistance(-1d));assertFalse(HealthImportRules.validDistance(300001d));
    }
}
