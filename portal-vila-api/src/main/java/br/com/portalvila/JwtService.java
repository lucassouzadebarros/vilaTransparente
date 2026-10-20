package br.com.portalvila;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Map;

@Service
public class JwtService {
    private final SecretKey key;
    private final long expirationMinutes;

    public JwtService(
        @Value("${portal.jwt.secret}") String secret,
        @Value("${portal.jwt.expiration-minutes}") long expirationMinutes
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMinutes = expirationMinutes;
    }

    public String issue(AppUser user) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(user.email)
            .claims(Map.of(
                "role", user.role,
                "name", user.name,
                "residentId", user.residentId == null ? "" : user.residentId.toString()
            ))
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(expirationMinutes * 60)))
            .signWith(key)
            .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    private static final String DOCUMENT_TOKEN_TYPE = "document";
    private static final long DOCUMENT_TOKEN_MINUTES = 10;

    /** Short-lived link token that lets a browser tab (which cannot send the login header) open one document. */
    public String issueDocumentToken(Long documentId) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject("document:" + documentId)
            .claim("type", DOCUMENT_TOKEN_TYPE)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(DOCUMENT_TOKEN_MINUTES * 60)))
            .signWith(key)
            .compact();
    }

    public boolean isValidDocumentToken(String token, Long documentId) {
        if (token == null || token.isBlank()) {
            return false;
        }
        try {
            Claims claims = parse(token);
            return isDocumentToken(claims) && ("document:" + documentId).equals(claims.getSubject());
        } catch (RuntimeException ex) {
            return false;
        }
    }

    static boolean isDocumentToken(Claims claims) {
        return DOCUMENT_TOKEN_TYPE.equals(claims.get("type"));
    }
}
