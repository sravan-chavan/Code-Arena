'use client';

import { getToken } from './apiClient';
import {
  CONNECT_GRACE_MS,
  RECONNECT_INITIAL_MS,
  RECONNECT_MAX_ATTEMPTS,
  RECONNECT_MAX_MS,
} from './realtimeConfig';

function wsUrl() {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function delayForAttempt(attempt) {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_INITIAL_MS * (2 ** attempt));
  const jitter = Math.floor(Math.random() * Math.min(250, base / 4));
  return base + jitter;
}

class RealtimeClient {
  constructor() {
    this.ws = null;
    this.status = 'offline';
    this.authenticated = false;
    this.hasAuthenticated = false;
    this.stopped = false;
    this.attempt = 0;
    this.reconnectTimer = null;
    this.seen = new Set();
    this.desired = new Set();
    this.contestListeners = new Map();
    this.userListeners = new Set();
    this.statusListeners = new Set();
    this.reconnectListeners = new Set();
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  onStatus(listener) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onReconnect(listener) {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  onUserEvent(listener) {
    this.userListeners.add(listener);
    this.connect();
    return () => this.userListeners.delete(listener);
  }

  subscribe(contestId, listener) {
    if (!contestId) return () => {};
    this.desired.add(contestId);
    let listeners = this.contestListeners.get(contestId);
    if (!listeners) {
      listeners = new Set();
      this.contestListeners.set(contestId, listeners);
    }
    listeners.add(listener);
    this.connect();
    if (this.authenticated) {
      this.send({ type: 'subscribe', contestId });
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.contestListeners.delete(contestId);
        this.desired.delete(contestId);
        if (this.authenticated) {
          this.send({ type: 'unsubscribe', contestId });
        }
      }
    };
  }

  connect() {
    if (this.stopped) this.stopped = false;
    this.open();
  }

  disconnect() {
    this.stopped = true;
    this.authenticated = false;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('offline');
  }

  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  open() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const token = getToken();
    if (!token) {
      this.setStatus('offline');
      return;
    }
    this.setStatus(this.hasAuthenticated ? 'reconnecting' : 'reconnecting');
    const socket = new WebSocket(wsUrl());
    this.ws = socket;
    socket.onopen = () => {
      const current = getToken();
      if (!current) {
        this.disconnect();
        return;
      }
      this.send({ type: 'auth', token: current });
    };
    socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      this.authenticated = false;
      this.scheduleReconnect();
    };
  }

  scheduleReconnect() {
    if (this.stopped) {
      this.setStatus('offline');
      return;
    }
    if (this.attempt >= RECONNECT_MAX_ATTEMPTS) {
      this.setStatus('offline');
      return;
    }
    this.setStatus('reconnecting');
    const wait = delayForAttempt(this.attempt);
    this.attempt += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), wait);
  }

  handleMessage(raw) {
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (!event || typeof event.type !== 'string' || event.version !== 1) {
      return;
    }
    if (event.eventId) {
      if (this.seen.has(event.eventId)) return;
      this.seen.add(event.eventId);
      if (this.seen.size > 500) {
        const oldest = this.seen.values().next().value;
        this.seen.delete(oldest);
      }
    }
    if (event.type === 'system.subscribed' && typeof window !== 'undefined') {
      window.__wsSubscribed = window.__wsSubscribed || {};
      window.__wsSubscribed[event.contestId] = true;
    }
    if (event.type === 'system.authenticated') {
      const resumed = this.hasAuthenticated;
      this.authenticated = true;
      this.hasAuthenticated = true;
      this.attempt = 0;
      this.setStatus('connected');
      for (const contestId of this.desired) {
        this.send({ type: 'subscribe', contestId });
      }
      if (resumed) {
        for (const listener of this.reconnectListeners) listener();
      }
      return;
    }
    if (event.type === 'system.error' && event.payload?.code === 'UNAUTHENTICATED') {
      this.stopped = true;
      this.setStatus('offline');
      return;
    }
    for (const listener of this.userListeners) {
      try { listener(event); } catch { /* listener errors must not break the socket */ }
    }
    if (event.contestId && this.contestListeners.has(event.contestId)) {
      for (const listener of this.contestListeners.get(event.contestId)) {
        try { listener(event); } catch { /* ignore */ }
      }
    }
  }

  ensureConnected(timeoutMs = CONNECT_GRACE_MS) {
    if (this.authenticated && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }
    this.connect();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(false);
      }, timeoutMs);
      const off = this.onStatus((status) => {
        if (status === 'connected') {
          clearTimeout(timer);
          off();
          resolve(true);
        }
      });
    });
  }

  async waitForSubmission(submissionId, { timeoutMs = 45000, onEvent } = {}) {
    const ready = await this.ensureConnected(CONNECT_GRACE_MS);
    if (!ready) {
      const error = new Error('WebSocket unavailable');
      error.code = 'WS_UNAVAILABLE';
      throw error;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        const error = new Error('WebSocket result timed out');
        error.code = 'WS_TIMEOUT';
        reject(error);
      }, timeoutMs);
      const off = this.onUserEvent((event) => {
        const payload = event?.payload;
        if (!payload || payload.submissionId !== submissionId) return;
        if (onEvent) onEvent(event);
        if (event.type === 'submission.completed' || event.type === 'submission.failed') {
          clearTimeout(timer);
          off();
          resolve(payload);
        }
      });
    });
  }
}

let singleton = null;

export function getRealtimeClient() {
  if (!singleton) singleton = new RealtimeClient();
  if (typeof window !== 'undefined') {
    window.__codearenaRealtime = singleton;
  }
  return singleton;
}

export function disconnectRealtime() {
  if (singleton) singleton.disconnect();
}

export { RealtimeClient };
