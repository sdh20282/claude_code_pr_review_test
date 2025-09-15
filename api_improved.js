const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ResponseHelper = require('./responseHelper');
const { i18n } = require('./i18n');
const AccountLockoutManager = require('./accountLockoutManager');

// Import improved modules
const UserManager = require('./userManager');
const { ValidationError } = require('./validation_improved');

const app = express();

// Initialize managers
const userManager = new UserManager();
const lockoutManager = new AccountLockoutManager({
    maxAttempts: 5,
    lockoutDuration: 30 * 60 * 1000, // 30 minutes
    unlockMethods: ['time', 'email', 'admin']
});

// Enhanced middleware setup
app.use(express.json({ 
    limit: '1mb', // Reduced from 10mb for security
    verify: (req, res, buf) => {
        // Add request size tracking for progress feedback
        req.requestSize = buf.length;
    }
}));

// Improved CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
    credentials: true
}));

// Language detection middleware
app.use((req, res, next) => {
    const acceptLanguage = req.headers['accept-language'];
    const detectedLang = i18n.detectLanguage(acceptLanguage);
    i18n.setLanguage(detectedLang);
    req.language = detectedLang;
    next();
});

// Enhanced rate limiting with user-friendly messages
const createRateLimit = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: (req, res) => {
        const response = ResponseHelper.rateLimitError();
        return response.body;
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const response = ResponseHelper.rateLimitError();
        res.status(response.statusCode).json(response.body);
    }
});

// Different rate limits for different endpoints
const generalLimiter = createRateLimit(15 * 60 * 1000, 100, 'general');
const authLimiter = createRateLimit(15 * 60 * 1000, 10, 'auth');

app.use('/api', generalLimiter);
app.use(['/api/login', '/api/register'], authLimiter);

// Request processing middleware for progress tracking
app.use((req, res, next) => {
    req.startTime = Date.now();
    req.requestId = require('crypto').randomBytes(8).toString('hex');
    
    // Add progress tracking capability
    res.progress = (current, total, message) => {
        const progressData = ResponseHelper.progress(current, total, message);
        res.write(`data: ${JSON.stringify(progressData.body)}\n\n`);
    };
    
    next();
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
    const requestId = req.requestId || 'unknown';
    
    // Log error securely (no sensitive data)
    console.error(`[${requestId}] Error:`, {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        timestamp: new Date().toISOString()
    });
    
    // Send user-friendly error response
    if (err instanceof ValidationError) {
        const response = ResponseHelper.validationError(err.message, err.field);
        return res.status(response.statusCode).json(response.body);
    }
    
    const response = ResponseHelper.serverError(
        i18n.t('error.server')
    );
    res.status(response.statusCode).json(response.body);
});

// Enhanced authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        const response = ResponseHelper.authError(i18n.t('auth.tokenRequired'));
        return res.status(response.statusCode).json(response.body);
    }

    const user = userManager.validateSession(token);
    if (!user) {
        const response = ResponseHelper.authError(i18n.t('auth.tokenInvalid'));
        return res.status(response.statusCode).json(response.body);
    }

    // Only include safe user data in request
    req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
    };
    next();
}

// Admin authorization middleware
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        const response = ResponseHelper.forbiddenError(i18n.t('error.forbidden'));
        return res.status(response.statusCode).json(response.body);
    }
    next();
}

// Public endpoints

// Enhanced health check with minimal system info
app.get('/api/health', (req, res) => {
    const response = ResponseHelper.success({
        status: 'healthy',
        version: '1.0.0'
    }, 'Service is running normally', {
        timestamp: new Date().toISOString(),
        requestId: req.requestId
    });
    
    res.status(response.statusCode).json(response.body);
});

// Enhanced registration with progress tracking
app.post('/api/register', async (req, res) => {
    try {
        // Set up Server-Sent Events for progress tracking
        if (req.headers.accept === 'text/event-stream') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
        }
        
        const userData = req.body;
        
        // Progress: Step 1 - Validation
        if (res.progress) {
            res.progress(1, 4, '입력 정보를 검증하는 중...');
        }
        
        // Enhanced validation with user-friendly messages
        const validation = require('./validation_improved').validateUser(userData);
        
        if (!validation.isValid) {
            const response = ResponseHelper.validationError(
                validation.errors,
                null
            );
            
            // Add suggestions and progress info
            response.body.error.details.suggestions = validation.suggestions;
            response.body.error.details.progress = validation.progress;
            
            return res.status(response.statusCode).json(response.body);
        }
        
        // Progress: Step 2 - User creation
        if (res.progress) {
            res.progress(2, 4, '계정을 생성하는 중...');
        }
        
        const newUser = await userManager.createUser(validation.validatedData);
        
        // Progress: Step 3 - Welcome email (simulated)
        if (res.progress) {
            res.progress(3, 4, '환영 이메일을 발송하는 중...');
        }
        
        // Simulate email sending delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Progress: Step 4 - Complete
        if (res.progress) {
            res.progress(4, 4, '회원가입이 완료되었습니다!');
        }
        
        // Return safe user data without sensitive information
        const safeUserData = {
            id: newUser.id,
            email: newUser.email,
            username: newUser.username,
            profile: newUser.profile,
            createdAt: newUser.createdAt
        };
        
        const response = ResponseHelper.success(
            safeUserData,
            i18n.t('user.created'),
            {
                registrationId: req.requestId,
                nextSteps: [
                    '이메일 인증을 완료해주세요',
                    '프로필 정보를 추가로 입력하세요',
                    '첫 로그인을 시작하세요'
                ]
            },
            201
        );
        
        res.status(response.statusCode).json(response.body);
        
    } catch (error) {
        // Enhanced error handling with specific user guidance
        let response;
        
        if (error.message.includes('already exists')) {
            response = ResponseHelper.error(
                '이미 존재하는 이메일입니다',
                'EMAIL_EXISTS',
                {
                    suggestions: [
                        '다른 이메일 주소를 사용해보세요',
                        '기존 계정으로 로그인을 시도해보세요',
                        '비밀번호를 잊으셨다면 재설정을 이용하세요'
                    ],
                    helpActions: [
                        { text: '로그인하기', action: 'login' },
                        { text: '비밀번호 찾기', action: 'reset_password' }
                    ]
                },
                409
            );
        } else {
            response = ResponseHelper.serverError(
                '계정 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
            );
        }
        
        res.status(response.statusCode).json(response.body);
    }
});

// Enhanced login with lockout management
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Input validation
        if (!email || !password) {
            const response = ResponseHelper.validationError([{
                message: '이메일과 비밀번호를 모두 입력해주세요',
                fields: !email && !password ? ['email', 'password'] : (!email ? ['email'] : ['password'])
            }]);
            return res.status(response.statusCode).json(response.body);
        }
        
        // Check account lockout status
        const lockStatus = lockoutManager.isAccountLocked(email);
        if (lockStatus.isLocked) {
            const response = ResponseHelper.error(
                lockStatus.userMessage,
                'ACCOUNT_LOCKED',
                {
                    unlockOptions: lockStatus.unlockOptions,
                    remainingTime: lockStatus.remainingTimeFormatted,
                    helpText: lockStatus.helpText,
                    nextSteps: lockStatus.nextSteps
                },
                423 // Locked status code
            );
            return res.status(response.statusCode).json(response.body);
        }
        
        try {
            const loginResult = await userManager.loginUser(email, password);
            
            // Reset lockout attempts on successful login
            lockoutManager.resetAttempts(email);
            
            // Return success with safe user data
            const response = ResponseHelper.success(
                {
                    token: loginResult.token,
                    user: {
                        id: loginResult.user.id,
                        email: loginResult.user.email,
                        username: loginResult.user.username,
                        profile: loginResult.user.profile
                    }
                },
                i18n.t('auth.loginSuccess'),
                {
                    loginTime: new Date().toISOString(),
                    nextSteps: [
                        '로그인이 완료되었습니다',
                        '개인정보를 안전하게 보호하세요',
                        '의심스러운 활동이 있다면 즉시 신고하세요'
                    ]
                }
            );
            
            res.status(response.statusCode).json(response.body);
            
        } catch (loginError) {
            // Record failed attempt
            const attemptResult = lockoutManager.recordFailedAttempt(email, {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                timestamp: Date.now()
            });
            
            let errorResponse;
            
            if (attemptResult.isLocked) {
                // Account just got locked
                errorResponse = ResponseHelper.error(
                    attemptResult.userMessage,
                    'ACCOUNT_LOCKED',
                    {
                        unlockOptions: attemptResult.unlockOptions,
                        helpText: attemptResult.helpText,
                        nextSteps: attemptResult.nextSteps,
                        lockoutInfo: {
                            duration: attemptResult.duration,
                            unlockAt: attemptResult.unlockAt
                        }
                    },
                    423
                );
            } else {
                // Login failed but account not locked yet
                errorResponse = ResponseHelper.error(
                    i18n.t('auth.loginFailed'),
                    'LOGIN_FAILED',
                    {
                        attemptsRemaining: attemptResult.attemptsRemaining,
                        warningLevel: attemptResult.warningLevel,
                        helpText: '이메일과 비밀번호를 다시 확인해주세요',
                        nextSteps: attemptResult.nextSteps,
                        suggestions: [
                            '비밀번호 대소문자를 확인해주세요',
                            'Caps Lock이 켜져있지 않은지 확인하세요',
                            '다른 기기에서 로그인을 시도해보세요'
                        ]
                    },
                    401
                );
            }
            
            res.status(errorResponse.statusCode).json(errorResponse.body);
        }
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        );
        res.status(response.statusCode).json(response.body);
    }
});

// Account unlock endpoints
app.post('/api/unlock/email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            const response = ResponseHelper.validationError('이메일을 입력해주세요');
            return res.status(response.statusCode).json(response.body);
        }
        
        const result = await lockoutManager.sendUnlockEmail(email);
        
        if (result.success) {
            const response = ResponseHelper.success(
                null,
                result.message,
                {
                    instructions: result.instructions,
                    supportInfo: result.supportInfo,
                    tokenExpiry: result.tokenExpiry
                }
            );
            res.status(response.statusCode).json(response.body);
        } else {
            const response = ResponseHelper.error(
                result.error,
                result.code,
                { helpText: '계정 상태를 확인하고 다시 시도해주세요' }
            );
            res.status(response.statusCode).json(response.body);
        }
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '잠금 해제 이메일 발송 중 오류가 발생했습니다'
        );
        res.status(response.statusCode).json(response.body);
    }
});

app.post('/api/unlock/token', (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            const response = ResponseHelper.validationError('잠금 해제 토큰을 입력해주세요');
            return res.status(response.statusCode).json(response.body);
        }
        
        const result = lockoutManager.unlockAccountWithToken(token);
        
        if (result.success) {
            const response = ResponseHelper.success(
                null,
                result.message,
                {
                    nextSteps: result.nextSteps,
                    securityTips: result.securityTips
                }
            );
            res.status(response.statusCode).json(response.body);
        } else {
            const response = ResponseHelper.error(
                result.error,
                result.code,
                { helpText: result.helpText }
            );
            res.status(response.statusCode).json(response.body);
        }
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '토큰 처리 중 오류가 발생했습니다'
        );
        res.status(response.statusCode).json(response.body);
    }
});

// Protected endpoints
app.get('/api/profile', authenticateToken, (req, res) => {
    try {
        const user = userManager.getUserById(req.user.id);
        
        if (!user) {
            const response = ResponseHelper.notFoundError('사용자 정보');
            return res.status(response.statusCode).json(response.body);
        }
        
        // Return safe user data
        const safeUserData = {
            id: user.id,
            email: user.email,
            username: user.username,
            profile: user.profile,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            loginCount: user.loginCount
        };
        
        const response = ResponseHelper.success(
            safeUserData,
            i18n.t('user.profileRetrieved')
        );
        
        res.status(response.statusCode).json(response.body);
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '프로필 정보를 가져오는 중 오류가 발생했습니다'
        );
        res.status(response.statusCode).json(response.body);
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const updates = req.body;
        
        // Validate allowed fields for update
        const allowedFields = ['firstName', 'lastName', 'age'];
        const updateData = {};
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateData[field] = updates[field];
            }
        }
        
        if (Object.keys(updateData).length === 0) {
            const response = ResponseHelper.validationError('업데이트할 정보를 입력해주세요');
            return res.status(response.statusCode).json(response.body);
        }
        
        const updatedUser = userManager.updateUser(req.user.id, { profile: updateData });
        
        // Return safe updated data
        const safeUserData = {
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            profile: updatedUser.profile
        };
        
        const response = ResponseHelper.success(
            safeUserData,
            i18n.t('user.updated'),
            {
                updatedFields: Object.keys(updateData),
                updatedAt: new Date().toISOString()
            }
        );
        
        res.status(response.statusCode).json(response.body);
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '프로필 업데이트 중 오류가 발생했습니다'
        );
        res.status(response.statusCode).json(response.body);
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        const success = userManager.logout(token);
        
        if (success) {
            const response = ResponseHelper.success(
                null,
                i18n.t('auth.logoutSuccess'),
                {
                    logoutTime: new Date().toISOString(),
                    nextSteps: [
                        '성공적으로 로그아웃되었습니다',
                        '개인정보 보안을 위해 브라우저를 닫아주세요',
                        '공용 컴퓨터라면 모든 데이터를 삭제하세요'
                    ]
                }
            );
            res.status(response.statusCode).json(response.body);
        } else {
            const response = ResponseHelper.error(
                '로그아웃 처리에 실패했습니다',
                'LOGOUT_FAILED',
                { helpText: '이미 로그아웃되었거나 세션이 만료되었을 수 있습니다' }
            );
            res.status(response.statusCode).json(response.body);
        }
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '로그아웃 처리 중 오류가 발생했습니다'
        );
        res.status(response.statusCode).json(response.body);
    }
});

// Admin endpoints with proper authorization
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        
        const users = userManager.getAllUsers();
        const total = users.length;
        const start = (pageNum - 1) * limitNum;
        const paginatedUsers = users.slice(start, start + limitNum);
        
        // Return safe user data for admin
        const safeUsers = paginatedUsers.map(user => ({
            id: user.id,
            email: user.email,
            username: user.username,
            isActive: user.isActive,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            loginCount: user.loginCount
        }));
        
        const response = ResponseHelper.paginated(
            safeUsers,
            pageNum,
            limitNum,
            total,
            '사용자 목록을 성공적으로 조회했습니다'
        );
        
        res.status(response.statusCode).json(response.body);
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '사용자 목록 조회 중 오류가 발생했습니다'
        );
        res.status(response.statusCode).json(response.body);
    }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = req.params.id;
        
        // Prevent admin from deleting their own account
        if (userId === req.user.id) {
            const response = ResponseHelper.error(
                '자신의 계정은 삭제할 수 없습니다',
                'CANNOT_DELETE_SELF',
                {
                    helpText: '다른 관리자에게 요청하거나 고객지원팀에 문의하세요'
                },
                403
            );
            return res.status(response.statusCode).json(response.body);
        }
        
        const deleted = userManager.deleteUser(userId);
        
        if (deleted) {
            const response = ResponseHelper.success(
                null,
                i18n.t('user.deleted'),
                {
                    deletedUserId: userId,
                    deletedBy: req.user.id,
                    deletedAt: new Date().toISOString()
                }
            );
            res.status(response.statusCode).json(response.body);
        } else {
            const response = ResponseHelper.notFoundError('사용자');
            res.status(response.statusCode).json(response.body);
        }
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '사용자 삭제 중 오류가 발생했습니다'
        );
        res.status(response.statusCode).json(response.body);
    }
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userStats = userManager.getStatistics();
        const lockoutStats = lockoutManager.getAdminDashboard();
        
        const response = ResponseHelper.success(
            {
                users: userStats,
                security: lockoutStats,
                system: {
                    uptime: process.uptime(),
                    nodeVersion: process.version,
                    environment: process.env.NODE_ENV || 'development'
                }
            },
            '관리자 통계를 성공적으로 조회했습니다',
            {
                generatedAt: new Date().toISOString(),
                nextUpdate: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            }
        );
        
        res.status(response.statusCode).json(response.body);
        
    } catch (error) {
        const response = ResponseHelper.serverError(
            '통계 조회 중 오류가 발생했습니다'
        );
        res.status(response.statusCode).json(response.body);
    }
});

// Enhanced 404 handler
app.use('*', (req, res) => {
    const response = ResponseHelper.notFoundError('요청한 리소스');
    response.body.error.details.requestedPath = req.originalUrl;
    response.body.error.details.method = req.method;
    response.body.error.details.suggestions = [
        'URL을 다시 확인해주세요',
        'API 문서를 참조하세요',
        '고객지원팀에 문의하세요'
    ];
    
    res.status(response.statusCode).json(response.body);
});

// Enhanced graceful shutdown
const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`🚀 Server running on port ${process.env.PORT || 3000}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔧 Language: ${i18n.getLanguage()}`);
});

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
    console.log(`\n📴 ${signal} received. Starting graceful shutdown...`);
    
    server.close((err) => {
        if (err) {
            console.error('❌ Error during server shutdown:', err);
            process.exit(1);
        }
        
        console.log('✅ Server closed successfully');
        
        // Clean up resources
        try {
            // Close database connections
            userManager.db.cleanup();
            
            console.log('✅ Cleanup completed');
            process.exit(0);
        } catch (cleanupError) {
            console.error('❌ Error during cleanup:', cleanupError);
            process.exit(1);
        }
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('⏰ Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

module.exports = app;