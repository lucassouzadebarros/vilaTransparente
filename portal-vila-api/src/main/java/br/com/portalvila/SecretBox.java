package br.com.portalvila;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Seals the secrets the server must be able to read back (a condominium's Asaas key) with AES-256-GCM. The key comes from
 * {@code portal.secrets.key} (PORTAL_SECRETS_KEY), outside the database: a copy of the database alone opens nothing.
 * GCM also refuses a sealed value that was changed.
 */
@Component
class SecretBox {
    private static final String PREFIX = "v1:";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    SecretBox(@Value("${portal.secrets.key:}") String secret) {
        this.key = secret == null || secret.isBlank() ? null : new SecretKeySpec(sha256(secret), "AES");
    }

    boolean ready() {
        return key != null;
    }

    String seal(String plain) {
        requireReady();
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return PREFIX + Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not seal a secret", e);
        }
    }

    String open(String sealed) {
        requireReady();
        if (sealed == null || !sealed.startsWith(PREFIX)) {
            throw new IllegalStateException("Not a sealed value");
        }
        try {
            byte[] all = Base64.getDecoder().decode(sealed.substring(PREFIX.length()));
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, all, 0, IV_BYTES));
            return new String(cipher.doFinal(all, IV_BYTES, all.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("Could not open a sealed secret (wrong server key, or the value was changed)", e);
        }
    }

    /** For tokens that only need comparing (never reading back): their SHA-256, in hex. */
    static String digest(String value) {
        return HexFormat.of().formatHex(sha256(value));
    }

    void requireReady() {
        if (key == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "O servidor ainda não tem a chave de proteção configurada (PORTAL_SECRETS_KEY). Fale com a administração da plataforma.");
        }
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
