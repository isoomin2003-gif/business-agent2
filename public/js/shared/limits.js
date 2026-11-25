// 서버와 화면이 함께 쓰는 이용 규칙 (설명서·안내 문구도 이 값을 그대로 씀)
export const COMPOSE_LIMIT = { max: 5, windowMin: 10 }; // AI 작곡: 한 사람당 10분에 최대 5곡
export const WISH_TTL_DAYS = 7; // 소원 나무: 작성 후 7일 동안 공개
export const TREE_NOTES = 25;   // 나뭇가지에 보이는 쪽지 수 (아직 만료되지 않은 최근 소원)
export const composeLimitText = () => `AI 작곡은 한 사람당 ${COMPOSE_LIMIT.windowMin}분에 최대 ${COMPOSE_LIMIT.max}곡까지 가능해요.`;
