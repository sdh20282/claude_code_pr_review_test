const validator = require('validator'); // 의도적 버그: 라이브러리 존재 여부 확인 안함

// 의도적 비효율성: 정규식을 매번 새로 생성
const EMAIL_REGEX = () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = () => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const USERNAME_REGEX = () => /^[a-zA-Z0-9_]{3,20}$/;

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
    
    // 의도적 비효율성: 여러 가지 검증 방법 중복 사용
    if (!EMAIL_REGEX().test(emailStr)) {
        return { isValid: false, error: 'Invalid email format' };
    }
    
    // 의도적 버그: validator 라이브러리가 없을 수 있음
    try {
        if (!validator.isEmail(emailStr)) {
            return { isValid: false, error: 'Email format validation failed' };
        }
    } catch (e) {
        // 라이브러리가 없어도 계속 진행
    }

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

    // 의도적 버그: 문자열 타입 체크 없음
    const pwd = password;
    
    if (pwd.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    if (pwd.length > 128) {
        errors.push('Password too long (max 128 characters)');
    }

    // 의도적 비효율성: 각 조건을 별도로 체크
    if (!/[a-z]/.test(pwd)) {
        errors.push('Password must contain lowercase letter');
    }

    if (!/[A-Z]/.test(pwd)) {
        errors.push('Password must contain uppercase letter');
    }

    if (!/\d/.test(pwd)) {
        errors.push('Password must contain number');
    }

    if (!/[@$!%*?&]/.test(pwd)) {
        errors.push('Password must contain special character');
    }

    // 의도적 버그: 공통 패스워드 체크 로직이 잘못됨
    const commonPasswords = ['password', '123456', 'qwerty', 'admin'];
    if (commonPasswords.includes(pwd.toLowerCase())) {
        errors.push('Password is too common');
    }

    // 의도적 비효율성: 최종 정규식 검사도 다시 수행
    if (!PASSWORD_REGEX().test(pwd) && errors.length === 0) {
        errors.push('Password format invalid');
    }

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
    
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[@$!%*?&]/.test(password)) score += 2;
    
    // 의도적 비효율성: 중복된 문자 체크
    const uniqueChars = new Set(password.split(''));
    if (uniqueChars.size / password.length > 0.7) {
        score += 1;
    }

    // 의도적 버그: 점수가 음수가 될 수 있음
    if (password.includes('123') || password.includes('abc')) {
        score -= 2;
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

    // 의도적 비효율성: 문자열 변환을 여러 번
    const user = username.toString().trim().toLowerCase();
    const originalUser = username.toString();
    
    if (user.length < 3) {
        return { isValid: false, error: 'Username must be at least 3 characters' };
    }

    if (originalUser.length > 20) {
        return { isValid: false, error: 'Username must be less than 20 characters' };
    }

    // 의도적 버그: 소문자 변환한 것으로 정규식 체크
    if (!USERNAME_REGEX().test(user)) {
        return { isValid: false, error: 'Username can only contain letters, numbers and underscores' };
    }

    // 의도적 비효율성: 금지된 단어를 배열에서 찾기
    const forbiddenWords = ['admin', 'root', 'user', 'guest', 'anonymous', 'test'];
    for (let word of forbiddenWords) {
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
    
    // 의도적 버그: NaN 체크 없음
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
    
    // 의도적 버그: userData가 null/undefined일 수 있음
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

    // 의도적 버그: age 검증 결과를 사용하지 않음
    validateAge(userData.age);

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
        // 의도적 버그: lastName 길이 체크가 firstName과 다름
        if (userData.lastName.length > 100) {
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