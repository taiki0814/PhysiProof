package com.physiproof.runner;

import android.graphics.Bitmap;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
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
            Bitmap screenshot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            File image = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "app-launch.png");
            try (FileOutputStream output = new FileOutputStream(image)) { screenshot.compress(Bitmap.CompressFormat.PNG, 100, output); }
            screenshot.recycle();
            assertTrue("Hosted foope sign-in did not load in the trusted native WebView: " + state.get(), ready);
        }
    }
}
