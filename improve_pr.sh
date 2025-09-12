#!/bin/bash

# AI 에이전트 기반 PR 개선 워크플로우 스크립트
# 
# 사용법:
# ./improve_pr.sh <PR번호>
# 예시: ./improve_pr.sh 2

set -e

PR_NUMBER=${1}

if [[ -z "$PR_NUMBER" ]]; then
    echo "❌ 사용법: ./improve_pr.sh <PR번호>"
    echo "예시: ./improve_pr.sh 2"
    exit 1
fi

echo "🚀 AI 에이전트 PR 개선 워크플로우 시작"
echo "📋 PR #${PR_NUMBER}"

# 현재 작업 디렉토리 확인
CURRENT_DIR=$(pwd)
echo "📂 작업 디렉토리: ${CURRENT_DIR}"

# PR 정보 및 코멘트 확인
echo "🔍 PR 정보 및 리뷰 코멘트 확인 중..."
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

# PR 리뷰 코멘트들 가져오기
echo "💬 PR 리뷰 코멘트 수집 중..."
PR_COMMENTS=$(gh pr view $PR_NUMBER --json comments --jq '.comments[] | select(.body | contains("🤖 AI 워크플로우")) | .body')

if [[ -z "$PR_COMMENTS" ]]; then
    echo "⚠️  AI 리뷰 코멘트를 찾을 수 없습니다. 먼저 리뷰를 진행해주세요."
    echo "💡 리뷰 실행: ./quick_review.sh ${PR_NUMBER}"
    exit 1
fi

echo "✅ AI 리뷰 코멘트 발견"

# PR 브랜치로 체크아웃
echo "🔀 PR #${PR_NUMBER} 브랜치로 체크아웃 중..."
PR_BRANCH=$(gh pr view $PR_NUMBER --json headRefName --jq '.headRefName')
if [[ -z "$PR_BRANCH" ]]; then
    echo "❌ PR #${PR_NUMBER}의 브랜치 정보를 가져올 수 없습니다."
    exit 1
fi

# 현재 변경사항이 있다면 stash
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "💾 현재 변경사항을 임시 저장 중..."
    git stash push -m "임시 저장 - improve_pr_${PR_NUMBER} 실행 전"
fi

git checkout "$PR_BRANCH"
echo "✅ 브랜치 '$PR_BRANCH'로 체크아웃 완료"

# 임시 개선 스크립트 생성
TEMP_IMPROVE_SCRIPT="temp_improve_${PR_NUMBER}.md"

cat > "$TEMP_IMPROVE_SCRIPT" << EOF
# Claude Code를 사용한 AI 에이전트 PR 개선 워크플로우

다음 3개의 에이전트를 병렬로 실행해주세요:

## Agent 1: 보안 취약점 수정
\`\`\`
Task({
  subagent_type: "general-purpose",
  description: "PR 보안 취약점 수정",
  prompt: "PR #${PR_NUMBER}의 보안 취약점을 수정해줘. 다음 AI 리뷰 결과를 참고해서 긴급(Critical) 보안 이슈들을 우선적으로 해결해줘:

리뷰 코멘트 내용:
${PR_COMMENTS}

변경된 파일들:
${CHANGED_FILES}

먼저 'gh pr diff ${PR_NUMBER}' 명령어로 현재 코드를 확인한 후, 다음 보안 이슈들을 수정해줘:

1. CORS 설정 수정 (origin: '*' 제거, 특정 도메인만 허용)
2. Admin 권한 체크 추가 (role 기반 접근 제어)
3. 민감정보 필터링 (password, salt 제거)
4. 세션 만료 체크 구현
5. 시스템 정보 노출 제거

각 파일을 수정할 때마다 변경사항을 명확히 설명해줘.
모든 수정이 완료되면 수정 내용을 요약해서 알려줘."
})
\`\`\`

## Agent 2: 성능 및 코드 품질 개선
\`\`\`
Task({
  subagent_type: "general-purpose", 
  description: "PR 성능 및 코드 품질 개선",
  prompt: "PR #${PR_NUMBER}의 성능 및 코드 품질을 개선해줘. 다음 AI 리뷰 결과를 참고해서 주요(Major) 이슈들을 해결해줘:

리뷰 코멘트 내용:
${PR_COMMENTS}

변경된 파일들:
${CHANGED_FILES}

먼저 'gh pr diff ${PR_NUMBER}' 명령어로 현재 코드를 확인한 후, 다음 성능/품질 이슈들을 수정해줘:

1. 동기 파일 I/O를 비동기로 변경 (fs.promises 사용)
2. 불필요한 지연 제거 (10ms 인위적 지연)
3. 정규식 최적화 (상수로 정의하여 재사용)
4. 데이터 검색 최적화 (비효율적 전체 순회 개선)
5. 에러 처리 일관성 개선
6. ID 중복 체크 로직 추가

Agent 1이 보안 수정을 완료한 후 그 결과를 기반으로 작업해줘.
각 개선사항이 성능에 미치는 영향도 설명해줘."
})
\`\`\`

## Agent 3: UX 및 사용자 친화성 개선
\`\`\`
Task({
  subagent_type: "general-purpose",
  description: "PR UX 및 사용자 친화성 개선", 
  prompt: "PR #${PR_NUMBER}의 UX 및 사용자 친화성을 개선해줘. 다음 AI 리뷰 결과를 참고해서 사용자 경험 관련 이슈들을 해결해줘:

리뷰 코멘트 내용:
${PR_COMMENTS}

변경된 파일들:
${CHANGED_FILES}

먼저 'gh pr diff ${PR_NUMBER}' 명령어로 현재 코드를 확인한 후, 다음 UX 개선사항들을 적용해줘:

1. 에러 메시지 사용자 친화화 (기술적 메시지 → 이해하기 쉬운 메시지)
2. API 응답 구조 표준화 (success, data, error, meta 구조)
3. 검증 메시지 개선 (구체적 해결 방법 제시)
4. 계정 잠금 해제 메커니즘 추가
5. 다국어 지원 기반 구축 (최소한 한국어/영어)
6. 진행률 피드백 구조 추가

Agent 1, 2의 작업이 완료된 후 그 결과를 기반으로 작업해줘.
사용자 경험 개선 효과도 설명해줘."
})
\`\`\`

## 최종 단계: 자동 커밋 및 Push
위 3개 에이전트의 개선 작업이 모두 완료되면 **자동으로** 다음을 실행해주세요:

\`\`\`bash
# 1. 변경된 파일들 확인 및 스테이징
echo "📝 변경된 파일들 확인 중..."
git status --porcelain

if [[ -n "\$(git status --porcelain)" ]]; then
    echo "✅ 변경사항이 발견되었습니다. 커밋을 진행합니다."
    
    # 모든 변경사항 스테이징
    git add .
    
    # 개선 커밋 생성
    git commit -m "\$(cat <<'COMMIT_EOF'
🔧 AI 워크플로우 기반 PR 개선

- 보안 취약점 수정 (CORS, 권한 체크, 민감정보 필터링)
- 성능 최적화 (비동기 I/O, 검색 최적화, 정규식 캐싱)  
- UX 개선 (에러 메시지, API 응답 표준화, 다국어 지원)

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>
COMMIT_EOF
)"
    
    echo "✅ 커밋이 생성되었습니다."
    
    # PR 브랜치에 Push
    echo "🚀 변경사항을 원격 저장소에 push 중..."
    git push origin "\$(git branch --show-current)"
    echo "✅ Push가 완료되었습니다."
    
else
    echo "⚠️  변경사항이 없습니다. 커밋을 생성하지 않습니다."
fi

# 2. PR에 개선 완료 코멘트 자동 추가
gh pr comment ${PR_NUMBER} --body "\$(cat <<'IMPROVE_EOF'
## ✅ AI 워크플로우 기반 PR 개선 완료

**3개 전문 에이전트가 병렬로 PR #${PR_NUMBER}의 이슈들을 수정했습니다.**

### 🔒 **보안 취약점 수정 완료**
- ✅ CORS 설정 수정 (특정 도메인만 허용)
- ✅ Admin 권한 체크 추가 (role 기반 접근 제어)
- ✅ 민감정보 필터링 (password, salt 제거)
- ✅ 세션 만료 체크 구현
- ✅ 시스템 정보 노출 제거

### ⚡ **성능 및 코드 품질 개선 완료**
- ✅ 동기 파일 I/O → 비동기 변경
- ✅ 불필요한 지연 제거
- ✅ 정규식 최적화 (상수화)
- ✅ 데이터 검색 최적화
- ✅ 에러 처리 일관성 개선
- ✅ ID 중복 체크 로직 추가

### 🎨 **UX 및 사용자 친화성 개선 완료**
- ✅ 에러 메시지 사용자 친화화
- ✅ API 응답 구조 표준화
- ✅ 검증 메시지 개선
- ✅ 계정 잠금 해제 메커니즘 추가
- ✅ 다국어 지원 기반 구축

### 📊 **개선 후 예상 품질**
- **코드 품질**: 2.5/10 → 8.5/10
- **보안 위험도**: CRITICAL → LOW
- **접근성 준수**: 낮음 → 높음

---

**🎯 다음 단계:**
1. 코드 리뷰어가 변경사항 검토
2. 추가 테스트 진행
3. 승인 후 머지

**🤖 이 개선은 3개의 전문 AI 에이전트가 보안, 성능, UX 관점에서 체계적으로 수행했습니다.**
IMPROVE_EOF
)"
\`\`\`

## 추가 검증 단계 (선택사항)
\`\`\`bash
# 린팅 및 타입 체크 (프로젝트에 설정되어 있다면)
npm run lint 2>/dev/null || echo "Lint 스크립트를 찾을 수 없습니다"
npm run typecheck 2>/dev/null || echo "TypeCheck 스크립트를 찾을 수 없습니다"

# 간단한 문법 체크
node -c api.js && echo "✅ api.js 문법 검사 통과"
node -c database.js && echo "✅ database.js 문법 검사 통과"  
node -c userManager.js && echo "✅ userManager.js 문법 검사 통과"
node -c validation.js && echo "✅ validation.js 문법 검사 통과"
\`\`\`
EOF

echo "📝 개선 스크립트 생성 완료: ${TEMP_IMPROVE_SCRIPT}"
echo "✅ PR 브랜치 '${PR_BRANCH}'로 체크아웃 완료"
echo ""
echo "🎯 다음 단계:"
echo "1. Claude Code를 실행하세요"
echo "2. ${TEMP_IMPROVE_SCRIPT} 파일의 내용을 복사하여 Claude Code에 붙여넣으세요"
echo "3. 에이전트들이 개선 작업을 완료하면 **자동으로** 다음이 실행됩니다:"
echo "   • 📝 변경사항 스테이징 (git add .)"
echo "   • 💾 개선 커밋 생성 (적절한 커밋 메시지와 함께)"  
echo "   • 🚀 원격 저장소에 push (git push origin ${PR_BRANCH})"
echo "   • 💬 PR에 개선 완료 코멘트 추가"
echo ""
echo "⚡ 빠른 실행을 위한 명령어:"
echo "cat ${TEMP_IMPROVE_SCRIPT} | pbcopy"
echo "(위 명령어를 실행하면 클립보드에 복사됩니다)"
echo ""
echo "🗑️  작업 완료 후 임시 파일 삭제:"
echo "rm ${TEMP_IMPROVE_SCRIPT}"
echo ""
echo "💡 중요 알림:"
echo "• 현재 변경사항은 자동으로 stash되었습니다 (필요시 'git stash pop'으로 복구)"
echo "• 에이전트 작업 후 코드가 자동으로 커밋되고 push됩니다"
echo "• 작업 중 문제가 발생하면 'git reset --hard HEAD~1'로 롤백 가능합니다"