// 작은 픽셀 아이콘: 글자 지도(한 글자 = 한 픽셀) → 선명한 SVG. 상단 버튼·설명서 책갈피에 씀
const PAL = {
  '.': null,
  k: '#1a1420', // 테두리
  R: '#d9575f', r: '#a83c48', W: '#f6ecd6', w: '#d9cdb4', // 천막 줄무늬
  P: '#7a5238', p: '#5a3a26', // 기둥·나무
  y: '#ffd36e', g: '#7fc77a', o: '#ff9b6b', b: '#7fb8d8', // 상품
  T: '#1f4a4c', t: '#163638', G: '#d8b25a', g2: '#a8853c', C: '#f6ecd6', c: '#cdbf9f', // 설명서 표지
  H: '#c4687a', h: '#8f4656', D: '#ffe08a', // 집
  S: '#3a3446', s: '#6d6680', L: '#7ee08a', // 라디오
  F: '#3f8a52', f: '#2b6a3c', N: '#6b4429', // 나무
};

const MAPS = {
  // 줄무늬 천막이 있는 가판대
  shop: [
    '................',
    '.kkkkkkkkkkkkkk.',
    'kRRWWRRWWRRWWRRk',
    'kRRWWRRWWRRWWRRk',
    'krrwwrrwwrrwwrrk',
    '.kr.kw.kr.kw.kk.',
    '..P..........P..',
    '..P..........P..',
    '..P.yy.gg.oo.P..',
    '..P.yy.gg.oo.P..',
    '.kkkkkkkkkkkkkk.',
    '.kPPPPPPPPPPPPk.',
    '.kPppppppppppPk.',
    '.kPPPPPPPPPPPPk.',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],
  // 짙은 청록 표지 + 금색 모서리 + 수놓은 창 무늬
  book: [
    '................',
    '..kkkkkkkkkkkk..',
    '.kGGTTTTTTTTGGCk',
    '.kGTTTTTTTTTTGCk',
    '.kTTTTkkkkTTTTCk',
    '.kTTTkDDDDkTTTCk',
    '.kTTTkDkkDkTTTCk',
    '.kTTTkDDDDkTTTCk',
    '.kTTTkkkkkkTTTCk',
    '.kTTTTTTTTTTTTCk',
    '.kTTTTHTTHTTTTCk',
    '.kTTTTTHHTTTTTck',
    '.kGTTTTTTTTTTGck',
    '.kGGTTTTTTTTGGck',
    '..kkkkkkkkkkkkk.',
    '................',
  ],
  house: [
    '................',
    '.......kk.......',
    '......kHHk......',
    '.....kHHHHk.....',
    '....kHHHHHHk....',
    '...kHHHHHHHHk...',
    '..kkkkkkkkkkkk..',
    '...kWWWWWWWWk...',
    '...kWkkWWWWWk...',
    '...kWkDkWkkWk...',
    '...kWkkWWkDWk...',
    '...kWWWWWkPWk...',
    '...kWWWWWkPWk...',
    '...kkkkkkkkkk...',
    '................',
    '................',
  ],
  radio: [
    '................',
    '..........k.....',
    '...........k....',
    '............k...',
    '..kkkkkkkkkkkk..',
    '.kSSSSSSSSSSSSk.',
    '.kSsSsSsSSkkkSk.',
    '.kSSSSSSSSkDkSk.',
    '.kSsSsSsSSkkkSk.',
    '.kSSSSSSSSSSSSk.',
    '.kSsSsSsSSSLSSk.',
    '.kSSSSSSSSSSSSk.',
    '..kkkkkkkkkkkk..',
    '...kk......kk...',
    '................',
    '................',
  ],
  tree: [
    '................',
    '......kkkk......',
    '....kkFFFFkk....',
    '...kFFFFFFFFk...',
    '..kFFgFFFFFFFk..',
    '..kFFFFFFFgFFk..',
    '..kFFFFFFFFFFk..',
    '..kfFFFgFFFFfk..',
    '...kffFFFFffk...',
    '....kkfNNfkk....',
    '......kNNk......',
    '......kNNk......',
    '......kNNk......',
    '....kkkNNkkk....',
    '...kgggggggggk..',
    '................',
  ],
  chat: [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kWWWWWWWWWWWWk.',
    '.kWWWWWWWWWWWWk.',
    '.kWWkkWWkkWWkWk.',
    '.kWWWWWWWWWWWWk.',
    '.kWWWWWWWWWWWWk.',
    '..kkkkWWkkkkkk..',
    '......kWk.......',
    '.......kk.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  star: [
    '................',
    '..............D.',
    '............DD..',
    '..........DD....',
    '........DD......',
    '.......D........',
    '......DDD.......',
    '.....DDWDD......',
    '......DDD.......',
    '.......D........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

/** 픽셀 지도 → SVG 문자열 (crispEdges로 확대해도 또렷) */
export function iconSvg(name, size = 24) {
  const map = MAPS[name];
  const rows = map.length, cols = map[0].length;
  let rects = '';
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = PAL[row[x]];
      if (col) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col}"/>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
