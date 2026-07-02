import { defineConfig } from 'vitest/config';
import os from 'os';
import path from 'path';

export default defineConfig({
  test: {
    // 테스트가 실제 data/people.json 을 오염시키지 않도록 people 저장소를 OS 임시경로로 격리.
    // (server.test.js 등이 POST /api/people 로 '서유지' 등을 남기던 문제 방지)
    env: {
      PEOPLE_STORE: path.join(os.tmpdir(), 'agentmonitor-vitest-people.json'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['server.js', 'shared/**/*.js'],
      thresholds: { lines: 60 }
    }
  }
});
