/**
 * 고급 캐시 매니저 (난이도 5/10)
 * LRU(Least Recently Used) 캐시 구현 with TTL(Time To Live) 지원
 * 메모리 효율적인 캐싱 솔루션
 */

class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.defaultTTL = options.defaultTTL || 3600000; // 1시간
    this.cache = new Map();
    this.accessOrder = new Map();
    this.expirations = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0
    };

    // 자동 정리 인터벌
    if (options.autoCleanup) {
      this.cleanupInterval = setInterval(() => {
        this.removeExpired();
      }, options.cleanupInterval || 60000);
    }
  }

  /**
   * 캐시에 값 저장
   * @param {string} key - 캐시 키
   * @param {*} value - 저장할 값
   * @param {number} ttl - TTL (밀리초)
   */
  set(key, value, ttl = this.defaultTTL) {
    // 만료된 항목 정리
    this.removeExpired();

    // 캐시 크기 제한 확인
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const expiration = Date.now() + ttl;
    this.cache.set(key, value);
    this.accessOrder.set(key, Date.now());
    this.expirations.set(key, expiration);

    return this;
  }

  /**
   * 캐시에서 값 조회
   * @param {string} key - 캐시 키
   * @returns {*} 캐시된 값 또는 undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      this.stats.misses++;
      return undefined;
    }

    const expiration = this.expirations.get(key);
    if (expiration && expiration < Date.now()) {
      this.remove(key);
      this.stats.expired++;
      this.stats.misses++;
      return undefined;
    }

    // LRU 업데이트
    this.accessOrder.set(key, Date.now());
    this.stats.hits++;
    return this.cache.get(key);
  }

  /**
   * 다중 키 조회
   * @param {Array<string>} keys - 조회할 키 배열
   * @returns {Map} 키-값 맵
   */
  getMany(keys) {
    const results = new Map();
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    }
    return results;
  }

  /**
   * 패턴 매칭으로 캐시 조회
   * @param {string|RegExp} pattern - 검색 패턴
   * @returns {Map} 매칭된 키-값 맵
   */
  getByPattern(pattern) {
    const results = new Map();
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

    for (const [key, value] of this.cache) {
      if (regex.test(key)) {
        const val = this.get(key); // 만료 체크 포함
        if (val !== undefined) {
          results.set(key, val);
        }
      }
    }
    return results;
  }

  /**
   * 캐시 항목 제거
   * @param {string} key - 제거할 키
   */
  remove(key) {
    const deleted = this.cache.delete(key);
    this.accessOrder.delete(key);
    this.expirations.delete(key);
    return deleted;
  }

  /**
   * 패턴 매칭으로 캐시 제거
   * @param {string|RegExp} pattern - 제거할 패턴
   */
  removeByPattern(pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    const keysToRemove = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.remove(key);
    }

    return keysToRemove.length;
  }

  /**
   * LRU 정책에 따라 가장 오래된 항목 제거
   */
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.remove(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * 만료된 항목 제거
   */
  removeExpired() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, expiration] of this.expirations) {
      if (expiration < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.remove(key);
      this.stats.expired++;
    }

    return expiredKeys.length;
  }

  /**
   * 캐시 갱신 (TTL 연장)
   * @param {string} key - 갱신할 키
   * @param {number} ttl - 새로운 TTL
   */
  refresh(key, ttl = this.defaultTTL) {
    if (this.cache.has(key)) {
      this.expirations.set(key, Date.now() + ttl);
      this.accessOrder.set(key, Date.now());
      return true;
    }
    return false;
  }

  /**
   * 전체 캐시 클리어
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.expirations.clear();
    this.resetStats();
  }

  /**
   * 캐시 크기 조회
   */
  size() {
    this.removeExpired();
    return this.cache.size;
  }

  /**
   * 캐시 통계 조회
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * 통계 초기화
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0
    };
  }

  /**
   * 메모리 사용량 추정
   */
  estimateMemoryUsage() {
    let bytes = 0;
    for (const [key, value] of this.cache) {
      bytes += key.length * 2; // 문자열은 UTF-16
      bytes += this.estimateSize(value);
    }
    return this.formatBytes(bytes);
  }

  /**
   * 객체 크기 추정 (간단한 추정)
   */
  estimateSize(obj) {
    if (obj === null || obj === undefined) return 0;

    switch (typeof obj) {
      case 'string':
        return obj.length * 2;
      case 'number':
        return 8;
      case 'boolean':
        return 4;
      case 'object':
        if (obj instanceof Date) return 8;
        if (Array.isArray(obj)) {
          return obj.reduce((sum, item) => sum + this.estimateSize(item), 0);
        }
        // 객체는 JSON 문자열 크기로 추정
        try {
          return JSON.stringify(obj).length * 2;
        } catch {
          return 1000; // 기본값
        }
      default:
        return 0;
    }
  }

  /**
   * 바이트를 읽기 쉬운 형식으로 변환
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 캐시 내용을 직렬화
   */
  serialize() {
    const data = {
      cache: Array.from(this.cache.entries()),
      accessOrder: Array.from(this.accessOrder.entries()),
      expirations: Array.from(this.expirations.entries()),
      stats: this.stats
    };
    return JSON.stringify(data);
  }

  /**
   * 직렬화된 데이터로부터 캐시 복원
   */
  deserialize(data) {
    try {
      const parsed = JSON.parse(data);
      this.cache = new Map(parsed.cache);
      this.accessOrder = new Map(parsed.accessOrder);
      this.expirations = new Map(parsed.expirations);
      this.stats = parsed.stats || this.stats;

      // 만료된 항목 정리
      this.removeExpired();
      return true;
    } catch (error) {
      console.error('Failed to deserialize cache:', error);
      return false;
    }
  }

  /**
   * 정리 (cleanup interval 제거)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// 사용 예제
function examples() {
  const cache = new CacheManager({
    maxSize: 50,
    defaultTTL: 5000, // 5초
    autoCleanup: true,
    cleanupInterval: 1000
  });

  // 기본 사용
  cache.set('user:1', { name: 'Alice', age: 30 });
  cache.set('user:2', { name: 'Bob', age: 25 }, 10000); // 10초 TTL

  console.log('User 1:', cache.get('user:1'));

  // 패턴 검색
  cache.set('product:1', { name: 'Laptop', price: 1200 });
  cache.set('product:2', { name: 'Mouse', price: 25 });
  const products = cache.getByPattern(/^product:/);
  console.log('Products:', products);

  // 통계
  console.log('Stats:', cache.getStats());

  // 직렬화/역직렬화
  const serialized = cache.serialize();
  const newCache = new CacheManager();
  newCache.deserialize(serialized);

  // 정리
  setTimeout(() => {
    cache.destroy();
  }, 30000);
}

module.exports = CacheManager;