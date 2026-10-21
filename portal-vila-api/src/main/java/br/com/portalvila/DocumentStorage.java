package br.com.portalvila;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Saves uploaded files under the upload folder. Only PDFs and photos are accepted, and the first bytes are checked
 * so a page or a program renamed to ".jpg" is refused instead of stored.
 */
@Component
class DocumentStorage {
    static final Set<String> PHOTO_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp");
    static final Set<String> DOCUMENT_EXTENSIONS = Set.of("pdf", "jpg", "jpeg", "png", "webp");

    private final Path root;

    DocumentStorage(@Value("${portal.uploads.dir:uploads/documents}") String uploadDir) {
        this.root = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    /** Stores the file and returns where it went. {@code photosOnly} refuses PDFs. */
    Path save(MultipartFile file, boolean photosOnly) throws IOException {
        String extension = extensionOf(file.getOriginalFilename());
        Set<String> allowed = photosOnly ? PHOTO_EXTENSIONS : DOCUMENT_EXTENSIONS;
        if (!allowed.contains(extension)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                photosOnly ? "Envie uma foto (JPG, PNG ou WebP)." : "Envie um PDF ou uma foto (JPG, PNG ou WebP).");
        }
        byte[] head = file.getInputStream().readNBytes(12);
        if (!matchesContent(extension, head)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O arquivo não parece ser " + (extension.equals("pdf") ? "um PDF" : "uma foto") + " válida.");
        }
        Files.createDirectories(root);
        Path destination = root.resolve(UUID.randomUUID() + "." + extension).normalize();
        file.transferTo(destination);
        return destination;
    }

    void delete(PortalDocument document) {
        if (document.storagePath == null || document.storagePath.isBlank()) {
            return;
        }
        try {
            Files.deleteIfExists(Paths.get(document.storagePath));
        } catch (IOException ignored) {
            // The row is what matters: an orphan file does no harm.
        }
    }

    static String extensionOf(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "pdf";
        }
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    }

    static String contentTypeOf(String filename) {
        return switch (extensionOf(filename)) {
            case "pdf" -> "application/pdf";
            case "jpg", "jpeg" -> "image/jpeg";
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            default -> "application/octet-stream";
        };
    }

    private static boolean matchesContent(String extension, byte[] head) {
        return switch (extension) {
            case "pdf" -> startsWith(head, 0x25, 0x50, 0x44, 0x46);
            case "jpg", "jpeg" -> startsWith(head, 0xFF, 0xD8, 0xFF);
            case "png" -> startsWith(head, 0x89, 0x50, 0x4E, 0x47);
            case "webp" -> startsWith(head, 0x52, 0x49, 0x46, 0x46) && head.length >= 12
                && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P';
            default -> false;
        };
    }

    private static boolean startsWith(byte[] head, int... expected) {
        if (head.length < expected.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if ((head[i] & 0xFF) != expected[i]) {
                return false;
            }
        }
        return true;
    }
}
