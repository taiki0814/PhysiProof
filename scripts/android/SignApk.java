import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.HexFormat;

/** Sign locally using Google's APK signer. Secrets are provided only through the child environment. */
public final class SignApk {
    public static void main(String[] args) throws Exception {
        if (args.length != 4) throw new IllegalArgumentException("Expected input APK, output APK, keystore and alias");
        String secret = System.getenv("FOOPE_APK_STORE_PASSWORD");
        if (secret == null) throw new IllegalStateException("Signing password missing");
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (FileInputStream input = new FileInputStream(args[2])) { store.load(input, secret.toCharArray()); }
        PrivateKey key = (PrivateKey) store.getKey(args[3], secret.toCharArray());
        List<X509Certificate> certificates = new ArrayList<>();
        for (var certificate : store.getCertificateChain(args[3])) certificates.add((X509Certificate) certificate);
        var signer = new ApkSigner.SignerConfig.Builder(args[3], key, certificates).build();
        File output = new File(args[1]);
        new ApkSigner.Builder(List.of(signer)).setInputApk(new File(args[0])).setOutputApk(output)
            .setMinSdkVersion(26).setV1SigningEnabled(true).setV2SigningEnabled(true)
            .setV3SigningEnabled(true).setV4SigningEnabled(false).build().sign();
        var verified = new ApkVerifier.Builder(output).build().verify();
        if (!verified.isVerified() || !verified.isVerifiedUsingV2Scheme()) throw new IllegalStateException("APK signature verification failed");
        if (!MessageDigest.isEqual(verified.getSignerCertificates().get(0).getEncoded(), certificates.get(0).getEncoded())) {
            throw new IllegalStateException("Unexpected APK signing certificate");
        }
        System.out.println("APK signature verified (v2/v3). Signing certificate SHA-256: "
            + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(certificates.get(0).getEncoded())));
    }
}
