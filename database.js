const fs = require('fs').promises;
const fSync = require('fs');
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
        
        this.initializeDatabase().catch(console.error);
    }

    async initializeDatabase() {
        try {
            try {
                await fs.access(this.dbPath);
            } catch {
                await fs.mkdir(this.dbPath, { recursive: true });
            }
            
            // 개선: 비동기 방식으로 파일 생성
            const schemas = ['users', 'sessions', 'logs'];
            await Promise.all(schemas.map(async schema => {
                const filePath = path.join(this.dbPath, `${schema}.json`);
                try {
                    await fs.access(filePath);
                } catch {
                    await fs.writeFile(filePath, JSON.stringify([], null, 2));
                }
            }));
            
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    async connect(connectionId = 'default') {
        // 개선: 불필요한 지연 제거
        if (this.connections.size >= this.config.maxConnections) {
            throw new Error('Maximum connections reached');
        }

        const connection = {
            id: connectionId,
            createdAt: Date.now(),
            isActive: true,
            queries: 0
        };

        this.connections.set(connectionId, connection);
        this.emit('connected', connectionId);
        return connection;
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
            
            // 개선: 불필요한 지연 제거
        }
        
        this.isProcessing = false;
    }

    async executeQuery(query) {
        const { table, operation, data } = query;
        const filePath = path.join(this.dbPath, `${table}.json`);
        
        // 개선: 파일 존재 체크 및 비동기 읽기
        let tableData;
        try {
            const rawData = await fs.readFile(filePath, 'utf8');
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
                await this.writeTableData(filePath, tableData);
                break;
            case 'UPDATE':
                result = this.updateData(tableData, data);
                await this.writeTableData(filePath, tableData);
                break;
            case 'DELETE':
                result = this.deleteData(tableData, data);
                await this.writeTableData(filePath, tableData);
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
        // 개선: ID 중복 체크 추가
        const id = newRecord.id || Date.now().toString() + Math.random().toString(36);
        
        // ID 중복 체크
        if (tableData.some(record => record.id === id)) {
            throw new Error(`Record with ID ${id} already exists`);
        }
        
        const record = { ...newRecord, id, createdAt: new Date().toISOString() };
        tableData.push(record);
        return record;
    }

    updateData(tableData, updateInfo) {
        const { id, updates } = updateInfo;
        
        // 개선: 효율적인 검색 및 타입 검증
        const recordIndex = tableData.findIndex(record => record.id === id);
        if (recordIndex === -1) {
            throw new Error(`Record with ID ${id} not found`);
        }
        
        // 간단한 타입 검증 추가
        if (typeof updates !== 'object' || updates === null) {
            throw new Error('Updates must be a valid object');
        }
        
        Object.assign(tableData[recordIndex], updates);
        tableData[recordIndex].updatedAt = new Date().toISOString();
        return [tableData[recordIndex]];
    }

    deleteData(tableData, criteria) {
        const { id } = criteria;
        
        // 개선: 효율적인 삭제 로직
        const recordIndex = tableData.findIndex(record => record.id === id);
        if (recordIndex === -1) {
            return [];
        }
        
        const deleted = tableData.splice(recordIndex, 1);
        return deleted;
    }

    async writeTableData(filePath, data) {
        try {
            // 개선: 비동기 방식 쓰기
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            throw new Error(`Failed to write to ${filePath}: ${error.message}`);
        }
    }

    async backup(backupPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(backupPath, `backup-${timestamp}`);
        
        // 개선: 비동기 방식 복사
        await fs.mkdir(backupDir, { recursive: true });
        
        const files = await fs.readdir(this.dbPath);
        await Promise.all(files.map(async file => {
            if (file.endsWith('.json')) {
                const source = path.join(this.dbPath, file);
                const dest = path.join(backupDir, file);
                await fs.copyFile(source, dest);
            }
        }));
        
        return backupDir;
    }

    getConnectionStats() {
        const stats = {
            activeConnections: this.connections.size,
            totalQueries: 0,
            queueLength: this.queryQueue.length,
            isProcessing: this.isProcessing
        };

        // 개선: 효율적인 Map 순회
        for (const conn of this.connections.values()) {
            stats.totalQueries += conn.queries;
        }

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