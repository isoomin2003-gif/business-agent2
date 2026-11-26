// 아바타 꾸미기 선택지 (서버·브라우저 공통). 머리 6 × 맨투맨 6 × 하의 2 = 72가지, 모두 무료
export const HAIRS = ['짧은 가르마', '둥근 숏컷', '곱슬 숏컷', '턱선 단발', '어깨까지 오는 생머리', '낮은 묶음머리'];
export const TOPS = [
  { name: '연보라', base: '#c7b2e6', shade: '#a68fd0', rib: '#b59fdb' },
  { name: '크림', base: '#f4e8cf', shade: '#d9caa8', rib: '#e6d8b8' },
  { name: '살구', base: '#f6bd8c', shade: '#dd9e6c', rib: '#eaae7c' },
  { name: '인디핑크', base: '#c98a8f', shade: '#a96c72', rib: '#b97b80' },
  { name: '하늘색', base: '#a8c6ea', shade: '#84a6d2', rib: '#96b6df' },
  { name: '네이비', base: '#34406c', shade: '#232d52', rib: '#2c375f' },
];
export const BOTTOMS = ['짙은색 긴바지', '차콜색 A라인 치마'];

/** 기본 착장: 짧은 가르마 + 연보라 맨투맨 + 짙은 긴바지 */
export const DEFAULT_AVATAR = Object.freeze({ hair: 0, top: 0, bottom: 0 });

const pick = (v, n) => { const i = Number(v); return Number.isInteger(i) && i >= 0 && i < n ? i : null; };

/** 저장·전송용으로 검사 — 하나라도 잘못되면 null */
export function validAvatar(a) {
  if (!a || typeof a !== 'object') return null;
  const hair = pick(a.hair, HAIRS.length), top = pick(a.top, TOPS.length), bottom = pick(a.bottom, BOTTOMS.length);
  return hair === null || top === null || bottom === null ? null : { hair, top, bottom };
}

/** 그릴 때: 저장한 적 없거나 잘못된 값이면 기본 착장 */
export const avatarOf = (a) => validAvatar(a) || { ...DEFAULT_AVATAR };
