# Vault Security Portal

[한국어](README.md) · [English](README.en.md)

## 목적

HashiCorp Vault 기반 자격증명 요청·승인·발급·폐기 과정을 한 화면에서 운영하고, 정책 기반 셀프서비스를 실습하는 웹 포털입니다.

## 기대 효과

- 사용자 요청과 승인자의 판단, 실행 결과를 연결해 처리 과정을 이해하기 쉽습니다.
- 활성 자격증명과 감사 이력을 확인하며 수명주기 관리를 연습할 수 있습니다.
- Mock 모드로 흐름을 검증한 뒤 실제 Vault 어댑터 연동을 준비할 수 있습니다.

## 주요 기능과 구성

- Next.js 프런트엔드, Node.js/Express BFF, PostgreSQL 메타데이터 저장소
- 요청 → 승인 → 실행 → 활성 자격증명 → 폐기 → 감사 흐름
- 개발자·승인자·관리자·감사자 역할과 Mock 로그인
- Vault 연동 어댑터, 인벤토리, Plugin Factory 및 빌드·배포 지원
- `infra/aws/terraform/`: ECS Fargate, RDS, ALB, ECR, CodeBuild 구성

## 시작하기

Node.js와 `package.json`에 명시된 pnpm 버전을 준비합니다. 로컬 Docker 모드는 Mock Vault를 사용합니다.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
docker compose up --build
```

브라우저에서 `http://localhost:3000`에 접속합니다. `developer@example.com`으로 요청하고 `approver@example.com`으로 승인한 뒤 실행·폐기·감사 화면을 확인하세요. 관리자와 감사자 예제 계정은 `admin@example.com`, `auditor@example.com`입니다.

## 문서

- [로컬 개발](docs/local-development.md)
- [아키텍처](docs/architecture.md)
- [실제 Vault 연동](docs/real-vault-integration.md)
- [AWS 배포](docs/aws-deployment.md)
- [보안 모델](docs/security-model.md)

## 범위와 제약사항

기본 로그인과 Vault 동작은 Mock 모드입니다. 실제 연동에는 TLS, 최소 권한, AppRole 등 인증 설정과 대상 제품의 API·라이선스 검토가 필요합니다. 애플리케이션에 Vault root token을 사용하지 마세요. `pnpm deploy:aws`는 AWS 리소스와 서비스에 영향을 주는 배포 명령이며, 클라우드 비용이 발생합니다.
