// server/shared/roles.js — 역할 정의 단일 진실(SSoT). 서버·클라이언트 공유.
// P1-A: 5역할(developer·devops·qa·pm·leader) 확정. designer·marketer 제거.
// id: 코드 식별자(snake_case), name: 하위호환 별칭(= id), label: UI 표시명, color: 16진 CSS 색상
const ROLES = [
  { id: 'developer', name: 'developer', label: 'Developer', color: '#4A90D9', emoji: '💻' },
  { id: 'devops',    name: 'devops',    label: 'DevOps',    color: '#E67E22', emoji: '⚙️' },
  { id: 'qa',        name: 'qa',        label: 'QA',        color: '#27AE60', emoji: '🔍' },
  { id: 'pm',        name: 'pm',        label: 'PM',        color: '#8E44AD', emoji: '📋' },
  { id: 'leader',    name: 'leader',    label: 'Leader',    color: '#E74C3C', emoji: '🎯' },
];

const ROLE_NAMES = ROLES.map(r => r.id);

export { ROLES, ROLE_NAMES };
