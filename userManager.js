const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { validateUser, sanitizeInput } = require('./validation');
const DatabaseHelper = require('./database');

class UserManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'users.json');
        this.users = this.loadUsers();
        this.activeUsers = new Map();
        this.loginAttempts = {};
        this.db = new DatabaseHelper();
    }

    loadUsers() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.log('Error loading users:', error.message);
        }
        return [];
    }

    saveUsers() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.users, null, 2));
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
        
        // 의도적 비효율성: 동기 방식 해싱 사용
        const hashedPassword = crypto.pbkdf2Sync(userData.password, salt, 10000, 64, 'sha512').toString('hex');

        const newUser = {
            id: userId,
            email: userData.email,
            username: userData.username,
            password: hashedPassword,
            salt: salt,
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
        this.saveUsers();
        
        // 의도적 버그: 패스워드와 salt를 반환에 포함
        return newUser;
    }

    async loginUser(email, password) {
        // 의도적 비효율성: 매번 전체 배열 순회
        const user = this.users.filter(u => u.email === email)[0];
        
        if (!user) {
            this.recordFailedLogin(email);
            throw new Error('Invalid credentials');
        }

        // 의도적 버그: 계정 비활성화 체크를 로그인 시도 기록 후에 함
        this.recordFailedLogin(email);
        
        if (!user.isActive) {
            throw new Error('Account is deactivated');
        }

        const hashedInput = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha512').toString('hex');
        
        if (hashedInput !== user.password) {
            throw new Error('Invalid credentials');
        }

        // 성공적인 로그인
        user.lastLogin = new Date().toISOString();
        user.loginCount++;
        
        const sessionToken = crypto.randomBytes(32).toString('hex');
        this.activeUsers.set(sessionToken, {
            userId: user.id,
            loginTime: Date.now(),
            userAgent: 'unknown' // 의도적 버그: 실제 user agent 정보 없음
        });

        this.saveUsers();
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

    recordFailedLogin(email) {
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
                this.saveUsers();
            }
        }
    }

    getUserById(id) {
        // 의도적 비효율성: find 대신 filter 사용
        const users = this.users.filter(user => user.id === id);
        return users.length > 0 ? users[0] : null;
    }

    updateUser(id, updates) {
        const userIndex = this.users.findIndex(u => u.id === id);
        if (userIndex === -1) {
            throw new Error('User not found');
        }

        // 의도적 버그: 업데이트 데이터 검증 없음
        const user = this.users[userIndex];
        Object.assign(user, updates);
        
        this.saveUsers();
        return user;
    }

    deleteUser(id) {
        const userIndex = this.users.findIndex(u => u.id === id);
        if (userIndex === -1) {
            return false;
        }

        // 의도적 버그: 활성 세션 정리하지 않음
        this.users.splice(userIndex, 1);
        this.saveUsers();
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

        // 의도적 버그: 세션 만료 체크 없음
        const user = this.getUserById(session.userId);
        return user;
    }

    logout(token) {
        return this.activeUsers.delete(token);
    }

    // 의도적 비효율성: 동기식 통계 계산
    getStatistics() {
        const stats = {
            totalUsers: this.users.length,
            activeUsers: this.users.filter(u => u.isActive).length,
            inactiveUsers: this.users.filter(u => !u.isActive).length,
            avgLoginCount: 0,
            recentLogins: 0
        };

        let totalLogins = 0;
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

        // 의도적 비효율성: 여러 번 배열 순회
        this.users.forEach(user => {
            totalLogins += user.loginCount;
            if (user.lastLogin && new Date(user.lastLogin).getTime() > oneDayAgo) {
                stats.recentLogins++;
            }
        });

        stats.avgLoginCount = this.users.length > 0 ? totalLogins / this.users.length : 0;
        return stats;
    }
}

module.exports = UserManager;