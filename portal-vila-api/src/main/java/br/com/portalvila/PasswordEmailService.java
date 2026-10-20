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

    boolean isConfigured() {
        return mailSender.getIfAvailable() != null && !mailHost.isBlank() && !from.isBlank();
    }

    /** The code only works for a short time; the current password keeps working until the code is used. */
    boolean sendResetCode(AppUser user, String code, long validForMinutes) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (!isConfigured() || sender == null) {
            return false;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(user.email);
        message.setSubject("Portal da Vila - codigo para trocar a senha");
        message.setText("""
            Ola, %s.

            Recebemos um pedido para trocar a senha do Portal da Vila.

            Seu codigo e: %s

            Ele vale por %d minutos. Digite o codigo no aplicativo, na tela "Esqueci minha senha", junto com a nova senha.

            Se voce nao pediu, ignore este e-mail: sua senha atual continua funcionando.
            """.formatted(user.name, code, validForMinutes));
        try {
            sender.send(message);
            return true;
        } catch (org.springframework.mail.MailException ex) {
            return false;
        }
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
