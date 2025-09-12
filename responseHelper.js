/**
 * Response Helper - Standardized API Response Structure
 * Provides consistent response format for all API endpoints
 */

class ResponseHelper {
    /**
     * Standard successful response
     * @param {Object} data - Response data
     * @param {string} message - Success message
     * @param {Object} meta - Metadata (pagination, timestamps, etc.)
     * @param {number} statusCode - HTTP status code
     */
    static success(data = null, message = null, meta = {}, statusCode = 200) {
        const response = {
            success: true,
            data,
            message,
            meta: {
                timestamp: new Date().toISOString(),
                ...meta
            },
            error: null
        };

        return {
            statusCode,
            body: response
        };
    }

    /**
     * Standard error response
     * @param {string} message - User-friendly error message
     * @param {string} code - Error code for client handling
     * @param {Object} details - Additional error details
     * @param {number} statusCode - HTTP status code
     */
    static error(message, code = 'GENERAL_ERROR', details = {}, statusCode = 400) {
        const response = {
            success: false,
            data: null,
            message: null,
            meta: {
                timestamp: new Date().toISOString()
            },
            error: {
                message,
                code,
                details
            }
        };

        return {
            statusCode,
            body: response
        };
    }

    /**
     * Validation error response
     * @param {Array} errors - Array of validation errors
     * @param {string} field - Field that failed validation
     */
    static validationError(errors, field = null) {
        return this.error(
            '입력 정보를 확인해주세요', // User-friendly message in Korean
            'VALIDATION_ERROR',
            {
                field,
                errors: Array.isArray(errors) ? errors : [errors],
                helpText: '올바른 형식으로 다시 입력해주세요'
            },
            400
        );
    }

    /**
     * Authentication error response
     */
    static authError(message = '로그인이 필요합니다') {
        return this.error(
            message,
            'AUTH_ERROR',
            {
                helpText: '다시 로그인해주세요'
            },
            401
        );
    }

    /**
     * Authorization error response
     */
    static forbiddenError(message = '접근 권한이 없습니다') {
        return this.error(
            message,
            'FORBIDDEN_ERROR',
            {
                helpText: '관리자에게 문의하세요'
            },
            403
        );
    }

    /**
     * Not found error response
     */
    static notFoundError(resource = '요청한 정보') {
        return this.error(
            `${resource}를 찾을 수 없습니다`,
            'NOT_FOUND_ERROR',
            {
                helpText: '요청 URL을 확인해주세요'
            },
            404
        );
    }

    /**
     * Server error response
     */
    static serverError(message = '일시적인 오류가 발생했습니다') {
        return this.error(
            message,
            'SERVER_ERROR',
            {
                helpText: '잠시 후 다시 시도해주세요'
            },
            500
        );
    }

    /**
     * Rate limit error response
     */
    static rateLimitError() {
        return this.error(
            '너무 많은 요청이 발생했습니다',
            'RATE_LIMIT_ERROR',
            {
                helpText: '잠시 후 다시 시도해주세요',
                retryAfter: 60
            },
            429
        );
    }

    /**
     * Progress response for multi-step operations
     * @param {number} current - Current step
     * @param {number} total - Total steps
     * @param {string} message - Progress message
     * @param {Object} data - Partial data
     */
    static progress(current, total, message, data = null) {
        const percentage = Math.round((current / total) * 100);
        
        return this.success(
            data,
            message,
            {
                progress: {
                    current,
                    total,
                    percentage,
                    isComplete: current >= total
                }
            },
            202 // Accepted
        );
    }

    /**
     * Paginated response
     * @param {Array} data - Array of items
     * @param {number} page - Current page
     * @param {number} limit - Items per page
     * @param {number} total - Total items
     * @param {string} message - Success message
     */
    static paginated(data, page, limit, total, message = null) {
        const totalPages = Math.ceil(total / limit);
        const hasNext = page < totalPages;
        const hasPrev = page > 1;

        return this.success(
            data,
            message,
            {
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext,
                    hasPrev
                }
            }
        );
    }
}

module.exports = ResponseHelper;