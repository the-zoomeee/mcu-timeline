/* ---------------------------- DATA (loaded from data.json at runtime) ---------------------------- */
// All content — titles, links, cast, runtimes, character threads, trailer IDs — lives in data.json,
// sitting next to this HTML file. Edit that file to add/change content; this script only contains
// behavior. The two most common edits:
//   1. Fill in `"trailer": "VIDEO_ID_OR_URL"` on any item to enable inline trailer playback for it.
//   2. Add/edit entries in `items`, `links`, `cast`, etc. following the existing shape.
let PHASE_HEX = {};
let PHASE_NAME = {};
let ITEMS = [];
let RUNTIME = {};
let WHERE_UPCOMING = {};
let LANG_STANDARD = [];
let LANG_OVERRIDES = {};
let CAST = {};
let SKIPPABLE = new Set();
let CHARACTERS = [];
let CHAR_FOCUS = {};
let LINKS = {};
let RELEASE_ORDER = [];
let CHRONO_ORDER = [];

let byId = {};
let CHAR_BY_ID = {};
// One-way graph: GRAPH_OUT[a][b] means "a leads to / feeds into b".
// GRAPH_IN is the reverse lookup (who leads into this node) — used only for dimming logic, never drawn.
let GRAPH_OUT = {};
let GRAPH_IN = {};

const HOTSTAR_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px"><path d="M12 2 L14.5 9 L22 9 L16 13.5 L18 21 L12 16.5 L6 21 L8 13.5 L2 9 L9.5 9 Z" fill="currentColor"/></svg>';

function whereToWatch(it){
  if(WHERE_UPCOMING[it.id]) return WHERE_UPCOMING[it.id];
  return it.type === 'movie' ? 'Disney+ (was theatrical)' : 'Disney+';
}
function languagesFor(it){
  if(WHERE_UPCOMING[it.id]) return LANG_OVERRIDES[it.id] || ['English'];
  return LANG_OVERRIDES[it.id] || LANG_STANDARD;
}
function trailerSearchUrl(it){
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(it.title + ' official trailer Marvel');
}
function hotstarUrl(it){
  return 'https://www.hotstar.com/in/search?q=' + encodeURIComponent(it.title);
}
function castFor(id){ return CAST[id] || []; }
function charsOf(id){ return CHAR_FOCUS[id] || []; }
function titlesForChar(charId){
  return ITEMS.filter(function(it){ return charsOf(it.id).indexOf(charId) !== -1; });
}
function runtimeLabel(id){
  var r = RUNTIME[id];
  if(!r) return 'Runtime TBA';
  if(r.min) return r.min + ' min';
  return r.ep + ' episode' + (r.ep === 1 ? '' : 's');
}

// Accepts a bare YouTube video ID or a full URL in any common format (watch?v=, youtu.be/, /embed/,
// with or without extra query params) and returns just the video ID, or '' if nothing usable is found.
// This means the data.json "trailer" field can be filled in with whatever you copy-paste — no need
// to hand-extract the ID yourself.
function getYouTubeId(input){
  if(!input) return '';
  var s = String(input).trim();
  if(!s) return '';
  if(/^[a-zA-Z0-9_-]{11}$/.test(s)) return s; // already a bare 11-char video ID
  var patterns = [
    /(?:youtube\.com\/watch\?v=|youtube-nocookie\.com\/embed\/|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  ];
  for(var i=0; i<patterns.length; i++){
    var m = s.match(patterns[i]);
    if(m) return m[1];
  }
  return '';
}

/* ---------------------------- DATA LOADING ---------------------------- */
async function loadData(){
  var loadStateEl = document.getElementById('loadState');
  try{
    var res = await fetch('data.json');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();

    PHASE_HEX = data.phaseColors || {};
    PHASE_NAME = data.phaseNames || {};
    ITEMS = data.items || [];
    RUNTIME = data.runtime || {};
    WHERE_UPCOMING = data.whereUpcoming || {};
    LANG_STANDARD = (data.languages && data.languages.standard) || ['English'];
    LANG_OVERRIDES = (data.languages && data.languages.overrides) || {};
    CAST = data.cast || {};
    SKIPPABLE = new Set(data.skippable || []);
    CHARACTERS = data.characters || [];
    CHAR_FOCUS = data.charFocus || {};
    LINKS = data.links || {};
    RELEASE_ORDER = data.releaseOrder || [];
    CHRONO_ORDER = data.chronoOrder || [];

    byId = {};
    ITEMS.forEach(function(it){ byId[it.id] = it; });

    CHAR_BY_ID = {};
    CHARACTERS.forEach(function(c){ CHAR_BY_ID[c.id] = c; });

    GRAPH_OUT = {};
    GRAPH_IN = {};
    ITEMS.forEach(function(it){ GRAPH_OUT[it.id] = {}; GRAPH_IN[it.id] = {}; });
    Object.keys(LINKS).forEach(function(from){
      LINKS[from].forEach(function(to){
        if(byId[to]){
          GRAPH_OUT[from][to] = true;
          GRAPH_IN[to][from] = true;
        }
      });
    });

    init();
    if(loadStateEl) loadStateEl.classList.add('hidden');
  }catch(err){
    console.error('Failed to load data.json', err);
    if(loadStateEl){
      loadStateEl.classList.add('error');
      loadStateEl.innerHTML =
        '<div class="load-card"><div class="load-error">'
        + '<h2>Couldn\'t load data.json</h2>'
        + '<p>This page loads its content from <code>data.json</code>, which must sit in the same folder and be served over <code>http(s)://</code> — browsers block local file reads (<code>file://</code>) for security.</p>'
        + '<ol>'
        + '<li>Put <code>mcu-timeline.html</code> and <code>data.json</code> in the same folder.</li>'
        + '<li>Open a terminal in that folder and run: <code>python3 -m http.server 8000</code></li>'
        + '<li>Visit <code>http://localhost:8000/mcu-timeline.html</code> instead of double-clicking the file.</li>'
        + '</ol>'
        + '<p style="margin-top:12px;">Or host both files on any static host (Netlify Drop, GitHub Pages, Vercel) for permanent use.</p>'
        + '</div></div>';
    }
  }
}

/* ---------------------------- STATE ---------------------------- */
var mode = 'release';
var selectedId = null;
var activeThread = null;

/* ---------------------------- WATCHED PROGRESS ---------------------------- */
var WATCHED_KEY = 'mcuLedgerWatched';
var watched = {};
try{
  var storedWatched = localStorage.getItem(WATCHED_KEY);
  if(storedWatched) watched = JSON.parse(storedWatched);
}catch(e){ watched = {}; }

function saveWatched(){
  try{ localStorage.setItem(WATCHED_KEY, JSON.stringify(watched)); }catch(e){}
}
function isWatched(id){ return !!watched[id]; }
function toggleWatched(id){
  if(watched[id]) delete watched[id]; else watched[id] = true;
  saveWatched();
  updateProgressUI();
}
function updateProgressUI(){
  var total = ITEMS.length;
  var count = Object.keys(watched).filter(function(id){ return byId[id] && watched[id]; }).length;
  var pct = total ? Math.round(count/total*100) : 0;
  var countEl = document.getElementById('progressCount');
  var totalEl = document.getElementById('progressTotal');
  var pctEl = document.getElementById('progressPct');
  var subEl = document.getElementById('progressSub');
  var ringEl = document.getElementById('progressRingFill');
  var phasesEl = document.getElementById('progressPhases');
  var panel = document.getElementById('progressPanel');
  if(countEl) countEl.textContent = count;
  if(totalEl) totalEl.textContent = total;
  if(pctEl) pctEl.textContent = pct;
  if(subEl) subEl.textContent = pct + '% of the MCU catalog';
  if(panel) panel.setAttribute('aria-label', 'MCU watch progress: ' + pct + '% (' + count + ' of ' + total + ')');
  if(ringEl){
    var circ = 2 * Math.PI * 30;
    ringEl.style.strokeDasharray = ((pct/100)*circ).toFixed(2) + ' ' + circ.toFixed(2);
  }
  if(phasesEl){
    var html = '';
    for(var p=1; p<=6; p++){
      var titles = ITEMS.filter(function(it){ return it.phase === p; });
      var seen = titles.filter(function(it){ return isWatched(it.id); }).length;
      var n = titles.length;
      var pPct = n ? Math.round(seen/n*100) : 0;
      html += '<div class="progress-phase" role="listitem" title="'+PHASE_NAME[p]+': '+seen+' of '+n+' watched">';
      html += '<span class="progress-phase-name">'+PHASE_NAME[p]+'</span>';
      html += '<span class="progress-phase-track"><span class="progress-phase-fill" style="width:'+pPct+'%;background:'+PHASE_HEX[p]+'"></span></span>';
      html += '<span class="progress-phase-stat"><b>'+pPct+'%</b> '+seen+'/'+n+'</span>';
      html += '</div>';
    }
    phasesEl.innerHTML = html;
  }
}
var progressResetBtn = document.getElementById('progressReset');
if(progressResetBtn){
  progressResetBtn.addEventListener('click', function(){
    watched = {};
    saveWatched();
    updateProgressUI();
    render();
  });
}

/* ---------------------------- THEME ---------------------------- */
var THEME_KEY = 'mcuLedgerTheme';
var themeToggleBtn = document.getElementById('themeToggle');
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  if(themeToggleBtn) themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
}
(function initTheme(){
  var saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
  if(!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches){
    saved = 'light';
  }
  applyTheme(saved === 'light' ? 'light' : 'dark');
})();
if(themeToggleBtn){
  themeToggleBtn.addEventListener('click', function(){
    var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
    requestAnimationFrame(function(){
      drawSegments(currentOrder());
      redrawGraph();
    });
  });
}


/* ---------------------------- RENDER ---------------------------- */
var trackEl = document.getElementById('track');
var trackWrap = document.getElementById('track-wrap');
var svgEl = document.getElementById('links');

function currentOrder(){ return mode === 'release' ? RELEASE_ORDER : CHRONO_ORDER; }

function render(){
  var order = currentOrder();
  trackEl.innerHTML = '';

  order.forEach(function(id, i){
    var it = byId[id];
    var node = document.createElement('div');
    node.className = 'node ' + (i % 2 === 0 ? 'above' : 'below') + (isWatched(id) ? ' watched' : '');
    node.dataset.id = id;

    var dot = document.createElement('div');
    dot.className = 'node-dot';
    dot.style.borderColor = PHASE_HEX[it.phase];

    var card = document.createElement('div');
    card.className = 'card';

    var check = document.createElement('button');
    check.type = 'button';
    check.className = 'watched-check' + (isWatched(id) ? ' checked' : '');
    check.textContent = '✓';
    check.title = isWatched(id) ? 'Mark unwatched' : 'Mark watched';
    check.setAttribute('aria-label', check.title + ': ' + it.title);
    check.addEventListener('click', function(e){
      e.stopPropagation();
      toggleWatched(id);
      var nowWatched = isWatched(id);
      node.classList.toggle('watched', nowWatched);
      check.classList.toggle('checked', nowWatched);
      check.title = nowWatched ? 'Mark unwatched' : 'Mark watched';
    });
    card.appendChild(check);

    var badgeRow = document.createElement('div');
    badgeRow.className = 'badge-row';
    var typeBadge = document.createElement('span');
    typeBadge.className = 'type-badge';
    typeBadge.style.color = PHASE_HEX[it.phase];
    typeBadge.textContent = it.type;
    var yr = document.createElement('span');
    yr.className = 'year';
    yr.textContent = it.year;
    badgeRow.appendChild(typeBadge);
    badgeRow.appendChild(yr);

    var title = document.createElement('div');
    title.className = 'title';
    title.textContent = it.title;

    var phaseTag = document.createElement('div');
    phaseTag.className = 'phase-tag';
    phaseTag.style.color = PHASE_HEX[it.phase];
    phaseTag.textContent = PHASE_NAME[it.phase];

    card.appendChild(badgeRow);
    card.appendChild(title);
    card.appendChild(phaseTag);

    if(it.branch){
      var bf = document.createElement('span');
      bf.className = 'branch-flag';
      bf.textContent = 'branch';
      card.appendChild(bf);
    }
    if(it.upcoming){
      var uf = document.createElement('span');
      uf.className = 'upcoming-flag';
      uf.textContent = 'upcoming';
      card.appendChild(uf);
    }
    if(SKIPPABLE.has(id)){
      var sf = document.createElement('span');
      sf.className = 'skip-flag';
      sf.textContent = 'optional';
      card.appendChild(sf);
    }

    var focusChars = charsOf(id);
    if(focusChars.length){
      var dots = document.createElement('div');
      dots.className = 'char-dots';
      focusChars.forEach(function(cid){
        var ch = CHAR_BY_ID[cid];
        if(!ch) return;
        var d = document.createElement('span');
        d.className = 'char-dot';
        d.style.background = ch.color;
        d.title = ch.name;
        dots.appendChild(d);
      });
      card.appendChild(dots);
    }

    if(i % 2 === 0){
      node.appendChild(card);
      node.appendChild(dot);
    } else {
      node.appendChild(dot);
      node.appendChild(card);
    }
    node.addEventListener('click', function(){
      if(roadMode){ openRoadMap(id); } else { selectNode(id); }
    });
    trackEl.appendChild(node);
  });

  updateProgressUI();
  applyThreadHighlight();
  buildMinimap();

  requestAnimationFrame(function(){
    drawSegments(order);
    redrawGraph();
  });
}

function drawSegments(order){
  var olds = trackWrap.querySelectorAll('.seg-band, .seg-label');
  olds.forEach(function(e){ e.remove(); });
  var trackRect = trackEl.getBoundingClientRect();
  var curPhase = null, startX = null, lastX = null;

  function addBand(x1, x2, phase){
    var band = document.createElement('div');
    band.className = 'seg-band';
    band.style.left = x1 + 'px';
    band.style.width = Math.max(2, x2 - x1) + 'px';
    band.style.background = PHASE_HEX[phase];
    trackWrap.insertBefore(band, trackWrap.firstChild);
  }
  function addLabel(x, text, phase){
    var lbl = document.createElement('div');
    lbl.className = 'seg-label';
    lbl.style.left = (x + 12) + 'px';
    lbl.style.color = PHASE_HEX[phase];
    lbl.textContent = text;
    trackWrap.appendChild(lbl);
  }

  order.forEach(function(id, i){
    var it = byId[id];
    var nodeEl = trackEl.children[i];
    var r = nodeEl.getBoundingClientRect();
    var cx = r.left - trackRect.left + r.width/2;
    if(it.phase !== curPhase){
      if(curPhase !== null){
        addBand(startX, lastX, curPhase);
      }
      curPhase = it.phase;
      startX = cx;
      addLabel(cx, PHASE_NAME[curPhase], curPhase);
    }
    lastX = cx;
  });
  if(curPhase !== null) addBand(startX, lastX, curPhase);
}

/* ---------------------------- MINIMAP / SCRUBBER ---------------------------- */
var stageEl = document.getElementById('stage');
var minimapEl = document.getElementById('minimap');
var minimapTrackEl = document.getElementById('minimapTrack');
var minimapViewportEl = document.getElementById('minimapViewport');
var phaseJumpRowEl = document.getElementById('phaseJumpRow');

function jumpToPhase(phase){
  var order = currentOrder();
  var idx = -1;
  for(var i=0; i<order.length; i++){
    if(byId[order[i]].phase === phase){ idx = i; break; }
  }
  if(idx === -1) return;
  var el = trackEl.children[idx];
  if(el) el.scrollIntoView({behavior:'smooth', inline:'start', block:'nearest'});
}

function buildMinimap(){
  var order = currentOrder();
  if(!order.length) return;

  // phase jump chips, one per phase present in this view, in order of first appearance
  phaseJumpRowEl.innerHTML = '';
  var seenPhases = [];
  order.forEach(function(id){
    var p = byId[id].phase;
    if(seenPhases.indexOf(p) === -1) seenPhases.push(p);
  });
  seenPhases.forEach(function(p){
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'phase-chip';
    chip.innerHTML = '<span class="chip-dot" style="background:' + PHASE_HEX[p] + '"></span>' + PHASE_NAME[p];
    chip.title = 'Jump to ' + PHASE_NAME[p];
    chip.addEventListener('click', function(){ jumpToPhase(p); });
    phaseJumpRowEl.appendChild(chip);
  });
  var branchNote = document.createElement('span');
  branchNote.className = 'phase-chip phase-chip-static';
  branchNote.innerHTML = '<span class="chip-dot chip-dot-branch"></span>Alt. timeline / branch';
  phaseJumpRowEl.appendChild(branchNote);

  // proportional segment strip — one block per contiguous phase run, sized by node count
  minimapTrackEl.innerHTML = '';
  var total = order.length;
  var runs = [];
  var curPhase = null, count = 0;
  order.forEach(function(id){
    var p = byId[id].phase;
    if(p !== curPhase){
      if(curPhase !== null) runs.push({phase: curPhase, count: count});
      curPhase = p;
      count = 0;
    }
    count++;
  });
  if(curPhase !== null) runs.push({phase: curPhase, count: count});

  runs.forEach(function(run){
    var seg = document.createElement('div');
    seg.className = 'minimap-seg';
    seg.style.width = (run.count / total * 100) + '%';
    seg.style.background = PHASE_HEX[run.phase];
    seg.title = PHASE_NAME[run.phase];
    seg.addEventListener('click', function(e){
      e.stopPropagation();
      jumpToPhase(run.phase);
    });
    minimapTrackEl.appendChild(seg);
  });

  updateMinimapViewport();
}

function updateMinimapViewport(){
  if(!stageEl.scrollWidth) return;
  var visiblePct = Math.min(100, (stageEl.clientWidth / stageEl.scrollWidth) * 100);
  var scrollable = stageEl.scrollWidth - stageEl.clientWidth;
  var leftPct = scrollable > 0 ? (stageEl.scrollLeft / scrollable) * (100 - visiblePct) : 0;
  minimapViewportEl.style.width = visiblePct + '%';
  minimapViewportEl.style.left = leftPct + '%';
}

var minimapScrollTicking = false;
stageEl.addEventListener('scroll', function(){
  if(minimapScrollTicking) return;
  minimapScrollTicking = true;
  requestAnimationFrame(function(){
    updateMinimapViewport();
    minimapScrollTicking = false;
  });
});

// Drag the viewport indicator to scrub through the timeline continuously.
var minimapDragging = false;
var minimapDragStartX = 0;
var minimapDragStartScroll = 0;

function minimapDragMove(clientX){
  var minimapWidth = minimapEl.clientWidth;
  var scrollRatio = stageEl.scrollWidth / minimapWidth;
  var dx = clientX - minimapDragStartX;
  var next = minimapDragStartScroll + dx * scrollRatio;
  var max = stageEl.scrollWidth - stageEl.clientWidth;
  stageEl.scrollLeft = Math.max(0, Math.min(max, next));
}

minimapViewportEl.addEventListener('mousedown', function(e){
  e.preventDefault();
  minimapDragging = true;
  minimapDragStartX = e.clientX;
  minimapDragStartScroll = stageEl.scrollLeft;
});
window.addEventListener('mousemove', function(e){
  if(!minimapDragging) return;
  minimapDragMove(e.clientX);
});
window.addEventListener('mouseup', function(){ minimapDragging = false; });

minimapViewportEl.addEventListener('touchstart', function(e){
  minimapDragging = true;
  minimapDragStartX = e.touches[0].clientX;
  minimapDragStartScroll = stageEl.scrollLeft;
}, {passive:true});
window.addEventListener('touchmove', function(e){
  if(!minimapDragging) return;
  minimapDragMove(e.touches[0].clientX);
}, {passive:true});
window.addEventListener('touchend', function(){ minimapDragging = false; });

// Clicking the bar itself (outside a segment/viewport) jumps the timeline to roughly that spot.
minimapEl.addEventListener('click', function(e){
  if(e.target === minimapViewportEl) return;
  var rect = minimapEl.getBoundingClientRect();
  var frac = (e.clientX - rect.left) / rect.width;
  var max = stageEl.scrollWidth - stageEl.clientWidth;
  stageEl.scrollTo({left: Math.max(0, Math.min(max, frac * stageEl.scrollWidth - stageEl.clientWidth/2)), behavior:'smooth'});
});

function ensureArrowMarker(id, fill){
  if(svgEl.querySelector('#' + id)) return;
  var defs = svgEl.querySelector('defs');
  if(!defs){
    defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
    svgEl.appendChild(defs);
  }
  var marker = document.createElementNS('http://www.w3.org/2000/svg','marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox','0 0 10 10');
  marker.setAttribute('refX','8');
  marker.setAttribute('refY','5');
  marker.setAttribute('markerWidth','7');
  marker.setAttribute('markerHeight','7');
  marker.setAttribute('orient','auto-start-reverse');
  var arrowPath = document.createElementNS('http://www.w3.org/2000/svg','path');
  arrowPath.setAttribute('d','M 0 0 L 10 5 L 0 10 z');
  arrowPath.setAttribute('fill', fill);
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
}

function redrawGraph(){
  var order = currentOrder();
  svgEl.setAttribute('width', trackEl.scrollWidth);
  svgEl.setAttribute('height', trackEl.offsetHeight + 40);
  svgEl.innerHTML = '';
  if(activeThread){
    drawThreadFor(activeThread);
  } else if(selectedId && order.indexOf(selectedId) !== -1){
    drawLinksFor(selectedId);
  }
}

function applyThreadHighlight(){
  var order = currentOrder();
  var hits = activeThread ? threadHitsInOrder(activeThread) : [];
  var hitSet = {};
  hits.forEach(function(id){ hitSet[id] = true; });
  Array.prototype.forEach.call(trackEl.children, function(el, i){
    var nid = order[i];
    el.classList.remove('thread-hit','thread-dim');
    var numEl = el.querySelector('.thread-num');
    if(numEl) numEl.remove();
    if(!activeThread) return;
    if(hitSet[nid]){
      el.classList.add('thread-hit');
      var step = hits.indexOf(nid) + 1;
      var badge = document.createElement('span');
      badge.className = 'thread-num';
      badge.textContent = step;
      var dot = el.querySelector('.node-dot');
      if(dot) dot.appendChild(badge);
    } else {
      el.classList.add('thread-dim');
    }
  });
}

function threadHitsInOrder(charId){
  return currentOrder().filter(function(id){ return charsOf(id).indexOf(charId) !== -1; });
}

function setActiveThread(charId){
  activeThread = charId || null;
  var ch = activeThread ? CHAR_BY_ID[activeThread] : null;
  document.documentElement.style.setProperty('--thread', ch ? ch.color : '');
  var banner = document.getElementById('threadBanner');
  var label = document.getElementById('threadLabel');
  var meta = document.getElementById('threadMeta');
  var swatch = document.getElementById('threadSwatch');
  var charInput = document.getElementById('charInput');
  if(ch){
    var hits = threadHitsInOrder(ch.id);
    banner.classList.add('show');
    swatch.style.background = ch.color;
    label.innerHTML = 'Character thread · <b>' + ch.name + '</b>';
    meta.textContent = hits.length + ' appearance' + (hits.length === 1 ? '' : 's') + ' in ' + (mode === 'release' ? 'release' : 'chronological') + ' order';
    if(charInput) charInput.value = ch.name;
  } else {
    banner.classList.remove('show');
    if(charInput) charInput.value = '';
  }
  applyThreadHighlight();
  requestAnimationFrame(redrawGraph);
}

function drawThreadFor(charId){
  var ch = CHAR_BY_ID[charId];
  if(!ch) return;
  var order = currentOrder();
  var hits = threadHitsInOrder(charId);
  ensureArrowMarker('thread-arrow', ch.color);

  var trackRect = trackEl.getBoundingClientRect();
  for(var i = 0; i < hits.length - 1; i++){
    var fromIdx = order.indexOf(hits[i]);
    var toIdx = order.indexOf(hits[i+1]);
    if(fromIdx === -1 || toIdx === -1) continue;
    var fromEl = trackEl.children[fromIdx];
    var toEl = trackEl.children[toIdx];
    var fromDot = fromEl.querySelector('.node-dot');
    var toDot = toEl.querySelector('.node-dot');
    var fr = fromDot.getBoundingClientRect();
    var tr = toDot.getBoundingClientRect();
    var fx = fr.left - trackRect.left + fr.width/2;
    var fy = fr.top - trackRect.top + fr.height/2;
    var tx = tr.left - trackRect.left + tr.width/2;
    var ty = tr.top - trackRect.top + tr.height/2;
    var dx = tx - fx, dy = ty - fy;
    var len = Math.sqrt(dx*dx + dy*dy) || 1;
    var pullBack = 9;
    var tx2 = tx - (dx/len) * pullBack;
    var ty2 = ty - (dy/len) * pullBack;
    var dist = Math.abs(tx - fx);
    var arcHeight = Math.min(100, 28 + dist*0.1);
    var midY = Math.min(fy, ty) - arcHeight;
    var path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', 'M ' + fx + ' ' + fy + ' Q ' + ((fx+tx)/2) + ' ' + midY + ' ' + tx2 + ' ' + ty2);
    path.setAttribute('stroke', ch.color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('opacity', '0.9');
    path.setAttribute('marker-end', 'url(#thread-arrow)');
    path.style.filter = 'drop-shadow(0 0 5px ' + ch.color + '88)';
    svgEl.appendChild(path);
  }
}

function ensureStoryArrowMarker(){
  ensureArrowMarker('arrowhead', 'var(--accent)');
}

// Only draws OUTGOING links from the selected node ("leads to"), each arrowed toward its target.
function drawLinksFor(id){
  var order = currentOrder();
  var trackRect = trackEl.getBoundingClientRect();
  svgEl.setAttribute('width', trackEl.scrollWidth);
  svgEl.setAttribute('height', trackEl.offsetHeight + 40);
  svgEl.innerHTML = '';
  ensureStoryArrowMarker();

  var idx = order.indexOf(id);
  if(idx === -1) return;
  var fromEl = trackEl.children[idx];
  var fromDot = fromEl.querySelector('.node-dot');
  var fr = fromDot.getBoundingClientRect();
  var fx = fr.left - trackRect.left + fr.width/2;
  var fy = fr.top - trackRect.top + fr.height/2;

  var outgoing = Object.keys(GRAPH_OUT[id] || {});
  outgoing.forEach(function(otherId){
    var oidx = order.indexOf(otherId);
    if(oidx === -1) return;
    var toEl = trackEl.children[oidx];
    var toDot = toEl.querySelector('.node-dot');
    var tr = toDot.getBoundingClientRect();
    var tx = tr.left - trackRect.left + tr.width/2;
    var ty = tr.top - trackRect.top + tr.height/2;

    // pull the endpoint back slightly so the arrowhead doesn't sit under the dot
    var dx = tx - fx, dy = ty - fy;
    var len = Math.sqrt(dx*dx + dy*dy) || 1;
    var pullBack = 9;
    var tx2 = tx - (dx/len) * pullBack;
    var ty2 = ty - (dy/len) * pullBack;

    var dist = Math.abs(tx - fx);
    var arcHeight = Math.min(120, 40 + dist*0.12);
    var midY = Math.min(fy, ty) - arcHeight;
    var path = document.createElementNS('http://www.w3.org/2000/svg','path');
    var d = 'M ' + fx + ' ' + fy + ' Q ' + ((fx+tx)/2) + ' ' + midY + ' ' + tx2 + ' ' + ty2;
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'var(--accent)');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('fill', 'none');
    path.setAttribute('opacity', '0.8');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.style.filter = 'drop-shadow(0 0 4px rgba(242,193,78,0.35))';
    svgEl.appendChild(path);
  });
}

function selectNode(id){
  selectedId = id;
  var order = currentOrder();
  if(!activeThread){
    Array.prototype.forEach.call(trackEl.children, function(el, i){
      var nid = order[i];
      el.classList.remove('selected','linked','dimmed');
      if(nid === id){ el.classList.add('selected'); }
      else if(GRAPH_OUT[id] && GRAPH_OUT[id][nid]){ el.classList.add('linked'); }
      else { el.classList.add('dimmed'); }
    });
  } else {
    Array.prototype.forEach.call(trackEl.children, function(el, i){
      var nid = order[i];
      el.classList.toggle('selected', nid === id);
    });
  }
  redrawGraph();
  openDetail(id);
  var el = trackEl.children[order.indexOf(id)];
  if(el){
    el.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
  }
}

function clearSelection(){
  selectedId = null;
  Array.prototype.forEach.call(trackEl.children, function(el){
    el.classList.remove('selected','linked','dimmed');
  });
  applyThreadHighlight();
  redrawGraph();
}

/* ---------------------------- DETAIL PANEL ---------------------------- */
var detailEl = document.getElementById('detail');
var detailBody = document.getElementById('detailBody');
var overlayEl = document.getElementById('overlay');

function openDetail(id){
  var it = byId[id];
  var html = '';
  html += '<div class="dyear">'+it.year+' &middot; '+it.type.toUpperCase()+(it.branch ? ' &middot; ALT. TIMELINE' : '')+(it.upcoming ? ' &middot; UPCOMING' : '')+'</div>';
  html += '<h2>'+it.title+'</h2>';
  html += '<div class="dphase" style="color:'+PHASE_HEX[it.phase]+'">'+PHASE_NAME[it.phase]+'</div>';
  html += '<p class="blurb">'+it.blurb+'</p>';

  html += '<div class="meta-row">';
  html += '<span class="meta-chip">📺 <b>'+whereToWatch(it)+'</b></span>';
  html += '<span class="meta-chip">⏱ <b>'+runtimeLabel(id)+'</b></span>';
  html += '<span class="meta-chip">🌐 <b>'+languagesFor(it).join(', ')+'</b></span>';
  if(SKIPPABLE.has(id)){
    html += '<span class="meta-chip optional">⚑ Optional — not required for the core arc</span>';
  }
  html += '</div>';

  html += '<div class="action-row">';
  html += '<button type="button" class="trailer-btn" id="trailerBtn" data-id="'+id+'">▶ Play trailer</button>';
  html += '<a class="hotstar-btn" href="'+hotstarUrl(it)+'" target="_blank" rel="noopener noreferrer">'+HOTSTAR_ICON+' Open on Hotstar</a>';
  html += '</div>';

  var cast = castFor(id);
  if(cast.length){
    html += '<div class="link-title">Cast</div>';
    html += '<div class="cast-list">';
    cast.forEach(function(pair){
      html += '<div class="cast-row"><span class="cast-actor">'+pair[0]+'</span><span class="cast-role">'+pair[1]+'</span></div>';
    });
    html += '</div>';
  }

  var focusChars = charsOf(id);
  if(focusChars.length){
    html += '<div class="link-title">Character threads</div>';
    html += '<div class="char-chip-row">';
    focusChars.forEach(function(cid){
      var ch = CHAR_BY_ID[cid];
      if(!ch) return;
      html += '<button type="button" class="char-chip" data-char="'+ch.id+'"><span class="char-swatch" style="background:'+ch.color+'"></span>'+ch.name+(ch.aka ? ' · '+ch.aka : '')+'</button>';
    });
    html += '</div>';
  }

  html += '<button class="watch-path-btn" id="watchPathBtn" type="button">🛤 Show full watch path</button>';

  var outgoing = Object.keys(GRAPH_OUT[id] || {}).map(function(lid){ return byId[lid]; });
  var incoming = Object.keys(GRAPH_IN[id] || {}).map(function(lid){ return byId[lid]; });

  if(outgoing.length){
    outgoing.sort(function(a,b){ return a.year - b.year; });
    html += '<div class="link-title">Leads to</div>';
    outgoing.forEach(function(l){
      html += '<div class="link-item" data-id="'+l.id+'"><span>'+l.title+'</span><span class="lyr">'+l.year+'</span></div>';
    });
  } else {
    html += '<div class="link-title">Doesn\'t directly lead into anything catalogued</div>';
  }

  if(incoming.length){
    incoming.sort(function(a,b){ return a.year - b.year; });
    html += '<div class="link-title" style="margin-top:20px;">Follows from</div>';
    incoming.forEach(function(l){
      html += '<div class="link-item" data-id="'+l.id+'"><span>'+l.title+'</span><span class="lyr">'+l.year+'</span></div>';
    });
  }

  detailBody.innerHTML = html;
  var items = detailBody.querySelectorAll('.link-item');
  items.forEach(function(elx){
    elx.addEventListener('click', function(){ selectNode(elx.dataset.id); });
  });
  var charChips = detailBody.querySelectorAll('.char-chip');
  charChips.forEach(function(elx){
    elx.addEventListener('click', function(){
      setActiveThread(elx.dataset.char);
    });
  });
  var wpBtn = document.getElementById('watchPathBtn');
  if(wpBtn){
    wpBtn.addEventListener('click', function(){
      detailEl.classList.remove('open');
      overlayEl.classList.remove('show');
      openRoadMap(id);
    });
  }
  var trBtn = document.getElementById('trailerBtn');
  if(trBtn){
    trBtn.addEventListener('click', function(){ openTrailerModal(id); });
  }

  detailEl.classList.add('open');
  overlayEl.classList.add('show');
}

document.getElementById('closeDetail').addEventListener('click', function(){
  detailEl.classList.remove('open');
  overlayEl.classList.remove('show');
  clearSelection();
});
overlayEl.addEventListener('click', function(){
  detailEl.classList.remove('open');
  overlayEl.classList.remove('show');
  clearSelection();
});

/* ---------------------------- ROAD MODE (prerequisite watch-path tree) ---------------------------- */
var roadMode = false;
var roadHistory = [];
var roadModeToggle = document.getElementById('roadModeToggle');
var roadOverlayEl = document.getElementById('roadOverlay');
var roadModalEl = document.getElementById('roadModal');
var roadBodyEl = document.getElementById('roadBody');
var roadBackBtn = document.getElementById('roadBack');
var roadCloseBtn = document.getElementById('roadClose');

roadModeToggle.addEventListener('click', function(){
  roadMode = !roadMode;
  roadModeToggle.classList.toggle('active', roadMode);
  roadModeToggle.setAttribute('aria-pressed', roadMode ? 'true' : 'false');
});

// BFS backward from rootId along GRAPH_IN (i.e. "what leads into this"), building a
// shortest-path tree so every ancestor appears exactly once, at the shallowest depth
// it can be reached from — that's the natural "must watch before this" tree.
function buildPrereqTree(rootId){
  var visited = {};
  visited[rootId] = true;
  var parentOf = {}; // ancestorId -> tree-parent id (the node it's nested under)
  var childrenOf = {};
  var queue = [rootId];
  while(queue.length){
    var current = queue.shift();
    var preds = Object.keys(GRAPH_IN[current] || {});
    preds.sort(function(a,b){ return byId[a].year - byId[b].year; });
    preds.forEach(function(p){
      if(!visited[p]){
        visited[p] = true;
        parentOf[p] = current;
        if(!childrenOf[current]) childrenOf[current] = [];
        childrenOf[current].push(p);
        queue.push(p);
      }
    });
  }
  return { childrenOf: childrenOf, visited: Object.keys(visited).filter(function(k){ return k !== rootId; }) };
}

// A title counts as "essential" (part of the must-watch spine) if it isn't flagged as an
// alt-timeline branch and isn't in the curated SKIPPABLE set.
function isEssential(id){
  var it = byId[id];
  return !!it && !it.branch && !SKIPPABLE.has(id);
}

// Collapses a prerequisite tree down to only essential nodes: non-essential nodes are skipped,
// but their own essential descendants get reparented up to the nearest essential ancestor
// (or the root) so nothing essential is lost — just the optional detours are hidden.
function buildEssentialChildrenMap(rootId, childrenOf){
  var filtered = {};
  function process(nodeId){
    var rawKids = childrenOf[nodeId] || [];
    var effectiveKids = [];
    rawKids.forEach(function(kid){
      if(isEssential(kid)){
        effectiveKids.push(kid);
        filtered[kid] = process(kid);
      } else {
        effectiveKids = effectiveKids.concat(process(kid));
      }
    });
    effectiveKids.sort(function(a,b){ return byId[a].year - byId[b].year; });
    return effectiveKids;
  }
  filtered[rootId] = process(rootId);
  return filtered;
}

// Builds the "why watch this" explanation for a tree node: what it's about (its blurb)
// plus how it connects forward through the tree toward the root the user is working toward.
function whyText(id, parentId, rootId){
  var it = byId[id];
  var root = byId[rootId];
  if(id === rootId){
    return it.blurb + ' This is the title you\'re building the watch path toward — everything below is what feeds into it.';
  }
  var text = it.blurb;
  var parent = parentId ? byId[parentId] : null;
  if(parent){
    if(parent.id === root.id){
      text += ' It leads directly into <b>' + root.title + '</b> — the show you\'re working toward — so this fills in the connective tissue right before it.';
    } else {
      text += ' It leads directly into <b>' + parent.title + '</b>, which is itself a stepping stone on the way to <b>' + root.title + '</b>.';
    }
  }
  return text;
}

function renderTreeNode(id, childrenOf, isRoot, parentId, rootId){
  var it = byId[id];
  var li = document.createElement('li');
  if(isRoot) li.className = 'road-root';

  var row = document.createElement('div');
  row.className = 'road-node';
  var dot = document.createElement('span');
  dot.className = 'rphase-dot';
  dot.style.background = PHASE_HEX[it.phase];
  var t = document.createElement('span');
  t.className = 'rtitle';
  t.textContent = it.title;
  var y = document.createElement('span');
  y.className = 'ryear';
  y.textContent = it.year;
  row.appendChild(dot);
  row.appendChild(t);
  if(it.branch){
    var b = document.createElement('span');
    b.className = 'rbranch';
    b.textContent = 'branch';
    row.appendChild(b);
  }
  if(SKIPPABLE.has(id)){
    var sk = document.createElement('span');
    sk.className = 'rskip';
    sk.textContent = 'optional';
    row.appendChild(sk);
  }

  var qBtn = document.createElement('button');
  qBtn.type = 'button';
  qBtn.className = 'rwhy-btn';
  qBtn.textContent = '?';
  qBtn.title = 'Why watch this';
  qBtn.setAttribute('aria-label', 'Why watch ' + it.title);
  qBtn.addEventListener('click', function(e){
    e.stopPropagation();
    var childUl = li.querySelector(':scope > ul.road-tree');
    var existing = li.querySelector(':scope > .rwhy-panel');
    if(existing){
      existing.remove();
      qBtn.classList.remove('active');
      return;
    }
    var panel = document.createElement('div');
    panel.className = 'rwhy-panel';
    panel.innerHTML = whyText(id, parentId, rootId);
    li.insertBefore(panel, childUl || null);
    qBtn.classList.add('active');
  });
  row.appendChild(qBtn);
  row.appendChild(y);

  if(!isRoot){
    row.addEventListener('click', function(e){
      e.stopPropagation();
      roadHistory.push(currentRoadRoot);
      openRoadMap(id);
    });
  }
  li.appendChild(row);

  var kids = childrenOf[id];
  if(kids && kids.length){
    var ul = document.createElement('ul');
    ul.className = 'road-tree';
    kids.forEach(function(kid){
      ul.appendChild(renderTreeNode(kid, childrenOf, false, id, rootId));
    });
    li.appendChild(ul);
  }
  return li;
}

var currentRoadRoot = null;

var essentialOnly = false;

function openRoadMap(id){
  currentRoadRoot = id;
  var it = byId[id];
  var fullTree = buildPrereqTree(id);

  var effectiveChildrenOf = fullTree.childrenOf;
  var effectiveVisited = fullTree.visited;
  var hiddenCount = 0;
  if(essentialOnly){
    effectiveChildrenOf = buildEssentialChildrenMap(id, fullTree.childrenOf);
    effectiveVisited = fullTree.visited.filter(isEssential);
    hiddenCount = fullTree.visited.length - effectiveVisited.length;
  }

  roadBodyEl.innerHTML = '';

  var eyebrow = document.createElement('div');
  eyebrow.className = 'road-eyebrow';
  eyebrow.textContent = 'Watch path';
  var title = document.createElement('div');
  title.className = 'road-title';
  title.textContent = it.title;
  var count = document.createElement('div');
  count.className = 'road-count';
  if(effectiveVisited.length){
    count.innerHTML = '<b>' + effectiveVisited.length + '</b> title' + (effectiveVisited.length === 1 ? '' : 's') + ' to watch before this one.'
      + (hiddenCount ? ' <span class="road-hidden-note">(' + hiddenCount + ' optional hidden)</span>' : '');
  } else if(hiddenCount){
    count.innerHTML = 'Nothing essential required first — <span class="road-hidden-note">' + hiddenCount + ' optional title' + (hiddenCount === 1 ? '' : 's') + ' hidden</span>.';
  } else {
    count.textContent = 'Nothing required first — this is a starting point.';
  }

  roadBodyEl.appendChild(eyebrow);
  roadBodyEl.appendChild(title);
  roadBodyEl.appendChild(count);

  if(fullTree.visited.length){
    var toggleWrap = document.createElement('div');
    toggleWrap.className = 'essential-toggle-wrap';
    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'essential-toggle' + (essentialOnly ? ' active' : '');
    toggleBtn.setAttribute('aria-pressed', essentialOnly ? 'true' : 'false');
    toggleBtn.innerHTML = '<span class="essential-toggle-dot"></span> Essential path only';
    toggleBtn.title = 'Collapse the tree to just the must-watch spine, hiding optional and alt-timeline titles';
    toggleBtn.addEventListener('click', function(){
      essentialOnly = !essentialOnly;
      openRoadMap(id);
    });
    toggleWrap.appendChild(toggleBtn);
    roadBodyEl.appendChild(toggleWrap);
  }

  if(effectiveVisited.length){
    var sectionLbl = document.createElement('div');
    sectionLbl.className = 'road-section-label';
    sectionLbl.textContent = 'Prerequisite tree';
    roadBodyEl.appendChild(sectionLbl);

    var rootUl = document.createElement('ul');
    rootUl.className = 'road-tree';
    rootUl.style.marginLeft = '0';
    rootUl.style.paddingLeft = '0';
    rootUl.style.borderLeft = 'none';
    rootUl.appendChild(renderTreeNode(id, effectiveChildrenOf, true, null, id));
    roadBodyEl.appendChild(rootUl);

    var flatLbl = document.createElement('div');
    flatLbl.className = 'road-section-label';
    flatLbl.textContent = 'Suggested linear watch order';
    roadBodyEl.appendChild(flatLbl);

    var flatItems = effectiveVisited.map(function(vid){ return byId[vid]; });
    flatItems.sort(function(a,b){ return a.year - b.year; });
    var flatUl = document.createElement('ul');
    flatUl.className = 'road-flat';
    flatItems.forEach(function(fi){
      var li = document.createElement('li');
      var t = document.createElement('span');
      t.textContent = fi.title;
      var y = document.createElement('span');
      y.className = 'ryear';
      y.textContent = fi.year;
      li.appendChild(t);
      li.appendChild(y);
      li.addEventListener('click', function(){
        roadHistory.push(currentRoadRoot);
        openRoadMap(fi.id);
      });
      flatUl.appendChild(li);
    });
    roadBodyEl.appendChild(flatUl);
  } else {
    var empty = document.createElement('div');
    empty.className = 'road-empty';
    empty.textContent = hiddenCount
      ? 'Everything before ' + it.title + ' is optional — jump right in.'
      : 'Jump right in — no earlier MCU viewing is required for ' + it.title + '.';
    roadBodyEl.appendChild(empty);
  }

  roadBackBtn.style.display = roadHistory.length ? 'inline-block' : 'none';
  roadOverlayEl.classList.add('show');
  roadModalEl.classList.add('open');
}

function closeRoadMap(){
  roadOverlayEl.classList.remove('show');
  roadModalEl.classList.remove('open');
  roadHistory = [];
}

roadCloseBtn.addEventListener('click', closeRoadMap);
roadOverlayEl.addEventListener('click', closeRoadMap);
roadBackBtn.addEventListener('click', function(){
  var prev = roadHistory.pop();
  if(prev){ openRoadMap(prev); }
});

/* ---------------------------- TRAILER MODAL (inline playback, no redirect) ---------------------------- */
var trailerOverlayEl = document.getElementById('trailerOverlay');
var trailerModalEl = document.getElementById('trailerModal');
var trailerBodyEl = document.getElementById('trailerBody');
var trailerTitleEl = document.getElementById('trailerTitle');
var trailerCloseBtn = document.getElementById('trailerClose');

function openTrailerModal(id){
  var it = byId[id];
  trailerTitleEl.textContent = it.title;
  var vid = getYouTubeId(it.trailer);

  if(vid){
    trailerBodyEl.innerHTML =
      '<div class="trailer-frame-wrap"><iframe src="https://www.youtube-nocookie.com/embed/'+vid+'?autoplay=1&rel=0" title="'+it.title+' trailer" referrerpolicy="strict-origin-when-cross-origin" allow="accelerated-video; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>'
      + '<div class="trailer-note">Trailer not loading? Some studio uploads restrict embedding — <a href="'+trailerSearchUrl(it)+'" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">open it on YouTube</a> instead.</div>';
  } else {
    trailerBodyEl.innerHTML =
      '<div class="trailer-fallback">We haven\'t verified an embeddable trailer link for this title yet, so we won\'t guess and risk playing the wrong video.'
      + '<br><a href="'+trailerSearchUrl(it)+'" target="_blank" rel="noopener noreferrer">▶ Search "'+it.title+'" on YouTube</a></div>';
  }

  trailerOverlayEl.classList.add('show');
  trailerModalEl.classList.add('open');
}

function closeTrailerModal(){
  trailerOverlayEl.classList.remove('show');
  trailerModalEl.classList.remove('open');
  trailerBodyEl.innerHTML = ''; // stop playback by removing the iframe
}

trailerCloseBtn.addEventListener('click', closeTrailerModal);
trailerOverlayEl.addEventListener('click', closeTrailerModal);

/* ---------------------------- TABS ---------------------------- */
document.getElementById('tabs').addEventListener('click', function(e){
  var btn = e.target.closest('.tab');
  if(!btn) return;
  var tabs = document.querySelectorAll('.tab');
  tabs.forEach(function(t){ t.classList.remove('active'); });
  btn.classList.add('active');
  mode = btn.dataset.mode;
  detailEl.classList.remove('open');
  overlayEl.classList.remove('show');
  clearSelection();
  render();
  if(activeThread) setActiveThread(activeThread);
  document.getElementById('stage').scrollTo({left:0});
});

/* ---------------------------- SEARCH ---------------------------- */
var searchInput = document.getElementById('searchInput');
var searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', function(){
  var q = searchInput.value.trim().toLowerCase();
  if(!q){ searchResults.classList.remove('show'); searchResults.innerHTML=''; return; }
  var matches = ITEMS.filter(function(it){ return it.title.toLowerCase().indexOf(q) !== -1; }).slice(0,8);
  if(!matches.length){ searchResults.classList.remove('show'); searchResults.innerHTML=''; return; }
  searchResults.innerHTML = matches.map(function(m){
    return '<div class="sr-item" data-id="'+m.id+'"><span>'+m.title+'</span><span class="yr">'+m.year+'</span></div>';
  }).join('');
  searchResults.classList.add('show');
  var srItems = searchResults.querySelectorAll('.sr-item');
  srItems.forEach(function(elx){
    elx.addEventListener('click', function(){
      searchResults.classList.remove('show');
      searchInput.value = '';
      if(roadMode){ openRoadMap(elx.dataset.id); } else { selectNode(elx.dataset.id); }
    });
  });
});
document.addEventListener('click', function(e){
  if(!e.target.closest('#searchInput') && !e.target.closest('#searchResults')){
    searchResults.classList.remove('show');
  }
  if(!e.target.closest('#charInput') && !e.target.closest('#charResults')){
    charResults.classList.remove('show');
  }
});

/* ---------------------------- CHARACTER THREAD ---------------------------- */
var charInput = document.getElementById('charInput');
var charResults = document.getElementById('charResults');
var threadClearBtn = document.getElementById('threadClear');

function matchCharacters(q){
  q = q.toLowerCase();
  return CHARACTERS.filter(function(ch){
    return ch.name.toLowerCase().indexOf(q) !== -1 || (ch.aka && ch.aka.toLowerCase().indexOf(q) !== -1);
  }).filter(function(ch){ return titlesForChar(ch.id).length > 0; });
}

function renderCharResults(matches){
  if(!matches.length){ charResults.classList.remove('show'); charResults.innerHTML=''; return; }
  charResults.innerHTML = matches.map(function(ch){
    var n = titlesForChar(ch.id).length;
    return '<div class="sr-item" data-char="'+ch.id+'"><span>'+ch.name+(ch.aka ? ' · '+ch.aka : '')+'</span><span class="yr">'+n+' titles</span></div>';
  }).join('');
  charResults.classList.add('show');
  var items = charResults.querySelectorAll('.sr-item');
  items.forEach(function(elx){
    elx.addEventListener('click', function(){
      setActiveThread(elx.dataset.char);
      charResults.classList.remove('show');
      var hits = threadHitsInOrder(elx.dataset.char);
      if(hits.length){
        var order = currentOrder();
        var el = trackEl.children[order.indexOf(hits[0])];
        if(el) el.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
      }
    });
  });
}

charInput.addEventListener('input', function(){
  var q = charInput.value.trim();
  if(!q){
    charResults.classList.remove('show');
    charResults.innerHTML='';
    if(activeThread) setActiveThread(null);
    return;
  }
  renderCharResults(matchCharacters(q).slice(0,10));
});
charInput.addEventListener('focus', function(){
  if(charInput.value.trim()){
    renderCharResults(matchCharacters(charInput.value.trim()).slice(0,10));
  } else {
    var popular = CHARACTERS.filter(function(ch){ return titlesForChar(ch.id).length > 0; })
      .sort(function(a,b){ return titlesForChar(b.id).length - titlesForChar(a.id).length; })
      .slice(0,10);
    renderCharResults(popular);
  }
});
if(threadClearBtn){
  threadClearBtn.addEventListener('click', function(){ setActiveThread(null); });
}

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && activeThread && !detailEl.classList.contains('open') && !roadModalEl.classList.contains('open')){
    setActiveThread(null);
  }
});

/* ---------------------------- RESIZE ---------------------------- */
var resizeTimer;
window.addEventListener('resize', function(){
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function(){
    drawSegments(currentOrder());
    redrawGraph();
    buildMinimap();
  }, 120);
});

/* ---------------------------- INIT ---------------------------- */
function initHintDismiss(){
  var hintEl = document.getElementById('hintBanner');
  var closeBtn = document.getElementById('hintClose');
  if(!hintEl || !closeBtn) return;
  var dismissed = false;
  try{ dismissed = localStorage.getItem('mcuLedgerHintDismissed') === '1'; }catch(e){}
  if(dismissed) hintEl.style.display = 'none';
  closeBtn.addEventListener('click', function(){
    hintEl.style.display = 'none';
    try{ localStorage.setItem('mcuLedgerHintDismissed', '1'); }catch(e){}
  });
}

function initProgressToggle(){
  var panel = document.getElementById('progressPanel');
  var toggle = document.getElementById('progressBreakdownToggle');
  if(!panel || !toggle) return;
  toggle.addEventListener('click', function(){
    var expanded = panel.classList.toggle('expanded');
    toggle.textContent = expanded ? 'Breakdown ▴' : 'Breakdown ▾';
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
}

function init(){
  render();
  initHintDismiss();
  initProgressToggle();
}
loadData();
