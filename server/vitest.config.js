import { defineConfig } from 'vitest/config';
import os from 'os';
import path from 'path';

export default defineConfig({
  test: {
    // 테스트가 실제 data/people.json 을 오염시키지 않도록 people 저장소를 OS 임시경로로 격리.
    // (server.test.js 등이 POST /api/people 로 '서유지' 등을 남기던 문제 방지)
    env: {
      PEOPLE_STORE: path.join(os.tmpdir(), 'agentmonitor-vitest-people.json'),
      // MEALPLAN-01: 식단표 이미지 캐시도 임시경로로 격리(실제 data/mealplan.img 오염 방지)
      MEALPLAN_IMAGE: path.join(os.tmpdir(), 'agentmonitor-vitest-mealplan.img'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['server.js', 'shared/**/*.js'],
      thresholds: { lines: 60 }
    }
  }
});
