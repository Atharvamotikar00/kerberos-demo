// Renders the Client / AS / TGS / Application Server flow diagram as SVG,
// with the six RFC 4120 message hops as labeled arrows. Exposes
// highlightHop(name) so the same diagram instance can be reused inside
// the wizard to spotlight the currently active step.
//
// Silver & Light Blue Y2K Theme:
//   - Silver gradient nodes (no extra inner boxes)
//   - Sparkle/star decorations
//   - Lens flare on active hops
//   - Traveling dot particles along active paths
//   - Stroke-dasharray draw-in on load
//   - Pulsing glow on active nodes
//   - Staggered entrance animation

const NODES = {
  client: { x: 90, y: 260, label: 'Client' },
  as:     { x: 330, y: 90,  label: 'AS' },
  tgs:    { x: 330, y: 260, label: 'TGS' },
  app:    { x: 330, y: 430, label: 'Application\nServer' },
};

const HOPS = [
  { id: 'AS-REQ',  from: 'client', to: 'as',     label: 'AS-REQ',  bend: -18 },
  { id: 'AS-REP',  from: 'as',     to: 'client', label: 'AS-REP',  bend: 18 },
  { id: 'TGS-REQ', from: 'client', to: 'tgs',    label: 'TGS-REQ', bend: -18 },
  { id: 'TGS-REP', from: 'tgs',    to: 'client', label: 'TGS-REP', bend: 18 },
  { id: 'AP-REQ',  from: 'client', to: 'app',    label: 'AP-REQ',  bend: -18 },
  { id: 'AP-REP',  from: 'app',    to: 'client', label: 'AP-REP',  bend: 18 },
];

function nodeCenter(id) {
  const n = NODES[id];
  return { x: n.x + 55, y: n.y + 30 };
}

function pathFor(hop) {
  const from = nodeCenter(hop.from);
  const to = nodeCenter(hop.to);
  const mx = (from.x + to.x) / 2 + hop.bend * (Math.sign(to.y - from.y) || 1);
  const my = (from.y + to.y) / 2 + hop.bend;
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
}

function labelPos(hop) {
  const from = nodeCenter(hop.from);
  const to = nodeCenter(hop.to);
  return {
    x: (from.x + to.x) / 2 + hop.bend * 1.4,
    y: (from.y + to.y) / 2 + hop.bend * 1.2,
  };
}

function bezierPoint(p0, cp, p1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
  };
}

function getControlPoint(hop) {
  const from = nodeCenter(hop.from);
  const to = nodeCenter(hop.to);
  const mx = (from.x + to.x) / 2 + hop.bend * (Math.sign(to.y - from.y) || 1);
  const my = (from.y + to.y) / 2 + hop.bend;
  return { x: mx, y: my };
}

function generateSparkles(count, w, h) {
  const sparkles = [];
  const rng = (seed) => {
    let s = seed;
    return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  };
  const rand = rng(42);
  for (let i = 0; i < count; i++) {
    sparkles.push({
      x: rand() * w, y: rand() * h,
      size: 0.8 + rand() * 2, delay: rand() * 5,
      duration: 2 + rand() * 3, opacity: 0.2 + rand() * 0.5,
    });
  }
  return sparkles;
}

function starPath(cx, cy, outerR, innerR) {
  const points = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return `M${points.join('L')}Z`;
}

export function renderDiagram(container) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 480 520');
  svg.setAttribute('class', 'flow-diagram');

  const sparkles = generateSparkles(18, 480, 520);

  svg.innerHTML = `
    <defs>
      <!-- Silver gradient for nodes -->
      <linearGradient id="silver-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1a2845" />
        <stop offset="25%" stop-color="#1c2e50" />
        <stop offset="50%" stop-color="#223860" />
        <stop offset="75%" stop-color="#1c2e50" />
        <stop offset="100%" stop-color="#1a2845" />
      </linearGradient>

      <!-- Active node gradient (lighter silver) -->
      <linearGradient id="silver-active" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#243a60" />
        <stop offset="30%" stop-color="#2a4470" />
        <stop offset="60%" stop-color="#304e80" />
        <stop offset="100%" stop-color="#2a4470" />
      </linearGradient>

      <!-- Blue active path gradient -->
      <linearGradient id="blue-active" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#7eb8ff" />
        <stop offset="50%" stop-color="#a0d0f8" />
        <stop offset="100%" stop-color="#7eb8ff" />
      </linearGradient>

      <!-- Glow filters -->
      <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
        <feFlood flood-color="#7eb8ff" flood-opacity="0.6" result="color"/>
        <feComposite in="color" in2="blur" operator="in" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>

      <filter id="glow-blue-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
        <feFlood flood-color="#7eb8ff" flood-opacity="0.35" result="color"/>
        <feComposite in="color" in2="blur" operator="in" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>

      <filter id="lens-flare" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur"/>
        <feFlood flood-color="#7eb8ff" flood-opacity="0.15" result="color"/>
        <feComposite in="color" in2="blur" operator="in" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>

      <!-- Arrow markers -->
      <marker id="arrow-idle" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#3d5580" />
      </marker>
      <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#7eb8ff" />
      </marker>

      <!-- Sparkle glow -->
      <radialGradient id="sparkle-glow">
        <stop offset="0%" stop-color="#fff" stop-opacity="1" />
        <stop offset="40%" stop-color="#7eb8ff" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#7eb8ff" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Sparkle decorations -->
    <g class="sparkles">
      ${sparkles.map((s) => `
        <path d="${starPath(s.x, s.y, s.size, s.size * 0.3)}"
              fill="white" opacity="0">
          <animate attributeName="opacity"
                   values="0;${s.opacity};0"
                   dur="${s.duration}s"
                   begin="${s.delay}s"
                   repeatCount="indefinite" />
        </path>
      `).join('')}
    </g>

    <!-- Hops — single path only, no ghost/inner box -->
    <g class="hops">
      ${HOPS.map((h) => {
        const lp = labelPos(h);
        return `
          <g class="hop" data-hop="${h.id}">
            <path class="hop-path" d="${pathFor(h)}" fill="none"
                  stroke="#2a3a5a" stroke-width="2"
                  stroke-linecap="round"
                  marker-end="url(#arrow-idle)" />
            <circle class="travel-dot" r="4" fill="#7eb8ff" opacity="0"
                    filter="url(#glow-blue)" />
            <text x="${lp.x}" y="${lp.y}" text-anchor="middle" class="hop-label">${h.label}</text>
          </g>`;
      }).join('')}
    </g>

    <!-- Lens flare -->
    <g class="lens-flare" opacity="0">
      <circle r="20" fill="url(#sparkle-glow)" filter="url(#lens-flare)" />
      <circle r="4" fill="white" opacity="0.8" />
      <circle r="8" fill="none" stroke="rgba(126,184,255,0.3)" stroke-width="0.5" />
      <circle r="16" fill="none" stroke="rgba(176,200,232,0.2)" stroke-width="0.3" />
    </g>

    <!-- Nodes — single rect, no extra boxes -->
    <g class="nodes">
      ${Object.entries(NODES).map(([id, n]) => `
        <g class="node" data-node="${id}">
          <rect class="node-main" x="${n.x}" y="${n.y}" width="110" height="60" rx="12" />
          <text x="${n.x + 55}" y="${n.y + 34}" text-anchor="middle">
            ${n.label.split('\n').map((line, idx) =>
              `<tspan x="${n.x + 55}" dy="${idx === 0 ? 0 : 14}">${line}</tspan>`
            ).join('')}
          </text>
        </g>
      `).join('')}
    </g>
  `;

  container.innerHTML = '';
  container.appendChild(svg);

  // Entrance animation
  svg.querySelectorAll('.node').forEach((el) => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.6s ease-out';
  });
  svg.querySelectorAll('.hop').forEach((el) => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.5s ease-out';
  });

  requestAnimationFrame(() => {
    svg.querySelectorAll('.node').forEach((el, i) => {
      setTimeout(() => { el.style.opacity = '1'; }, 150 + i * 150);
    });
    svg.querySelectorAll('.hop').forEach((el, i) => {
      setTimeout(() => { el.style.opacity = '1'; }, 500 + i * 120);
    });
  });

  // Stroke-dash draw-in
  svg.querySelectorAll('.hop-path').forEach((path) => {
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    path.style.transition = 'stroke-dashoffset 0.8s ease-out, stroke 0.3s, stroke-width 0.3s';
    setTimeout(() => { path.style.strokeDashoffset = '0'; }, 700);
  });

  // Traveling dot
  const activeAnimations = new Map();

  function startTravelDot(hopGroup, hop) {
    const dot = hopGroup.querySelector('.travel-dot');
    if (!dot) return;
    dot.style.opacity = '1';
    const from = nodeCenter(hop.from);
    const to = nodeCenter(hop.to);
    const cp = getControlPoint(hop);
    let start = null;
    const duration = 1400;

    function frame(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = (elapsed % duration) / duration;
      const pt = bezierPoint(from, cp, to, progress);
      dot.setAttribute('cx', pt.x);
      dot.setAttribute('cy', pt.y);
      dot.setAttribute('opacity', 0.4 + 0.6 * Math.abs(Math.sin(progress * Math.PI)));
      activeAnimations.set(hop.id, requestAnimationFrame(frame));
    }
    activeAnimations.set(hop.id, requestAnimationFrame(frame));
  }

  function stopTravelDot(hopId) {
    const id = activeAnimations.get(hopId);
    if (id) cancelAnimationFrame(id);
    activeAnimations.delete(hopId);
    const group = svg.querySelector(`.hop[data-hop="${hopId}"]`);
    if (group) { const dot = group.querySelector('.travel-dot'); if (dot) dot.style.opacity = '0'; }
  }

  // Node glow (no extra rect — just CSS filter)

  // Lens flare
  const flareGroup = svg.querySelector('.lens-flare');
  function showFlare(x, y) {
    if (!flareGroup) return;
    flareGroup.setAttribute('opacity', '1');
    flareGroup.setAttribute('transform', `translate(${x}, ${y})`);
  }
  function hideFlare() { if (flareGroup) flareGroup.setAttribute('opacity', '0'); }

  // Highlight API
  return {
    highlightHop(hopId) {
      [...activeAnimations.keys()].forEach(stopTravelDot);

      svg.querySelectorAll('.hop').forEach((el) => {
        const isActive = el.dataset.hop === hopId;
        el.classList.toggle('active', isActive);
        const path = el.querySelector('.hop-path');
        const arrow = isActive ? 'url(#arrow-active)' : 'url(#arrow-idle)';
        if (path) {
          path.setAttribute('marker-end', arrow);
          if (isActive) {
            path.setAttribute('stroke', 'url(#blue-active)');
            path.style.strokeDasharray = '0';
            path.style.strokeDashoffset = '0';
            path.style.strokeWidth = '3';
          } else {
            path.setAttribute('stroke', '#2a3a5a');
            path.style.strokeDasharray = 'none';
            path.style.strokeWidth = '2';
          }
        }
      });

      const activeHop = HOPS.find((h) => h.id === hopId);

      svg.querySelectorAll('.node').forEach((el) => {
        const isActive = activeHop && (el.dataset.node === activeHop.from || el.dataset.node === activeHop.to);
        el.classList.toggle('active', !!isActive);
        const mainRect = el.querySelector('.node-main');
        if (mainRect) {
          mainRect.setAttribute('fill', isActive ? 'url(#silver-active)' : 'url(#silver-grad)');
        }
        el.style.filter = isActive ? 'url(#glow-blue-soft)' : '';
      });

      if (activeHop) {
        const hopGroup = svg.querySelector(`.hop[data-hop="${hopId}"]`);
        if (hopGroup) startTravelDot(hopGroup, activeHop);

        const from = nodeCenter(activeHop.from);
        const to = nodeCenter(activeHop.to);
        const cp = getControlPoint(activeHop);
        showFlare(bezierPoint(from, cp, to, 0.5).x, bezierPoint(from, cp, to, 0.5).y);
      } else {
        hideFlare();
      }
    },

    clearHighlight() {
      [...activeAnimations.keys()].forEach(stopTravelDot);
      hideFlare();
      svg.querySelectorAll('.hop, .node').forEach((el) => { el.classList.remove('active'); el.style.filter = ''; });
      svg.querySelectorAll('.hop-path').forEach((path) => {
        path.setAttribute('marker-end', 'url(#arrow-idle)');
        path.setAttribute('stroke', '#2a3a5a');
        path.style.strokeWidth = '2';
      });
      svg.querySelectorAll('.node-main').forEach((rect) => {
        rect.setAttribute('fill', 'url(#silver-grad)');
      });
    },
  };
}
