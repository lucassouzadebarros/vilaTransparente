package br.com.portalvila;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Sealing the secrets kept in the database: readable back only with the server's key, and never if changed. */
class SecretBoxTest {
    private final SecretBox box = new SecretBox("chave-do-servidor");

    @Test
    void aSealedSecretOpensWithTheSameKeyAndIsNotReadableInTheDatabase() {
        String sealed = box.seal("$aact_minha_chave_secreta");

        assertThat(sealed).startsWith("v1:").doesNotContain("minha_chave");
        assertThat(box.open(sealed)).isEqualTo("$aact_minha_chave_secreta");
        // The same secret twice gives two different sealed values (a fresh nonce every time).
        assertThat(box.seal("$aact_minha_chave_secreta")).isNotEqualTo(sealed);
    }

    @Test
    void anotherKeyOrAChangedValueOpensNothing() {
        String sealed = box.seal("$aact_minha_chave_secreta");
        char[] changed = sealed.toCharArray();
        changed[10] = changed[10] == 'A' ? 'B' : 'A';

        assertThatThrownBy(() -> new SecretBox("outra-chave").open(sealed)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> box.open(new String(changed))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void withoutTheServerKeyNothingIsSealed() {
        SecretBox unset = new SecretBox("");

        assertThat(unset.ready()).isFalse();
        assertThatThrownBy(() -> unset.seal("x")).isInstanceOf(ResponseStatusException.class);
    }
}
