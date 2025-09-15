/**
 * 고급 이벤트 버스 시스템 (난이도 7/10)
 * 비동기 이벤트 처리, 미들웨어, 이벤트 체이닝, 우선순위 큐 지원
 * 복잡한 애플리케이션을 위한 확장 가능한 이벤트 시스템
 */

class EventBus {
  constructor(config = {}) {
    this.events = new Map();
    this.middlewares = [];
    this.config = {
      maxListeners: config.maxListeners || 10,
      enableLogging: config.enableLogging || false,
      asyncTimeout: config.asyncTimeout || 5000,
      errorHandler: config.errorHandler || this.defaultErrorHandler,
      enableMetrics: config.enableMetrics || false
    };

    this.metrics = {
      eventsFired: new Map(),
      listenerExecutions: new Map(),
      errors: new Map(),
      performance: new Map()
    };

    this.wildcardCache = new Map();
    this.eventHistory = [];
    this.maxHistorySize = config.maxHistorySize || 100;

    // 이벤트 체인 관리
    this.chains = new Map();
    this.runningChains = new Set();
  }

  /**
   * 이벤트 리스너 등록 (우선순위 지원)
   * @param {string} event - 이벤트 이름 (와일드카드 지원: *, **)
   * @param {Function} handler - 핸들러 함수
   * @param {Object} options - 옵션 (priority, once, async, timeout)
   */
  on(event, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }

    const listener = {
      handler,
      priority: options.priority || 0,
      once: options.once || false,
      async: options.async || false,
      timeout: options.timeout || this.config.asyncTimeout,
      id: this.generateListenerId()
    };

    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const listeners = this.events.get(event);

    // 최대 리스너 수 체크
    if (listeners.length >= this.config.maxListeners) {
      this.log('warn', `Max listeners (${this.config.maxListeners}) exceeded for event "${event}"`);
    }

    // 우선순위에 따라 정렬하여 삽입
    const insertIndex = listeners.findIndex(l => l.priority < listener.priority);
    if (insertIndex === -1) {
      listeners.push(listener);
    } else {
      listeners.splice(insertIndex, 0, listener);
    }

    // 와일드카드 캐시 무효화
    this.invalidateWildcardCache(event);

    return listener.id;
  }

  /**
   * 한 번만 실행되는 리스너 등록
   */
  once(event, handler, options = {}) {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * 리스너 제거
   * @param {string} event - 이벤트 이름
   * @param {Function|string} handlerOrId - 핸들러 함수 또는 리스너 ID
   */
  off(event, handlerOrId) {
    if (!this.events.has(event)) return false;

    const listeners = this.events.get(event);
    const originalLength = listeners.length;

    if (typeof handlerOrId === 'string') {
      // ID로 제거
      const index = listeners.findIndex(l => l.id === handlerOrId);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    } else {
      // 핸들러 함수로 제거
      const index = listeners.findIndex(l => l.handler === handlerOrId);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }

    if (listeners.length === 0) {
      this.events.delete(event);
    }

    this.invalidateWildcardCache(event);
    return originalLength !== listeners.length;
  }

  /**
   * 모든 리스너 제거
   */
  offAll(event) {
    if (event) {
      this.events.delete(event);
      this.invalidateWildcardCache(event);
    } else {
      this.events.clear();
      this.wildcardCache.clear();
    }
  }

  /**
   * 이벤트 발생 (비동기 지원)
   * @param {string} event - 이벤트 이름
   * @param {...*} args - 이벤트 인자
   */
  async emit(event, ...args) {
    const startTime = performance.now();

    // 메트릭 수집
    if (this.config.enableMetrics) {
      this.updateMetrics('eventsFired', event);
    }

    // 히스토리 기록
    this.addToHistory(event, args);

    // 미들웨어 실행
    const middlewareResult = await this.runMiddlewares(event, args);
    if (middlewareResult === false) {
      this.log('info', `Event "${event}" cancelled by middleware`);
      return [];
    }

    // 직접 리스너와 와일드카드 리스너 수집
    const listeners = this.collectListeners(event);

    if (listeners.length === 0) {
      this.log('debug', `No listeners for event "${event}"`);
      return [];
    }

    // 리스너 실행
    const results = [];
    const errors = [];

    for (const listener of listeners) {
      try {
        const result = await this.executeListener(listener, event, args);
        results.push(result);

        // once 리스너 제거
        if (listener.once) {
          this.off(listener.originalEvent || event, listener.id);
        }

        // 메트릭 수집
        if (this.config.enableMetrics) {
          this.updateMetrics('listenerExecutions', event);
        }
      } catch (error) {
        errors.push({ listener, error });
        this.handleError(error, event, listener);

        if (this.config.enableMetrics) {
          this.updateMetrics('errors', event);
        }
      }
    }

    // 성능 메트릭
    if (this.config.enableMetrics) {
      const duration = performance.now() - startTime;
      this.updatePerformanceMetrics(event, duration);
    }

    // 에러가 있었다면 throw
    if (errors.length > 0 && this.config.throwErrors) {
      throw new AggregateError(errors, `Errors in event "${event}"`);
    }

    return results;
  }

  /**
   * 동기적 이벤트 발생
   */
  emitSync(event, ...args) {
    const listeners = this.collectListeners(event);
    const results = [];

    for (const listener of listeners) {
      if (listener.async) {
        this.log('warn', `Async listener skipped in sync emit for event "${event}"`);
        continue;
      }

      try {
        const result = listener.handler(...args);
        results.push(result);

        if (listener.once) {
          this.off(listener.originalEvent || event, listener.id);
        }
      } catch (error) {
        this.handleError(error, event, listener);
      }
    }

    return results;
  }

  /**
   * 이벤트 체인 정의
   * @param {string} chainName - 체인 이름
   * @param {Array} chain - 이벤트 체인 정의
   */
  defineChain(chainName, chain) {
    if (!Array.isArray(chain)) {
      throw new TypeError('Chain must be an array');
    }

    this.chains.set(chainName, chain.map(item => {
      if (typeof item === 'string') {
        return { event: item, transform: null };
      }
      return {
        event: item.event,
        transform: item.transform || null,
        condition: item.condition || null
      };
    }));
  }

  /**
   * 이벤트 체인 실행
   */
  async executeChain(chainName, initialData) {
    if (!this.chains.has(chainName)) {
      throw new Error(`Chain "${chainName}" not found`);
    }

    if (this.runningChains.has(chainName)) {
      throw new Error(`Chain "${chainName}" is already running`);
    }

    this.runningChains.add(chainName);
    const chain = this.chains.get(chainName);
    let data = initialData;

    try {
      for (const step of chain) {
        // 조건 체크
        if (step.condition && !step.condition(data)) {
          this.log('debug', `Skipping step ${step.event} in chain ${chainName}`);
          continue;
        }

        // 데이터 변환
        if (step.transform) {
          data = await step.transform(data);
        }

        // 이벤트 발생
        const results = await this.emit(step.event, data);

        // 결과를 다음 단계로 전달
        if (results.length > 0) {
          data = results[0]; // 첫 번째 결과 사용
        }
      }

      return data;
    } finally {
      this.runningChains.delete(chainName);
    }
  }

  /**
   * 미들웨어 추가
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new TypeError('Middleware must be a function');
    }
    this.middlewares.push(middleware);
  }

  /**
   * 미들웨어 실행
   */
  async runMiddlewares(event, args) {
    for (const middleware of this.middlewares) {
      const result = await middleware(event, args, this);
      if (result === false) {
        return false;
      }
    }
    return true;
  }

  /**
   * 리스너 실행 (타임아웃 지원)
   */
  async executeListener(listener, event, args) {
    if (listener.async) {
      return await this.executeWithTimeout(
        listener.handler(...args),
        listener.timeout,
        `Listener timeout for event "${event}"`
      );
    } else {
      return listener.handler(...args);
    }
  }

  /**
   * 타임아웃과 함께 Promise 실행
   */
  executeWithTimeout(promise, timeout, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(message));
      }, timeout);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  /**
   * 와일드카드를 포함한 모든 리스너 수집
   */
  collectListeners(event) {
    // 캐시 확인
    if (this.wildcardCache.has(event)) {
      return this.wildcardCache.get(event);
    }

    const listeners = [];
    const eventParts = event.split('.');

    for (const [pattern, patternListeners] of this.events) {
      if (this.matchesPattern(event, pattern, eventParts)) {
        listeners.push(...patternListeners.map(l => ({
          ...l,
          originalEvent: pattern
        })));
      }
    }

    // 우선순위 정렬
    listeners.sort((a, b) => b.priority - a.priority);

    // 캐시 저장
    this.wildcardCache.set(event, listeners);

    return listeners;
  }

  /**
   * 이벤트 패턴 매칭
   */
  matchesPattern(event, pattern, eventParts = null) {
    if (event === pattern) return true;

    // 와일드카드 처리
    if (pattern.includes('*')) {
      if (pattern === '*') return true;
      if (pattern === '**') return true;

      const patternParts = pattern.split('.');
      if (!eventParts) eventParts = event.split('.');

      // '**' 처리 (재귀적 매칭)
      if (patternParts.includes('**')) {
        return this.matchesDeepWildcard(eventParts, patternParts);
      }

      // '*' 처리 (단일 레벨 매칭)
      if (patternParts.length !== eventParts.length) return false;

      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i] !== '*' && patternParts[i] !== eventParts[i]) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * 깊은 와일드카드 매칭
   */
  matchesDeepWildcard(eventParts, patternParts) {
    let eventIndex = 0;
    let patternIndex = 0;

    while (patternIndex < patternParts.length && eventIndex < eventParts.length) {
      if (patternParts[patternIndex] === '**') {
        if (patternIndex === patternParts.length - 1) {
          return true; // '**'가 마지막이면 나머지 모두 매칭
        }
        // '**' 다음 패턴을 찾기
        patternIndex++;
        while (eventIndex < eventParts.length) {
          if (eventParts[eventIndex] === patternParts[patternIndex]) {
            break;
          }
          eventIndex++;
        }
      } else if (patternParts[patternIndex] === '*' ||
                 patternParts[patternIndex] === eventParts[eventIndex]) {
        patternIndex++;
        eventIndex++;
      } else {
        return false;
      }
    }

    return patternIndex === patternParts.length && eventIndex === eventParts.length;
  }

  /**
   * 와일드카드 캐시 무효화
   */
  invalidateWildcardCache(event) {
    this.wildcardCache.clear();
  }

  /**
   * 히스토리에 이벤트 추가
   */
  addToHistory(event, args) {
    this.eventHistory.push({
      event,
      args: args.slice(0, 3), // 처음 3개 인자만 저장
      timestamp: Date.now()
    });

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * 메트릭 업데이트
   */
  updateMetrics(type, event) {
    const current = this.metrics[type].get(event) || 0;
    this.metrics[type].set(event, current + 1);
  }

  /**
   * 성능 메트릭 업데이트
   */
  updatePerformanceMetrics(event, duration) {
    if (!this.metrics.performance.has(event)) {
      this.metrics.performance.set(event, {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity,
        avg: 0
      });
    }

    const perf = this.metrics.performance.get(event);
    perf.count++;
    perf.total += duration;
    perf.min = Math.min(perf.min, duration);
    perf.max = Math.max(perf.max, duration);
    perf.avg = perf.total / perf.count;
  }

  /**
   * 메트릭 조회
   */
  getMetrics() {
    return {
      eventsFired: Object.fromEntries(this.metrics.eventsFired),
      listenerExecutions: Object.fromEntries(this.metrics.listenerExecutions),
      errors: Object.fromEntries(this.metrics.errors),
      performance: Object.fromEntries(
        Array.from(this.metrics.performance.entries()).map(([event, perf]) => [
          event,
          {
            ...perf,
            avg: perf.avg.toFixed(2) + 'ms',
            min: perf.min.toFixed(2) + 'ms',
            max: perf.max.toFixed(2) + 'ms'
          }
        ])
      )
    };
  }

  /**
   * 에러 핸들러
   */
  handleError(error, event, listener) {
    this.config.errorHandler(error, event, listener);
  }

  /**
   * 기본 에러 핸들러
   */
  defaultErrorHandler(error, event, listener) {
    console.error(`Error in event "${event}":`, error);
  }

  /**
   * 로깅
   */
  log(level, message) {
    if (this.config.enableLogging) {
      console[level](`[EventBus] ${message}`);
    }
  }

  /**
   * 리스너 ID 생성
   */
  generateListenerId() {
    return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 이벤트 버스 상태 조회
   */
  getState() {
    const state = {
      eventsCount: this.events.size,
      listenersCount: 0,
      chains: Array.from(this.chains.keys()),
      runningChains: Array.from(this.runningChains),
      middlewares: this.middlewares.length,
      historySize: this.eventHistory.length
    };

    for (const listeners of this.events.values()) {
      state.listenersCount += listeners.length;
    }

    return state;
  }

  /**
   * 정리
   */
  destroy() {
    this.offAll();
    this.chains.clear();
    this.runningChains.clear();
    this.middlewares = [];
    this.eventHistory = [];
    this.metrics = {
      eventsFired: new Map(),
      listenerExecutions: new Map(),
      errors: new Map(),
      performance: new Map()
    };
  }
}

// 사용 예제
async function examples() {
  const eventBus = new EventBus({
    enableLogging: true,
    enableMetrics: true,
    maxListeners: 20
  });

  // 미들웨어 추가
  eventBus.use(async (event, args, bus) => {
    console.log(`[Middleware] Event: ${event}`);
    return true; // 계속 진행
  });

  // 우선순위 리스너
  eventBus.on('user.login', (user) => {
    console.log('[Priority 10] User logged in:', user.name);
  }, { priority: 10 });

  eventBus.on('user.login', (user) => {
    console.log('[Priority 5] Send email to:', user.email);
  }, { priority: 5 });

  // 와일드카드 리스너
  eventBus.on('user.*', (data) => {
    console.log('[Wildcard] User event:', data);
  });

  // 비동기 리스너
  eventBus.on('data.process', async (data) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return data * 2;
  }, { async: true, timeout: 500 });

  // 이벤트 체인 정의
  eventBus.defineChain('userFlow', [
    { event: 'user.validate' },
    {
      event: 'user.save',
      transform: (data) => ({ ...data, timestamp: Date.now() })
    },
    {
      event: 'user.notify',
      condition: (data) => data.sendNotification === true
    }
  ]);

  // 이벤트 발생
  await eventBus.emit('user.login', { name: 'Alice', email: 'alice@example.com' });

  // 체인 실행
  const result = await eventBus.executeChain('userFlow', {
    name: 'Bob',
    sendNotification: true
  });

  // 메트릭 조회
  console.log('Metrics:', eventBus.getMetrics());
  console.log('State:', eventBus.getState());

  // 정리
  eventBus.destroy();
}

module.exports = EventBus;