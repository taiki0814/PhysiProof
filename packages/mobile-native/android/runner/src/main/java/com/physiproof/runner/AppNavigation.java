package com.physiproof.runner;

import java.net.URI;

/** Exact WebView trust boundary; external pages never receive a native bridge. */
final class AppNavigation {
    static final String ORIGIN = "https://physiproof-frontend.pages.dev";
    static boolean trusted(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && "physiproof-frontend.pages.dev".equals(uri.getHost())
                && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception error) { return false; }
    }
    static String signInUrl(String requestId) {
        if (requestId == null || !requestId.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")) {
            throw new IllegalArgumentException("Invalid sign-in request");
        }
        return ORIGIN + "/app-login?request=" + requestId;
    }
}
