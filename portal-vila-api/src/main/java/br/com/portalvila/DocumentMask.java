package br.com.portalvila;

/** Hides most of a CPF/CNPJ for people who only need to know who the supplier is, not their personal number. */
final class DocumentMask {
    private DocumentMask() {
    }

    static String mask(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        String digits = value.replaceAll("\\D", "");
        if (digits.length() == 11) {
            return "***.***.***-" + digits.substring(9);
        }
        if (digits.length() == 14) {
            return "**.***.***/****-" + digits.substring(12);
        }
        return digits.length() <= 2 ? "***" : "***" + digits.substring(digits.length() - 2);
    }
}
