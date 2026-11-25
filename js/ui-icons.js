// Unified PNG UI Icon Registry & Auto-Fallback Component
// Drop custom PNGs into assets/icons/ (ico_gem.png, ico_crown.png, ico_heart.png, ico_umbrella.png, ico_mask.png, ico_chest.png)
// to replace fallback emojis everywhere automatically without code changes.
window.UIIcons = (function () {
  const ICON_MAP = {
    coin:     { src: 'assets/design/item_coin.png?v=20261121hd41',    alt: '골드',   fallback: 'G', prebuilt: true },
    ticket:   { src: 'assets/ui/gacha_ticket.png?v=20261121hd56',     alt: '뽑기권', fallback: 'T', prebuilt: true },
    gem:      { src: 'assets/icons/ico_gem.svg?v=20261121hd88',       alt: '보석',   fallback: '보석', prebuilt: true },
    crown:    { src: 'assets/icons/ico_crown.svg?v=20261121hd88',     alt: '왕관',   fallback: '골드', prebuilt: true },
    heart:    { src: 'assets/icons/ico_heart.png?v=20261121hd89',     alt: '체력',   fallback: 'HP', prebuilt: true },
    umbrella: { src: 'assets/icons/ico_umbrella.png?v=20261121hd65',  alt: '우산',   fallback: '우산', prebuilt: true },
    mask:     { src: 'assets/icons/ico_mask.png?v=20261121hd65',      alt: '마스크', fallback: '마스크', prebuilt: true },
    chest:    { src: 'assets/icons/ico_chest.png?v=20261121hd65',     alt: '상자',   fallback: '상자', prebuilt: true },
    skip:     { src: 'assets/icons/ico_skip.svg?v=20261121hd88',      alt: '건너뛰기', fallback: '>>', prebuilt: true },
    check:    { src: 'assets/icons/ico_check.svg?v=20261121hd88',     alt: '완료',   fallback: 'OK', prebuilt: true },
    m_play:   { src: 'assets/icons/ico_mission_play.svg?v=20261121hd88',  alt: '플레이', fallback: 'P', prebuilt: true },
    m_dist:   { src: 'assets/icons/ico_mission_dist.svg?v=20261121hd88',  alt: '거리',   fallback: 'M', prebuilt: true },
    m_jump:   { src: 'assets/icons/ico_mission_jump.svg?v=20261121hd88',  alt: '점프',   fallback: 'J', prebuilt: true },
    m_dodge:  { src: 'assets/icons/ico_mission_dodge.svg?v=20261121hd88', alt: '회피',   fallback: 'D', prebuilt: true }
  };

  const EMOJI_TO_KEY = {
    '🪙': 'coin',
    '💎': 'gem',
    '👑': 'crown',
    '❤️': 'heart',
    '❤':  'heart',
    '☂️': 'umbrella',
    '☂':  'umbrella',
    '😷': 'mask',
    '📦': 'chest'
  };

  const EMOJI_RE = /🪙|💎|👑|❤️|❤|☂️|☂|😷|📦/g;
  const readyState = {}; // 'ready' | 'loading' | 'missing'

  function probeIcon(key) {
    const def = ICON_MAP[key];
    if (!def) return;
    if (def.prebuilt) {
      readyState[key] = 'ready';
      return;
    }
    if (readyState[key]) return;
    readyState[key] = 'loading';
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        readyState[key] = 'ready';
        hydrate(document, key);
      } else {
        readyState[key] = 'missing';
      }
    };
    img.onerror = () => {
      readyState[key] = 'missing';
    };
    img.src = def.src;
  }

  function init() {
    Object.keys(ICON_MAP).forEach(probeIcon);
  }

  function isReady(key) {
    return readyState[key] === 'ready';
  }

  function html(key, size = 'sm', extraClass = '') {
    const def = ICON_MAP[key];
    if (!def) return '';
    const sz = size || 'sm';
    const extra = extraClass ? ` ${extraClass}` : '';
    if (readyState[key] === 'ready') {
      return `<img src="${def.src}" alt="${def.alt}" class="ui-ico ui-ico-${sz}${extra}" data-ui-icon="${key}" data-ui-size="${sz}" draggable="false" />`;
    }
    return `<span class="ui-ico-slot ui-ico-${sz}${extra}" data-ui-icon="${key}" data-ui-size="${sz}" aria-hidden="true">${def.fallback}</span>`;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split('"')
      .join('&quot;');
  }

  function formatText(text, size = 'sm', extraClass = '') {
    const escaped = escapeHtml(text);
    return escaped.replace(EMOJI_RE, (m) => {
      const k = EMOJI_TO_KEY[m];
      return k ? html(k, size, extraClass) : m;
    });
  }

  function hydrate(root, onlyKey) {
    if (typeof document === 'undefined') return;
    const scope = root || document;
    const selector = onlyKey ? `[data-ui-icon="${onlyKey}"]` : '[data-ui-icon]';
    const nodes = scope.querySelectorAll(selector);
    nodes.forEach((node) => {
      const key = node.getAttribute('data-ui-icon');
      const def = ICON_MAP[key];
      if (!def || readyState[key] !== 'ready') return;
      if (node.tagName === 'IMG') return;
      const sz = node.getAttribute('data-ui-size') || 'sm';
      const img = document.createElement('img');
      img.src = def.src;
      img.alt = def.alt;
      img.draggable = false;
      img.setAttribute('data-ui-icon', key);
      img.setAttribute('data-ui-size', sz);
      const clsList = Array.from(node.classList).filter((c) => c !== 'ui-ico-slot');
      if (!clsList.includes('ui-ico')) clsList.unshift('ui-ico');
      if (!clsList.includes(`ui-ico-${sz}`)) clsList.push(`ui-ico-${sz}`);
      img.className = clsList.join(' ');
      node.replaceWith(img);
    });
  }

  init();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => hydrate(document), { once: true });
    } else {
      hydrate(document);
    }
  }

  return {
    ICON_MAP,
    EMOJI_TO_KEY,
    isReady,
    html,
    formatText,
    hydrate
  };
})();
