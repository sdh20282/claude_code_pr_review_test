#!/bin/bash

# AI 에이전트 기반 PR 전체 리뷰 워크플로우 빠른 실행 스크립트
# 
# 사용법:
# ./quick_review.sh 1
# ./quick_review.sh 2

set -e

PR_NUMBER=${1}

if [[ -z "$PR_NUMBER" ]]; then
    echo "❌ 사용법: ./quick_review.sh <PR번호>"
    echo "예시: ./quick_review.sh 1"
    exit 1
fi

echo "🚀 AI 에이전트 PR 전체 리뷰 워크플로우 시작"
echo "📋 PR #${PR_NUMBER}"

# 현재 작업 디렉토리 확인
CURRENT_DIR=$(pwd)
echo "📂 작업 디렉토리: ${CURRENT_DIR}"

# PR 정보 확인
echo "🔍 PR 정보 확인 중..."
if ! gh pr view $PR_NUMBER > /dev/null 2>&1; then
    echo "❌ PR #${PR_NUMBER}를 찾을 수 없습니다."
    exit 1
fi

# 변경된 파일들 확인
echo "📄 변경된 파일들 탐지 중..."
CHANGED_FILES=$(gh pr diff $PR_NUMBER --name-only)
if [[ -z "$CHANGED_FILES" ]]; then
    echo "❌ PR #${PR_NUMBER}에 변경된 파일이 없습니다."
    exit 1
fi

echo "✅ 변경된 파일들:"
echo "$CHANGED_FILES" | while read -r file; do
    echo "  - $file"
done

# PR diff 내용 확인
PR_DIFF=$(gh pr diff $PR_NUMBER)
echo "✅ PR 변경사항 확인 완료"

# 임시 리뷰 스크립트 생성
TEMP_REVIEW_SCRIPT="temp_review_${PR_NUMBER}.md"

cat > "$TEMP_REVIEW_SCRIPT" << EOF
# Claude Code를 사용한 AI 에이전트 PR 리뷰

다음 3개의 에이전트를 병렬로 실행해주세요:

## Agent 1: 코드 구조 및 로직 분석
\`\`\`
Task({
  subagent_type: "general-purpose",
  description: "PR 전체 코드 구조 및 로직 분석",
  prompt: "PR #${PR_NUMBER}의 모든 변경사항을 분석해줘. 다음 관점에서 집중적으로 검토해줘:

1. 코드 구조와 아키텍처 변경사항
2. 로직의 정확성 및 버그 탐지
3. 에러 처리 및 예외 상황 대응
4. 코드 가독성 및 유지보수성
5. 파일 간 일관성 및 통합성

변경된 파일들:
${CHANGED_FILES}

먼저 'gh pr diff ${PR_NUMBER}' 명령어로 전체 변경사항을 확인한 후 분석해줘.

분석 결과를 다음 형식으로 정리해줘:
- 발견된 주요 이슈들 (심각도별로)
- 전체 코드 품질 평가
- 파일별 구체적인 수정 제안사항"
})
\`\`\`

## Agent 2: 보안 및 성능 검토
\`\`\`
Task({
  subagent_type: "general-purpose",
  description: "PR 전체 보안 및 성능 검토",
  prompt: "PR #${PR_NUMBER}의 모든 변경사항을 보안 및 성능 관점에서 검토해줘. 다음 관점에서 집중적으로 분석해줘:

1. 보안 취약점 (XSS, 입력 검증, 인증/인가 등)
2. 성능 이슈 및 최적화 포인트
3. 메모리 누수 가능성
4. 브라우저/플랫폼 호환성 이슈
5. 의존성 및 라이브러리 보안

변경된 파일들:
${CHANGED_FILES}

먼저 'gh pr diff ${PR_NUMBER}' 명령어로 전체 변경사항을 확인한 후 분석해줘.

분석 결과를 다음 형식으로 정리해줘:
- 전체 보안 위험도 평가
- 파일별 성능 병목 지점
- 우선순위별 최적화 권장사항"
})
\`\`\`

## Agent 3: UX 및 접근성 평가
\`\`\`
Task({
  subagent_type: "general-purpose",
  description: "PR 전체 UX 및 접근성 평가",
  prompt: "PR #${PR_NUMBER}의 모든 변경사항을 UX 및 접근성 관점에서 평가해줘. 다음 관점에서 집중적으로 검토해줘:

1. 사용자 인터페이스 설계 변경사항
2. 사용자 경험 (UX) 품질 개선/저하
3. 접근성 (WCAG 가이드라인) 준수
4. 모바일 반응형 디자인
5. 사용자 워크플로우 및 인터랙션

변경된 파일들:
${CHANGED_FILES}

먼저 'gh pr diff ${PR_NUMBER}' 명령어로 전체 변경사항을 확인한 후 분석해줘.

분석 결과를 다음 형식으로 정리해줘:
- 전체 UX 변화 평가 (개선/저하 포인트)
- 접근성 준수 현황 및 문제점
- 파일별 구체적인 개선 제안사항"
})
\`\`\`

## 최종 단계: 통합 리뷰 생성 및 코멘트
위 3개 에이전트의 결과를 통합하여 다음 템플릿으로 GitHub 코멘트를 생성해주세요:

\`\`\`bash
gh pr comment ${PR_NUMBER} --body "\$(cat <<'REVIEW_EOF'
## 🤖 AI 워크플로우 기반 종합 PR 리뷰

**3개 전문 에이전트의 병렬 분석 결과를 통합한 PR #${PR_NUMBER} 전체 리뷰입니다.**

### 📋 **변경된 파일들**
${CHANGED_FILES}

---

## 📊 **종합 평가**
- **코드 품질**: [점수]/10
- **보안 위험도**: [위험도]
- **접근성 준수**: [준수도]
- **전체 권장사항**: [권장사항]

---

## 🔴 **긴급 수정 필요 (Critical)**
[Agent 결과에서 Critical 이슈들 정리]

---

## 🟡 **중요 개선사항 (Major)**
[Agent 결과에서 Major 이슈들 정리]

---

## 🟢 **사용자 경험 향상 (Minor)**
[Agent 결과에서 Minor 이슈들 정리]

---

## ✅ **잘 구현된 부분**
[각 Agent에서 발견한 강점들 정리]

---

## 🎯 **우선 수정 권장사항**
[우선순위별 수정사항 나열]

---

**🤖 이 리뷰는 3개의 전문 AI 에이전트가 각각 다른 관점(코드품질, 보안성능, UX접근성)에서 분석한 결과를 통합한 것입니다.**
REVIEW_EOF
)"
\`\`\`
EOF

echo "📝 리뷰 스크립트 생성 완료: ${TEMP_REVIEW_SCRIPT}"
echo ""
echo "🎯 다음 단계:"
echo "1. Claude Code를 실행하세요"
echo "2. ${TEMP_REVIEW_SCRIPT} 파일의 내용을 복사하여 Claude Code에 붙여넣으세요"
echo "3. 에이전트들이 분석을 완료하면 자동으로 GitHub에 코멘트가 달립니다"
echo ""
echo "⚡ 빠른 실행을 위한 명령어:"
echo "cat ${TEMP_REVIEW_SCRIPT} | pbcopy"
echo "(위 명령어를 실행하면 클립보드에 복사됩니다)"
echo ""
echo "🗑️  작업 완료 후 임시 파일 삭제:"
echo "rm ${TEMP_REVIEW_SCRIPT}"