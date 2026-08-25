/**
 * The server, and only the server.
 *
 * This used to pick between a real implementation and a fixture one at call
 * time so a simulator could walk the app without a backend. That mode is gone:
 * every screen now depends on things a fixture cannot honestly fake — a queue
 * that survives relaunches, storage policies, realtime, a subscription — and a
 * demo that lies about those is worse than no demo at all.
 */
export * from './api.real';
