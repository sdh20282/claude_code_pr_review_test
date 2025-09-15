/**
 * Task Scheduler with Priority Queue Implementation
 *
 * 이 스케줄러는 우선순위 큐를 사용하여 작업을 관리하고,
 * 비동기 작업 실행, 재시도 로직, 동시 실행 제한 등을 지원합니다.
 */

class TaskScheduler {
  constructor(maxConcurrent = 3) {
    this.queue = [];
    this.running = [];
    this.completed = [];
    this.failed = [];
    this.maxConcurrent = maxConcurrent;
    this.taskIdCounter = 0;
    this.listeners = {
      onComplete: [],
      onFail: [],
      onStart: []
    };
  }

  // 작업 추가 (우선순위와 재시도 옵션 포함)
  addTask(taskFn, options = {}) {
    const task = {
      id: ++this.taskIdCounter,
      fn: taskFn,
      priority: options.priority || 0,
      retries: options.retries || 0,
      retryDelay: options.retryDelay || 1000,
      attemptCount: 0,
      createdAt: Date.now(),
      name: options.name || `Task-${this.taskIdCounter}`
    };

    // 우선순위에 따라 큐에 삽입
    const insertIndex = this.queue.findIndex(t => t.priority < task.priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }

    this.processQueue();
    return task.id;
  }

  // 큐 처리
  async processQueue() {
    while (this.queue.length > 0 && this.running.length < this.maxConcurrent) {
      const task = this.queue.shift();
      this.running.push(task);

      this.emit('onStart', task);
      this.executeTask(task);
    }
  }

  // 작업 실행
  async executeTask(task) {
    try {
      task.attemptCount++;
      task.startedAt = Date.now();

      const result = await Promise.race([
        task.fn(),
        this.timeout(task.timeout || 30000)
      ]);

      task.completedAt = Date.now();
      task.duration = task.completedAt - task.startedAt;
      task.result = result;

      this.completed.push(task);
      this.removeFromRunning(task.id);
      this.emit('onComplete', task);

    } catch (error) {
      task.error = error;

      if (task.attemptCount <= task.retries) {
        // 재시도 로직
        console.log(`Retrying ${task.name} (${task.attemptCount}/${task.retries + 1})`);
        await this.delay(task.retryDelay * Math.pow(2, task.attemptCount - 1)); // 지수 백오프
        this.removeFromRunning(task.id);
        this.queue.unshift(task); // 우선순위 큐 맨 앞에 추가
      } else {
        // 최종 실패
        task.failedAt = Date.now();
        this.failed.push(task);
        this.removeFromRunning(task.id);
        this.emit('onFail', task);
      }
    }

    this.processQueue();
  }

  // 실행 중인 작업에서 제거
  removeFromRunning(taskId) {
    const index = this.running.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.running.splice(index, 1);
    }
  }

  // 타임아웃 헬퍼
  timeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), ms);
    });
  }

  // 지연 헬퍼
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 이벤트 리스너 등록
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  // 이벤트 발생
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  // 상태 조회
  getStatus() {
    return {
      queued: this.queue.length,
      running: this.running.length,
      completed: this.completed.length,
      failed: this.failed.length,
      tasks: {
        queue: this.queue.map(t => ({ id: t.id, name: t.name, priority: t.priority })),
        running: this.running.map(t => ({ id: t.id, name: t.name, startedAt: t.startedAt })),
        completed: this.completed.slice(-10),
        failed: this.failed.slice(-10)
      }
    };
  }

  // 특정 작업 취소
  cancelTask(taskId) {
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const [task] = this.queue.splice(queueIndex, 1);
      return { success: true, task };
    }
    return { success: false, message: 'Task not found in queue' };
  }

  // 모든 작업 완료 대기
  async waitForAll() {
    return new Promise((resolve) => {
      const checkComplete = setInterval(() => {
        if (this.queue.length === 0 && this.running.length === 0) {
          clearInterval(checkComplete);
          resolve({
            completed: this.completed.length,
            failed: this.failed.length
          });
        }
      }, 100);
    });
  }
}

// 사용 예제
async function example() {
  const scheduler = new TaskScheduler(2); // 최대 2개 동시 실행

  // 이벤트 리스너 등록
  scheduler.on('onComplete', (task) => {
    console.log(`✅ Completed: ${task.name} in ${task.duration}ms`);
  });

  scheduler.on('onFail', (task) => {
    console.log(`❌ Failed: ${task.name} - ${task.error.message}`);
  });

  scheduler.on('onStart', (task) => {
    console.log(`🚀 Started: ${task.name}`);
  });

  // 다양한 작업 추가
  scheduler.addTask(
    async () => {
      await new Promise(r => setTimeout(r, 1000));
      return 'Data fetched';
    },
    { name: 'Fetch Data', priority: 5 }
  );

  scheduler.addTask(
    async () => {
      await new Promise(r => setTimeout(r, 500));
      if (Math.random() > 0.5) throw new Error('Random failure');
      return 'Processed';
    },
    { name: 'Process Data', priority: 3, retries: 2, retryDelay: 500 }
  );

  scheduler.addTask(
    async () => {
      await new Promise(r => setTimeout(r, 1500));
      return 'Saved to DB';
    },
    { name: 'Save to Database', priority: 1 }
  );

  scheduler.addTask(
    async () => {
      await new Promise(r => setTimeout(r, 800));
      return 'Email sent';
    },
    { name: 'Send Email', priority: 4 }
  );

  // 상태 모니터링
  const statusInterval = setInterval(() => {
    const status = scheduler.getStatus();
    console.log(`\n📊 Status - Queue: ${status.queued}, Running: ${status.running}, Completed: ${status.completed}, Failed: ${status.failed}`);
  }, 1000);

  // 모든 작업 완료 대기
  const result = await scheduler.waitForAll();
  clearInterval(statusInterval);

  console.log('\n✨ All tasks completed!');
  console.log(`Total completed: ${result.completed}, Total failed: ${result.failed}`);
}

// 실행 (주석 해제하여 테스트)
// example();

module.exports = TaskScheduler;