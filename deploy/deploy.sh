#!/bin/bash
# METAOFFICE 프로덕션 배포 스크립트 (10.10.33.36)
# 실행: bash deploy/deploy.sh
set -e

echo "=== METAOFFICE 배포 시작 ==="

# 최신 코드 반영
git pull origin master

# 앱 컨테이너 재빌드 및 기동
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

echo "=== 컨테이너 상태 ==="
docker compose -f docker-compose.prod.yml ps

echo "=== 배포 완료 ==="
echo "접속: https://metaoffice.fllab.internal/3d/"
