package com.physiproof.runner;

import android.os.ParcelFileDescriptor;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.FileInputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Real Android WebView smoke test. Does not authenticate or fabricate sensor readings. */
@RunWith(AndroidJUnit4.class)
public class AppLaunchTest {
    @Test public void launchesPinnedFoopeAndExposesOnlyTheTrustedAppBridge() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<String> state = new AtomicReference<>("");
            boolean ready = false;
            for (int attempt = 0; attempt < 60; attempt++) {
                CountDownLatch observed = new CountDownLatch(1);
                scenario.onActivity(activity -> {
                    WebView web = activity.findViewById(android.R.id.content).findViewWithTag("foope-web");
                    assertNotNull(web);
                    assertFalse(web.getSettings().getAllowFileAccess());
                    assertFalse(web.getSettings().getAllowContentAccess());
                    assertTrue(web.getSettings().getUserAgentString().contains("FoopeAndroid/"));
                    web.evaluateJavascript("location.origin==='https://physiproof-frontend.pages.dev' && !!window.FoopeApp && !!document.body && document.body.innerText.includes('Googleでログイン')",
                        value -> { state.set(value); observed.countDown(); });
                });
                assertTrue("WebView callback missing", observed.await(5, TimeUnit.SECONDS));
                String value = state.get();
                if ("true".equals(value)) { ready = true; break; }
                Thread.sleep(1000);
            }
            // Gradle uninstalls the test app and removes its external files. The
            // test-only shell captures outside app data before that cleanup.
            try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                    .executeShellCommand("screencap -p /sdcard/Download/foope-app-launch.png");
                 FileInputStream output = new FileInputStream(descriptor.getFileDescriptor())) {
                byte[] buffer = new byte[1024];
                while (output.read(buffer) != -1) { /* Wait for capture completion. */ }
            }
            assertTrue("Hosted foope sign-in did not load in the trusted native WebView: " + state.get(), ready);
        }
    }
}
