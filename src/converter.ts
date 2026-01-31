const japaneseNumeralToArabicNumeral: { [key: string]: number } = {
  '〇': 0,
  '一': 1,
  '二': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
};

const smallUnits: { [key: string]: number } = {
  '十': 10,
  '百': 100,
  '千': 1_000,
};

const largeUnits: { [key: string]: number } = {
  '万': 10_000,
  '億': 100_000_000,
  '兆': 1_000_000_000_000,
};

const KANJI_NUMS = '〇一二三四五六七八九十百千万億兆';
const KANJI_NUMS_DOT = KANJI_NUMS + '・';

interface ConversionRule {
  pattern: RegExp;
  replace: (...args: any[]) => string;
}

const rules: ConversionRule[] = [
  // Fractions: 三分の二 -> 2/3
  {
    pattern: new RegExp(`([${KANJI_NUMS}]+)分の([${KANJI_NUMS}]+)`, 'g'),
    replace: (_, d, n) => `${fmt(n)}/${fmt(d)}`
  },
  // Units with commas
  ...['円', '年', '月', '日', '人', '割', '週', '期', '親等', '個', '歳', '犯', '回', '以上'].map(unit => ({
    pattern: new RegExp(`([${KANJI_NUMS}]+)${unit}`, 'g'),
    replace: (_: string, n: string) => `${fmt(n)}${unit}`
  })),
  // Percentage
  {
    pattern: new RegExp(`([${KANJI_NUMS_DOT}]+)パーセント`, 'g'),
    replace: (_, n) => `${fmt(n)}%`
  },
  // Special handling for 箇月
  {
    pattern: new RegExp(`([${KANJI_NUMS}]+)箇月`, 'g'),
    replace: (_, n) => `${fmt(n)}か月`
  },
  // Ordinals (no commas for article numbers usually)
  {
    pattern: new RegExp(`第([${KANJI_NUMS}]+)(?![${KANJI_NUMS}])(?!取得者|債務者|者|方|般)`, 'g'),
    replace: (_, n) => `第${convertString(n)}`
  },
  {
    pattern: new RegExp(`前([${KANJI_NUMS}]+)(?![${KANJI_NUMS}])(?!方|般)`, 'g'),
    replace: (_, n) => `前${convertString(n)}`
  },
  {
    pattern: new RegExp(`([条項章節款目\\d])((?:の[${KANJI_NUMS}]+)+)(?![${KANJI_NUMS}])(?!方|般)`, 'g'),
    replace: (_: string, prefix: string, branches: string) => prefix + branches.replace(new RegExp(`の([${KANJI_NUMS}]+)`, 'g'), (__: string, n: string) => `の${convertString(n)}`)
  },
  // Large numbers without specific unit suffix (e.g. 二十万)
  {
    pattern: new RegExp(`[${KANJI_NUMS}]+([万億兆])[${KANJI_NUMS}]*`, 'g'),
    replace: (match) => {
        const val = parseNamedJapaneseNumeral(match);
        return isNaN(val) ? match : val.toLocaleString();
    }
  }
];

function fmt(kanji: string): string {
    const converted = convertString(kanji);
    const num = Number(converted);
    return isNaN(num) ? converted : num.toLocaleString();
}

export function convertJapaneseNumeralToNumber(text: string): string {
    let result = text;
    for (const rule of rules) {
        result = result.replace(rule.pattern, rule.replace);
    }
    // Final cleanup for any missed 箇月
    return result.replace(/箇月/g, 'か月');
}

function convertString(str: string): string {
  const hasUnits = /[十百千万億兆]/.test(str);
  if (!hasUnits) {
    return str.split('').map(c => c === '・' ? '.' : (japaneseNumeralToArabicNumeral[c] ?? c)).join('');
  } else {
    return parseNamedJapaneseNumeral(str).toString();
  }
}

function parseNamedJapaneseNumeral(str: string): number {
  let total = 0;
  let currentBlock = 0;
  let currentDigit = -1;

  for (const char of str) {
    if (japaneseNumeralToArabicNumeral[char] !== undefined) {
        if (currentDigit !== -1) {
             currentBlock += currentDigit;
        }
        currentDigit = japaneseNumeralToArabicNumeral[char];
    } else if (smallUnits[char] !== undefined) {
      const digit = currentDigit === -1 ? 1 : currentDigit;
      currentBlock += digit * smallUnits[char];
      currentDigit = -1;
    } else if (largeUnits[char] !== undefined) {
        let segment = currentBlock;
        if (currentDigit !== -1) {
            segment += currentDigit;
            currentDigit = -1;
        }
        if (segment === 0) segment = 1;

        total += segment * largeUnits[char];
        currentBlock = 0;
    }
  }

  if (currentDigit !== -1) {
      currentBlock += currentDigit;
  }
  total += currentBlock;

  return total;
}
