package com.physiproof.runner;

import android.os.ParcelFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.Color;
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
                    assertTrue("WebView must be laid out", web.getWidth()>100 && web.getHeight()>100);
                    assertTrue(web.getSettings().getUserAgentString().contains("FoopeAndroid/"));
                    web.evaluateJavascript("location.origin==='https://physiproof-frontend.pages.dev' && !!window.FoopeApp && !!document.body && document.body.innerText.includes('Googleでログイン')",
                        value -> { state.set(value); observed.countDown(); });
                });
                assertTrue("WebView callback missing", observed.await(5, TimeUnit.SECONDS));
                String value = state.get();
                if ("true".equals(value)) { ready = true; break; }
                Thread.sleep(1000);
            }
            assertTrue("Hosted foope sign-in did not load in the trusted native WebView: " + state.get(), ready);
            CountDownLatch painted = new CountDownLatch(1);
            scenario.onActivity(activity -> {
                WebView web = activity.findViewById(android.R.id.content).findViewWithTag("foope-web");
                web.postVisualStateCallback(1, new WebView.VisualStateCallback() {
                    @Override public void onComplete(long requestId) { web.postDelayed(painted::countDown, 500); }
                });
            });
            assertTrue("WebView did not complete its first paint", painted.await(15, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            Bitmap visible = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            assertNotNull("Android screenshot unavailable", visible);
            int coloredPixels=0;
            for(int y=0;y<visible.getHeight();y+=4)for(int x=0;x<visible.getWidth();x+=4){
                int color=visible.getPixel(x,y);
                if(Color.green(color)>150 && Color.green(color)>Color.red(color)+20 && Color.green(color)>Color.blue(color)+20)coloredPixels++;
            }
            visible.recycle();
            // Gradle uninstalls the test app and removes its external files. The
            // test-only shell captures outside app data before that cleanup.
            try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                    .executeShellCommand("screencap -p /sdcard/Download/foope-app-launch.png");
                 FileInputStream output = new FileInputStream(descriptor.getFileDescriptor())) {
                byte[] buffer = new byte[1024];
                while (output.read(buffer) != -1) { /* Wait for capture completion. */ }
            }
            assertTrue("Login DOM exists but the Android screen is blank", coloredPixels>100);
        }
    }
}
