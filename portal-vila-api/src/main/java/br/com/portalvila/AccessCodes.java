package br.com.portalvila;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * The codes people type to get in for the first time (house invitations, a síndico's activation): eight characters
 * shown as XXXX-XXXX, easy to read out loud, single use. Only their hash is stored.
 */
final class AccessCodes {
    /** No 0/O and no 1/I/L: a code read out loud or from a screenshot is not mistyped. */
    private static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    static final int LENGTH = 8;
    private static final SecureRandom RANDOM = new SecureRandom();

    private AccessCodes() {
    }

    static String newCode() {
        StringBuilder code = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }

    /** The same code however it is typed: lower case, with a dash or with spaces. */
    static String normalize(String raw) {
        return raw == null ? "" : raw.toUpperCase().replaceAll("[^A-Z0-9]", "");
    }

    static boolean wellFormed(String normalized) {
        return normalized.length() == LENGTH;
    }

    /** Shown to people as XXXX-XXXX. */
    static String display(String code) {
        return code.substring(0, 4) + "-" + code.substring(4);
    }

    static String hash(String normalizedCode) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalizedCode.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
