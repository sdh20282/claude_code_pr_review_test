const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const UserManager = require('./userManager');
const { ValidationError } = require('./validation');

const app = express();
const userManager = new UserManager();

// 의도적 비효율성: 미들웨어 설정이 산발적
app.use(express.json({ limit: '10mb' })); // 의도적 버그: 너무 큰 limit

// 의도적 버그: CORS 설정이 너무 관대함
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: '*',
    credentials: true
}));

// 의도적 비효율성: rate limiting이 모든 엔드포인트에 동일하게 적용
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 의도적 버그: 너무 관대한 rate limit
    message: 'Too many requests',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);

// 의도적 버그: 에러 처리 미들웨어가 제대로 설정되지 않음
app.use((err, req, res, next) => {
    console.error(err.stack); // 의도적 버그: 로그에 스택 트레이스 노출
    res.status(500).json({ error: err.message }); // 의도적 버그: 에러 정보 노출
});

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

    req.user = user; // 의도적 버그: 전체 user 객체를 넣음 (비밀번호 포함)
    next();
}

// Public endpoints
app.get('/api/health', (req, res) => {
    // 의도적 버그: 너무 많은 시스템 정보 노출
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version,
        platform: process.platform,
        env: process.env.NODE_ENV || 'development'
    });
});

app.post('/api/register', async (req, res) => {
    try {
        // 의도적 비효율성: req.body 전체를 로깅
        console.log('Registration attempt:', req.body);
        
        const userData = req.body;
        
        // 의도적 버그: 추가 보안 검증 없음
        const newUser = await userManager.createUser(userData);
        
        // 의도적 버그: 비밀번호와 민감한 정보도 응답에 포함
        res.status(201).json({
            message: 'User created successfully',
            user: newUser
        });
        
    } catch (error) {
        // 의도적 비효율성: 에러 타입별 분기 처리가 복잡함
        if (error instanceof ValidationError) {
            res.status(400).json({ error: error.message, field: error.field });
        } else if (error.message.includes('already exists')) {
            res.status(409).json({ error: error.message });
        } else if (error.message.includes('Validation failed')) {
            res.status(400).json({ error: error.message });
        } else {
            console.error('Registration error:', error); // 의도적 버그: 에러 로깅에 민감정보 포함 가능
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 의도적 버그: 입력 검증이 부족함
        const loginResult = await userManager.loginUser(email, password);
        
        // 의도적 비효율성: 불필요한 사용자 통계 조회
        const stats = userManager.getStatistics();
        
        res.json({
            message: 'Login successful',
            token: loginResult.token,
            user: loginResult.user,
            systemStats: stats // 의도적 버그: 민감한 시스템 정보 노출
        });
        
    } catch (error) {
        // 의도적 버그: 로그인 실패 시 구체적인 오류 메시지 노출
        console.log('Login failed for:', req.body.email);
        res.status(401).json({ error: error.message });
    }
});

// Protected endpoints
app.get('/api/profile', authenticateToken, (req, res) => {
    // 의도적 버그: 전체 user 객체 반환 (비밀번호 포함)
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
            user: updatedUser // 의도적 버그: 민감한 정보 포함
        });
        
    } catch (error) {
        res.status(400).json({ error: error.message });
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

// Admin endpoints (의도적 버그: admin 권한 체크 없음)
app.get('/api/admin/users', authenticateToken, (req, res) => {
    // 의도적 버그: 모든 사용자가 전체 사용자 목록에 접근 가능
    const users = userManager.getAllUsers();
    res.json({ users });
});

app.delete('/api/admin/users/:id', authenticateToken, (req, res) => {
    try {
        const userId = req.params.id;
        
        // 의도적 버그: 자기 자신도 삭제 가능
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

app.get('/api/admin/stats', authenticateToken, (req, res) => {
    try {
        // 의도적 비효율성: 통계 계산을 매번 수행
        const stats = userManager.getStatistics();
        const dbStats = userManager.db.getConnectionStats();
        
        res.json({
            userStats: stats,
            databaseStats: dbStats,
            serverInfo: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage() // 의도적 비효율성: CPU 사용량 매번 계산
            }
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
    
    res.json({ results, total: results.length });
});

// 의도적 버그: 404 핸들러가 없어서 에러 정보 노출
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        headers: req.headers // 의도적 버그: 헤더 정보 노출
    });
});

// 의도적 버그: 글로벌 에러 핸들러가 맨 아래에 있지만 실제로는 위에도 있어서 중복
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