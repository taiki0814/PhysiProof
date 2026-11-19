package com.physiproof.runner;

import org.junit.Test;
import static org.junit.Assert.*;

public class AppNavigationTest {
    @Test public void trustsOnlyTheExactHttpsFrontend() {
        assertTrue(AppNavigation.trusted(AppNavigation.ORIGIN + "/dashboard?tab=map"));
        assertTrue(AppNavigation.trusted("https://physiproof-frontend.pages.dev:443/login"));
        String[] rejected = { "http://physiproof-frontend.pages.dev", "https://physiproof-frontend.pages.dev.evil.example/",
            "https://evil.example@physiproof-frontend.pages.dev/", "https://physiproof-frontend.pages.dev:444/",
            "javascript:alert(1)", "file:///login", "content://private", "foope://auth/return", "", "not a URL" };
        for (String value : rejected) assertFalse(value, AppNavigation.trusted(value));
    }
    @Test public void browserHandoffContainsOnlyAnOpaqueRequestId() {
        String id = "f45bb240-1c17-4ad2-9a14-b7f1ffbcf658";
        assertEquals(AppNavigation.ORIGIN + "/app-login?request=" + id, AppNavigation.signInUrl(id));
        String[] rejected = { "", "../../login", id + "&proof=secret", "https://evil.example", "1-1-1-1-1" };
        for (String value : rejected) {
            try { AppNavigation.signInUrl(value); fail(value); } catch (IllegalArgumentException expected) { }
        }
    }
}
