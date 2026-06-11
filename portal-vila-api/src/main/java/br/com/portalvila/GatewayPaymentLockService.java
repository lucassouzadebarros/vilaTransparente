package br.com.portalvila;

import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

@Service
class GatewayPaymentLockService {
    private final ConcurrentHashMap<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    <T> T withLock(String gatewayPaymentId, Supplier<T> action) {
        if (gatewayPaymentId == null || gatewayPaymentId.isBlank()) {
            return action.get();
        }
        ReentrantLock lock = locks.computeIfAbsent(gatewayPaymentId, ignored -> new ReentrantLock());
        lock.lock();
        try {
            return action.get();
        } finally {
            lock.unlock();
        }
    }
}
