package br.com.portalvila;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Runs the real migrations (db/migration) on an in-memory H2, one file at a time, so a test can stop at a version,
 * put data in, and apply the next one.
 *
 * The migrations are written for PostgreSQL. A few old ones only move data or use PostgreSQL-only syntax, so they are
 * skipped here, and the one multi-column "add column" is split in two statements for H2. New migrations must stay
 * plain (one column per "alter table", ANSI types) so they run on both.
 */
final class TestMigrations {
    /** Data-only or PostgreSQL-only: they do not change the schema. */
    private static final Set<String> SKIPPED = Set.of("V7", "V15");

    private TestMigrations() {
    }

    static String url(String name) {
        return "jdbc:h2:mem:" + name + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
    }

    /** Applies the migrations whose version is between {@code from} and {@code to}, both included. */
    static void run(String url, int from, int to) {
        try (Connection connection = DriverManager.getConnection(url, "sa", ""); Statement statement = connection.createStatement()) {
            Resource[] files = new PathMatchingResourcePatternResolver().getResources("classpath:db/migration/V*.sql");
            Arrays.sort(files, Comparator.comparingInt(TestMigrations::version));
            for (Resource file : files) {
                int version = version(file);
                if (version < from || version > to || SKIPPED.contains("V" + version)) {
                    continue;
                }
                String sql = new String(file.getInputStream().readAllBytes(), StandardCharsets.UTF_8)
                    .replace("\r", "")
                    .replace(",\n  add column if not exists", ";\nalter table documents add column if not exists");
                for (String command : sql.split(";\\s*\n|;\\s*$")) {
                    if (!command.isBlank()) {
                        try {
                            statement.execute(command);
                        } catch (Exception e) {
                            throw new IllegalStateException("Migration " + file.getFilename() + " failed on: " + command, e);
                        }
                    }
                }
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static int version(Resource file) {
        Matcher matcher = Pattern.compile("V(\\d+)__").matcher(file.getFilename());
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : 0;
    }
}
