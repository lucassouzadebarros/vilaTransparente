package br.com.portalvila;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
class PasswordEmailService {
    private final ObjectProvider<JavaMailSender> mailSender;
    private final String mailHost;
    private final String from;

    PasswordEmailService(
        ObjectProvider<JavaMailSender> mailSender,
        @Value("${spring.mail.host:}") String mailHost,
        @Value("${portal.mail.from:}") String from
    ) {
        this.mailSender = mailSender;
        this.mailHost = mailHost == null ? "" : mailHost.trim();
        this.from = from == null ? "" : from.trim();
    }

    boolean sendTemporaryPassword(AppUser user, String temporaryPassword) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null || mailHost.isBlank() || from.isBlank()) {
            return false;
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(user.email);
        message.setSubject("Portal da Vila - senha temporaria");
        message.setText("""
            Ola, %s.

            Recebemos uma solicitacao de recuperacao de senha para o Portal da Vila.

            Sua senha temporaria e: %s

            Entre no aplicativo usando essa senha. Logo apos o login, o sistema vai solicitar que voce cadastre uma nova senha.

            Se voce nao solicitou essa recuperacao, avise a administracao da vila.
            """.formatted(user.name, temporaryPassword));
        sender.send(message);
        return true;
    }
}
