// 한국 시간(KST, UTC+9) 기준 날짜·주차 계산과 테스트용 시계
// - 한 주 = 일요일 0시 ~ 토요일 24시 (KST). 주차는 그 주 일요일 날짜(YYYY-MM-DD)로 부름
// - 신문 발행 = 그 주가 끝난 다음 날(다음 일요일) 오후 6시 KST
const KST_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;

let offset = 0; // 테스트에서만 바꿈 (ALLOW_TEST_CLOCK=1)
export const now = () => Date.now() + offset;
export function setNow(ms) { offset = ms - Date.now(); }
export function resetClock() { offset = 0; }

/** 그 순간의 KST 날짜 (YYYY-MM-DD) */
export const kstDate = (ms = now()) => new Date(ms + KST_MS).toISOString().slice(0, 10);
/** KST 요일 (0=일) */
export const kstDow = (ms = now()) => new Date(ms + KST_MS).getUTCDay();
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** 그 순간이 속한 주의 시작(일요일) 날짜 */
export const weekStartOf = (ms = now()) => addDays(kstDate(ms), -kstDow(ms));
/** 그 주 기사가 실리는 날(다음 일요일) */
export const issueDateOf = (weekStart) => addDays(weekStart, 7);
/** 발행 시각(다음 일요일 18:00 KST)의 UTC 밀리초 */
export const publishAtOf = (weekStart) => Date.parse(`${issueDateOf(weekStart)}T18:00:00+09:00`);
/** 그 주가 끝난 시각(다음 일요일 0시 KST) — 이때부터 기사를 미리 만들어 둘 수 있음 */
export const weekEndOf = (weekStart) => Date.parse(`${issueDateOf(weekStart)}T00:00:00+09:00`);
const DOW = '일월화수목금토';
export const kstLabel = (date) => `${date} (${DOW[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;
