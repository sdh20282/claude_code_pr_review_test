/**
 * Internationalization (i18n) Module
 * Provides multi-language support for user messages
 */

const messages = {
    en: {
        // Authentication messages
        auth: {
            loginRequired: 'Login is required',
            loginSuccess: 'Login successful',
            loginFailed: 'Invalid email or password',
            logoutSuccess: 'Successfully logged out',
            tokenRequired: 'Access token is required',
            tokenInvalid: 'Invalid or expired token',
            accountLocked: 'Account is temporarily locked due to multiple failed attempts',
            accountUnlocked: 'Account has been unlocked',
            unlockEmailSent: 'Unlock instructions sent to your email'
        },

        // Validation messages
        validation: {
            required: 'This field is required',
            emailInvalid: 'Please enter a valid email address',
            emailTooLong: 'Email address is too long',
            passwordTooShort: 'Password must be at least 8 characters',
            passwordTooLong: 'Password is too long',
            passwordMissingLowercase: 'Password must include a lowercase letter',
            passwordMissingUppercase: 'Password must include an uppercase letter',
            passwordMissingNumber: 'Password must include a number',
            passwordMissingSpecial: 'Password must include a special character (@$!%*?&)',
            passwordCommon: 'This password is too common. Please choose a stronger one',
            usernameTooShort: 'Username must be at least 3 characters',
            usernameTooLong: 'Username must be less than 20 characters',
            usernameInvalid: 'Username can only contain letters, numbers, and underscores',
            usernameForbidden: 'Username contains prohibited words',
            ageInvalid: 'Please enter a valid age',
            ageTooYoung: 'You must be at least 13 years old',
            ageTooOld: 'Please enter a realistic age'
        },

        // User management messages
        user: {
            created: 'Account created successfully',
            updated: 'Profile updated successfully',
            deleted: 'Account deleted successfully',
            notFound: 'User not found',
            alreadyExists: 'An account with this email already exists',
            profileRetrieved: 'Profile information retrieved'
        },

        // Error messages
        error: {
            general: 'An unexpected error occurred',
            validation: 'Please check your input',
            server: 'Server error occurred. Please try again later',
            notFound: 'Requested resource not found',
            forbidden: 'You don\'t have permission to access this resource',
            rateLimited: 'Too many requests. Please wait a moment',
            fileUpload: 'File upload failed',
            networkError: 'Network connection error'
        },

        // Success messages
        success: {
            operationComplete: 'Operation completed successfully',
            dataSaved: 'Data saved successfully',
            emailSent: 'Email sent successfully'
        },

        // Help messages
        help: {
            emailFormat: 'Example: user@example.com',
            passwordRequirements: 'Must be 8+ characters with uppercase, lowercase, number, and special character',
            usernameRequirements: '3-20 characters, letters/numbers/underscores only',
            contactSupport: 'Contact support if you need help',
            tryAgainLater: 'Please try again in a few minutes',
            checkEmailSpam: 'Check your spam folder if you don\'t see the email'
        }
    },

    ko: {
        // 인증 메시지
        auth: {
            loginRequired: '로그인이 필요합니다',
            loginSuccess: '로그인되었습니다',
            loginFailed: '이메일 또는 비밀번호가 올바르지 않습니다',
            logoutSuccess: '로그아웃되었습니다',
            tokenRequired: '액세스 토큰이 필요합니다',
            tokenInvalid: '유효하지 않거나 만료된 토큰입니다',
            accountLocked: '로그인 실패가 반복되어 계정이 일시적으로 잠금되었습니다',
            accountUnlocked: '계정 잠금이 해제되었습니다',
            unlockEmailSent: '계정 잠금 해제 안내를 이메일로 발송했습니다'
        },

        // 유효성 검증 메시지
        validation: {
            required: '필수 입력 항목입니다',
            emailInvalid: '올바른 이메일 주소를 입력해주세요',
            emailTooLong: '이메일 주소가 너무 깁니다',
            passwordTooShort: '비밀번호는 최소 8자 이상이어야 합니다',
            passwordTooLong: '비밀번호가 너무 깁니다',
            passwordMissingLowercase: '비밀번호에 소문자가 포함되어야 합니다',
            passwordMissingUppercase: '비밀번호에 대문자가 포함되어야 합니다',
            passwordMissingNumber: '비밀번호에 숫자가 포함되어야 합니다',
            passwordMissingSpecial: '비밀번호에 특수문자(@$!%*?&)가 포함되어야 합니다',
            passwordCommon: '너무 흔한 비밀번호입니다. 더 안전한 비밀번호를 선택해주세요',
            usernameTooShort: '사용자명은 최소 3자 이상이어야 합니다',
            usernameTooLong: '사용자명은 20자 이하여야 합니다',
            usernameInvalid: '사용자명은 영문, 숫자, 밑줄(_)만 사용할 수 있습니다',
            usernameForbidden: '사용자명에 금지된 단어가 포함되어 있습니다',
            ageInvalid: '올바른 나이를 입력해주세요',
            ageTooYoung: '최소 13세 이상이어야 합니다',
            ageTooOld: '현실적인 나이를 입력해주세요'
        },

        // 사용자 관리 메시지
        user: {
            created: '계정이 성공적으로 생성되었습니다',
            updated: '프로필이 업데이트되었습니다',
            deleted: '계정이 삭제되었습니다',
            notFound: '사용자를 찾을 수 없습니다',
            alreadyExists: '이미 존재하는 이메일입니다',
            profileRetrieved: '프로필 정보를 가져왔습니다'
        },

        // 오류 메시지
        error: {
            general: '예상치 못한 오류가 발생했습니다',
            validation: '입력 정보를 확인해주세요',
            server: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요',
            notFound: '요청하신 정보를 찾을 수 없습니다',
            forbidden: '접근 권한이 없습니다',
            rateLimited: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요',
            fileUpload: '파일 업로드에 실패했습니다',
            networkError: '네트워크 연결 오류가 발생했습니다'
        },

        // 성공 메시지
        success: {
            operationComplete: '작업이 성공적으로 완료되었습니다',
            dataSaved: '데이터가 저장되었습니다',
            emailSent: '이메일이 발송되었습니다'
        },

        // 도움말 메시지
        help: {
            emailFormat: '예: user@example.com',
            passwordRequirements: '8자 이상, 대소문자, 숫자, 특수문자 포함',
            usernameRequirements: '3-20자, 영문/숫자/밑줄만 사용',
            contactSupport: '도움이 필요하시면 고객지원팀에 문의하세요',
            tryAgainLater: '잠시 후 다시 시도해주세요',
            checkEmailSpam: '이메일이 보이지 않으면 스팸함을 확인해주세요'
        }
    }
};

class I18n {
    constructor(defaultLanguage = 'ko') {
        this.currentLanguage = defaultLanguage;
        this.messages = messages;
    }

    /**
     * Set the current language
     * @param {string} language - Language code (en, ko)
     */
    setLanguage(language) {
        if (this.messages[language]) {
            this.currentLanguage = language;
        } else {
            console.warn(`Language ${language} not supported. Using ${this.currentLanguage}`);
        }
    }

    /**
     * Get a translated message
     * @param {string} key - Message key (e.g., 'auth.loginRequired')
     * @param {Object} params - Parameters for string interpolation
     */
    t(key, params = {}) {
        const keys = key.split('.');
        let message = this.messages[this.currentLanguage];

        // Navigate through nested object
        for (const k of keys) {
            message = message?.[k];
        }

        // Fallback to English if translation not found
        if (!message) {
            message = this.messages.en;
            for (const k of keys) {
                message = message?.[k];
            }
        }

        // Final fallback to key itself
        if (!message) {
            console.warn(`Translation not found for key: ${key}`);
            return key;
        }

        // Simple string interpolation
        return this.interpolate(message, params);
    }

    /**
     * Simple string interpolation
     * @param {string} message - Message template
     * @param {Object} params - Parameters to interpolate
     */
    interpolate(message, params) {
        return message.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }

    /**
     * Get validation error message with help text
     * @param {string} errorType - Type of validation error
     * @param {string} field - Field name
     */
    validationError(errorType, field = null) {
        const message = this.t(`validation.${errorType}`);
        const helpKey = `help.${errorType}Requirements` || `help.${field}Requirements`;
        const help = this.t(helpKey);
        
        return {
            message,
            help: help !== helpKey ? help : this.t('help.contactSupport'),
            field
        };
    }

    /**
     * Detect language from request headers
     * @param {string} acceptLanguageHeader - Accept-Language header value
     */
    detectLanguage(acceptLanguageHeader) {
        if (!acceptLanguageHeader) return this.currentLanguage;

        const languages = acceptLanguageHeader
            .split(',')
            .map(lang => lang.split(';')[0].trim().toLowerCase());

        for (const lang of languages) {
            if (lang.startsWith('ko')) return 'ko';
            if (lang.startsWith('en')) return 'en';
        }

        return this.currentLanguage;
    }

    /**
     * Get current language
     */
    getLanguage() {
        return this.currentLanguage;
    }

    /**
     * Get available languages
     */
    getAvailableLanguages() {
        return Object.keys(this.messages);
    }
}

// Create singleton instance
const i18n = new I18n();

module.exports = { I18n, i18n };