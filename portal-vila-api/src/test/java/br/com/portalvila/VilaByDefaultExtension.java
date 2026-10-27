package br.com.portalvila;

import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

/**
 * Every test runs as the Vila unless it says otherwise. The tests were written when there was one condominium and
 * set up their data straight through the repositories; in the running app nothing defaults to the Vila any more (work
 * that names no condominium runs as {@link TenantContext#NONE}). Registered for all tests in
 * {@code META-INF/services/org.junit.jupiter.api.extension.Extension}.
 */
public class VilaByDefaultExtension implements BeforeEachCallback, AfterEachCallback {
    @Override
    public void beforeEach(ExtensionContext context) {
        TenantContext.set(TenantContext.VILA);
    }

    @Override
    public void afterEach(ExtensionContext context) {
        TenantContext.clear();
    }
}
