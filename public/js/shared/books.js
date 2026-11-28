// 방 책장의 책 12권 = 1~12월 고정 (윗줄 왼쪽부터 1~4월, 가운데 줄 5~8월, 아랫줄 9~12월)
// 올해(한국 시간)의 그 달에 다이어리를 한 번이라도 저장했으면 그 달의 책만 색칠. 같은 달에 여러 번 써도 한 권, 새달은 첫 일기를 쓸 때까지 회갈색
const KST_MS = 9 * 3600_000;
/** 한국 시간 오늘 날짜 'YYYY-MM-DD' */
export const kstToday = (ms = Date.now()) => new Date(ms + KST_MS).toISOString().slice(0, 10);

/** 기록이 있는 달 목록(['2026-11', ...] 또는 [{ month }]) → 색칠할 책 번호(1~12월) */
export function coloredMonths(months, year = Number(kstToday().slice(0, 4))) {
  const set = new Set();
  for (const m of months || []) {
    const ym = typeof m === 'string' ? m : m?.month;
    const [y, mo] = String(ym || '').split('-').map(Number);
    if (y === year && mo >= 1 && mo <= 12) set.add(mo);
  }
  return [...set].sort((a, b) => a - b);
}
