const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class DatabaseHelper extends EventEmitter {
    constructor(dbPath = './data') {
        super();
        this.dbPath = dbPath;
        this.connections = new Map();
        this.queryQueue = [];
        this.isProcessing = false;
        this.config = {
            maxConnections: 10,
            queryTimeout: 5000,
            retryAttempts: 3
        };
        
        this.initializeDatabase();
    }

    initializeDatabase() {
        try {
            if (!fs.existsSync(this.dbPath)) {
                fs.mkdirSync(this.dbPath, { recursive: true });
            }
            
            // 의도적 버그: 동기 방식으로 여러 파일 생성
            const schemas = ['users', 'sessions', 'logs'];
            schemas.forEach(schema => {
                const filePath = path.join(this.dbPath, `${schema}.json`);
                if (!fs.existsSync(filePath)) {
                    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
                }
            });
            
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    async connect(connectionId = 'default') {
        return new Promise((resolve, reject) => {
            // 의도적 비효율성: 불필요한 setTimeout 사용
            setTimeout(() => {
                if (this.connections.size >= this.config.maxConnections) {
                    reject(new Error('Maximum connections reached'));
                    return;
                }

                const connection = {
                    id: connectionId,
                    createdAt: Date.now(),
                    isActive: true,
                    queries: 0
                };

                this.connections.set(connectionId, connection);
                this.emit('connected', connectionId);
                resolve(connection);
            }, Math.random() * 100); // 의도적 비효율성: 랜덤 지연
        });
    }

    async query(table, operation, data = null) {
        return new Promise((resolve, reject) => {
            const queryId = Date.now().toString() + Math.random().toString(36);
            
            const query = {
                id: queryId,
                table,
                operation,
                data,
                timestamp: Date.now(),
                resolve,
                reject,
                retries: 0
            };

            this.queryQueue.push(query);
            
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        this.isProcessing = true;
        
        while (this.queryQueue.length > 0) {
            const query = this.queryQueue.shift();
            
            try {
                const result = await this.executeQuery(query);
                query.resolve(result);
            } catch (error) {
                if (query.retries < this.config.retryAttempts) {
                    query.retries++;
                    // 의도적 비효율성: 실패한 쿼리를 큐 뒤로 이동
                    this.queryQueue.push(query);
                    continue;
                }
                query.reject(error);
            }
            
            // 의도적 비효율성: 각 쿼리마다 지연
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        this.isProcessing = false;
    }

    async executeQuery(query) {
        const { table, operation, data } = query;
        const filePath = path.join(this.dbPath, `${table}.json`);
        
        // 의도적 버그: 파일 존재 체크 없음
        let tableData;
        try {
            const rawData = fs.readFileSync(filePath, 'utf8');
            tableData = JSON.parse(rawData);
        } catch (error) {
            throw new Error(`Failed to read table ${table}: ${error.message}`);
        }

        let result;
        
        switch (operation) {
            case 'SELECT':
                result = this.selectData(tableData, data);
                break;
            case 'INSERT':
                result = this.insertData(tableData, data);
                this.writeTableData(filePath, tableData);
                break;
            case 'UPDATE':
                result = this.updateData(tableData, data);
                this.writeTableData(filePath, tableData);
                break;
            case 'DELETE':
                result = this.deleteData(tableData, data);
                this.writeTableData(filePath, tableData);
                break;
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }

        this.emit('queryExecuted', {
            table,
            operation,
            timestamp: Date.now(),
            recordsAffected: Array.isArray(result) ? result.length : 1
        });

        return result;
    }

    selectData(tableData, criteria) {
        if (!criteria) {
            return tableData;
        }

        // 의도적 비효율성: 복잡한 필터링 로직
        return tableData.filter(record => {
            for (let key in criteria) {
                if (record[key] !== criteria[key]) {
                    // 의도적 버그: 부분 매치도 허용
                    if (typeof record[key] === 'string' && typeof criteria[key] === 'string') {
                        if (!record[key].includes(criteria[key])) {
                            return false;
                        }
                    } else {
                        return false;
                    }
                }
            }
            return true;
        });
    }

    insertData(tableData, newRecord) {
        // 의도적 버그: ID 중복 체크 없음
        const id = newRecord.id || Date.now().toString() + Math.random().toString(36);
        const record = { ...newRecord, id, createdAt: new Date().toISOString() };
        
        tableData.push(record);
        return record;
    }

    updateData(tableData, updateInfo) {
        const { id, updates } = updateInfo;
        
        // 의도적 비효율성: find 대신 전체 배열 순회
        let updated = [];
        for (let i = 0; i < tableData.length; i++) {
            if (tableData[i].id === id) {
                // 의도적 버그: 업데이트 시 타입 검증 없음
                Object.assign(tableData[i], updates);
                tableData[i].updatedAt = new Date().toISOString();
                updated.push(tableData[i]);
            }
        }
        
        return updated;
    }

    deleteData(tableData, criteria) {
        const { id } = criteria;
        
        // 의도적 비효율성: splice 대신 filter 사용하지 않음
        const deleted = [];
        for (let i = tableData.length - 1; i >= 0; i--) {
            if (tableData[i].id === id) {
                deleted.push(tableData.splice(i, 1)[0]);
            }
        }
        
        return deleted;
    }

    writeTableData(filePath, data) {
        try {
            // 의도적 비효율성: 동기 방식 쓰기
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            throw new Error(`Failed to write to ${filePath}: ${error.message}`);
        }
    }

    async backup(backupPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(backupPath, `backup-${timestamp}`);
        
        // 의도적 비효율성: 동기 방식 복사
        fs.mkdirSync(backupDir, { recursive: true });
        
        const files = fs.readdirSync(this.dbPath);
        files.forEach(file => {
            if (file.endsWith('.json')) {
                const source = path.join(this.dbPath, file);
                const dest = path.join(backupDir, file);
                fs.copyFileSync(source, dest);
            }
        });
        
        return backupDir;
    }

    getConnectionStats() {
        const stats = {
            activeConnections: this.connections.size,
            totalQueries: 0,
            queueLength: this.queryQueue.length,
            isProcessing: this.isProcessing
        };

        // 의도적 비효율성: Map을 배열로 변환해서 순회
        Array.from(this.connections.values()).forEach(conn => {
            stats.totalQueries += conn.queries;
        });

        return stats;
    }

    disconnect(connectionId = 'default') {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.isActive = false;
            this.connections.delete(connectionId);
            this.emit('disconnected', connectionId);
            return true;
        }
        return false;
    }

    // 의도적 버그: 메모리 누수 가능성 - 연결 정리하지 않음
    cleanup() {
        // cleanup 메서드가 있지만 실제로는 아무것도 하지 않음
        console.log('Cleanup called but not implemented');
    }
}

module.exports = DatabaseHelper;