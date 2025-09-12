/**
 * Account Lockout Manager
 * Provides enhanced account security with time-based unlock mechanism
 * and user-friendly unlock options
 */

const crypto = require('crypto');
const { i18n } = require('./i18n');

class AccountLockoutManager {
    constructor(options = {}) {
        this.config = {
            maxAttempts: options.maxAttempts || 5,
            lockoutDuration: options.lockoutDuration || 30 * 60 * 1000, // 30 minutes default
            progressiveLockout: options.progressiveLockout || true,
            unlockMethods: options.unlockMethods || ['time', 'email', 'admin'],
            cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, // 1 hour
            ...options
        };
        
        // In-memory storage (should be replaced with persistent storage in production)
        this.lockoutAttempts = new Map();
        this.unlockTokens = new Map();
        this.adminUnlockRequests = new Map();
        
        // Start cleanup interval
        this.startCleanupInterval();
    }

    /**
     * Record a failed login attempt
     * @param {string} identifier - Email or username
     * @param {Object} metadata - Additional metadata (IP, user agent, etc.)
     * @returns {Object} - Lockout status and user-friendly information
     */
    recordFailedAttempt(identifier, metadata = {}) {
        const key = this.normalizeIdentifier(identifier);
        const now = Date.now();
        
        if (!this.lockoutAttempts.has(key)) {
            this.lockoutAttempts.set(key, {
                attempts: 0,
                firstAttempt: now,
                lastAttempt: now,
                lockedAt: null,
                lockoutCount: 0,
                metadata: []
            });
        }
        
        const record = this.lockoutAttempts.get(key);
        record.attempts++;
        record.lastAttempt = now;
        record.metadata.push({
            timestamp: now,
            ip: metadata.ip,
            userAgent: metadata.userAgent,
            source: metadata.source
        });
        
        // Check if account should be locked
        if (record.attempts >= this.config.maxAttempts && !record.lockedAt) {
            return this.lockAccount(key, record);
        }
        
        // Return current status with user-friendly information
        return this.getAttemptStatus(key, record);
    }

    /**
     * Lock an account
     * @param {string} key - Normalized identifier
     * @param {Object} record - Current attempt record
     * @returns {Object} - Lockout information with user options
     */
    lockAccount(key, record) {
        const now = Date.now();
        record.lockedAt = now;
        record.lockoutCount++;
        
        // Progressive lockout: increase duration with each lockout
        const lockoutDuration = this.config.progressiveLockout 
            ? this.config.lockoutDuration * Math.pow(2, record.lockoutCount - 1)
            : this.config.lockoutDuration;
        
        record.unlockAt = now + lockoutDuration;
        
        // Generate unlock options
        const unlockOptions = this.generateUnlockOptions(key, record);
        
        return {
            isLocked: true,
            lockedAt: now,
            unlockAt: record.unlockAt,
            attemptsRemaining: 0,
            lockoutCount: record.lockoutCount,
            duration: lockoutDuration,
            userMessage: i18n.t('auth.accountLocked'),
            unlockOptions,
            helpText: this.generateLockoutHelpText(record),
            nextSteps: this.generateNextSteps(unlockOptions)
        };
    }

    /**
     * Check if account is locked
     * @param {string} identifier - Email or username
     * @returns {Object} - Lock status and unlock information
     */
    isAccountLocked(identifier) {
        const key = this.normalizeIdentifier(identifier);
        const record = this.lockoutAttempts.get(key);
        
        if (!record || !record.lockedAt) {
            return { isLocked: false };
        }
        
        const now = Date.now();
        
        // Check if time-based unlock has occurred
        if (now >= record.unlockAt) {
            return this.autoUnlockAccount(key, record);
        }
        
        // Account is still locked
        const remainingTime = record.unlockAt - now;
        const unlockOptions = this.generateUnlockOptions(key, record);
        
        return {
            isLocked: true,
            lockedAt: record.lockedAt,
            unlockAt: record.unlockAt,
            remainingTime,
            remainingTimeFormatted: this.formatDuration(remainingTime),
            lockoutCount: record.lockoutCount,
            userMessage: i18n.t('auth.accountLocked'),
            unlockOptions,
            helpText: this.generateLockoutHelpText(record),
            nextSteps: this.generateNextSteps(unlockOptions)
        };
    }

    /**
     * Generate unlock options for locked account
     * @param {string} key - Account identifier
     * @param {Object} record - Lockout record
     * @returns {Array} - Available unlock methods
     */
    generateUnlockOptions(key, record) {
        const options = [];
        const now = Date.now();
        
        // Time-based unlock
        if (this.config.unlockMethods.includes('time')) {
            const remainingTime = record.unlockAt - now;
            options.push({
                method: 'time',
                title: '자동 잠금 해제 대기',
                description: `${this.formatDuration(remainingTime)} 후 자동으로 잠금이 해제됩니다`,
                action: 'wait',
                estimatedTime: remainingTime,
                icon: '⏰',
                availability: 'automatic'
            });
        }
        
        // Email-based unlock
        if (this.config.unlockMethods.includes('email')) {
            options.push({
                method: 'email',
                title: '이메일로 즉시 잠금 해제',
                description: '인증 이메일을 받아 즉시 계정 잠금을 해제할 수 있습니다',
                action: 'send_unlock_email',
                estimatedTime: 5 * 60 * 1000, // 5 minutes
                icon: '📧',
                availability: 'immediate'
            });
        }
        
        // Admin unlock request
        if (this.config.unlockMethods.includes('admin')) {
            options.push({
                method: 'admin',
                title: '관리자에게 잠금 해제 요청',
                description: '관리자가 검토 후 계정 잠금을 해제해드립니다',
                action: 'request_admin_unlock',
                estimatedTime: 2 * 60 * 60 * 1000, // 2 hours
                icon: '👨‍💼',
                availability: 'manual'
            });
        }
        
        return options.sort((a, b) => a.estimatedTime - b.estimatedTime);
    }

    /**
     * Send unlock email
     * @param {string} identifier - Account identifier
     * @returns {Object} - Email sending result
     */
    async sendUnlockEmail(identifier) {
        const key = this.normalizeIdentifier(identifier);
        const record = this.lockoutAttempts.get(key);
        
        if (!record || !record.lockedAt) {
            return {
                success: false,
                error: '계정이 잠금 상태가 아닙니다',
                code: 'ACCOUNT_NOT_LOCKED'
            };
        }
        
        // Generate unlock token
        const unlockToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        
        this.unlockTokens.set(unlockToken, {
            accountKey: key,
            createdAt: Date.now(),
            expiresAt: tokenExpiry,
            used: false
        });
        
        // In a real implementation, send actual email here
        const unlockLink = `https://yourapp.com/unlock-account?token=${unlockToken}`;
        
        return {
            success: true,
            message: i18n.t('auth.unlockEmailSent'),
            tokenExpiry,
            instructions: [
                '이메일을 확인해주세요 (스팸함도 확인)',
                '링크를 클릭하여 계정 잠금을 해제하세요',
                '링크는 24시간 후 만료됩니다',
                '문제가 있으면 고객지원팀에 문의하세요'
            ],
            supportInfo: {
                email: 'support@yourapp.com',
                phone: '1588-0000',
                hours: '평일 09:00-18:00'
            }
        };
    }

    /**
     * Unlock account using email token
     * @param {string} token - Unlock token from email
     * @returns {Object} - Unlock result
     */
    unlockAccountWithToken(token) {
        const tokenInfo = this.unlockTokens.get(token);
        
        if (!tokenInfo) {
            return {
                success: false,
                error: '유효하지 않은 잠금 해제 토큰입니다',
                code: 'INVALID_UNLOCK_TOKEN',
                helpText: '새로운 잠금 해제 이메일을 요청해주세요'
            };
        }
        
        if (tokenInfo.used) {
            return {
                success: false,
                error: '이미 사용된 토큰입니다',
                code: 'TOKEN_ALREADY_USED',
                helpText: '계정이 이미 잠금 해제되었거나 새 토큰이 필요합니다'
            };
        }
        
        if (Date.now() > tokenInfo.expiresAt) {
            return {
                success: false,
                error: '만료된 토큰입니다',
                code: 'TOKEN_EXPIRED',
                helpText: '새로운 잠금 해제 이메일을 요청해주세요'
            };
        }
        
        // Mark token as used
        tokenInfo.used = true;
        
        // Unlock the account
        return this.unlockAccount(tokenInfo.accountKey, 'email_token');
    }

    /**
     * Request admin unlock
     * @param {string} identifier - Account identifier
     * @param {Object} requestData - Request information
     * @returns {Object} - Request result
     */
    requestAdminUnlock(identifier, requestData = {}) {
        const key = this.normalizeIdentifier(identifier);
        const record = this.lockoutAttempts.get(key);
        
        if (!record || !record.lockedAt) {
            return {
                success: false,
                error: '계정이 잠금 상태가 아닙니다',
                code: 'ACCOUNT_NOT_LOCKED'
            };
        }
        
        const requestId = crypto.randomBytes(16).toString('hex');
        
        this.adminUnlockRequests.set(requestId, {
            accountKey: key,
            requestedAt: Date.now(),
            requestData: {
                reason: requestData.reason || '계정 잠금 해제 요청',
                contactInfo: requestData.contactInfo,
                urgency: requestData.urgency || 'normal',
                additionalInfo: requestData.additionalInfo
            },
            status: 'pending',
            adminResponse: null,
            processedAt: null
        });
        
        return {
            success: true,
            requestId,
            message: '관리자 잠금 해제 요청이 접수되었습니다',
            estimatedResponseTime: '2시간 이내',
            trackingInfo: {
                requestId,
                status: 'pending',
                submittedAt: new Date().toISOString()
            },
            nextSteps: [
                '요청이 관리자에게 전달되었습니다',
                '2시간 이내에 검토 후 연락드리겠습니다',
                '긴급한 경우 고객지원팀으로 직접 연락하세요'
            ],
            supportInfo: {
                email: 'support@yourapp.com',
                phone: '1588-0000',
                hours: '평일 09:00-18:00'
            }
        };
    }

    /**
     * Manually unlock account (admin function)
     * @param {string} identifier - Account identifier
     * @param {string} method - Unlock method
     * @param {Object} adminInfo - Admin information
     * @returns {Object} - Unlock result
     */
    unlockAccount(identifier, method = 'manual', adminInfo = null) {
        const key = this.normalizeIdentifier(identifier);
        const record = this.lockoutAttempts.get(key);
        
        if (!record) {
            return {
                success: false,
                error: '계정 기록을 찾을 수 없습니다',
                code: 'ACCOUNT_NOT_FOUND'
            };
        }
        
        // Reset lockout status
        record.lockedAt = null;
        record.unlockAt = null;
        record.attempts = 0;
        record.unlockMethod = method;
        record.unlockedAt = Date.now();
        record.unlockedBy = adminInfo;
        
        return {
            success: true,
            message: i18n.t('auth.accountUnlocked'),
            unlockedAt: record.unlockedAt,
            method,
            nextSteps: [
                '계정 잠금이 해제되었습니다',
                '이제 정상적으로 로그인할 수 있습니다',
                '보안을 위해 강력한 비밀번호를 사용해주세요'
            ],
            securityTips: [
                '비밀번호를 주기적으로 변경하세요',
                '2단계 인증을 활성화하세요',
                '의심스러운 로그인 시도가 있다면 즉시 신고하세요'
            ]
        };
    }

    /**
     * Auto-unlock account when time expires
     * @param {string} key - Account key
     * @param {Object} record - Lockout record
     * @returns {Object} - Unlock status
     */
    autoUnlockAccount(key, record) {
        record.lockedAt = null;
        record.unlockAt = null;
        record.attempts = 0;
        record.unlockMethod = 'auto_time';
        record.unlockedAt = Date.now();
        
        return {
            isLocked: false,
            autoUnlocked: true,
            unlockedAt: record.unlockedAt,
            message: '계정 잠금이 자동으로 해제되었습니다',
            nextSteps: [
                '이제 정상적으로 로그인할 수 있습니다',
                '보안을 위해 강력한 비밀번호를 사용해주세요'
            ]
        };
    }

    /**
     * Reset login attempts after successful login
     * @param {string} identifier - Account identifier
     */
    resetAttempts(identifier) {
        const key = this.normalizeIdentifier(identifier);
        if (this.lockoutAttempts.has(key)) {
            this.lockoutAttempts.delete(key);
        }
    }

    /**
     * Get current attempt status
     * @param {string} key - Account key
     * @param {Object} record - Attempt record
     * @returns {Object} - Current status
     */
    getAttemptStatus(key, record) {
        const attemptsRemaining = Math.max(0, this.config.maxAttempts - record.attempts);
        
        return {
            isLocked: false,
            attempts: record.attempts,
            maxAttempts: this.config.maxAttempts,
            attemptsRemaining,
            userMessage: attemptsRemaining > 0 
                ? `로그인에 실패했습니다. ${attemptsRemaining}번 더 실패하면 계정이 잠금됩니다.`
                : '로그인에 실패했습니다.',
            warningLevel: this.getWarningLevel(attemptsRemaining),
            nextSteps: this.generateFailureNextSteps(attemptsRemaining)
        };
    }

    /**
     * Get warning level based on remaining attempts
     * @param {number} remaining - Attempts remaining
     * @returns {string} - Warning level
     */
    getWarningLevel(remaining) {
        if (remaining <= 1) return 'critical';
        if (remaining <= 2) return 'high';
        if (remaining <= 3) return 'medium';
        return 'low';
    }

    /**
     * Generate next steps for failed login
     * @param {number} remaining - Attempts remaining
     * @returns {Array} - Next steps
     */
    generateFailureNextSteps(remaining) {
        const steps = [];
        
        if (remaining > 0) {
            steps.push('비밀번호를 다시 한 번 확인해보세요');
            steps.push('Caps Lock이 켜져있지 않은지 확인하세요');
            
            if (remaining <= 2) {
                steps.push('비밀번호 재설정을 고려해보세요');
                steps.push('다른 기기에서 로그인을 시도해보세요');
            }
        }
        
        steps.push('문제가 계속되면 고객지원팀에 문의하세요');
        return steps;
    }

    /**
     * Generate lockout help text
     * @param {Object} record - Lockout record
     * @returns {string} - Help text
     */
    generateLockoutHelpText(record) {
        return `보안을 위해 ${record.attempts}회 연속 로그인 실패로 인해 계정이 일시적으로 잠금되었습니다. ` +
               `아래 방법 중 하나를 선택하여 계정 잠금을 해제할 수 있습니다.`;
    }

    /**
     * Generate next steps for lockout
     * @param {Array} unlockOptions - Available unlock options
     * @returns {Array} - Next steps
     */
    generateNextSteps(unlockOptions) {
        const steps = [];
        
        if (unlockOptions.some(opt => opt.method === 'time')) {
            steps.push('잠시 기다리시면 자동으로 잠금이 해제됩니다');
        }
        
        if (unlockOptions.some(opt => opt.method === 'email')) {
            steps.push('즉시 해제하려면 이메일 인증을 이용하세요');
        }
        
        steps.push('본인 계정이 맞는지 다시 한번 확인해주세요');
        steps.push('의심스러운 활동이 있다면 즉시 신고하세요');
        
        return steps;
    }

    /**
     * Normalize identifier for consistent key usage
     * @param {string} identifier - Email or username
     * @returns {string} - Normalized key
     */
    normalizeIdentifier(identifier) {
        return identifier.toLowerCase().trim();
    }

    /**
     * Format duration in user-friendly format
     * @param {number} duration - Duration in milliseconds
     * @returns {string} - Formatted duration
     */
    formatDuration(duration) {
        const minutes = Math.ceil(duration / (60 * 1000));
        
        if (minutes < 60) {
            return `${minutes}분`;
        }
        
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        if (hours < 24) {
            return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
        }
        
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        
        return remainingHours > 0 ? `${days}일 ${remainingHours}시간` : `${days}일`;
    }

    /**
     * Start cleanup interval to remove old records
     */
    startCleanupInterval() {
        setInterval(() => {
            this.cleanupExpiredRecords();
        }, this.config.cleanupInterval);
    }

    /**
     * Clean up expired records
     */
    cleanupExpiredRecords() {
        const now = Date.now();
        const expiredKeys = [];
        
        // Clean up expired lockout records
        for (const [key, record] of this.lockoutAttempts) {
            // Remove records that are unlocked and older than 24 hours
            if (!record.lockedAt && (now - record.lastAttempt) > (24 * 60 * 60 * 1000)) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => this.lockoutAttempts.delete(key));
        
        // Clean up expired unlock tokens
        const expiredTokens = [];
        for (const [token, tokenInfo] of this.unlockTokens) {
            if (now > tokenInfo.expiresAt || tokenInfo.used) {
                expiredTokens.push(token);
            }
        }
        
        expiredTokens.forEach(token => this.unlockTokens.delete(token));
    }

    /**
     * Get admin dashboard data
     * @returns {Object} - Dashboard statistics
     */
    getAdminDashboard() {
        const now = Date.now();
        const last24Hours = now - (24 * 60 * 60 * 1000);
        
        let totalLocked = 0;
        let recentLockouts = 0;
        let totalAttempts = 0;
        
        for (const [key, record] of this.lockoutAttempts) {
            if (record.lockedAt) totalLocked++;
            if (record.lockedAt && record.lockedAt > last24Hours) recentLockouts++;
            totalAttempts += record.attempts;
        }
        
        return {
            currentlyLocked: totalLocked,
            recentLockouts24h: recentLockouts,
            totalFailedAttempts: totalAttempts,
            pendingUnlockRequests: this.adminUnlockRequests.size,
            activeTokens: this.unlockTokens.size
        };
    }
}

module.exports = AccountLockoutManager;