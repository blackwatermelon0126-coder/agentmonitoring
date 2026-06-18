// server/shared/roles.js — 역할 정의 단일 진실(SSoT). 서버·클라이언트 공유.
const ROLES = [
  { name: 'developer', label: 'Developer', color: '#4A90D9', emoji: '💻' },
  { name: 'devops',    label: 'DevOps',    color: '#E67E22', emoji: '⚙️' },
  { name: 'qa',        label: 'QA',        color: '#27AE60', emoji: '🔍' },
  { name: 'pm',        label: 'PM',        color: '#8E44AD', emoji: '📋' },
  { name: 'leader',    label: 'Leader',    color: '#E74C3C', emoji: '🎯' },
];

const ROLE_NAMES = ROLES.map(r => r.name);

module.exports = { ROLES, ROLE_NAMES };
