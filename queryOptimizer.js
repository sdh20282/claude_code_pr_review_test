/**
 * 데이터베이스 쿼리 옵티마이저 (난이도 10/10)
 * SQL 쿼리 파싱, AST 생성, 비용 기반 최적화, 실행 계획 생성
 * 인덱스 선택, 조인 순서 최적화, 서브쿼리 평면화 등 복잡한 알고리즘
 */

class QueryOptimizer {
  constructor(schema = {}) {
    this.schema = schema;
    this.statistics = new Map();
    this.indexes = new Map();
    this.costModel = new CostModel();
    this.cache = new Map();
    this.executionPlans = new Map();
    this.histograms = new Map();
    this.correlations = new Map();
  }

  /**
   * SQL 파서 - 재귀 하강 파서로 AST 생성
   */
  parseSQL(sql) {
    const tokens = this.tokenize(sql);
    const parser = new Parser(tokens);
    return parser.parse();
  }

  /**
   * 토크나이저
   */
  tokenize(sql) {
    const tokens = [];
    const keywords = new Set([
      'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
      'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'GROUP',
      'BY', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'UNION', 'INTERSECT',
      'EXCEPT', 'AS', 'DISTINCT', 'ALL', 'ANY', 'SOME'
    ]);

    const operators = /^(>=|<=|<>|!=|=|<|>|\+|-|\*|\/|%|\|\||&&)/;
    const whitespace = /^\s+/;
    const identifier = /^[a-zA-Z_][a-zA-Z0-9_]*/;
    const number = /^\d+(\.\d+)?/;
    const string = /^'([^']*)'/;

    let remaining = sql;
    let position = 0;

    while (remaining.length > 0) {
      // 공백 스킵
      const wsMatch = remaining.match(whitespace);
      if (wsMatch) {
        position += wsMatch[0].length;
        remaining = remaining.slice(wsMatch[0].length);
        continue;
      }

      // 문자열 리터럴
      const strMatch = remaining.match(string);
      if (strMatch) {
        tokens.push({
          type: 'STRING',
          value: strMatch[1],
          position
        });
        position += strMatch[0].length;
        remaining = remaining.slice(strMatch[0].length);
        continue;
      }

      // 숫자
      const numMatch = remaining.match(number);
      if (numMatch) {
        tokens.push({
          type: 'NUMBER',
          value: parseFloat(numMatch[0]),
          position
        });
        position += numMatch[0].length;
        remaining = remaining.slice(numMatch[0].length);
        continue;
      }

      // 연산자
      const opMatch = remaining.match(operators);
      if (opMatch) {
        tokens.push({
          type: 'OPERATOR',
          value: opMatch[0],
          position
        });
        position += opMatch[0].length;
        remaining = remaining.slice(opMatch[0].length);
        continue;
      }

      // 식별자 또는 키워드
      const idMatch = remaining.match(identifier);
      if (idMatch) {
        const value = idMatch[0];
        const upperValue = value.toUpperCase();
        tokens.push({
          type: keywords.has(upperValue) ? 'KEYWORD' : 'IDENTIFIER',
          value: keywords.has(upperValue) ? upperValue : value,
          position
        });
        position += value.length;
        remaining = remaining.slice(value.length);
        continue;
      }

      // 특수 문자
      tokens.push({
        type: 'SPECIAL',
        value: remaining[0],
        position
      });
      position++;
      remaining = remaining.slice(1);
    }

    return tokens;
  }

  /**
   * 파서 클래스
   */
  Parser = class {
    constructor(tokens) {
      this.tokens = tokens;
      this.position = 0;
    }

    parse() {
      return this.parseSelectStatement();
    }

    parseSelectStatement() {
      this.expect('SELECT');

      const columns = this.parseSelectList();

      this.expect('FROM');
      const from = this.parseFromClause();

      let where = null;
      if (this.match('WHERE')) {
        where = this.parseWhereClause();
      }

      let groupBy = null;
      if (this.match('GROUP')) {
        this.expect('BY');
        groupBy = this.parseGroupByClause();
      }

      let having = null;
      if (this.match('HAVING')) {
        having = this.parseHavingClause();
      }

      let orderBy = null;
      if (this.match('ORDER')) {
        this.expect('BY');
        orderBy = this.parseOrderByClause();
      }

      let limit = null;
      if (this.match('LIMIT')) {
        limit = this.parseNumber();
      }

      return {
        type: 'SELECT',
        columns,
        from,
        where,
        groupBy,
        having,
        orderBy,
        limit
      };
    }

    parseSelectList() {
      const columns = [];

      do {
        if (this.match('*')) {
          columns.push({ type: 'WILDCARD' });
        } else {
          columns.push(this.parseExpression());
        }
      } while (this.match(','));

      return columns;
    }

    parseFromClause() {
      const tables = [];

      do {
        const table = this.parseTableReference();
        tables.push(table);

        // JOIN 파싱
        while (this.matchAny(['JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER'])) {
          const joinType = this.current().value;
          this.advance();

          if (this.match('JOIN')) {
            // JOIN 키워드 스킵
          }

          const rightTable = this.parseTableReference();

          let condition = null;
          if (this.match('ON')) {
            condition = this.parseExpression();
          }

          tables.push({
            type: 'JOIN',
            joinType,
            left: tables.pop(),
            right: rightTable,
            condition
          });
        }
      } while (this.match(','));

      return tables;
    }

    parseTableReference() {
      const name = this.expectIdentifier();

      let alias = null;
      if (this.match('AS')) {
        alias = this.expectIdentifier();
      } else if (this.current().type === 'IDENTIFIER') {
        alias = this.expectIdentifier();
      }

      return {
        type: 'TABLE',
        name,
        alias
      };
    }

    parseWhereClause() {
      return this.parseExpression();
    }

    parseExpression() {
      return this.parseOrExpression();
    }

    parseOrExpression() {
      let left = this.parseAndExpression();

      while (this.match('OR')) {
        const right = this.parseAndExpression();
        left = {
          type: 'BINARY_OP',
          operator: 'OR',
          left,
          right
        };
      }

      return left;
    }

    parseAndExpression() {
      let left = this.parseComparisonExpression();

      while (this.match('AND')) {
        const right = this.parseComparisonExpression();
        left = {
          type: 'BINARY_OP',
          operator: 'AND',
          left,
          right
        };
      }

      return left;
    }

    parseComparisonExpression() {
      let left = this.parsePrimaryExpression();

      if (this.current().type === 'OPERATOR') {
        const operator = this.current().value;
        this.advance();
        const right = this.parsePrimaryExpression();
        return {
          type: 'BINARY_OP',
          operator,
          left,
          right
        };
      }

      return left;
    }

    parsePrimaryExpression() {
      // 괄호
      if (this.match('(')) {
        const expr = this.parseExpression();
        this.expect(')');
        return expr;
      }

      // 함수 호출
      if (this.current().type === 'IDENTIFIER' &&
          this.peek() && this.peek().value === '(') {
        const funcName = this.expectIdentifier();
        this.expect('(');
        const args = [];

        if (!this.match(')')) {
          do {
            args.push(this.parseExpression());
          } while (this.match(','));
          this.expect(')');
        }

        return {
          type: 'FUNCTION',
          name: funcName,
          arguments: args
        };
      }

      // 컬럼 참조
      if (this.current().type === 'IDENTIFIER') {
        const parts = [this.expectIdentifier()];

        while (this.match('.')) {
          parts.push(this.expectIdentifier());
        }

        return {
          type: 'COLUMN',
          parts
        };
      }

      // 리터럴
      if (this.current().type === 'NUMBER') {
        const value = this.current().value;
        this.advance();
        return {
          type: 'LITERAL',
          dataType: 'NUMBER',
          value
        };
      }

      if (this.current().type === 'STRING') {
        const value = this.current().value;
        this.advance();
        return {
          type: 'LITERAL',
          dataType: 'STRING',
          value
        };
      }

      throw new Error(`Unexpected token: ${this.current().value}`);
    }

    // 헬퍼 메서드들
    current() {
      return this.tokens[this.position];
    }

    peek() {
      return this.tokens[this.position + 1];
    }

    advance() {
      this.position++;
    }

    match(expected) {
      if (this.current() && this.current().value === expected) {
        this.advance();
        return true;
      }
      return false;
    }

    matchAny(expected) {
      if (this.current() && expected.includes(this.current().value)) {
        return true;
      }
      return false;
    }

    expect(expected) {
      if (!this.match(expected)) {
        throw new Error(`Expected ${expected}, got ${this.current()?.value}`);
      }
    }

    expectIdentifier() {
      if (this.current().type !== 'IDENTIFIER') {
        throw new Error(`Expected identifier, got ${this.current()?.value}`);
      }
      const value = this.current().value;
      this.advance();
      return value;
    }

    parseNumber() {
      if (this.current().type !== 'NUMBER') {
        throw new Error(`Expected number, got ${this.current()?.value}`);
      }
      const value = this.current().value;
      this.advance();
      return value;
    }

    parseGroupByClause() {
      const expressions = [];
      do {
        expressions.push(this.parseExpression());
      } while (this.match(','));
      return expressions;
    }

    parseHavingClause() {
      return this.parseExpression();
    }

    parseOrderByClause() {
      const items = [];
      do {
        const expression = this.parseExpression();
        let direction = 'ASC';

        if (this.match('ASC') || this.match('DESC')) {
          direction = this.tokens[this.position - 1].value;
        }

        items.push({ expression, direction });
      } while (this.match(','));

      return items;
    }
  };

  /**
   * 쿼리 최적화 - 핵심 로직
   */
  optimize(ast) {
    // 1. 쿼리 재작성
    ast = this.rewriteQuery(ast);

    // 2. 조인 순서 최적화
    ast = this.optimizeJoinOrder(ast);

    // 3. 서브쿼리 평면화
    ast = this.flattenSubqueries(ast);

    // 4. 술어 푸시다운
    ast = this.pushDownPredicates(ast);

    // 5. 인덱스 선택
    const indexes = this.selectIndexes(ast);

    // 6. 실행 계획 생성
    const plan = this.generateExecutionPlan(ast, indexes);

    // 7. 비용 추정
    const cost = this.estimateCost(plan);

    return {
      ast,
      plan,
      cost,
      indexes
    };
  }

  /**
   * 쿼리 재작성
   */
  rewriteQuery(ast) {
    // 상수 폴딩
    ast = this.foldConstants(ast);

    // 중복 제거
    ast = this.eliminateDuplicates(ast);

    // 술어 단순화
    ast = this.simplifyPredicates(ast);

    return ast;
  }

  /**
   * 상수 폴딩
   */
  foldConstants(node) {
    if (!node) return node;

    if (node.type === 'BINARY_OP') {
      node.left = this.foldConstants(node.left);
      node.right = this.foldConstants(node.right);

      // 양쪽이 모두 리터럴인 경우 계산
      if (node.left.type === 'LITERAL' && node.right.type === 'LITERAL') {
        return this.evaluateBinaryOp(node.operator, node.left, node.right);
      }
    }

    // 재귀적으로 처리
    for (const key in node) {
      if (typeof node[key] === 'object' && node[key] !== null) {
        if (Array.isArray(node[key])) {
          node[key] = node[key].map(item => this.foldConstants(item));
        } else {
          node[key] = this.foldConstants(node[key]);
        }
      }
    }

    return node;
  }

  /**
   * 조인 순서 최적화 - 동적 프로그래밍
   */
  optimizeJoinOrder(ast) {
    if (!ast.from || ast.from.length <= 1) return ast;

    const tables = this.extractTables(ast.from);
    const predicates = this.extractJoinPredicates(ast);

    // 동적 프로그래밍으로 최적 조인 순서 찾기
    const n = tables.length;
    const dp = new Map();

    // 단일 테이블 초기화
    for (let i = 0; i < n; i++) {
      const mask = 1 << i;
      dp.set(mask, {
        cost: this.getTableScanCost(tables[i]),
        plan: tables[i],
        cardinality: this.getTableCardinality(tables[i])
      });
    }

    // 조인 조합 계산
    for (let size = 2; size <= n; size++) {
      this.generateCombinations(n, size).forEach(mask => {
        let bestCost = Infinity;
        let bestPlan = null;
        let bestCardinality = 0;

        // 가능한 분할 시도
        for (let subset = mask; subset > 0; subset = (subset - 1) & mask) {
          const complement = mask ^ subset;
          if (complement === 0 || complement >= subset) continue;

          const left = dp.get(subset);
          const right = dp.get(complement);

          if (!left || !right) continue;

          const joinCost = this.estimateJoinCost(
            left,
            right,
            predicates,
            mask
          );

          const totalCost = left.cost + right.cost + joinCost.cost;

          if (totalCost < bestCost) {
            bestCost = totalCost;
            bestPlan = {
              type: 'JOIN',
              left: left.plan,
              right: right.plan,
              method: joinCost.method,
              predicates: joinCost.predicates
            };
            bestCardinality = joinCost.cardinality;
          }
        }

        if (bestPlan) {
          dp.set(mask, {
            cost: bestCost,
            plan: bestPlan,
            cardinality: bestCardinality
          });
        }
      });
    }

    const fullMask = (1 << n) - 1;
    const result = dp.get(fullMask);

    if (result) {
      ast.from = [result.plan];
    }

    return ast;
  }

  /**
   * 조인 비용 추정
   */
  estimateJoinCost(left, right, predicates, mask) {
    const leftCard = left.cardinality;
    const rightCard = right.cardinality;

    // 적용 가능한 조인 술어 찾기
    const applicablePredicates = predicates.filter(p =>
      this.isPredicateApplicable(p, mask)
    );

    // 선택도 계산
    const selectivity = this.estimateSelectivity(applicablePredicates);

    // 결과 카디널리티
    const cardinality = leftCard * rightCard * selectivity;

    // 조인 방법 선택
    let method = 'NESTED_LOOP';
    let cost = leftCard * rightCard;

    // 해시 조인 고려
    if (applicablePredicates.some(p => p.type === 'EQUALITY')) {
      const hashCost = leftCard + rightCard;
      if (hashCost < cost) {
        method = 'HASH_JOIN';
        cost = hashCost;
      }
    }

    // 머지 조인 고려
    if (this.canUseMergeJoin(applicablePredicates)) {
      const mergeCost = leftCard * Math.log2(leftCard) +
                       rightCard * Math.log2(rightCard);
      if (mergeCost < cost) {
        method = 'MERGE_JOIN';
        cost = mergeCost;
      }
    }

    return {
      cost,
      method,
      cardinality,
      predicates: applicablePredicates
    };
  }

  /**
   * 서브쿼리 평면화
   */
  flattenSubqueries(ast) {
    // EXISTS 서브쿼리를 JOIN으로 변환
    if (ast.where) {
      ast.where = this.flattenExists(ast.where, ast);
    }

    // IN 서브쿼리를 JOIN으로 변환
    if (ast.where) {
      ast.where = this.flattenIn(ast.where, ast);
    }

    // 스칼라 서브쿼리 최적화
    ast = this.optimizeScalarSubqueries(ast);

    return ast;
  }

  /**
   * 술어 푸시다운
   */
  pushDownPredicates(ast) {
    if (!ast.where) return ast;

    const predicates = this.extractPredicates(ast.where);
    const pushed = new Map();

    predicates.forEach(predicate => {
      const tables = this.getPredicateTables(predicate);

      // 단일 테이블 술어는 해당 테이블로 푸시
      if (tables.size === 1) {
        const table = tables.values().next().value;
        if (!pushed.has(table)) {
          pushed.set(table, []);
        }
        pushed.get(table).push(predicate);
      }
    });

    // 푸시된 술어 적용
    ast.from = this.applyPushedPredicates(ast.from, pushed);

    return ast;
  }

  /**
   * 인덱스 선택
   */
  selectIndexes(ast) {
    const selectedIndexes = [];
    const candidateIndexes = this.getCandidateIndexes(ast);

    // 각 테이블별로 최적 인덱스 선택
    const tables = this.extractTables(ast.from);

    tables.forEach(table => {
      const tableIndexes = candidateIndexes.filter(idx =>
        idx.table === table.name
      );

      if (tableIndexes.length === 0) return;

      // 비용 기반 인덱스 선택
      let bestIndex = null;
      let bestCost = this.getTableScanCost(table);

      tableIndexes.forEach(index => {
        const cost = this.estimateIndexCost(index, ast);
        if (cost < bestCost) {
          bestCost = cost;
          bestIndex = index;
        }
      });

      if (bestIndex) {
        selectedIndexes.push(bestIndex);
      }
    });

    return selectedIndexes;
  }

  /**
   * 실행 계획 생성
   */
  generateExecutionPlan(ast, indexes) {
    const plan = {
      type: 'QUERY_PLAN',
      operation: 'SELECT',
      children: []
    };

    // FROM 절 처리
    if (ast.from && ast.from.length > 0) {
      plan.children.push(this.generateFromPlan(ast.from[0], indexes));
    }

    // WHERE 절 처리
    if (ast.where) {
      plan.children.push({
        type: 'FILTER',
        predicate: ast.where,
        children: []
      });
    }

    // GROUP BY 처리
    if (ast.groupBy) {
      plan.children.push({
        type: 'GROUP',
        expressions: ast.groupBy,
        children: []
      });
    }

    // ORDER BY 처리
    if (ast.orderBy) {
      plan.children.push({
        type: 'SORT',
        expressions: ast.orderBy,
        children: []
      });
    }

    // LIMIT 처리
    if (ast.limit) {
      plan.children.push({
        type: 'LIMIT',
        count: ast.limit,
        children: []
      });
    }

    return plan;
  }

  /**
   * FROM 절 실행 계획 생성
   */
  generateFromPlan(from, indexes) {
    if (from.type === 'TABLE') {
      const index = indexes.find(idx => idx.table === from.name);

      if (index) {
        return {
          type: 'INDEX_SCAN',
          table: from.name,
          index: index.name,
          children: []
        };
      }

      return {
        type: 'TABLE_SCAN',
        table: from.name,
        children: []
      };
    }

    if (from.type === 'JOIN') {
      return {
        type: from.method || 'NESTED_LOOP_JOIN',
        condition: from.condition,
        children: [
          this.generateFromPlan(from.left, indexes),
          this.generateFromPlan(from.right, indexes)
        ]
      };
    }

    return from;
  }

  /**
   * 비용 추정
   */
  estimateCost(plan) {
    return this.estimatePlanCost(plan);
  }

  /**
   * 재귀적 비용 계산
   */
  estimatePlanCost(node) {
    if (!node) return 0;

    let cost = 0;

    switch (node.type) {
      case 'TABLE_SCAN':
        cost = this.getTableScanCost({ name: node.table });
        break;

      case 'INDEX_SCAN':
        cost = this.getIndexScanCost(node.index, node.table);
        break;

      case 'NESTED_LOOP_JOIN':
        const leftCost = this.estimatePlanCost(node.children[0]);
        const rightCost = this.estimatePlanCost(node.children[1]);
        const leftCard = this.estimateCardinality(node.children[0]);
        const rightCard = this.estimateCardinality(node.children[1]);
        cost = leftCost + rightCost + (leftCard * rightCard);
        break;

      case 'HASH_JOIN':
        cost = this.estimatePlanCost(node.children[0]) +
               this.estimatePlanCost(node.children[1]) +
               this.estimateCardinality(node.children[0]) +
               this.estimateCardinality(node.children[1]);
        break;

      case 'FILTER':
        cost = this.estimatePlanCost(node.children[0]) +
               this.estimateCardinality(node.children[0]) * 0.1;
        break;

      case 'SORT':
        const card = this.estimateCardinality(node.children[0]);
        cost = this.estimatePlanCost(node.children[0]) +
               card * Math.log2(card);
        break;

      default:
        if (node.children) {
          cost = node.children.reduce((sum, child) =>
            sum + this.estimatePlanCost(child), 0
          );
        }
    }

    return cost;
  }

  // 헬퍼 메서드들
  extractTables(from) {
    if (!from) return [];

    const tables = [];
    const extract = (node) => {
      if (node.type === 'TABLE') {
        tables.push(node);
      } else if (node.type === 'JOIN') {
        extract(node.left);
        extract(node.right);
      }
    };

    from.forEach(extract);
    return tables;
  }

  extractJoinPredicates(ast) {
    // JOIN ON 조건과 WHERE 절에서 조인 술어 추출
    const predicates = [];
    // 구현 생략
    return predicates;
  }

  extractPredicates(where) {
    if (!where) return [];

    const predicates = [];
    const extract = (node) => {
      if (node.type === 'BINARY_OP') {
        if (node.operator === 'AND') {
          extract(node.left);
          extract(node.right);
        } else {
          predicates.push(node);
        }
      } else {
        predicates.push(node);
      }
    };

    extract(where);
    return predicates;
  }

  getTableScanCost(table) {
    // 테이블 통계 기반 비용 계산
    const stats = this.statistics.get(table.name);
    return stats ? stats.rowCount : 1000;
  }

  getTableCardinality(table) {
    const stats = this.statistics.get(table.name);
    return stats ? stats.rowCount : 1000;
  }

  getIndexScanCost(indexName, tableName) {
    const stats = this.statistics.get(tableName);
    const index = this.indexes.get(indexName);

    if (!stats || !index) return 100;

    // B-트리 높이 기반 비용
    const height = Math.ceil(Math.log2(stats.rowCount));
    return height + (stats.rowCount * index.selectivity);
  }

  estimateCardinality(node) {
    // 노드별 카디널리티 추정
    if (!node) return 1;

    switch (node.type) {
      case 'TABLE_SCAN':
      case 'TABLE':
        return this.getTableCardinality({ name: node.table || node.name });

      case 'FILTER':
        const inputCard = this.estimateCardinality(node.children[0]);
        const selectivity = this.estimateSelectivity([node.predicate]);
        return inputCard * selectivity;

      case 'JOIN':
      case 'NESTED_LOOP_JOIN':
      case 'HASH_JOIN':
        const leftCard = this.estimateCardinality(node.children[0]);
        const rightCard = this.estimateCardinality(node.children[1]);
        const joinSelectivity = this.estimateJoinSelectivity(node);
        return leftCard * rightCard * joinSelectivity;

      default:
        if (node.children && node.children.length > 0) {
          return this.estimateCardinality(node.children[0]);
        }
        return 1;
    }
  }

  estimateSelectivity(predicates) {
    if (!predicates || predicates.length === 0) return 1;

    // 독립성 가정하에 선택도 계산
    return predicates.reduce((sel, pred) => {
      const predSel = this.estimatePredicateSelectivity(pred);
      return sel * predSel;
    }, 1);
  }

  estimatePredicateSelectivity(predicate) {
    // 술어 타입별 선택도 추정
    if (predicate.operator === '=') return 0.1;
    if (predicate.operator === '<' || predicate.operator === '>') return 0.3;
    if (predicate.operator === 'LIKE') return 0.25;
    if (predicate.operator === 'IN') return 0.2;
    return 0.5;
  }

  estimateJoinSelectivity(join) {
    // 조인 선택도 추정
    if (join.condition) {
      return this.estimatePredicateSelectivity(join.condition);
    }
    return 0.1; // 기본값
  }

  generateCombinations(n, k) {
    const combinations = [];
    const generate = (start, current, remaining) => {
      if (remaining === 0) {
        combinations.push(current);
        return;
      }

      for (let i = start; i < n; i++) {
        generate(i + 1, current | (1 << i), remaining - 1);
      }
    };

    generate(0, 0, k);
    return combinations;
  }

  isPredicateApplicable(predicate, mask) {
    // 술어가 현재 테이블 집합에 적용 가능한지 확인
    // 구현 생략
    return true;
  }

  canUseMergeJoin(predicates) {
    // 머지 조인 사용 가능 여부 확인
    return predicates.some(p =>
      p.type === 'EQUALITY' && this.hasIndex(p.left) && this.hasIndex(p.right)
    );
  }

  hasIndex(column) {
    // 컬럼에 인덱스가 있는지 확인
    // 구현 생략
    return false;
  }

  getCandidateIndexes(ast) {
    // 사용 가능한 인덱스 목록 반환
    const indexes = [];
    for (const [name, index] of this.indexes) {
      indexes.push({ name, ...index });
    }
    return indexes;
  }

  estimateIndexCost(index, ast) {
    // 인덱스 사용 비용 추정
    const baseTableCost = this.getTableScanCost({ name: index.table });
    const selectivity = index.selectivity || 0.1;
    return baseTableCost * selectivity;
  }

  getPredicateTables(predicate) {
    // 술어가 참조하는 테이블 목록
    const tables = new Set();
    const extract = (node) => {
      if (node.type === 'COLUMN' && node.parts.length > 1) {
        tables.add(node.parts[0]);
      }
      if (node.left) extract(node.left);
      if (node.right) extract(node.right);
    };
    extract(predicate);
    return tables;
  }

  applyPushedPredicates(from, pushed) {
    // 푸시된 술어 적용
    // 구현 생략
    return from;
  }

  flattenExists(where, ast) {
    // EXISTS 서브쿼리 평면화
    // 구현 생략
    return where;
  }

  flattenIn(where, ast) {
    // IN 서브쿼리 평면화
    // 구현 생략
    return where;
  }

  optimizeScalarSubqueries(ast) {
    // 스칼라 서브쿼리 최적화
    // 구현 생략
    return ast;
  }

  evaluateBinaryOp(operator, left, right) {
    // 이진 연산 평가
    const leftVal = left.value;
    const rightVal = right.value;

    switch (operator) {
      case '+': return { type: 'LITERAL', value: leftVal + rightVal };
      case '-': return { type: 'LITERAL', value: leftVal - rightVal };
      case '*': return { type: 'LITERAL', value: leftVal * rightVal };
      case '/': return { type: 'LITERAL', value: leftVal / rightVal };
      default: return { type: 'BINARY_OP', operator, left, right };
    }
  }

  eliminateDuplicates(ast) {
    // 중복 제거
    // 구현 생략
    return ast;
  }

  simplifyPredicates(ast) {
    // 술어 단순화
    // 구현 생략
    return ast;
  }
}

/**
 * 비용 모델 클래스
 */
class CostModel {
  constructor() {
    this.cpuCostPerTuple = 0.01;
    this.ioCostPerPage = 1.0;
    this.hashTableBuildCost = 0.1;
    this.sortCostFactor = 0.05;
  }

  calculateCost(operation, inputSize, parameters = {}) {
    switch (operation) {
      case 'TABLE_SCAN':
        return inputSize * this.ioCostPerPage;

      case 'INDEX_SCAN':
        const height = Math.ceil(Math.log2(inputSize));
        return height * this.ioCostPerPage +
               inputSize * parameters.selectivity * this.cpuCostPerTuple;

      case 'NESTED_LOOP_JOIN':
        return parameters.outerSize * parameters.innerSize * this.cpuCostPerTuple;

      case 'HASH_JOIN':
        return (parameters.outerSize + parameters.innerSize) * this.cpuCostPerTuple +
               parameters.innerSize * this.hashTableBuildCost;

      case 'SORT':
        return inputSize * Math.log2(inputSize) * this.sortCostFactor;

      default:
        return inputSize * this.cpuCostPerTuple;
    }
  }
}

// 사용 예제
function example() {
  const optimizer = new QueryOptimizer({
    users: {
      columns: ['id', 'name', 'email', 'created_at'],
      primaryKey: 'id',
      indexes: ['email_idx', 'created_at_idx']
    },
    posts: {
      columns: ['id', 'user_id', 'title', 'content', 'created_at'],
      primaryKey: 'id',
      foreignKeys: { user_id: 'users.id' },
      indexes: ['user_id_idx', 'created_at_idx']
    }
  });

  // 통계 정보 설정
  optimizer.statistics.set('users', {
    rowCount: 100000,
    avgRowSize: 200,
    cardinality: { id: 100000, email: 100000 }
  });

  optimizer.statistics.set('posts', {
    rowCount: 1000000,
    avgRowSize: 500,
    cardinality: { id: 1000000, user_id: 100000 }
  });

  // 인덱스 정보 설정
  optimizer.indexes.set('users_email_idx', {
    table: 'users',
    columns: ['email'],
    unique: true,
    selectivity: 0.00001
  });

  optimizer.indexes.set('posts_user_id_idx', {
    table: 'posts',
    columns: ['user_id'],
    unique: false,
    selectivity: 0.00001
  });

  // 쿼리 최적화
  const sql = `
    SELECT u.name, p.title, p.created_at
    FROM users u
    JOIN posts p ON u.id = p.user_id
    WHERE u.email = 'test@example.com'
      AND p.created_at > '2024-01-01'
    ORDER BY p.created_at DESC
    LIMIT 10
  `;

  try {
    const ast = optimizer.parseSQL(sql);
    console.log('AST:', JSON.stringify(ast, null, 2));

    const optimized = optimizer.optimize(ast);
    console.log('Execution Plan:', JSON.stringify(optimized.plan, null, 2));
    console.log('Estimated Cost:', optimized.cost);
    console.log('Selected Indexes:', optimized.indexes);
  } catch (error) {
    console.error('Optimization error:', error);
  }
}

module.exports = QueryOptimizer;