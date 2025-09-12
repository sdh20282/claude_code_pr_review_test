# 🤖 AI 에이전트 기반 PR 리뷰 템플릿

Claude Code의 서브 에이전트를 활용한 전문적이고 체계적인 PR 리뷰 시스템입니다.

## 🚀 빠른 시작

```bash
# 실행 권한 부여
chmod +x quick_review.sh

# PR 전체 리뷰 시작 (파일명 불필요!)
./quick_review.sh 1
./quick_review.sh 2
```

## 🤖 에이전트 구성

- **Agent 1**: 코드 분석가 (PR 전체 구조, 로직, 파일간 일관성)
- **Agent 2**: 보안/성능 전문가 (전체 보안점검, 성능 최적화)  
- **Agent 3**: UX/접근성 전문가 (전체 UX 변화, 접근성 준수)

## 📁 파일 구성

- `pr_review_workflow.md` - 상세 워크플로우 가이드
- `run_pr_review.js` - Node.js 스크립트
- `quick_review.sh` - 빠른 실행 스크립트

## 🔗 다른 레포로 가져가기

```bash
# 파일 복사
cp quick_review.sh /path/to/your/project/
cp pr_review_workflow.md /path/to/your/project/

# 별칭 설정
alias pr_review='/path/to/quick_review.sh'
```

**🎉 이제 어떤 프로젝트에서든 전문적인 AI 에이전트 리뷰를 받을 수 있습니다!**