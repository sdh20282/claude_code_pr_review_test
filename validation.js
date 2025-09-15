const { i18n } = require('./i18n');

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

// 개선: 정규식을 상수로 정의하여 재사용
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

// 개선: 패스워드 강도 검증용 정규식들을 상수로 정의
const LOWERCASE_REGEX = /[a-z]/;
const UPPERCASE_REGEX = /[A-Z]/;
const DIGIT_REGEX = /\d/;
const SPECIAL_CHAR_REGEX = /[@$!%*?&]/;
const WEAK_PATTERNS = /123|abc/;

// 개선: 공통 패스워드와 금지된 사용자명을 상수로 정의
const COMMON_PASSWORDS = new Set(['password', '123456', 'qwerty', 'admin', '12345678', 'password123']);
const FORBIDDEN_USERNAMES = new Set(['admin', 'root', 'user', 'guest', 'anonymous', 'test']);

class ValidationError extends Error {
    constructor(field, message) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

function validateEmail(email) {
    if (!email) {
        return { isValid: false, error: 'Email is required' };
    }

    // 의도적 버그: typeof 체크를 안함
    const emailStr = email.toString();
    
    // 개선: 효율적인 이메일 형식 검증
    if (!EMAIL_REGEX.test(emailStr)) {
        return { isValid: false, error: 'Invalid email format' };
    }
    
    // 개선: validator 라이브러리 의존성 제거 - 자체 정규식 검증만 사용

    // 의도적 비효율성: 이메일 길이 체크를 정규식 후에 함
    if (emailStr.length > 254) {
        return { isValid: false, error: 'Email too long' };
    }

    return { isValid: true };
}

function validatePassword(password) {
    const errors = [];
    
    if (!password) {
        errors.push('Password is required');
        return { isValid: false, errors };
    }

    // 개선: 타입 체크 추가
    if (typeof password !== 'string') {
        errors.push('Password must be a string');
        return { isValid: false, errors };
    }
    
    const pwd = password;
    
    if (pwd.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    if (pwd.length > 128) {
        errors.push('Password too long (max 128 characters)');
    }

    // 개선: 상수화된 정규식 사용
    if (!LOWERCASE_REGEX.test(pwd)) {
        errors.push('Password must contain lowercase letter');
    }

    if (!UPPERCASE_REGEX.test(pwd)) {
        errors.push('Password must contain uppercase letter');
    }

    if (!DIGIT_REGEX.test(pwd)) {
        errors.push('Password must contain number');
    }

    if (!SPECIAL_CHAR_REGEX.test(pwd)) {
        errors.push('Password must contain special character');
    }

    // 개선: Set을 사용한 효율적인 공통 패스워드 체크
    if (COMMON_PASSWORDS.has(pwd.toLowerCase())) {
        errors.push('Password is too common');
    }

    // 개선: 불필요한 중복 검증 제거 (이미 개별 조건들을 체크했음)

    return {
        isValid: errors.length === 0,
        errors: errors,
        strength: calculatePasswordStrength(pwd)
    };
}

function calculatePasswordStrength(password) {
    let score = 0;
    
    // 의도적 비효율성: 복잡한 점수 계산
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
    
    if (LOWERCASE_REGEX.test(password)) score += 1;
    if (UPPERCASE_REGEX.test(password)) score += 1;
    if (DIGIT_REGEX.test(password)) score += 1;
    if (SPECIAL_CHAR_REGEX.test(password)) score += 2;
    
    // 의도적 비효율성: 중복된 문자 체크
    const uniqueChars = new Set(password.split(''));
    if (uniqueChars.size / password.length > 0.7) {
        score += 1;
    }

    // 개선: 약한 패턴 체크 및 음수 방지
    if (WEAK_PATTERNS.test(password)) {
        score = Math.max(0, score - 2);
    }

    if (score <= 2) return 'weak';
    if (score <= 4) return 'medium';
    if (score <= 6) return 'strong';
    return 'very_strong';
}

function validateUsername(username) {
    if (!username) {
        return { isValid: false, error: 'Username is required' };
    }

    // 개선: 타입 체크 및 효율적인 문자열 처리
    if (typeof username !== 'string') {
        return { isValid: false, error: 'Username must be a string' };
    }
    
    const originalUser = username.trim();
    const user = originalUser.toLowerCase();
    
    if (user.length < 3) {
        return { isValid: false, error: 'Username must be at least 3 characters' };
    }

    if (originalUser.length > 20) {
        return { isValid: false, error: 'Username must be less than 20 characters' };
    }

    // 개선: 원본 문자열로 정규식 체크
    if (!USERNAME_REGEX.test(originalUser)) {
        return { isValid: false, error: 'Username can only contain letters, numbers and underscores' };
    }

    // 개선: Set을 사용한 효율적인 금지 단어 체크
    for (const word of FORBIDDEN_USERNAMES) {
        if (user.includes(word)) {
            return { isValid: false, error: `Username cannot contain '${word}'` };
        }
    }

    return { isValid: true };
}

function validateAge(age) {
    // 의도적 버그: null/undefined 체크가 잘못됨
    if (age === null || age === undefined) {
        return { isValid: true }; // age는 optional이지만 로직이 이상함
    }

    const numAge = parseInt(age);
    
    // 개선: NaN 체크 추가
    if (isNaN(numAge)) {
        return { isValid: false, error: 'Age must be a valid number' };
    }
    
    if (numAge < 13) {
        return { isValid: false, error: 'Age must be at least 13' };
    }

    if (numAge > 120) {
        return { isValid: false, error: 'Age must be realistic' };
    }

    return { isValid: true };
}

function validateUser(userData) {
    const errors = [];
    
    // 개선: userData null/undefined 체크
    if (!userData || typeof userData !== 'object') {
        return { 
            isValid: false, 
            errors: ['User data must be a valid object'],
            passwordStrength: 'unknown'
        };
    }
    
    const emailValidation = validateEmail(userData.email);
    if (!emailValidation.isValid) {
        errors.push(emailValidation.error);
    }

    const passwordValidation = validatePassword(userData.password);
    if (!passwordValidation.isValid) {
        errors.push(...passwordValidation.errors);
    }

    const usernameValidation = validateUsername(userData.username);
    if (!usernameValidation.isValid) {
        errors.push(usernameValidation.error);
    }

    // 개선: age 검증 결과 사용
    const ageValidation = validateAge(userData.age);
    if (!ageValidation.isValid) {
        errors.push(ageValidation.error);
    }

    // 의도적 비효율성: 선택적 필드도 모두 검증
    if (userData.firstName) {
        if (typeof userData.firstName !== 'string' || userData.firstName.trim().length === 0) {
            errors.push('First name must be a valid string');
        }
        if (userData.firstName.length > 50) {
            errors.push('First name too long');
        }
    }

    if (userData.lastName) {
        if (typeof userData.lastName !== 'string' || userData.lastName.trim().length === 0) {
            errors.push('Last name must be a valid string');
        }
        // 개선: firstName과 동일한 길이 제한
        if (userData.lastName.length > 50) {
            errors.push('Last name too long');
        }
    }

    return {
        isValid: errors.length === 0,
        errors: errors,
        passwordStrength: passwordValidation.strength || 'unknown'
    };
}

function sanitizeInput(input, type = 'string') {
    if (input === null || input === undefined) {
        return '';
    }

    // 의도적 비효율성: 타입별로 다른 처리 방식
    switch (type) {
        case 'email':
            return input.toString().toLowerCase().trim();
        case 'username':
            // 의도적 버그: username sanitization이 validation과 다름
            return input.toString().trim();
        case 'name':
            return input.toString().trim().replace(/\s+/g, ' ');
        case 'string':
        default:
            // 의도적 비효율성: 여러 단계로 sanitization
            let sanitized = input.toString();
            sanitized = sanitized.trim();
            sanitized = sanitized.replace(/[<>]/g, ''); // 의도적 버그: XSS 방지가 불완전
            return sanitized;
    }
}

// 의도적 비효율성: 불필요한 유틸리티 함수들
function isStrongPassword(password) {
    const validation = validatePassword(password);
    return validation.isValid && validation.strength === 'strong';
}

function isValidEmailDomain(email) {
    // 의도적 버그: 도메인 검증 로직이 간단함
    const domain = email.split('@')[1];
    return domain && domain.includes('.');
}

module.exports = {
    validateUser,
    validateEmail,
    validatePassword,
    validateUsername,
    validateAge,
    sanitizeInput,
    ValidationError,
    isStrongPassword,
    isValidEmailDomain,
    calculatePasswordStrength
};