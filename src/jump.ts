export {};

let inputBuffer = '';
let inputTimeout: number | undefined;
let jumpTimeout: number | undefined;
let hudElement: HTMLDivElement | null = null;

/**
 * HUD（検索窓）を作成・取得する
 */
function getOrCreateHUD(): HTMLDivElement {
  if (hudElement) return hudElement;

  hudElement = document.createElement('div');
  hudElement.id = 'easy-egov-jump-hud';
  Object.assign(hudElement.style, {
    position: 'fixed',
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '12px 24px',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    color: '#1a1a1a',
    fontSize: '18px',
    fontWeight: '600',
    fontFamily: '"Outfit", "Inter", "Roboto", sans-serif',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    opacity: '0',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'none',
    letterSpacing: '0.05em'
  });

  hudElement.innerHTML = `
    <span style="opacity: 0.5; font-size: 14px; text-transform: uppercase;">Jump to</span>
    <span id="easy-egov-jump-text"></span>
  `;

  document.body.appendChild(hudElement);
  return hudElement;
}

/**
 * HUDの表示を更新する
 */
function updateHUD(text: string) {
  const hud = getOrCreateHUD();
  const textEl = document.getElementById('easy-egov-jump-text');

  if (text.length > 0) {
    const parts = text.trim().split(/\s+/);
    const main = parts[0] || '';
    const sub = parts.slice(1).join('の');
    const display = `第${main}条${sub ? 'の' + sub : ''}`;

    if (textEl) textEl.textContent = display;
    hud.style.opacity = '1';
    hud.style.transform = 'translateX(-50%) translateY(0)';
  } else {
    hud.style.opacity = '0';
    hud.style.transform = 'translateX(-50%) translateY(20px)';
  }
}

function resetInputBuffer() {
  if (inputTimeout) window.clearTimeout(inputTimeout);
  inputTimeout = window.setTimeout(() => {
    inputBuffer = '';
    updateHUD('');
  }, 1000);
}

function toJapaneseNumeral(n: number): string {
  if (n === 0) return '〇';
  const units = ['', '十', '百', '千'];
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  let res = '';
  const s = n.toString();
  for (let i = 0; i < s.length; i++) {
    const char = s[s.length - 1 - i];
    if (!char) continue;
    const d = parseInt(char);
    const pos = i % 4;
    if (d !== 0) {
      const digitJapaneseNumeral = digits[d] || '';
      const unitJapaneseNumeral = units[pos] || '';
      const temp = (d === 1 && pos > 0) ? '' : digitJapaneseNumeral;
      res = temp + unitJapaneseNumeral + res;
    }
    if (i === 3 && s.length > 4) {
      res = '万' + res;
    }
  }
  return res;
}

function toFullWidth(s: string): string {
  return s.replace(/[0-9]/g, m => String.fromCharCode(m.charCodeAt(0) + 0xFEE0));
}

function scrollToArticle(input: string) {
  const trimmedInput = input.trim();
  const parts = trimmedInput.split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return;

  const mainArticleStr = parts[0];
  if (!mainArticleStr) return;
  const mainArticleNum = parseInt(mainArticleStr);
  if (isNaN(mainArticleNum)) return;

  const mainArticleHalf = parts[0]!;
  const mainArticleFull = toFullWidth(mainArticleHalf);
  const mainArticleJapaneseNumeral = toJapaneseNumeral(mainArticleNum);

  const subParts = parts.slice(1);
  const subTextHalf = subParts.length > 0 ? 'の' + subParts.join('の') : '';
  const subTextFull = subParts.length > 0 ? 'の' + subParts.map(s => toFullWidth(s)).join('の') : '';
  const subTextJapaneseNumeral = subParts.length > 0 ? 'の' + subParts.map(s => toJapaneseNumeral(parseInt(s))).join('の') : '';

  const targets = [
    `第${mainArticleHalf}条${subTextHalf}`,
    `第${mainArticleFull}条${subTextFull}`,
    `第${mainArticleJapaneseNumeral}条${subTextJapaneseNumeral}`
  ];

  type MatchCandidate = {
    node: HTMLElement;
    score: number;
    text: string;
  };

  const candidates: MatchCandidate[] = [];

  for (const targetText of targets) {
    // 1. Try to find by class ArticleTitle or ParagraphNum (reliable)
    const classXpath = `//*[(contains(@class, "ArticleTitle") or contains(@class, "ParagraphNum")) and contains(., "${targetText}")]`;
    const classResult = document.evaluate(classXpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

    for (let i = 0; i < classResult.snapshotLength; i++) {
      const node = classResult.snapshotItem(i) as HTMLElement;
      if (node.closest('a')) continue;

      const normalizedText = (node.textContent || '').replace(/[\s,]/g, '');
      const index = normalizedText.indexOf(targetText);
      if (index === -1) continue;

      // Check if it's a prefix
      const nextChar = normalizedText[index + targetText.length];
      if (nextChar && /[0-9０-９の]/.test(nextChar)) continue;

      let score = 0;
      const classAttr = node.getAttribute('class') || '';
      if (classAttr.includes('ArticleTitle')) score += 1000;
      if (classAttr.includes('ParagraphNum')) score += 500;
      if (index === 0) score += 2000;

      candidates.push({ node, score, text: targetText });
    }

    if (candidates.length > 0) break;

    // 2. Fallback to general search
    const generalXpath = `//*[not(self::script) and not(self::style) and contains(., "${targetText}")]`;
    const generalResult = document.evaluate(generalXpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

    for (let i = 0; i < generalResult.snapshotLength; i++) {
        const node = generalResult.snapshotItem(i) as HTMLElement;
        if (node.closest('a')) continue;

        const normalizedText = (node.textContent || '').replace(/[\s,]/g, '');
        const index = normalizedText.indexOf(targetText);
        if (index === -1) continue;

        const nextChar = normalizedText[index + targetText.length];
        if (nextChar && /[0-9０-９の]/.test(nextChar)) continue;

        // Take it if it's the first one, but try to find a child if it's a large container
        let bestChild = node;
        const children = node.querySelectorAll('*');
        for (const child of Array.from(children)) {
            const childText = (child.textContent || '').replace(/[\s,]/g, '');
            const cIndex = childText.indexOf(targetText);
            if (cIndex !== -1) {
                const cNextChar = childText[cIndex + targetText.length];
                if (!(cNextChar && /[0-9０-９の]/.test(cNextChar))) {
                    bestChild = child as HTMLElement;
                }
            }
        }

        candidates.push({ node: bestChild, score: (index === 0 ? 100 : 0), text: targetText });
    }

    if (candidates.length > 0) break;
  }

  if (candidates.length > 0) {
    // Pick the one with the highest score. If scores are equal, the first one (document order) wins.
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]!;
    best.node.scrollIntoView({ behavior: 'auto', block: 'center' });
    applyPremiumHighlight(best.node, best.text);
    if (jumpTimeout) clearTimeout(jumpTimeout);
  } else {
    console.log(`Article targets ${JSON.stringify(targets)} not found. (Input: "${input}")`);
  }
}

/**
 * 指定したテキストのみをハイライトする
 */
function applyPremiumHighlight(node: HTMLElement, searchText: string) {
  const textContent = node.textContent || '';

  // Try to find the exact match in the original text (allowing for spaces)
  const escapedText = searchText.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const regex = new RegExp(escapedText, 'i');
  const match = textContent.match(regex);

  if (!match || match.index === undefined) {
    // Fallback if regex fails: highlight the whole node
    highlightWholeNode(node);
    return;
  }

  const matchStart = match.index;
  const matchEnd = matchStart + match[0].length;

  // Use Range to wrap the text
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
  let currentChar = 0;
  const range = document.createRange();
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  let cn: Node | null;
  while (cn = walker.nextNode()) {
    const tn = cn as Text;
    const len = tn.textContent?.length || 0;

    if (!startNode && currentChar + len > matchStart) {
      startNode = tn;
      startOffset = matchStart - currentChar;
    }
    if (startNode && currentChar + len >= matchEnd) {
      endNode = tn;
      endOffset = matchEnd - currentChar;
      break;
    }
    currentChar += len;
  }

  if (startNode && endNode) {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const span = document.createElement('span');
    Object.assign(span.style, {
      backgroundColor: 'rgba(255, 230, 0, 0.45)', // Premium gold highlight
      boxShadow: '0 0 12px rgba(255, 215, 0, 0.3)',
      borderRadius: '4px',
      padding: '2px 0',
      transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'default'
    });

    try {
      range.surroundContents(span);

      // Animate out
      setTimeout(() => {
        span.style.backgroundColor = 'transparent';
        span.style.boxShadow = 'none';
        setTimeout(() => {
          // Unwrap safely
          if (span.parentNode) {
            const parent = span.parentNode;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
            parent.normalize();
          }
        }, 600);
      }, 2000);
    } catch (e) {
      highlightWholeNode(node);
    }
  } else {
    highlightWholeNode(node);
  }
}

function highlightWholeNode(node: HTMLElement) {
  const originalBg = node.style.backgroundColor;
  const originalTransition = node.style.transition;

  node.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
  node.style.backgroundColor = 'rgba(255, 230, 0, 0.35)';

  setTimeout(() => {
    node.style.backgroundColor = originalBg;
    setTimeout(() => {
      node.style.transition = originalTransition;
    }, 600);
  }, 2000);
}

function triggerAutoJump() {
  if (jumpTimeout) clearTimeout(jumpTimeout);

  if (inputBuffer.endsWith(' ')) {
    return;
  }

  jumpTimeout = window.setTimeout(() => {
    if (inputBuffer.length > 0) {
      scrollToArticle(inputBuffer);
    }
  }, 500);
}

document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'CONTENTEDITABLE'].includes(target.tagName) || target.isContentEditable) {
    return;
  }

  if (/^[0-9 ]$/.test(e.key)) {
    if (e.key === ' ' && inputBuffer.length === 0) {
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
    }

    inputBuffer += e.key;
    updateHUD(inputBuffer);
    resetInputBuffer();
    triggerAutoJump();
  } else if (e.key === 'Backspace') {
    if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        updateHUD(inputBuffer);
        resetInputBuffer();
        triggerAutoJump();
    }
  } else if (e.key === 'Escape') {
    inputBuffer = '';
    updateHUD('');
    if (jumpTimeout) clearTimeout(jumpTimeout);
  }
});


