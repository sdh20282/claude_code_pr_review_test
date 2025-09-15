/**
 * 데이터 처리 및 변환 클래스 (난이도 3/10)
 * 배열과 객체 데이터를 처리하고 변환하는 유틸리티
 */

class DataProcessor {
  constructor() {
    this.cache = new Map();
    this.transformHistory = [];
  }

  // 깊은 복사
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item));
    }
    if (obj instanceof Object) {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  }

  // 객체 평탄화 (중첩된 객체를 1차원으로)
  flattenObject(obj, prefix = '', result = {}) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          this.flattenObject(obj[key], newKey, result);
        } else {
          result[newKey] = obj[key];
        }
      }
    }
    return result;
  }

  // 평탄화된 객체 복원
  unflattenObject(flatObj) {
    const result = {};

    for (const key in flatObj) {
      const keys = key.split('.');
      let current = result;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = flatObj[key];
    }

    return result;
  }

  // 배열 그룹화
  groupBy(array, keyFn) {
    return array.reduce((groups, item) => {
      const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    }, {});
  }

  // 배열에서 중복 제거 (복잡한 객체도 처리)
  uniqueBy(array, keyFn) {
    const seen = new Set();
    return array.filter(item => {
      const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
      const keyStr = JSON.stringify(key);
      if (seen.has(keyStr)) {
        return false;
      }
      seen.add(keyStr);
      return true;
    });
  }

  // 데이터 변환 파이프라인
  createPipeline(...transforms) {
    return (data) => {
      let result = data;
      const history = [];

      for (const transform of transforms) {
        const beforeTransform = this.deepClone(result);
        result = transform(result);

        history.push({
          transform: transform.name || 'anonymous',
          before: beforeTransform,
          after: this.deepClone(result),
          timestamp: Date.now()
        });
      }

      this.transformHistory.push(...history);
      return result;
    };
  }

  // 메모이제이션된 함수 생성
  memoize(fn, keyGenerator) {
    return (...args) => {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

      if (this.cache.has(key)) {
        return this.cache.get(key);
      }

      const result = fn(...args);
      this.cache.set(key, result);

      // 캐시 크기 제한
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return result;
    };
  }

  // 배열 차집합
  difference(arr1, arr2, compareFn) {
    if (compareFn) {
      return arr1.filter(item1 =>
        !arr2.some(item2 => compareFn(item1, item2))
      );
    }
    const set2 = new Set(arr2);
    return arr1.filter(item => !set2.has(item));
  }

  // 배열 교집합
  intersection(arr1, arr2, compareFn) {
    if (compareFn) {
      return arr1.filter(item1 =>
        arr2.some(item2 => compareFn(item1, item2))
      );
    }
    const set2 = new Set(arr2);
    return arr1.filter(item => set2.has(item));
  }

  // 객체 병합 (깊은 병합)
  deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return this.deepMerge(target, ...sources);
  }

  // 헬퍼 메서드
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  // 변환 히스토리 조회
  getTransformHistory() {
    return this.transformHistory;
  }

  // 캐시 초기화
  clearCache() {
    this.cache.clear();
    this.transformHistory = [];
  }

  // 통계 정보
  getStats() {
    return {
      cacheSize: this.cache.size,
      historyLength: this.transformHistory.length,
      cacheSizeInBytes: this.estimateCacheSize()
    };
  }

  estimateCacheSize() {
    let size = 0;
    for (const [key, value] of this.cache) {
      size += JSON.stringify(key).length + JSON.stringify(value).length;
    }
    return size;
  }
}

// 사용 예제
function examples() {
  const processor = new DataProcessor();

  // 1. 객체 평탄화
  const nested = {
    user: {
      name: 'John',
      address: {
        city: 'Seoul',
        country: 'Korea'
      }
    }
  };
  console.log('Flattened:', processor.flattenObject(nested));

  // 2. 배열 그룹화
  const users = [
    { name: 'Alice', age: 25, city: 'Seoul' },
    { name: 'Bob', age: 30, city: 'Seoul' },
    { name: 'Charlie', age: 25, city: 'Busan' }
  ];
  console.log('Grouped by age:', processor.groupBy(users, 'age'));

  // 3. 파이프라인 처리
  const pipeline = processor.createPipeline(
    data => data.map(x => x * 2),
    data => data.filter(x => x > 5),
    data => data.reduce((sum, x) => sum + x, 0)
  );
  console.log('Pipeline result:', pipeline([1, 2, 3, 4, 5]));

  // 4. 메모이제이션
  const slowFn = (n) => {
    console.log(`Computing ${n}...`);
    return n * n;
  };
  const memoizedFn = processor.memoize(slowFn);
  console.log(memoizedFn(5)); // 계산함
  console.log(memoizedFn(5)); // 캐시에서 가져옴

  // 5. 배열 연산
  const arr1 = [1, 2, 3, 4, 5];
  const arr2 = [3, 4, 5, 6, 7];
  console.log('Difference:', processor.difference(arr1, arr2));
  console.log('Intersection:', processor.intersection(arr1, arr2));
}

module.exports = DataProcessor;