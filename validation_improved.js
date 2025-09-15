const { i18n } = require('./i18n');

// Optimized: Pre-compiled regex patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

// Password strength configuration
const PASSWORD_CONFIG = {
    minLength: 8,
    maxLength: 128,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '@$!%*?&',
    commonPasswords: ['password', '123456', '123456789', 'qwerty', 'admin', 'letmein', 'welcome']
};

class ValidationError extends Error {
    constructor(field, message, code = 'VALIDATION_ERROR', helpText = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.code = code;
        this.helpText = helpText;
        this.timestamp = new Date().toISOString();
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            field: this.field,
            code: this.code,
            helpText: this.helpText,
            timestamp: this.timestamp
        };
    }
}

function validateEmail(email) {
    if (!email) {
        return {
            isValid: false,
            error: i18n.t('validation.required'),
            helpText: i18n.t('help.emailFormat'),
            code: 'EMAIL_REQUIRED'
        };
    }

    // Type safety check
    if (typeof email !== 'string') {
        return {
            isValid: false,
            error: i18n.t('validation.emailInvalid'),
            helpText: i18n.t('help.emailFormat'),
            code: 'EMAIL_TYPE_ERROR'
        };
    }

    const emailStr = email.trim().toLowerCase();
    
    // Length check first for efficiency
    if (emailStr.length > 254) {
        return {
            isValid: false,
            error: i18n.t('validation.emailTooLong'),
            helpText: i18n.t('help.emailFormat'),
            code: 'EMAIL_TOO_LONG'
        };
    }
    
    // Format validation
    if (!EMAIL_REGEX.test(emailStr)) {
        return {
            isValid: false,
            error: i18n.t('validation.emailInvalid'),
            helpText: i18n.t('help.emailFormat'),
            code: 'EMAIL_INVALID_FORMAT',
            suggestions: ['user@example.com', 'test@gmail.com']
        };
    }

    return { 
        isValid: true,
        value: emailStr // Return sanitized value
    };
}

function validatePassword(password) {
    const errors = [];
    const suggestions = [];
    
    if (!password) {
        return {
            isValid: false,
            errors: [{
                message: i18n.t('validation.required'),
                code: 'PASSWORD_REQUIRED',
                helpText: i18n.t('help.passwordRequirements')
            }]
        };
    }

    // Type safety check
    if (typeof password !== 'string') {
        return {
            isValid: false,
            errors: [{
                message: i18n.t('validation.passwordTooShort'),
                code: 'PASSWORD_TYPE_ERROR',
                helpText: i18n.t('help.passwordRequirements')
            }]
        };
    }

    const pwd = password;
    
    // Length validation with specific guidance
    if (pwd.length < PASSWORD_CONFIG.minLength) {
        errors.push({
            message: i18n.t('validation.passwordTooShort'),
            code: 'PASSWORD_TOO_SHORT',
            helpText: i18n.t('help.passwordRequirements'),
            currentLength: pwd.length,
            requiredLength: PASSWORD_CONFIG.minLength
        });
        suggestions.push(`현재 ${pwd.length}자입니다. ${PASSWORD_CONFIG.minLength - pwd.length}자 더 추가해주세요.`);
    }

    if (pwd.length > PASSWORD_CONFIG.maxLength) {
        errors.push({
            message: i18n.t('validation.passwordTooLong'),
            code: 'PASSWORD_TOO_LONG',
            helpText: `최대 ${PASSWORD_CONFIG.maxLength}자까지 가능합니다`
        });
    }

    // Character requirement checks with specific guidance
    if (!/[a-z]/.test(pwd)) {
        errors.push({
            message: i18n.t('validation.passwordMissingLowercase'),
            code: 'PASSWORD_NO_LOWERCASE',
            helpText: '소문자 a-z 중 하나 이상 포함해주세요',
            example: 'password123A!'
        });
        suggestions.push('소문자를 추가하세요 (예: a, b, c)');
    }

    if (!/[A-Z]/.test(pwd)) {
        errors.push({
            message: i18n.t('validation.passwordMissingUppercase'),
            code: 'PASSWORD_NO_UPPERCASE',
            helpText: '대문자 A-Z 중 하나 이상 포함해주세요',
            example: 'Password123!'
        });
        suggestions.push('대문자를 추가하세요 (예: A, B, C)');
    }

    if (!/\d/.test(pwd)) {
        errors.push({
            message: i18n.t('validation.passwordMissingNumber'),
            code: 'PASSWORD_NO_NUMBER',
            helpText: '숫자 0-9 중 하나 이상 포함해주세요',
            example: 'Password123!'
        });
        suggestions.push('숫자를 추가하세요 (예: 1, 2, 3)');
    }

    if (!new RegExp(`[${PASSWORD_CONFIG.specialChars}]`).test(pwd)) {
        errors.push({
            message: i18n.t('validation.passwordMissingSpecial'),
            code: 'PASSWORD_NO_SPECIAL',
            helpText: `특수문자 ${PASSWORD_CONFIG.specialChars} 중 하나 이상 포함해주세요`,
            example: 'Password123!',
            allowedSpecialChars: PASSWORD_CONFIG.specialChars.split('')
        });
        suggestions.push(`특수문자를 추가하세요 (사용가능: ${PASSWORD_CONFIG.specialChars})`);
    }

    // Common password check with better logic
    if (PASSWORD_CONFIG.commonPasswords.some(common => pwd.toLowerCase().includes(common))) {
        errors.push({
            message: i18n.t('validation.passwordCommon'),
            code: 'PASSWORD_TOO_COMMON',
            helpText: '더 복잡하고 예측하기 어려운 비밀번호를 만들어주세요',
            suggestions: ['개인적인 단어와 숫자 조합 사용', '문장의 첫 글자들로 만들기', '특별한 기호 조합 사용']
        });
    }

    const strength = calculatePasswordStrength(pwd);
    const strengthFeedback = getPasswordStrengthFeedback(pwd, strength);

    return {
        isValid: errors.length === 0,
        errors,
        suggestions,
        strength,
        strengthFeedback,
        progressScore: Math.min(100, Math.max(0, ((4 - errors.length) / 4) * 100))
    };
}

function calculatePasswordStrength(password) {
    let score = 0;
    const feedback = {
        improvements: [],
        positives: []
    };
    
    // Length scoring
    if (password.length >= 8) {
        score += 1;
        feedback.positives.push('충분한 길이');
    }
    if (password.length >= 12) {
        score += 1;
        feedback.positives.push('권장 길이 이상');
    }
    if (password.length >= 16) {
        score += 1;
        feedback.positives.push('매우 긴 길이');
    }
    
    // Character variety scoring
    if (/[a-z]/.test(password)) {
        score += 1;
        feedback.positives.push('소문자 포함');
    } else {
        feedback.improvements.push('소문자 추가');
    }
    
    if (/[A-Z]/.test(password)) {
        score += 1;
        feedback.positives.push('대문자 포함');
    } else {
        feedback.improvements.push('대문자 추가');
    }
    
    if (/\d/.test(password)) {
        score += 1;
        feedback.positives.push('숫자 포함');
    } else {
        feedback.improvements.push('숫자 추가');
    }
    
    if (/[@$!%*?&]/.test(password)) {
        score += 2;
        feedback.positives.push('특수문자 포함');
    } else {
        feedback.improvements.push('특수문자 추가');
    }
    
    // Uniqueness scoring (prevent negative scores)
    const uniqueChars = new Set(password.split(''));
    const uniqueness = uniqueChars.size / password.length;
    if (uniqueness > 0.7) {
        score += 1;
        feedback.positives.push('다양한 문자 사용');
    } else if (uniqueness < 0.5) {
        feedback.improvements.push('반복 문자 줄이기');
    }

    // Pattern penalties (but don't allow negative scores)
    let penalty = 0;
    if (password.toLowerCase().includes('123')) {
        penalty += 1;
        feedback.improvements.push('연속 숫자 피하기');
    }
    if (password.toLowerCase().includes('abc')) {
        penalty += 1;
        feedback.improvements.push('연속 문자 피하기');
    }
    
    // Apply penalty but ensure score doesn't go below 0
    score = Math.max(0, score - penalty);

    // Determine strength level
    let level;
    if (score <= 2) level = 'weak';
    else if (score <= 4) level = 'medium';
    else if (score <= 6) level = 'strong';
    else level = 'very_strong';

    return {
        level,
        score,
        maxScore: 9,
        percentage: Math.round((score / 9) * 100),
        feedback
    };
}

function getPasswordStrengthFeedback(password, strength) {
    const messages = {
        'weak': {
            message: '약한 비밀번호입니다',
            color: '#ff4444',
            recommendations: [
                '길이를 늘려주세요 (최소 12자 권장)',
                '대소문자, 숫자, 특수문자를 모두 포함해주세요',
                '일반적인 단어나 패턴을 피해주세요'
            ]
        },
        'medium': {
            message: '보통 수준의 비밀번호입니다',
            color: '#ffaa00',
            recommendations: [
                '특수문자를 추가하여 보안을 강화해주세요',
                '길이를 조금 더 늘려보세요',
                '예측하기 어려운 조합을 사용해주세요'
            ]
        },
        'strong': {
            message: '강한 비밀번호입니다',
            color: '#44aa44',
            recommendations: [
                '매우 좋은 비밀번호입니다',
                '정기적으로 변경하는 것을 권장합니다'
            ]
        },
        'very_strong': {
            message: '매우 강한 비밀번호입니다',
            color: '#00aa44',
            recommendations: [
                '훌륭한 비밀번호입니다!',
                '보안이 매우 우수합니다'
            ]
        }
    };

    return messages[strength.level] || messages['weak'];
}

function validateUsername(username) {
    if (!username) {
        return {
            isValid: false,
            error: i18n.t('validation.required'),
            helpText: i18n.t('help.usernameRequirements'),
            code: 'USERNAME_REQUIRED'
        };
    }

    // Type safety check
    if (typeof username !== 'string') {
        return {
            isValid: false,
            error: i18n.t('validation.usernameInvalid'),
            helpText: i18n.t('help.usernameRequirements'),
            code: 'USERNAME_TYPE_ERROR'
        };
    }

    const originalUser = username.trim();
    const user = originalUser.toLowerCase();
    
    // Length validation with specific feedback
    if (originalUser.length < 3) {
        return {
            isValid: false,
            error: i18n.t('validation.usernameTooShort'),
            helpText: `현재 ${originalUser.length}자입니다. ${3 - originalUser.length}자 더 필요합니다.`,
            code: 'USERNAME_TOO_SHORT',
            currentLength: originalUser.length,
            requiredLength: 3
        };
    }

    if (originalUser.length > 20) {
        return {
            isValid: false,
            error: i18n.t('validation.usernameTooLong'),
            helpText: `현재 ${originalUser.length}자입니다. ${originalUser.length - 20}자 줄여주세요.`,
            code: 'USERNAME_TOO_LONG',
            currentLength: originalUser.length,
            maxLength: 20
        };
    }

    // Format validation with original case for accurate checking
    if (!USERNAME_REGEX.test(originalUser)) {
        return {
            isValid: false,
            error: i18n.t('validation.usernameInvalid'),
            helpText: i18n.t('help.usernameRequirements'),
            code: 'USERNAME_INVALID_FORMAT',
            allowedChars: '영문 대소문자, 숫자, 밑줄(_)',
            examples: ['user123', 'my_name', 'john_doe']
        };
    }

    // Forbidden words check with better error message
    const forbiddenWords = ['admin', 'root', 'user', 'guest', 'anonymous', 'test', 'system', 'null', 'undefined'];
    const foundForbidden = forbiddenWords.find(word => user.includes(word));
    
    if (foundForbidden) {
        return {
            isValid: false,
            error: i18n.t('validation.usernameForbidden'),
            helpText: `'${foundForbidden}' 단어를 포함할 수 없습니다. 다른 사용자명을 선택해주세요.`,
            code: 'USERNAME_FORBIDDEN_WORD',
            forbiddenWord: foundForbidden,
            suggestions: generateUsernameSuggestions(originalUser)
        };
    }

    return { 
        isValid: true, 
        value: originalUser,
        suggestions: originalUser.length < 6 ? ['사용자명을 조금 더 길게 만들어보세요'] : []
    };
}

function generateUsernameSuggestions(username) {
    const base = username.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
    const suggestions = [];
    
    if (base.length >= 3) {
        suggestions.push(`${base}_${Math.floor(Math.random() * 1000)}`);
        suggestions.push(`${base}_new`);
        suggestions.push(`my_${base}`);
    } else {
        suggestions.push('my_username');
        suggestions.push('user_' + Math.floor(Math.random() * 10000));
    }
    
    return suggestions.slice(0, 3);
}

function validateAge(age) {
    // Age is optional, so null/undefined is valid
    if (age === null || age === undefined || age === '') {
        return { isValid: true };
    }

    // Convert to number and check for NaN
    const numAge = parseInt(age, 10);
    
    if (isNaN(numAge)) {
        return {
            isValid: false,
            error: i18n.t('validation.ageInvalid'),
            helpText: '숫자로 입력해주세요 (예: 25)',
            code: 'AGE_NOT_NUMBER'
        };
    }
    
    if (numAge < 13) {
        return {
            isValid: false,
            error: i18n.t('validation.ageTooYoung'),
            helpText: '서비스 이용을 위해서는 13세 이상이어야 합니다',
            code: 'AGE_TOO_YOUNG',
            minimumAge: 13
        };
    }

    if (numAge > 120) {
        return {
            isValid: false,
            error: i18n.t('validation.ageTooOld'),
            helpText: '올바른 나이를 입력해주세요 (13-120세)',
            code: 'AGE_TOO_OLD',
            maximumAge: 120
        };
    }

    return { 
        isValid: true, 
        value: numAge 
    };
}

function validateNames(firstName, lastName) {
    const errors = [];
    const values = {};
    
    // First name validation (optional)
    if (firstName !== undefined && firstName !== null && firstName !== '') {
        if (typeof firstName !== 'string') {
            errors.push({
                field: 'firstName',
                message: '이름은 문자로 입력해주세요',
                code: 'FIRSTNAME_TYPE_ERROR'
            });
        } else {
            const trimmedFirst = firstName.trim();
            if (trimmedFirst.length === 0) {
                errors.push({
                    field: 'firstName',
                    message: '이름을 입력해주세요',
                    code: 'FIRSTNAME_EMPTY'
                });
            } else if (trimmedFirst.length > 50) {
                errors.push({
                    field: 'firstName',
                    message: '이름이 너무 깁니다 (최대 50자)',
                    code: 'FIRSTNAME_TOO_LONG',
                    currentLength: trimmedFirst.length,
                    maxLength: 50
                });
            } else {
                values.firstName = trimmedFirst;
            }
        }
    }

    // Last name validation (optional)
    if (lastName !== undefined && lastName !== null && lastName !== '') {
        if (typeof lastName !== 'string') {
            errors.push({
                field: 'lastName',
                message: '성은 문자로 입력해주세요',
                code: 'LASTNAME_TYPE_ERROR'
            });
        } else {
            const trimmedLast = lastName.trim();
            if (trimmedLast.length === 0) {
                errors.push({
                    field: 'lastName',
                    message: '성을 입력해주세요',
                    code: 'LASTNAME_EMPTY'
                });
            } else if (trimmedLast.length > 50) { // Fixed: consistent length limit
                errors.push({
                    field: 'lastName',
                    message: '성이 너무 깁니다 (최대 50자)',
                    code: 'LASTNAME_TOO_LONG',
                    currentLength: trimmedLast.length,
                    maxLength: 50
                });
            } else {
                values.lastName = trimmedLast;
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        values
    };
}

function validateUser(userData, options = {}) {
    const errors = [];
    const validatedData = {};
    const progress = {
        total: 5,
        completed: 0,
        fields: {}
    };
    
    // Input safety check
    if (!userData || typeof userData !== 'object') {
        return {
            isValid: false,
            errors: [{
                message: '사용자 정보가 올바르지 않습니다',
                code: 'INVALID_USER_DATA',
                helpText: '모든 필수 정보를 입력해주세요'
            }],
            progress: { total: 5, completed: 0, percentage: 0 }
        };
    }

    // Email validation
    const emailValidation = validateEmail(userData.email);
    progress.fields.email = emailValidation.isValid ? 'valid' : 'invalid';
    if (emailValidation.isValid) {
        validatedData.email = emailValidation.value;
        progress.completed++;
    } else {
        errors.push({
            field: 'email',
            ...emailValidation
        });
    }

    // Password validation
    const passwordValidation = validatePassword(userData.password);
    progress.fields.password = passwordValidation.isValid ? 'valid' : 'invalid';
    if (passwordValidation.isValid) {
        progress.completed++;
        validatedData.passwordStrength = passwordValidation.strength;
    } else {
        errors.push(...passwordValidation.errors.map(err => ({
            field: 'password',
            ...err
        })));
    }

    // Username validation
    const usernameValidation = validateUsername(userData.username);
    progress.fields.username = usernameValidation.isValid ? 'valid' : 'invalid';
    if (usernameValidation.isValid) {
        validatedData.username = usernameValidation.value;
        progress.completed++;
    } else {
        errors.push({
            field: 'username',
            ...usernameValidation
        });
    }

    // Age validation (optional field)
    const ageValidation = validateAge(userData.age);
    progress.fields.age = ageValidation.isValid ? 'valid' : 'invalid';
    if (ageValidation.isValid) {
        if (ageValidation.value !== undefined) {
            validatedData.age = ageValidation.value;
        }
        progress.completed++;
    } else {
        errors.push({
            field: 'age',
            ...ageValidation
        });
    }

    // Name validation (optional fields)
    const nameValidation = validateNames(userData.firstName, userData.lastName);
    progress.fields.names = nameValidation.isValid ? 'valid' : 'invalid';
    if (nameValidation.isValid) {
        Object.assign(validatedData, nameValidation.values);
        progress.completed++;
    } else {
        errors.push(...nameValidation.errors);
    }

    // Calculate overall progress
    progress.percentage = Math.round((progress.completed / progress.total) * 100);

    return {
        isValid: errors.length === 0,
        errors,
        validatedData,
        progress,
        suggestions: generateValidationSuggestions(errors),
        passwordStrength: passwordValidation.strength
    };
}

function generateValidationSuggestions(errors) {
    if (errors.length === 0) {
        return ['모든 항목이 올바르게 입력되었습니다!'];
    }
    
    const suggestions = [];
    const errorFields = [...new Set(errors.map(e => e.field))];
    
    if (errorFields.includes('email')) {
        suggestions.push('이메일 주소를 다시 확인해주세요');
    }
    if (errorFields.includes('password')) {
        suggestions.push('비밀번호 요구사항을 확인해주세요');
    }
    if (errorFields.includes('username')) {
        suggestions.push('사용자명 규칙을 확인해주세요');
    }
    
    suggestions.push('입력란을 하나씩 천천히 확인해보세요');
    suggestions.push('문제가 계속되면 고객지원팀에 문의하세요');
    
    return suggestions;
}

function sanitizeInput(input, type = 'string', options = {}) {
    if (input === null || input === undefined) {
        return options.returnNull ? null : '';
    }

    // Convert to string safely
    let sanitized;
    try {
        sanitized = String(input);
    } catch (e) {
        return options.returnNull ? null : '';
    }

    // Type-specific sanitization
    switch (type) {
        case 'email':
            return sanitized.toLowerCase().trim();
            
        case 'username':
            // Consistent with validation logic
            return sanitized.trim();
            
        case 'name':
            return sanitized
                .trim()
                .replace(/\s+/g, ' ') // Multiple spaces to single space
                .replace(/[<>"'&]/g, ''); // Basic XSS prevention
                
        case 'string':
        default:
            // Comprehensive XSS prevention
            return sanitized
                .trim()
                .replace(/[<>"'&]/g, '') // Remove dangerous characters
                .replace(/\u0000-\u001f/g, ''); // Remove control characters
    }
}

// Utility functions for enhanced UX
function isStrongPassword(password) {
    const validation = validatePassword(password);
    return validation.isValid && 
           (validation.strength.level === 'strong' || validation.strength.level === 'very_strong');
}

function isValidEmailDomain(email) {
    if (!email || typeof email !== 'string') return false;
    
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    
    const domain = parts[1];
    if (!domain || domain.length < 3) return false;
    
    // Check for valid domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
}

// Real-time validation helper for progressive validation
function validateFieldProgressive(field, value, allData = {}) {
    const validations = {
        email: validateEmail,
        password: validatePassword,
        username: validateUsername,
        age: validateAge
    };
    
    const validator = validations[field];
    if (!validator) {
        return { isValid: false, error: 'Unknown field type' };
    }
    
    const result = validator(value);
    
    // Add contextual suggestions based on other fields
    if (field === 'username' && result.isValid && allData.email) {
        const emailPart = allData.email.split('@')[0];
        if (value.toLowerCase() === emailPart.toLowerCase()) {
            result.suggestions = result.suggestions || [];
            result.suggestions.push('이메일과 다른 사용자명을 권장합니다');
        }
    }
    
    return result;
}

// Get validation progress for multi-step forms
function getValidationProgress(userData) {
    const requiredFields = ['email', 'password', 'username'];
    const optionalFields = ['age', 'firstName', 'lastName'];
    
    const progress = {
        required: { completed: 0, total: requiredFields.length },
        optional: { completed: 0, total: optionalFields.length },
        overall: { completed: 0, total: requiredFields.length + optionalFields.length }
    };
    
    requiredFields.forEach(field => {
        const validation = validateFieldProgressive(field, userData[field], userData);
        if (validation.isValid) {
            progress.required.completed++;
            progress.overall.completed++;
        }
    });
    
    optionalFields.forEach(field => {
        if (userData[field]) {
            const validation = validateFieldProgressive(field, userData[field], userData);
            if (validation.isValid) {
                progress.optional.completed++;
                progress.overall.completed++;
            }
        }
    });
    
    // Calculate percentages
    progress.required.percentage = Math.round((progress.required.completed / progress.required.total) * 100);
    progress.optional.percentage = Math.round((progress.optional.completed / progress.optional.total) * 100);
    progress.overall.percentage = Math.round((progress.overall.completed / progress.overall.total) * 100);
    
    return progress;
}

module.exports = {
    validateUser,
    validateEmail,
    validatePassword,
    validateUsername,
    validateAge,
    validateNames,
    sanitizeInput,
    ValidationError,
    isStrongPassword,
    isValidEmailDomain,
    calculatePasswordStrength,
    getPasswordStrengthFeedback,
    generateUsernameSuggestions,
    validateFieldProgressive,
    getValidationProgress,
    generateValidationSuggestions,
    PASSWORD_CONFIG
};