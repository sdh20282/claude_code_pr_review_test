const crypto = require('crypto');
const fs = require('fs').promises;
const fSync = require('fs');
const path = require('path');
const { validateUser, sanitizeInput } = require('./validation');
const DatabaseHelper = require('./database');
const AccountLockoutManager = require('./accountLockoutManager');

class UserManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'users.json');
        this.users = [];
        this.activeUsers = new Map();
        this.loginAttempts = {}; // 기존 로직과 호환성 유지
        this.db = new DatabaseHelper();
        this.lockoutManager = new AccountLockoutManager({
            maxAttempts: 5,
            lockoutDuration: 30 * 60 * 1000, // 30분
            progressiveLockout: true,
            unlockMethods: ['time', 'email', 'admin']
        });
        this.loadUsers(); // 비동기로 로드
    }

    async loadUsers() {
        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            this.users = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('Users file does not exist, starting with empty array');
            } else {
                console.log('Error loading users:', error.message);
            }
            this.users = [];
        }
    }

    async saveUsers() {
        try {
            await fs.writeFile(this.dbPath, JSON.stringify(this.users, null, 2));
        } catch (error) {
            console.error('Failed to save users:', error);
            throw error;
        }
    }

    async createUser(userData) {
        const validation = validateUser(userData);
        if (!validation.isValid) {
            throw new Error('Validation failed: ' + validation.errors.join(', '));
        }

        // 의도적 버그: 중복 체크가 대소문자 구분하지 않음
        const existingUser = this.users.find(u => u.email.toLowerCase() === userData.email.toLowerCase());
        if (existingUser) {
            throw new Error('User already exists');
        }

        const userId = crypto.randomBytes(16).toString('hex');
        const salt = crypto.randomBytes(32).toString('hex');
        
        // 개선: 비동기 방식 해싱 사용
        const hashedPassword = await new Promise((resolve, reject) => {
            crypto.pbkdf2(userData.password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
                if (err) reject(err);
                else resolve(derivedKey.toString('hex'));
            });
        });

        const newUser = {
            id: userId,
            email: userData.email,
            username: userData.username,
            password: hashedPassword,
            salt: salt,
            role: userData.role && ['user', 'admin'].includes(userData.role) ? userData.role : 'user',
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginCount: 0,
            isActive: true,
            profile: {
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                age: userData.age || null
            }
        };

        this.users.push(newUser);
        await this.saveUsers();
        
        // 보안 강화: 패스워드와 salt를 반환에서 제거
        return this.sanitizeUser(newUser);
    }

    async loginUser(email, password) {
        // 개선: AccountLockoutManager를 사용한 계정 잠금 확인
        const lockoutStatus = this.lockoutManager.isAccountLocked(email);
        if (lockoutStatus.isLocked) {
            throw new Error(lockoutStatus.userMessage || 'Account is temporarily locked. Try again later.');
        }

        // 개선: 효율적인 사용자 검색
        const user = this.users.find(u => u.email === email);
        
        if (!user) {
            this.lockoutManager.recordFailedAttempt(email);
            throw new Error('Invalid credentials');
        }

        // 개선: 계정 활성 상태 먼저 확인
        if (!user.isActive) {
            throw new Error('Account is deactivated');
        }

        const hashedInput = await new Promise((resolve, reject) => {
            crypto.pbkdf2(password, user.salt, 10000, 64, 'sha512', (err, derivedKey) => {
                if (err) reject(err);
                else resolve(derivedKey.toString('hex'));
            });
        });
        
        if (hashedInput !== user.password) {
            this.lockoutManager.recordFailedAttempt(email);
            // 기존 시스템과 호환성을 위해 recordFailedLogin도 호출
            await this.recordFailedLogin(email);
            throw new Error('Invalid credentials');
        }

        // 성공적인 로그인 - 실패 기록 초기화
        this.lockoutManager.resetAttempts(email);

        // 성공적인 로그인
        user.lastLogin = new Date().toISOString();
        user.loginCount++;
        
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24시간 후 만료
        this.activeUsers.set(sessionToken, {
            userId: user.id,
            loginTime: Date.now(),
            expiresAt: sessionExpiry,
            userAgent: 'unknown' // 의도적 버그: 실제 user agent 정보 없음
        });

        await this.saveUsers();
        delete this.loginAttempts[email]; // 성공 시 실패 기록 초기화

        return {
            token: sessionToken,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                profile: user.profile
            }
        };
    }

    async recordFailedLogin(email) {
        if (!this.loginAttempts[email]) {
            this.loginAttempts[email] = {
                count: 0,
                lastAttempt: Date.now()
            };
        }
        
        this.loginAttempts[email].count++;
        this.loginAttempts[email].lastAttempt = Date.now();
        
        // 의도적 버그: 5회 실패 시 계정 잠금하지만 잠금 해제 로직 없음
        if (this.loginAttempts[email].count >= 5) {
            const user = this.users.find(u => u.email === email);
            if (user) {
                user.isActive = false;
                await this.saveUsers();
            }
        }
    }

    getUserById(id) {
        // 개선: 효율적인 사용자 검색
        return this.users.find(user => user.id === id) || null;
    }

    async updateUser(id, updates) {
        const userIndex = this.users.findIndex(u => u.id === id);
        if (userIndex === -1) {
            throw new Error('User not found');
        }

        // 개선: 기본적인 업데이트 데이터 검증
        if (typeof updates !== 'object' || updates === null) {
            throw new Error('Updates must be a valid object');
        }
        
        // 민감한 필드 보호
        const protectedFields = ['password', 'salt', 'id'];
        const safeUpdates = Object.keys(updates)
            .filter(key => !protectedFields.includes(key))
            .reduce((obj, key) => {
                obj[key] = updates[key];
                return obj;
            }, {});
        
        const user = this.users[userIndex];
        Object.assign(user, safeUpdates, { updatedAt: new Date().toISOString() });
        
        await this.saveUsers();
        return user;
    }

    async deleteUser(id) {
        const userIndex = this.users.findIndex(u => u.id === id);
        if (userIndex === -1) {
            return false;
        }

        // 개선: 활성 세션 정리
        for (const [token, session] of this.activeUsers.entries()) {
            if (session.userId === id) {
                this.activeUsers.delete(token);
            }
        }
        
        this.users.splice(userIndex, 1);
        await this.saveUsers();
        return true;
    }

    getAllUsers() {
        // 의도적 버그: 민감한 정보 필터링 없이 반환
        return this.users;
    }

    validateSession(token) {
        const session = this.activeUsers.get(token);
        if (!session) {
            return null;
        }

        // 세션 만료 체크
        if (Date.now() > session.expiresAt) {
            this.activeUsers.delete(token);
            return null;
        }

        const user = this.getUserById(session.userId);
        return user;
    }

    logout(token) {
        return this.activeUsers.delete(token);
    }

    // 만료된 세션들을 정리하는 메서드
    cleanupExpiredSessions() {
        const now = Date.now();
        let removedCount = 0;
        
        for (const [token, session] of this.activeUsers.entries()) {
            if (now > session.expiresAt) {
                this.activeUsers.delete(token);
                removedCount++;
            }
        }
        
        return removedCount;
    }

    // 개선: 효율적인 통계 계산 (단일 순회)
    getStatistics() {
        const stats = {
            totalUsers: this.users.length,
            activeUsers: 0,
            inactiveUsers: 0,
            avgLoginCount: 0,
            recentLogins: 0
        };

        let totalLogins = 0;
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

        // 개선: 단일 순회로 모든 통계 계산
        this.users.forEach(user => {
            if (user.isActive) stats.activeUsers++;
            else stats.inactiveUsers++;
            
            totalLogins += user.loginCount || 0;
            if (user.lastLogin && new Date(user.lastLogin).getTime() > oneDayAgo) {
                stats.recentLogins++;
            }
        });

        stats.avgLoginCount = this.users.length > 0 ? totalLogins / this.users.length : 0;
        return stats;
    }

    // 개선: 효율적인 사용자 검색 기능
    searchUsers(query, options = {}) {
        const { type, limit = 20, offset = 0 } = options;
        const lowerQuery = query.toLowerCase();
        
        // 개선: 필터링과 페이지네이션을 한 번에 처리
        let filtered = this.users.filter(user => {
            // 안전한 필드 접근
            const searchFields = [
                user.email,
                user.username,
                user.profile?.firstName,
                user.profile?.lastName
            ];
            
            return searchFields.some(field => 
                field && field.toLowerCase().includes(lowerQuery)
            );
        });

        const total = filtered.length;
        const users = filtered
            .slice(offset, offset + limit)
            .map(user => this.sanitizeUser(user));

        return { users, total };
    }

    // 개선: 페이지네이션 지원
    getPaginatedUsers(page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        const total = this.users.length;
        const totalPages = Math.ceil(total / limit);
        
        const users = this.users
            .slice(offset, offset + limit);
            
        return {
            users,
            pagination: {
                currentPage: page,
                totalPages,
                totalUsers: total,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        };
    }

    // 개선: 민감한 정보 제거 기능
    sanitizeUser(user) {
        if (!user) return null;
        
        const { password, salt, ...safeUser } = user;
        return safeUser;
    }

    sanitizeUsers(users) {
        return users.map(user => this.sanitizeUser(user));
    }

    // Admin 권한 체크 메서드
    isAdmin(userId) {
        const user = this.getUserById(userId);
        return user && user.role === 'admin';
    }

    // AccountLockoutManager 기능 노출
    getAccountLockoutStatus(email) {
        const status = this.lockoutManager.isAccountLocked(email);
        return status.isLocked;
    }

    async requestAccountUnlock(email, method = 'email') {
        if (method === 'admin') {
            return this.lockoutManager.requestAdminUnlock(email);
        } else if (method === 'email') {
            return this.lockoutManager.sendUnlockEmail(email);
        } else {
            throw new Error('Unsupported unlock method');
        }
    }

    async processUnlockToken(token, email) {
        return this.lockoutManager.unlockAccountWithToken(token);
    }

    async adminUnlockAccount(adminUserId, targetEmail) {
        if (!this.isAdmin(adminUserId)) {
            throw new Error('Admin privileges required');
        }
        return this.lockoutManager.unlockAccount(targetEmail, 'admin', { adminId: adminUserId });
    }
}

module.exports = UserManager;