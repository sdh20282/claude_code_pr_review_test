/**
 * UX Improvement Examples
 * Demonstrates how all the enhanced components work together
 * to provide a superior user experience
 */

const ResponseHelper = require('./responseHelper');
const { i18n } = require('./i18n');
const { validateUser } = require('./validation_improved');
const AccountLockoutManager = require('./accountLockoutManager');
const { ProgressTracker, OperationFactory } = require('./progressTracker');

// Initialize components
const progressTracker = new ProgressTracker();
const lockoutManager = new AccountLockoutManager();

/**
 * Example 1: Enhanced Registration Flow with Progress Feedback
 */
async function enhancedRegistrationExample(userData, req, res) {
    const operationId = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        // Create progress tracker for registration
        const operation = OperationFactory.createUserRegistration(progressTracker, operationId);
        
        // Set up Server-Sent Events for real-time progress
        if (req.headers.accept === 'text/event-stream') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });
            
            // Send progress updates
            operation.on('stepStarted', (stepIndex, status) => {
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    ...status
                })}\n\n`);
            });
            
            operation.on('stepCompleted', (stepIndex, result, status) => {
                res.write(`data: ${JSON.stringify({
                    type: 'step_complete',
                    ...status
                })}\n\n`);
            });
        }
        
        // Step 1: Enhanced validation with detailed feedback
        operation.startStep(0, '사용자 입력을 검증하는 중입니다...');
        
        const validation = validateUser(userData);
        
        if (!validation.isValid) {
            operation.failStep(0, '입력 검증 실패', false);
            
            // Return comprehensive validation error with suggestions
            const response = ResponseHelper.validationError(
                '입력 정보를 확인해주세요',
                'VALIDATION_ERROR',
                {
                    errors: validation.errors,
                    suggestions: validation.suggestions,
                    progress: validation.progress,
                    fieldHints: {
                        email: '예: user@example.com',
                        password: '8자 이상, 대소문자/숫자/특수문자 포함',
                        username: '3-20자, 영문/숫자/밑줄만 사용'
                    },
                    nextSteps: [
                        '빨간색으로 표시된 필드를 먼저 수정하세요',
                        '각 필드의 도움말을 참조하세요',
                        '문제가 계속되면 예시를 참고하세요'
                    ]
                }
            );
            
            if (req.headers.accept === 'text/event-stream') {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    ...response.body
                })}\n\n`);
                res.end();
            } else {
                return res.status(response.statusCode).json(response.body);
            }
        }
        
        operation.completeStep(0, { success: true, message: '입력 검증 완료' });
        
        // Step 2: Account creation with duplicate check
        operation.startStep(1, '새 계정을 생성하는 중입니다...');
        
        // Simulate account creation process
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        operation.completeStep(1, { 
            success: true, 
            message: '계정이 성공적으로 생성되었습니다',
            accountId: `user_${Date.now()}`
        });
        
        // Step 3: Welcome email with delivery confirmation
        operation.startStep(2, '환영 이메일을 준비하는 중입니다...');
        
        // Simulate email preparation and sending
        setTimeout(() => {
            operation.updateStepProgress(2, 50, '이메일 템플릿을 생성하는 중...');
        }, 1000);
        
        setTimeout(() => {
            operation.updateStepProgress(2, 80, '이메일을 발송하는 중...');
        }, 2000);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        operation.completeStep(2, { 
            success: true, 
            message: '환영 이메일이 발송되었습니다',
            emailDelivered: true
        });
        
        // Step 4: Profile setup
        operation.startStep(3, '기본 프로필을 설정하는 중입니다...');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        operation.completeStep(3, { 
            success: true, 
            message: '프로필 설정 완료'
        });
        
        // Complete operation
        operation.complete({ 
            message: '회원가입이 성공적으로 완료되었습니다!',
            userId: validation.validatedData.email
        });
        
        // Send final success response
        const response = ResponseHelper.success(
            {
                user: {
                    email: validation.validatedData.email,
                    username: validation.validatedData.username
                },
                operationId
            },
            i18n.t('user.created'),
            {
                completionTime: new Date().toISOString(),
                nextSteps: [
                    '이메일 인증을 완료해주세요 (스팸함도 확인)',
                    '프로필 사진을 업로드하세요',
                    '관심 분야를 설정하세요',
                    '첫 로그인을 시작하세요'
                ],
                tips: [
                    '보안을 위해 정기적으로 비밀번호를 변경하세요',
                    '2단계 인증 설정을 권장합니다',
                    '개인정보는 신중하게 공유하세요'
                ]
            }
        );
        
        if (req.headers.accept === 'text/event-stream') {
            res.write(`data: ${JSON.stringify({
                type: 'complete',
                ...response.body
            })}\n\n`);
            res.end();
        } else {
            return res.status(response.statusCode).json(response.body);
        }
        
    } catch (error) {
        // Handle unexpected errors gracefully
        const response = ResponseHelper.serverError(
            '회원가입 처리 중 예상치 못한 오류가 발생했습니다'
        );
        
        response.body.error.details = {
            operationId,
            timestamp: new Date().toISOString(),
            supportInfo: {
                message: '문제가 지속되면 고객지원팀에 문의해주세요',
                email: 'support@example.com',
                phone: '1588-0000'
            },
            retryGuidance: {
                canRetry: true,
                suggestedWaitTime: '몇 분 후',
                alternativeActions: [
                    '브라우저 새로고침 후 재시도',
                    '다른 브라우저로 시도',
                    '나중에 다시 시도'
                ]
            }
        };
        
        if (req.headers.accept === 'text/event-stream') {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                ...response.body
            })}\n\n`);
            res.end();
        } else {
            return res.status(response.statusCode).json(response.body);
        }
    }
}

/**
 * Example 2: Enhanced Login with Smart Lockout Management
 */
async function enhancedLoginExample(email, password, req, res) {
    try {
        // Check account lockout status first
        const lockStatus = lockoutManager.isAccountLocked(email);
        
        if (lockStatus.isLocked) {
            // Provide comprehensive lockout information with options
            const response = ResponseHelper.error(
                lockStatus.userMessage,
                'ACCOUNT_LOCKED',
                {
                    lockoutInfo: {
                        lockedAt: lockStatus.lockedAt,
                        unlockAt: lockStatus.unlockAt,
                        remainingTime: lockStatus.remainingTimeFormatted,
                        lockoutCount: lockStatus.lockoutCount
                    },
                    unlockOptions: lockStatus.unlockOptions.map(option => ({
                        ...option,
                        estimatedTimeFormatted: formatDuration(option.estimatedTime)
                    })),
                    guidance: {
                        primary: lockStatus.helpText,
                        steps: lockStatus.nextSteps,
                        prevention: [
                            '올바른 비밀번호를 확인하세요',
                            '다른 기기에서의 로그인 시도를 확인하세요',
                            '의심스러운 활동이 있다면 즉시 신고하세요'
                        ]
                    },
                    support: {
                        quickActions: [
                            {
                                title: '이메일로 즉시 해제',
                                action: 'unlock_email',
                                description: '인증 이메일을 받아 즉시 잠금 해제'
                            },
                            {
                                title: '고객지원 연락',
                                action: 'contact_support',
                                description: '긴급한 경우 즉시 도움 요청'
                            }
                        ]
                    }
                },
                423 // HTTP 423 Locked
            );
            
            return res.status(response.statusCode).json(response.body);
        }
        
        // Attempt login (this would normally call userManager.loginUser)
        try {
            // Simulate login attempt
            const loginSuccessful = Math.random() > 0.3; // 70% success rate for demo
            
            if (!loginSuccessful) {
                throw new Error('Invalid credentials');
            }
            
            // Reset lockout on successful login
            lockoutManager.resetAttempts(email);
            
            // Return success response
            const response = ResponseHelper.success(
                {
                    token: 'mock_jwt_token',
                    user: {
                        email: email,
                        username: 'demo_user'
                    }
                },
                i18n.t('auth.loginSuccess'),
                {
                    loginTime: new Date().toISOString(),
                    securityTips: [
                        '로그인이 성공적으로 완료되었습니다',
                        '의심스러운 활동 발견 시 즉시 로그아웃하세요',
                        '공용 컴퓨터에서는 사용 후 반드시 로그아웃하세요'
                    ],
                    nextSteps: [
                        '메인 대시보드로 이동하기',
                        '보안 설정 확인하기',
                        '최신 공지사항 확인하기'
                    ]
                }
            );
            
            return res.status(response.statusCode).json(response.body);
            
        } catch (loginError) {
            // Record failed attempt and provide helpful feedback
            const attemptResult = lockoutManager.recordFailedAttempt(email, {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                source: 'web_login'
            });
            
            let errorResponse;
            
            if (attemptResult.isLocked) {
                // Account just got locked - provide immediate unlock options
                errorResponse = ResponseHelper.error(
                    attemptResult.userMessage,
                    'ACCOUNT_JUST_LOCKED',
                    {
                        lockoutInfo: {
                            reason: `${attemptResult.attemptsRemaining + 1}회 연속 로그인 실패`,
                            duration: formatDuration(attemptResult.duration),
                            unlockAt: attemptResult.unlockAt
                        },
                        immediateActions: {
                            title: '지금 바로 할 수 있는 일',
                            options: attemptResult.unlockOptions
                        },
                        preventiveMeasures: {
                            title: '다음에는 이런 일을 피하려면',
                            tips: [
                                '비밀번호 관리자 사용하기',
                                '정기적인 비밀번호 변경',
                                '2단계 인증 설정하기'
                            ]
                        },
                        helpText: attemptResult.helpText,
                        nextSteps: attemptResult.nextSteps
                    },
                    423
                );
            } else {
                // Login failed but account not locked - provide encouraging guidance
                const warningLevel = attemptResult.warningLevel;
                const urgencyMessage = warningLevel === 'critical' 
                    ? '⚠️ 다음 시도에서 실패하면 계정이 잠금됩니다'
                    : warningLevel === 'high'
                    ? '⚡ 몇 번 더 실패하면 계정이 잠금됩니다'
                    : '💡 로그인 정보를 다시 확인해주세요';
                
                errorResponse = ResponseHelper.error(
                    i18n.t('auth.loginFailed'),
                    'LOGIN_FAILED',
                    {
                        attemptInfo: {
                            remaining: attemptResult.attemptsRemaining,
                            total: 5,
                            warningLevel: warningLevel,
                            urgencyMessage: urgencyMessage
                        },
                        troubleshooting: {
                            title: '로그인 문제 해결하기',
                            commonIssues: [
                                {
                                    issue: 'Caps Lock 켜짐',
                                    solution: 'Caps Lock 키를 확인하고 끄세요',
                                    icon: '🔒'
                                },
                                {
                                    issue: '비밀번호 오타',
                                    solution: '비밀번호를 천천히 다시 입력해보세요',
                                    icon: '✏️'
                                },
                                {
                                    issue: '다른 기기 사용',
                                    solution: '평소 사용하던 기기에서 시도해보세요',
                                    icon: '📱'
                                }
                            ]
                        },
                        helpfulActions: [
                            {
                                title: '비밀번호 재설정',
                                description: '비밀번호를 잊으셨나요?',
                                action: 'reset_password',
                                priority: 'high'
                            },
                            {
                                title: '고객지원 문의',
                                description: '도움이 필요하시면 언제든 연락하세요',
                                action: 'contact_support',
                                priority: 'medium'
                            }
                        ],
                        nextSteps: attemptResult.nextSteps
                    },
                    401
                );
            }
            
            return res.status(errorResponse.statusCode).json(errorResponse.body);
        }
        
    } catch (error) {
        // Handle unexpected errors
        const response = ResponseHelper.serverError(
            '로그인 처리 중 일시적인 오류가 발생했습니다'
        );
        
        response.body.error.details.recovery = {
            immediate: [
                '페이지를 새로고침하고 다시 시도하세요',
                '잠시 후 다시 시도하세요'
            ],
            alternative: [
                '다른 브라우저를 사용해보세요',
                '모바일 앱을 사용해보세요'
            ],
            support: '문제가 계속되면 고객지원팀(1588-0000)으로 연락하세요'
        };
        
        return res.status(response.statusCode).json(response.body);
    }
}

/**
 * Helper function to format duration
 */
function formatDuration(duration) {
    const minutes = Math.ceil(duration / (60 * 1000));
    
    if (minutes < 60) {
        return `${minutes}분`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
}

/**
 * Example 3: Enhanced Error Handling with Context-Aware Solutions
 */
function handleValidationErrorExample(errors, userData) {
    const enhancedErrors = errors.map(error => {
        const baseError = { ...error };
        
        // Add context-aware solutions
        switch (error.field) {
            case 'email':
                baseError.contextualHelp = {
                    examples: ['john.doe@example.com', 'user123@gmail.com'],
                    commonMistakes: [
                        '@ 기호 빠뜨림',
                        '도메인 부분 누락',
                        '공백 포함'
                    ],
                    quickFix: userData.email ? 
                        `입력하신 "${userData.email}"를 확인해보세요` : 
                        null
                };
                break;
                
            case 'password':
                baseError.contextualHelp = {
                    strength: calculatePasswordContextualStrength(userData.password),
                    improvements: generatePasswordImprovements(userData.password),
                    generator: {
                        suggestion: generatePasswordSuggestion(),
                        tips: [
                            '좋아하는 문장의 첫 글자 사용하기',
                            '단어와 숫자의 창의적 조합',
                            '개인적 의미가 있는 특수문자 사용'
                        ]
                    }
                };
                break;
                
            case 'username':
                const suggestions = generateUsernameSuggestions(userData.email || 'user');
                baseError.contextualHelp = {
                    suggestions: suggestions,
                    availability: {
                        checking: false, // Would be true if checking in real-time
                        alternatives: suggestions.slice(1) // Alternative suggestions
                    },
                    inspiration: [
                        '취미나 관심사 반영하기',
                        '좋아하는 숫자 조합하기',
                        '밑줄(_)로 단어 연결하기'
                    ]
                };
                break;
        }
        
        return baseError;
    });
    
    return ResponseHelper.validationError(
        '입력 정보를 확인해주세요',
        'VALIDATION_ERROR',
        {
            errors: enhancedErrors,
            overallGuidance: {
                priority: 'high',
                message: '빨간색으로 표시된 필드부터 수정해주세요',
                estimatedTime: '2-3분 소요 예상'
            },
            progressIndicator: {
                completed: enhancedErrors.filter(e => !e.isValid).length,
                total: Object.keys(userData).length,
                nextField: enhancedErrors[0]?.field
            }
        }
    );
}

function calculatePasswordContextualStrength(password) {
    if (!password) return null;
    
    // This would use the enhanced password validation
    const validation = require('./validation_improved').validatePassword(password);
    return validation.strengthFeedback;
}

function generatePasswordImprovements(password) {
    const improvements = [];
    
    if (!password) return improvements;
    
    if (!/[A-Z]/.test(password)) {
        improvements.push({
            issue: '대문자 없음',
            solution: '아무 글자나 대문자로 바꿔보세요',
            example: password.charAt(0).toUpperCase() + password.slice(1)
        });
    }
    
    // Add more contextual improvements...
    return improvements;
}

function generatePasswordSuggestion() {
    const adjectives = ['강한', '빠른', '똑똑한', '신비한', '용감한'];
    const nouns = ['호랑이', '독수리', '바다', '산', '별'];
    const numbers = Math.floor(Math.random() * 100);
    const specials = ['!', '@', '#', '*'];
    
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const special = specials[Math.floor(Math.random() * specials.length)];
    
    return `${adj}${noun}${numbers}${special}`;
}

function generateUsernameSuggestions(email) {
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    const suggestions = [];
    
    suggestions.push(`${base}_${Math.floor(Math.random() * 1000)}`);
    suggestions.push(`${base}_new`);
    suggestions.push(`my_${base}`);
    
    return suggestions.filter(s => s.length >= 3 && s.length <= 20);
}

module.exports = {
    enhancedRegistrationExample,
    enhancedLoginExample,
    handleValidationErrorExample,
    progressTracker,
    lockoutManager
};