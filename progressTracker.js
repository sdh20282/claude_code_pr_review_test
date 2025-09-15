/**
 * Progress Tracker
 * Provides real-time progress feedback for multi-step operations
 * with user-friendly updates and estimated completion times
 */

const { i18n } = require('./i18n');
const { EventEmitter } = require('events');

class ProgressTracker extends EventEmitter {
    constructor(options = {}) {
        super();
        this.config = {
            estimationAccuracy: options.estimationAccuracy || 0.8,
            smoothingFactor: options.smoothingFactor || 0.3,
            updateInterval: options.updateInterval || 100,
            ...options
        };
        
        this.operations = new Map();
        this.analytics = new Map();
    }

    /**
     * Create a new operation tracker
     * @param {string} operationId - Unique operation identifier
     * @param {Object} config - Operation configuration
     * @returns {OperationTracker} - Operation tracker instance
     */
    createOperation(operationId, config = {}) {
        const operation = new OperationTracker(operationId, {
            ...this.config,
            ...config,
            progressTracker: this
        });
        
        this.operations.set(operationId, operation);
        
        // Clean up after completion
        operation.once('completed', () => {
            this.updateAnalytics(operationId, operation.getMetrics());
            setTimeout(() => {
                this.operations.delete(operationId);
            }, 60000); // Keep for 1 minute after completion
        });
        
        return operation;
    }

    /**
     * Get operation by ID
     * @param {string} operationId - Operation identifier
     * @returns {OperationTracker|null} - Operation tracker or null
     */
    getOperation(operationId) {
        return this.operations.get(operationId) || null;
    }

    /**
     * Update analytics with completed operation data
     * @param {string} operationId - Operation identifier
     * @param {Object} metrics - Operation metrics
     */
    updateAnalytics(operationId, metrics) {
        const operationType = metrics.type || 'unknown';
        
        if (!this.analytics.has(operationType)) {
            this.analytics.set(operationType, {
                totalOperations: 0,
                averageDuration: 0,
                successRate: 0,
                commonSteps: new Map()
            });
        }
        
        const analytics = this.analytics.get(operationType);
        analytics.totalOperations++;
        
        // Update average duration with exponential smoothing
        if (analytics.averageDuration === 0) {
            analytics.averageDuration = metrics.totalDuration;
        } else {
            analytics.averageDuration = 
                (analytics.averageDuration * (1 - this.config.smoothingFactor)) +
                (metrics.totalDuration * this.config.smoothingFactor);
        }
        
        // Update success rate
        analytics.successRate = 
            (analytics.successRate * (analytics.totalOperations - 1) + (metrics.success ? 1 : 0)) /
            analytics.totalOperations;
        
        // Update common steps
        metrics.steps.forEach(step => {
            const count = analytics.commonSteps.get(step.name) || 0;
            analytics.commonSteps.set(step.name, count + 1);
        });
    }

    /**
     * Get estimated duration for operation type
     * @param {string} operationType - Type of operation
     * @param {Array} steps - Steps to be performed
     * @returns {number} - Estimated duration in milliseconds
     */
    getEstimatedDuration(operationType, steps = []) {
        const analytics = this.analytics.get(operationType);
        
        if (!analytics || analytics.totalOperations < 3) {
            // Fallback estimation based on step count
            return steps.length * 2000; // 2 seconds per step default
        }
        
        // Use historical data for estimation
        const baseEstimate = analytics.averageDuration;
        const stepFactor = steps.length / 5; // Assume 5 steps as baseline
        
        return Math.round(baseEstimate * stepFactor * this.config.estimationAccuracy);
    }

    /**
     * Get analytics for all operation types
     * @returns {Object} - Analytics data
     */
    getAnalytics() {
        const result = {};
        
        for (const [type, analytics] of this.analytics) {
            result[type] = {
                ...analytics,
                commonSteps: Array.from(analytics.commonSteps.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10) // Top 10 common steps
            };
        }
        
        return result;
    }
}

class OperationTracker extends EventEmitter {
    constructor(operationId, config = {}) {
        super();
        this.operationId = operationId;
        this.config = config;
        this.progressTracker = config.progressTracker;
        
        this.state = {
            isActive: false,
            isCompleted: false,
            isError: false,
            startTime: null,
            endTime: null,
            currentStep: 0,
            totalSteps: 0,
            steps: [],
            percentage: 0,
            estimatedRemaining: 0,
            currentStepStartTime: null,
            messages: []
        };
        
        this.metrics = {
            type: config.type || 'unknown',
            steps: [],
            totalDuration: 0,
            averageStepDuration: 0,
            success: false
        };
    }

    /**
     * Start the operation
     * @param {Array} steps - Array of step configurations
     * @param {Object} metadata - Additional metadata
     */
    start(steps, metadata = {}) {
        if (this.state.isActive) {
            throw new Error('Operation is already active');
        }
        
        this.state.isActive = true;
        this.state.startTime = Date.now();
        this.state.totalSteps = steps.length;
        this.state.steps = steps.map((step, index) => ({
            id: index,
            name: step.name || `Step ${index + 1}`,
            description: step.description || '',
            weight: step.weight || 1,
            estimatedDuration: step.estimatedDuration || 2000,
            status: 'pending',
            startTime: null,
            endTime: null,
            result: null
        }));
        
        // Calculate estimated total duration
        const estimatedTotal = this.progressTracker?.getEstimatedDuration(
            this.config.type,
            this.state.steps
        ) || this.state.steps.reduce((sum, step) => sum + step.estimatedDuration, 0);
        
        this.state.estimatedTotal = estimatedTotal;
        this.state.estimatedCompletion = this.state.startTime + estimatedTotal;
        
        this.addMessage('시작', '작업을 시작합니다...', 'info');
        this.emit('started', this.getStatus());
        
        return this;
    }

    /**
     * Start a specific step
     * @param {number} stepIndex - Step index
     * @param {string} customMessage - Custom progress message
     */
    startStep(stepIndex, customMessage = null) {
        if (!this.state.isActive || stepIndex >= this.state.totalSteps) {
            return this;
        }
        
        // Complete previous step if needed
        if (this.state.currentStep > 0 && this.state.steps[this.state.currentStep - 1].status === 'active') {
            this.completeStep(this.state.currentStep - 1);
        }
        
        const step = this.state.steps[stepIndex];
        step.status = 'active';
        step.startTime = Date.now();
        
        this.state.currentStep = stepIndex + 1;
        this.state.currentStepStartTime = step.startTime;
        
        const message = customMessage || step.description || `${step.name} 진행 중...`;
        this.addMessage(step.name, message, 'progress');
        
        this.updateProgress();
        this.emit('stepStarted', stepIndex, this.getStatus());
        
        return this;
    }

    /**
     * Complete a step
     * @param {number} stepIndex - Step index
     * @param {Object} result - Step result
     */
    completeStep(stepIndex, result = null) {
        if (stepIndex >= this.state.totalSteps) {
            return this;
        }
        
        const step = this.state.steps[stepIndex];
        step.status = 'completed';
        step.endTime = Date.now();
        step.result = result;
        
        // Update metrics
        this.metrics.steps.push({
            name: step.name,
            duration: step.endTime - step.startTime,
            success: result?.success !== false
        });
        
        const completedMessage = result?.message || `${step.name} 완료`;
        this.addMessage(step.name, completedMessage, 'success');
        
        this.updateProgress();
        this.emit('stepCompleted', stepIndex, result, this.getStatus());
        
        // Check if all steps are completed
        if (this.state.steps.every(s => s.status === 'completed')) {
            this.complete();
        }
        
        return this;
    }

    /**
     * Fail a step
     * @param {number} stepIndex - Step index
     * @param {Error|string} error - Error information
     * @param {boolean} canRetry - Whether step can be retried
     */
    failStep(stepIndex, error, canRetry = false) {
        if (stepIndex >= this.state.totalSteps) {
            return this;
        }
        
        const step = this.state.steps[stepIndex];
        step.status = 'failed';
        step.endTime = Date.now();
        step.error = error;
        step.canRetry = canRetry;
        
        const errorMessage = typeof error === 'string' ? error : error.message;
        this.addMessage(step.name, `오류: ${errorMessage}`, 'error');
        
        this.updateProgress();
        this.emit('stepFailed', stepIndex, error, this.getStatus());
        
        if (!canRetry) {
            this.error(error);
        }
        
        return this;
    }

    /**
     * Update step progress (for long-running steps)
     * @param {number} stepIndex - Step index
     * @param {number} stepProgress - Progress within step (0-100)
     * @param {string} message - Progress message
     */
    updateStepProgress(stepIndex, stepProgress, message = null) {
        if (stepIndex >= this.state.totalSteps) {
            return this;
        }
        
        const step = this.state.steps[stepIndex];
        step.progress = Math.min(100, Math.max(0, stepProgress));
        
        if (message) {
            this.addMessage(step.name, message, 'progress');
        }
        
        this.updateProgress();
        this.emit('stepProgress', stepIndex, stepProgress, this.getStatus());
        
        return this;
    }

    /**
     * Update overall progress calculation
     */
    updateProgress() {
        if (this.state.totalSteps === 0) {
            return;
        }
        
        let totalWeight = 0;
        let completedWeight = 0;
        
        this.state.steps.forEach(step => {
            totalWeight += step.weight;
            
            if (step.status === 'completed') {
                completedWeight += step.weight;
            } else if (step.status === 'active' && step.progress) {
                completedWeight += (step.weight * step.progress / 100);
            }
        });
        
        this.state.percentage = Math.round((completedWeight / totalWeight) * 100);
        
        // Update estimated remaining time
        this.updateTimeEstimate();
    }

    /**
     * Update time estimation
     */
    updateTimeEstimate() {
        const now = Date.now();
        const elapsed = now - this.state.startTime;
        
        if (this.state.percentage > 0) {
            const totalEstimated = (elapsed / this.state.percentage) * 100;
            this.state.estimatedRemaining = Math.max(0, totalEstimated - elapsed);
            this.state.estimatedCompletion = now + this.state.estimatedRemaining;
        } else {
            // Fallback to initial estimate
            this.state.estimatedRemaining = this.state.estimatedTotal - elapsed;
        }
    }

    /**
     * Add a message to the progress log
     * @param {string} source - Message source (step name, etc.)
     * @param {string} message - Message content
     * @param {string} type - Message type (info, progress, success, warning, error)
     */
    addMessage(source, message, type = 'info') {
        const logEntry = {
            timestamp: Date.now(),
            source,
            message,
            type,
            stepIndex: this.state.currentStep - 1
        };
        
        this.state.messages.push(logEntry);
        
        // Keep only last 50 messages
        if (this.state.messages.length > 50) {
            this.state.messages = this.state.messages.slice(-50);
        }
        
        this.emit('message', logEntry);
    }

    /**
     * Complete the operation successfully
     * @param {Object} result - Final result
     */
    complete(result = null) {
        if (!this.state.isActive || this.state.isCompleted) {
            return this;
        }
        
        this.state.isCompleted = true;
        this.state.isActive = false;
        this.state.endTime = Date.now();
        this.state.percentage = 100;
        this.state.estimatedRemaining = 0;
        
        // Update metrics
        this.metrics.totalDuration = this.state.endTime - this.state.startTime;
        this.metrics.success = true;
        this.metrics.averageStepDuration = this.metrics.steps.length > 0 
            ? this.metrics.steps.reduce((sum, step) => sum + step.duration, 0) / this.metrics.steps.length
            : 0;
        
        const completionMessage = result?.message || '작업이 성공적으로 완료되었습니다';
        this.addMessage('완료', completionMessage, 'success');
        
        this.emit('completed', result, this.getStatus());
        
        return this;
    }

    /**
     * Mark operation as failed
     * @param {Error|string} error - Error information
     */
    error(error) {
        if (!this.state.isActive || this.state.isCompleted) {
            return this;
        }
        
        this.state.isError = true;
        this.state.isActive = false;
        this.state.endTime = Date.now();
        this.state.error = error;
        
        // Update metrics
        this.metrics.totalDuration = this.state.endTime - this.state.startTime;
        this.metrics.success = false;
        
        const errorMessage = typeof error === 'string' ? error : error.message;
        this.addMessage('오류', `작업 실패: ${errorMessage}`, 'error');
        
        this.emit('error', error, this.getStatus());
        
        return this;
    }

    /**
     * Get current operation status
     * @returns {Object} - Current status
     */
    getStatus() {
        return {
            operationId: this.operationId,
            isActive: this.state.isActive,
            isCompleted: this.state.isCompleted,
            isError: this.state.isError,
            percentage: this.state.percentage,
            currentStep: this.state.currentStep,
            totalSteps: this.state.totalSteps,
            estimatedRemaining: this.state.estimatedRemaining,
            estimatedRemainingFormatted: this.formatDuration(this.state.estimatedRemaining),
            estimatedCompletion: this.state.estimatedCompletion,
            elapsedTime: this.state.startTime ? Date.now() - this.state.startTime : 0,
            elapsedTimeFormatted: this.state.startTime ? this.formatDuration(Date.now() - this.state.startTime) : '0초',
            steps: this.state.steps.map(step => ({
                name: step.name,
                description: step.description,
                status: step.status,
                progress: step.progress || 0
            })),
            lastMessage: this.state.messages[this.state.messages.length - 1],
            recentMessages: this.state.messages.slice(-5)
        };
    }

    /**
     * Get detailed metrics
     * @returns {Object} - Operation metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            operationId: this.operationId,
            state: this.state
        };
    }

    /**
     * Format duration in user-friendly format
     * @param {number} duration - Duration in milliseconds
     * @returns {string} - Formatted duration
     */
    formatDuration(duration) {
        if (duration < 1000) {
            return '1초 미만';
        }
        
        const seconds = Math.floor(duration / 1000);
        
        if (seconds < 60) {
            return `${seconds}초`;
        }
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes < 60) {
            return remainingSeconds > 0 ? `${minutes}분 ${remainingSeconds}초` : `${minutes}분`;
        }
        
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
    }

    /**
     * Cancel the operation
     * @param {string} reason - Cancellation reason
     */
    cancel(reason = '사용자가 취소했습니다') {
        if (!this.state.isActive) {
            return this;
        }
        
        this.state.isActive = false;
        this.state.endTime = Date.now();
        this.state.cancelled = true;
        this.state.cancelReason = reason;
        
        this.addMessage('취소', reason, 'warning');
        this.emit('cancelled', reason, this.getStatus());
        
        return this;
    }
}

// Factory functions for common operation types
class OperationFactory {
    static createUserRegistration(progressTracker, operationId) {
        const operation = progressTracker.createOperation(operationId, {
            type: 'user_registration'
        });
        
        const steps = [
            {
                name: '입력 검증',
                description: '사용자 입력 정보를 검증하는 중...',
                estimatedDuration: 1000
            },
            {
                name: '계정 생성',
                description: '새 계정을 생성하는 중...',
                estimatedDuration: 2000
            },
            {
                name: '이메일 발송',
                description: '환영 이메일을 발송하는 중...',
                estimatedDuration: 3000
            },
            {
                name: '프로필 설정',
                description: '기본 프로필을 설정하는 중...',
                estimatedDuration: 1500
            }
        ];
        
        operation.start(steps);
        return operation;
    }
    
    static createDataImport(progressTracker, operationId, itemCount) {
        const operation = progressTracker.createOperation(operationId, {
            type: 'data_import'
        });
        
        const steps = [
            {
                name: '파일 검증',
                description: '업로드된 파일을 검증하는 중...',
                estimatedDuration: 2000
            },
            {
                name: '데이터 파싱',
                description: '데이터를 분석하는 중...',
                estimatedDuration: 1000 + (itemCount * 10)
            },
            {
                name: '데이터 저장',
                description: '데이터를 저장하는 중...',
                estimatedDuration: 2000 + (itemCount * 20)
            },
            {
                name: '인덱스 업데이트',
                description: '검색 인덱스를 업데이트하는 중...',
                estimatedDuration: 3000
            }
        ];
        
        operation.start(steps);
        return operation;
    }
}

module.exports = {
    ProgressTracker,
    OperationTracker,
    OperationFactory
};