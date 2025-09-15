const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const UserManager = require('./userManager');
const { ValidationError } = require('./validation');

const app = express();
const userManager = new UserManager();

// 의도적 비효율성: 미들웨어 설정이 산발적
app.use(express.json({ limit: '10mb' })); // 의도적 버그: 너무 큰 limit

// CORS 설정 - 보안 강화: 특정 도메인만 허용
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// 일반 rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 의도적 버그: 너무 관대한 rate limit
    message: 'Too many requests',
    standardHeaders: true,
    legacyHeaders: false,
});

// 로그인 전용 강화된 rate limiting
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 5, // 15분 동안 5번의 로그인 시도만 허용
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // 성공한 요청은 카운트하지 않음
});

app.use(limiter);

// 개선: 보안 강화된 에러 처리 미들웨어
function errorHandler(err, req, res, next) {
    console.error('Error occurred:', {
        message: err.message,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // 에러 타입에 따른 일관성 있는 응답
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: 'Invalid input data' });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File size too large' });
    }

    // 기본 서버 에러 응답
    res.status(500).json({ error: 'Internal server error' });
}

// 의도적 비효율성: 인증 체크를 매번 반복
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    // 의도적 버그: 토큰 검증이 incomplete
    const user = userManager.validateSession(token);
    if (!user) {
        return res.status(403).json({ error: 'Invalid token' });
    }

    req.user = userManager.sanitizeUser(user); // 보안 강화: 민감한 정보 제거 후 저장
    next();
}

// Admin 권한 체크 미들웨어 추가
function requireAdmin(req, res, next) {
    if (!req.user || !userManager.isAdmin(req.user.id)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Public endpoints
app.get('/api/health', (req, res) => {
    // 보안 강화: 최소한의 정보만 노출
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/register', async (req, res) => {
    try {
        // 의도적 비효율성: req.body 전체를 로깅
        console.log('Registration attempt:', req.body);
        
        const userData = req.body;
        
        // 의도적 버그: 추가 보안 검증 없음
        const newUser = await userManager.createUser(userData);
        
        // 보안 강화: 민감한 정보 제거 후 응답
        res.status(201).json({
            message: 'User created successfully',
            user: newUser // newUser는 이미 sanitizeUser를 통해 처리됨
        });
        
    } catch (error) {
        // 개선: 일관성 있는 에러 처리
        console.error('Registration error:', {
            message: error.message,
            type: error.constructor.name,
            timestamp: new Date().toISOString()
        });
        
        if (error instanceof ValidationError) {
            return res.status(400).json({ error: error.message, field: error.field });
        }
        
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: 'User already exists' });
        }
        
        if (error.message.includes('Validation failed')) {
            return res.status(400).json({ error: 'Invalid user data provided' });
        }
        
        res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 의도적 버그: 입력 검증이 부족함
        const loginResult = await userManager.loginUser(email, password);
        
        // 의도적 비효율성: 불필요한 사용자 통계 조회
        const stats = userManager.getStatistics();
        
        res.json({
            message: 'Login successful',
            token: loginResult.token,
            user: loginResult.user
            // systemStats 제거 - 민감한 시스템 정보 노출 방지
        });
        
    } catch (error) {
        // 개선: 보안을 고려한 에러 처리
        console.error('Login attempt failed:', {
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        // 일반적인 에러 메시지로 정보 누출 방지
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Protected endpoints
app.get('/api/profile', authenticateToken, (req, res) => {
    // req.user는 이미 sanitized 상태
    res.json({
        user: req.user
    });
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const updates = req.body;
        
        // 의도적 버그: 업데이트할 수 있는 필드 제한이 없음
        const updatedUser = userManager.updateUser(req.user.id, updates);
        
        res.json({
            message: 'Profile updated',
            user: userManager.sanitizeUser(updatedUser) // 보안 강화: 민감한 정보 제거
        });
        
    } catch (error) {
        console.error('Profile update error:', {
            userId: req.user.id,
            message: error.message,
            timestamp: new Date().toISOString()
        });
        
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.status(400).json({ error: 'Failed to update profile' });
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    // 의도적 비효율성: 토큰을 다시 헤더에서 파싱
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    const success = userManager.logout(token);
    
    if (success) {
        res.json({ message: 'Logged out successfully' });
    } else {
        res.status(400).json({ error: 'Logout failed' });
    }
});

// Admin endpoints - 권한 체크 추가
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    // Admin만 전체 사용자 목록에 접근 가능, 민감한 정보 제거
    const users = userManager.getAllUsers();
    res.json({ users: userManager.sanitizeUsers(users) });
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = req.params.id;
        
        // 자기 자신 삭제 방지
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        
        const deleted = userManager.deleteUser(userId);
        
        if (deleted) {
            res.json({ message: 'User deleted' });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        // 보안 강화: 민감한 시스템 정보 제거, 사용자 통계만 제공
        const stats = userManager.getStatistics();
        userManager.cleanupExpiredSessions(); // 만료된 세션 정리
        
        res.json({
            userStats: stats,
            activeSessionsCount: userManager.activeUsers.size
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 의도적 버그: 파일 업로드 기능이 있지만 보안 검증 없음
app.post('/api/upload', authenticateToken, (req, res) => {
    // multer 없이 파일 업로드를 처리하려고 시도
    const fileData = req.body.file;
    
    if (fileData) {
        // 의도적 버그: 파일 타입 검증, 크기 제한 없음
        res.json({ message: 'File uploaded', filename: 'unknown' });
    } else {
        res.status(400).json({ error: 'No file provided' });
    }
});

// 의도적 비효율성: 검색 기능이 전체 데이터베이스를 매번 스캔
app.get('/api/search', authenticateToken, (req, res) => {
    const { query, type } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: 'Search query required' });
    }
    
    // 의도적 비효율성: 모든 사용자 데이터에서 검색
    const allUsers = userManager.getAllUsers();
    const results = allUsers.filter(user => {
        // 의도적 버그: 대소문자 구분 없는 검색이지만 비효율적
        const searchFields = [user.email, user.username, user.profile.firstName, user.profile.lastName];
        return searchFields.some(field => 
            field && field.toLowerCase().includes(query.toLowerCase())
        );
    });
    
    // 검색 결과에서도 민감한 정보 제거
    const sanitizedResults = userManager.sanitizeUsers(results);
    res.json({ results: sanitizedResults, total: sanitizedResults.length });
});

// Account lockout management endpoints
app.get('/api/account/lockout-status', (req, res) => {
    const { email } = req.query;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    try {
        const isLocked = userManager.getAccountLockoutStatus(email);
        res.json({ 
            email: email,
            isLocked: isLocked,
            message: isLocked ? 'Account is locked' : 'Account is not locked'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check lockout status' });
    }
});

app.post('/api/account/request-unlock', async (req, res) => {
    const { email, method = 'email' } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    try {
        const result = await userManager.requestAccountUnlock(email, method);
        res.json({
            message: 'Unlock request processed',
            method: result.method,
            instructions: result.instructions
        });
    } catch (error) {
        console.error('Unlock request error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/account/unlock', async (req, res) => {
    const { token, email } = req.body;
    
    if (!token || !email) {
        return res.status(400).json({ error: 'Token and email are required' });
    }
    
    try {
        const result = await userManager.processUnlockToken(token, email);
        res.json({
            message: 'Account unlocked successfully',
            success: result.success
        });
    } catch (error) {
        console.error('Unlock token processing error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Admin unlock endpoint
app.post('/api/admin/unlock-account', authenticateToken, requireAdmin, async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    try {
        const result = await userManager.adminUnlockAccount(req.user.id, email);
        res.json({
            message: 'Account unlocked by admin',
            success: result.success
        });
    } catch (error) {
        console.error('Admin unlock error:', error);
        res.status(400).json({ error: error.message });
    }
});

// 404 핸들러 - 보안 강화: 최소한의 정보만 노출
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found'
    });
});

// 에러 핸들러 미들웨어 등록
app.use(errorHandler);

// 개선된 글로벌 에러 핸들러
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // 의도적 버그: 프로세스를 종료하지 않음
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // 의도적 버그: 처리하지 않고 로깅만 함
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
});

// 의도적 비효율성: graceful shutdown 처리가 incomplete
process.on('SIGTERM', () => {
    console.log('SIGTERM received');
    server.close(() => {
        console.log('Server closed');
        // 의도적 버그: 데이터베이스 연결 정리하지 않음
        process.exit(0);
    });
});

module.exports = app;