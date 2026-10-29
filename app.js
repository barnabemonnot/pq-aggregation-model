(function () {
  const M = window.AggModel;
  const DEFAULTS = {
    N: 1000000, totalNodes: 8000, subsPerNode: 2, minMesh: 50, sigRate: 1000, mode: 'gossip', h: 0.1, gossipHops: 3, globalHops: 5, meshD: 8, gossipStyle: 'pull', pullServe: 1, rounds: 2, verifyMs: 3.5, cpuShare: 0.5, bwShare: 0.2,
    tiers: [
      { name: 'Home 7870', share: 10, nodeShare: 87.5, threads: 16, up: 25, down: 50 },
      { name: 'Pro', share: 90, nodeShare: 12.5, threads: 32, up: 1000, down: 1000 },
      { name: 'Min node', share: 0, nodeShare: 0, threads: 8, up: 15, down: 50 },
    ],
    proposerTier: 0, preset: 'oct', proofKiB: 230, sigKiB: 1.2, leafCap: 4000, maxKeys: 65536, maxRec: 16,
    q: 0.33, pOff: 0.05, beta: 0.05, eps: 1e-6,
    shapeMode: 'auto', subnetMode: 'auto', subnets: 64, objective: 'time', tMax: 15, sManual: 1000, kManual: 8, LManual: 2,
    rMode: 'auto', rLeaf: 4, rMid: 8, rTop: 16, deadlinePct: 0.95, rFoldMode: 'auto', rFold: 8,
    roundInterval: 0, wattsPerThread: 7, pricekWh: 0.15, maxStakeETH: 0, cloudPerThreadHour: 0.046, ethPrice: 3000, stakingYield: 0.03,
  };
  let P = JSON.parse(JSON.stringify(DEFAULTS));
  const $ = id => document.getElementById(id);
  const NUM = ['deadlinePct', 'totalNodes', 'subsPerNode', 'minMesh', 'sigRate', 'verifyMs', 'gossipHops', 'globalHops', 'meshD', 'pullServe', 'cpuShare', 'bwShare', 'proofKiB', 'sigKiB', 'leafCap', 'maxKeys', 'maxRec',
    'q', 'pOff', 'beta', 'tMax', 'subnets', 'sManual', 'kManual', 'LManual', 'rLeaf', 'rMid', 'rTop', 'rFold', 'roundInterval', 'wattsPerThread', 'pricekWh', 'maxStakeETH', 'cloudPerThreadHour', 'ethPrice', 'stakingYield'];

  // quantities stored as fractions but edited as percentages
  const PCT = new Set(['deadlinePct', 'cpuShare', 'bwShare', 'q', 'pOff', 'beta', 'stakingYield']);
  const fmt = (x, d = 1) => x == null || !isFinite(x) ? '–' : x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmt0 = x => fmt(x, 0);
  const sec = x => x < 1 ? fmt(x * 1000, 0) + ' ms' : fmt(x, 2) + ' s';
  const bytes = b => b >= 1e9 ? fmt(b / 1e9, 2) + ' GB' : b >= 1e6 ? fmt(b / 1e6, 1) + ' MB' : fmt(b / 1e3, 0) + ' kB';
  const pct = x => x < 0.001 ? '<0.1%' : fmt(x * 100, 1) + '%';
  const sci = x => x === 0 ? '0' : x >= 0.01 ? fmt(x, 3) : x.toExponential(1);

  function bindSeg(id, key) {
    $(id).querySelectorAll('button').forEach(b => b.onclick = () => { P[key] = b.dataset.v; sync(); update(); });
  }
  function sync() {
    NUM.forEach(k => { $(k).value = PCT.has(k) ? +(P[k] * 100).toFixed(2) : P[k]; });
    $('h').value = Math.round(P.h * 2000); $('h_n').value = Math.round(P.h * 2000);
    $('N').value = P.N; $('logN').value = Math.log10(P.N);
    $('preset').value = P.preset; $('objective').value = P.objective; $('eps').value = String(P.eps);
    $('roundsSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === +P.rounds));
    ['gossipStyle', 'shapeMode', 'subnetMode', 'rMode', 'rFoldMode'].forEach(id => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === P[id])));
    $('autoBox').style.display = P.shapeMode === 'auto' ? '' : 'none';
    $('manualBox').style.display = P.shapeMode === 'manual' ? '' : 'none';
    $('rBox').style.display = P.rMode === 'manual' ? '' : 'none';
    $('subnets').parentElement.style.display = P.subnetMode === 'fixed' ? '' : 'none';
    $('pullServe').parentElement.style.display = P.gossipStyle === 'pull' ? '' : 'none';
    $('rFold').parentElement.style.display = P.rFoldMode === 'manual' ? '' : 'none';
    $('tMax').parentElement.style.display = P.objective === 'work' ? '' : 'none';
    // tiers
    const cols = [['name', 'Tier'], ['nodeShare', 'nodes%'], ['share', 'stake%'], ['threads', 'thr'], ['up', 'up'], ['down', 'down']];
    const b = stakeBounds();
    $('tiers').innerHTML = '<tr>' + cols.map((c, j) => `<th${j === 0 ? ' style="width:24%"' : ''}>${c[1]}</th>`).join('') + '<th>val/<br>node</th></tr>' +
      P.tiers.map((t, i) => '<tr>' + cols.map(c => {
        const v = c[0] === 'share' || c[0] === 'nodeShare' ? +(+t[c[0]]).toFixed(1) : t[c[0]];
        const extra = c[0] === 'share' ? ` min="${b.lo[i].toFixed(1)}" max="${b.hi[i].toFixed(1)}" step="0.1" title="Feasible: ${b.lo[i].toFixed(1)}–${b.hi[i].toFixed(1)}%"` : '';
        if (c[0] === 'name') return `<td class="tname" title="${t.name}">${t.name}</td>`;
        return `<td><input data-i="${i}" data-k="${c[0]}" value="${v}" type="number"${extra}></td>`;
      }).join('') + `<td class="vpn">${fmt0(vpnOf(t))}</td></tr>`).join('');
    $('tiers').querySelectorAll('input').forEach(inp => inp.onchange = () => {
      const i = +inp.dataset.i, k = inp.dataset.k, t = P.tiers[i];
      if (k === 'name') { t.name = inp.value; sync(); update(); return; }
      if (k === 'share' || k === 'nodeShare') rebalance(k, i, +inp.value);
      else t[k] = Math.max(0, +inp.value);
      sync(); update();
    });
    const tot = P.tiers.reduce((s, t) => s + b.hiRaw(t), 0);
    $('tierNote').innerHTML = b.feasible
      ? (isFinite(capVals()) ? `${fmt0(P.totalNodes)} nodes × up to ${fmt0(capVals())} validators = ${fmt0(P.totalNodes * capVals())} validator slots for N = ${fmt0(P.N)}. Each tier's stake % is limited to what its nodes can hold (hover a stake box for its range).`
        : `${fmt0(P.totalNodes)} nodes, no per-node stake cap. Validators per node follow from each tier's stake and node shares.`)
      : `<span class="warn">Infeasible: ${fmt0(P.totalNodes)} nodes × ${fmt0(capVals())} validators per node can hold at most ${fmt0(P.totalNodes * capVals())} validators &lt; N = ${fmt0(P.N)}. Raise the node count or the max stake per node.</span>`;
    $('proposerTier').innerHTML = P.tiers.map((t, i) => `<option value="${i}" ${i === +P.proposerTier ? 'selected' : ''}>${t.name}</option>`).join('');
  }

  // ---- node-count constraint: tier validators per node = stake share × N ÷ (node share × total nodes) ≤ cap
  const capVals = () => P.maxStakeETH > 0 ? Math.max(1, Math.floor(P.maxStakeETH / 32)) : Infinity;
  function vpnOf(t) {
    const nodes = t.nodeShare / 100 * P.totalNodes;
    return nodes > 0 ? (t.share / 100) * P.N / nodes : 0;
  }
  function stakeBounds() {
    const hiRaw = t => t.nodeShare <= 0 ? 0 : Math.min(100, 100 * capVals() * (t.nodeShare / 100) * P.totalNodes / P.N);
    const hi = P.tiers.map(hiRaw);
    const sumHi = hi.reduce((s, x) => s + x, 0);
    const lo = hi.map((h, i) => Math.max(0, 100 - (sumHi - h)));
    return { hi, lo, hiRaw, feasible: sumHi >= 100 - 1e-9 };
  }
  // fill `total` across tiers (except `skip`) within [0, hi], proportional to current values
  function waterFill(key, total, hi, skip) {
    const idx = P.tiers.map((_, i) => i).filter(i => i !== skip);
    let x = idx.map(i => Math.min(hi[i], P.tiers[i][key]));
    const sum = x.reduce((s, v) => s + v, 0), diff = total - sum;
    const room = idx.map((i, j) => diff > 0 ? hi[i] - x[j] : x[j]);
    const R = room.reduce((s, v) => s + v, 0);
    if (R > 1e-12 && Math.abs(diff) > 1e-12) {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), R);
      x = x.map((v, j) => v + step * room[j] / R);
    }
    idx.forEach((i, j) => { P.tiers[i][key] = Math.max(0, Math.min(hi[i], x[j])); });
  }
  function rebalance(key, idx, value) {
    if (key === 'nodeShare') {
      P.tiers[idx].nodeShare = Math.max(0, Math.min(100, value));
      waterFill('nodeShare', 100 - P.tiers[idx].nodeShare, P.tiers.map(() => 100), idx);
    }
    const b = stakeBounds();
    if (key === 'share') {
      P.tiers[idx].share = Math.max(b.lo[idx], Math.min(b.hi[idx], value));
      waterFill('share', 100 - P.tiers[idx].share, b.hi, idx);
    } else {
      // node shares or global inputs changed: keep stake shares, clamp to new bounds
      P.tiers.forEach((t, i) => { t.share = Math.min(b.hi[i], t.share); });
      const sum = P.tiers.reduce((s, t) => s + t.share, 0);
      if (sum < 100) waterFill('share', 100, b.hi, -1);
    }
  }

  function params(over) {
    const p = Object.assign({}, P, over || {});
    p.proposerTier = +p.proposerTier;
    const cap = capVals();
    p.tiers = p.tiers.map(t => ({ ...t, vpn: Math.max(1, Math.min(cap, vpnOf(t) || 1)) }));
    p.eps = +p.eps;
    return p;
  }

  // ---- tooltip
  const tip = $('tip');
  function showTip(e, html) {
    tip.innerHTML = html; tip.style.display = 'block';
    const w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = e.clientX + 12, y = e.clientY + 12;
    if (x + w > window.innerWidth - 8) x = Math.max(8, e.clientX - w - 12);
    if (y + hgt > window.innerHeight - 8) y = Math.max(8, e.clientY - hgt - 12);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  function drawTimeline(r) {
    const svg = $('timeline');
    const W = svg.clientWidth || 800, H = 120, pad = 10, y = 18, bh = 34;
    const total = r.round;
    const sx = (W - 2 * pad) / total;
    // compute: red fill with white dots; network: white fill with red dots and red outline
    let x = pad, out = `<defs>
      <pattern id="dotsCpu" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><rect width="9" height="9" fill="var(--accent)"></rect><circle cx="2.25" cy="2.25" r="1.6" fill="#fff"></circle><circle cx="6.75" cy="6.75" r="1.6" fill="#fff"></circle></pattern>
      <pattern id="dotsNet" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><rect width="9" height="9" fill="#fff"></rect><circle cx="2.25" cy="2.25" r="1.6" fill="var(--accent)"></circle><circle cx="6.75" cy="6.75" r="1.6" fill="var(--accent)"></circle></pattern>
    </defs>`;
    r.phases.forEach((ph, i) => {
      const w = Math.max(0, ph.t * sx);
      const cpu = ph.kind === 'cpu';
      out += `<rect data-i="${i}" x="${x + 1.5}" y="${y + 0.5}" width="${Math.max(0.5, w - 3)}" height="${bh - 1}" rx="4" fill="url(#${cpu ? 'dotsCpu' : 'dotsNet'})" stroke="var(--accent)" stroke-width="1"></rect>`;
      if (w > 46) out += `<text x="${x + w / 2}" y="${y + bh + 14}" text-anchor="middle">${sec(ph.t)}</text>`;
      x += w;
    });
    // axis
    const step = total > 20 ? 5 : total > 8 ? 2 : total > 3 ? 1 : 0.5;
    for (let t = 0; t <= total + 1e-9; t += step) {
      const xx = pad + t * sx;
      out += `<line x1="${xx}" x2="${xx}" y1="${y + bh + 22}" y2="${y + bh + 27}" stroke="var(--text-muted)"></line><text x="${xx}" y="${y + bh + 40}" text-anchor="middle">${fmt(t, step < 1 ? 1 : 0)} s</text>`;
    }
    out += `<text x="${pad}" y="11">Round = ${sec(r.round)}; finality = ${P.rounds} × round = ${sec(r.finality)}</text>`;
    svg.innerHTML = out;
    svg.querySelectorAll('rect').forEach(el => {
      const ph = r.phases[+el.dataset.i];
      el.onmousemove = e => showTip(e, `<b>${ph.name}</b><br>${ph.kind === 'cpu' ? 'Compute' : 'Network'}: ${sec(ph.t)}<br>${pct(ph.t / r.round)} of the round`);
      el.onmouseleave = hideTip;
    });
    $('phaseTable').innerHTML = '<tr><th>Phase</th><th>Type</th><th>Time</th><th>Share</th></tr>' +
      r.phases.map(ph => `<tr><td>${ph.name}</td><td>${ph.kind === 'cpu' ? 'compute' : 'network'}</td><td>${sec(ph.t)}</td><td>${pct(ph.t / r.round)}</td></tr>`).join('');
  }

  function drawTree(r) {
    const tiers = P.tiers;
    $('treeHint').innerHTML = `Leaf size <b>${fmt0(r.s)}</b>, fan-in <b>${r.k}</b>, <b>${r.L}</b> merge level${r.L > 1 ? 's' : ''}, ${fmt0(r.roots)} root proofs folded by <b>${r.fold.r}</b> independent folders (P(all fail) ≈ ${sci(r.risk.pFold)}). ` +
      (P.mode === 'gossip' ? `Gossip subnets: <b>${fmt0(r.subnets)}</b> with ~${fmt0(r.subscribersPerSubnet)} subscribing nodes each (cap ${fmt0(M.maxSubnets(params()))} subnets for ≥ ${fmt0(P.minMesh)} nodes per subnet); ${fmt0(r.sigsPerSubnet)} signatures per subnet take ${sec(r.sigsPerSubnet / P.sigRate)} to disseminate. ` : 'Directed: attesters send signatures straight to their leaf aggregators, no subnet topics. ') +
      `Expected vote loss ${pct(r.risk.expLoss)} (${pct(r.risk.safetyLoss)} from failed aggregators, ${pct(r.risk.deadlineLoss)} from jobs dropped at the ${fmt(P.deadlinePct * 100, 0)}% level deadline); loss bound P(loss &gt; β) ≤ ${sci(r.risk.risk)}.` + (r.risk.expLoss > P.beta ? ' <span class="warn">Expected loss exceeds β.</span>' : '');
    $('treeTable').innerHTML = '<tr><th>Level</th><th>Groups</th><th>Signers each</th><th>r</th><th>Jobs</th><th>AWU / job</th>' +
      tiers.map(t => `<th>Job time: ${t.name}</th>`).join('') + '<th>Phase</th><th>Paced by</th></tr>' +
      r.levels.map(l => `<tr><td>${l.l === 0 ? 'Leaves' : 'Merge ' + l.l}</td><td>${fmt0(l.G)}</td><td>${fmt0(l.cov)}</td><td>${l.r}</td><td>${fmt0(l.jobs)}</td><td>${fmt(r.workPerJob[l.l], 2)}</td>` +
        l.times.map(t => `<td>${sec(t)}</td>`).join('') + `<td>${sec(l.phase)}</td><td>${tiers[l.waitTier] ? tiers[l.waitTier].name : ''}</td></tr>`).join('') +
      `<tr><td>Fold</td><td>1</td><td>${fmt0(P.N)}</td><td>${r.fold.r}</td><td>${r.fold.r}</td><td>${fmt(r.foldWork, 2)}</td>` +
        r.fold.times.map(t => `<td>${sec(t)}</td>`).join('') + `<td>${sec(r.fold.phase)}</td><td>${tiers[r.fold.waitTier] ? tiers[r.fold.waitTier].name : ''}</td></tr>`;
  }

  function drawTreeSvg(r) {
    const svg = $('treeSvg');
    const rows = r.levels.map(l => ({ label: l.l === 0 ? 'Leaves' : (l.l === r.L ? `Merge ${l.l} (roots)` : `Merge ${l.l}`), G: l.G, cov: l.cov, r: l.r, t: l.phase }));
    rows.push({ label: 'Folders (block proof)', G: r.fold.r, cov: P.N, r: r.fold.r, t: r.fold.phase, fold: true });
    rows.push({ label: 'Proposer', G: 1, cov: P.N, r: 1, t: r.phases.find(p => p.name === 'Block proof to proposer').t, prop: true });
    const W = svg.clientWidth || 900, narrow = W < 600, rowH = narrow ? 74 : 46, top = 18, H = top + rows.length * rowH + 6;
    svg.setAttribute('height', H);
    const left = 20, right = narrow ? W - 10 : Math.max(left + 200, W - 330), MAXSHOW = narrow ? 8 : 12;
    let out = '';
    const ys = rows.map((_, i) => top + (rows.length - 1 - i) * rowH + 14);
    const xsOf = (n) => { const m = Math.min(n, MAXSHOW); const span = right - left; return Array.from({ length: m }, (_, j) => m === 1 ? (left + right) / 2 : left + 10 + j * (span - 40) / (m - 1)); };
    const pos = rows.map(rw => xsOf(rw.G));
    // edges: children of the first parent at each level, drawn to that parent
    for (let i = 1; i < rows.length; i++) {
      const fan = (rows[i].fold || rows[i].prop) ? rows[i - 1].G : r.k;
      const nKids = Math.min(fan, pos[i - 1].length);
      for (let j = 0; j < nKids; j++) out += `<line x1="${pos[i - 1][j]}" y1="${ys[i - 1]}" x2="${pos[i][0]}" y2="${ys[i]}" stroke="var(--text-muted)" stroke-width="1"></line>`;
    }
    rows.forEach((rw, i) => {
      pos[i].forEach((x, j) => {
        out += `<circle cx="${x}" cy="${ys[i]}" r="${rw.prop ? 8 : 6}" fill="${rw.prop ? 'var(--accent)' : 'var(--series-1)'}" stroke="var(--surface-1)" stroke-width="2" data-i="${i}"></circle>`;
      });
      if (rw.G > MAXSHOW) out += `<text x="${right - 14}" y="${ys[i] - 10}" text-anchor="end">… ${fmt0(rw.G)} total</text>`;
      const desc = rw.prop ? `includes the first valid block proof · receive ${sec(rw.t)}`
        : rw.fold ? `${rw.r} folders, each folds all ${fmt0(r.roots)} roots in ${r.foldLevels} step${r.foldLevels === 1 ? '' : 's'} · ${sec(rw.t)}`
        : `${fmt0(rw.G)} proofs · ${fmt0(rw.cov)} signers each · r = ${rw.r} · ${sec(rw.t)}`;
      const halo = 'paint-order:stroke;stroke:var(--surface-1);stroke-width:4px;stroke-linejoin:round;';
      if (narrow) out += `<text x="${left}" y="${ys[i] + 22}" style="${halo}font-weight:600;fill:var(--text-primary)">${rw.label}</text><text x="${left}" y="${ys[i] + 36}" style="${halo}">${desc}</text>`;
      else out += `<text x="${right + 16}" y="${ys[i] - 2}" style="font-weight:600;fill:var(--text-primary)">${rw.label}</text><text x="${right + 16}" y="${ys[i] + 12}">${desc}</text>`;
    });
    svg.innerHTML = out;
    svg.querySelectorAll('circle').forEach(c => {
      const rw = rows[+c.dataset.i];
      c.onmousemove = e => showTip(e, `<b>${rw.label}</b><br>${rw.prop ? 'Includes the first valid block proof it receives' : rw.fold ? `${rw.r} independent folders; any one suffices` : `${fmt0(rw.G)} proofs of ${fmt0(rw.cov)} signers, each computed by ${rw.r} aggregators`}<br>Phase: ${sec(rw.t)}`);
      c.onmouseleave = hideTip;
    });
    const chain = [`${fmt0(P.N)} signatures`].concat(r.levels.map((l, i) => i === 0 ? (P.mode === 'gossip' ? `${fmt0(r.subnets)} subnets × ${r.groupsPerSubnet} leaf group${r.groupsPerSubnet > 1 ? 's' : ''} (${fmt0(l.G)} leaves of ${fmt0(r.s)})` : `${fmt0(l.G)} leaf groups of ${fmt0(r.s)}`) : `${fmt0(l.G)}`), [`${r.fold.r} folders`, 'proposer']).join(' → ');
    $('treeSummary').innerHTML = `<b>${r.L} merge level${r.L === 1 ? '' : 's'}</b> + fold layer, fan-in ${r.k}: ${chain}`;
  }

  function drawNodes(r) {
    const yieldUSD = P.ethPrice * P.stakingYield;
    const money = x => '$' + fmt(x, x < 10 ? 2 : 0);
    $('costSummary').innerHTML = `<b>Network: ${money(r.net.energy)}/yr electricity</b> (${fmt0(r.net.kwh / 1000)} MWh) · <b>${money(r.net.cloud)}/yr</b> if the same thread-hours were rented in the cloud (${fmt0(r.net.threadHours)} thread-hours/yr). ` +
      `Per ETH staked: <b>${money(r.net.perETHEnergy)}</b> (electricity) to <b>${money(r.net.perETHCloud)}</b> (cloud) per year, i.e. ${pct(r.net.perETHEnergy / yieldUSD)}–${pct(r.net.perETHCloud / yieldUSD)} of staking rewards (${pct(P.stakingYield)} yield at $${fmt0(P.ethPrice)}/ETH), or ${(100 * r.net.perETHEnergy / P.ethPrice).toFixed(4)}%–${(100 * r.net.perETHCloud / P.ethPrice).toFixed(4)}% of stake per year. ` +
      `Assumes rounds run ${P.roundInterval > 0 ? 'every ' + P.roundInterval + ' s' : 'back to back'} (${fmt0(r.roundsPerYear)} rounds/yr).`;
    $('nodeTable').innerHTML = '<tr><th>Tier</th><th>Nodes</th><th>Validators / node</th><th>P(sampled)</th><th>Expected jobs</th><th>Busy thread-s</th><th>CPU duty</th><th>Upload</th><th>Download</th><th>kWh / yr</th><th>$ / yr (power)</th><th>$ / yr (cloud)</th><th>$ / ETH / yr (power – cloud)</th></tr>' +
      r.perTier.filter(t => t.nodes > 0).map(t => `<tr><td>${t.name}</td><td>${fmt0(t.nodes)}</td><td>${fmt0(t.vpn)}</td><td>${pct(Math.min(1, 1 - Math.pow(1 - t.pSampled, P.rounds)))}</td><td>${fmt(t.expJobs, 3)}</td><td>${fmt(t.busy, 2)}</td><td>${pct(t.duty)}</td><td>${bytes(t.up)}</td><td>${bytes(t.down)}</td><td>${fmt0(t.kwh)}</td><td>${money(t.cost)}</td><td>${money(t.cloud)}</td><td>${money(t.cost / t.stakeETH)} – ${money(t.cloud / t.stakeETH)}</td></tr>`).join('') +
      `<tr><td>Per validator</td><td>1</td><td></td><td>${fmt(r.perTier.length ? r.perTier[0].expJobs / Math.max(1, r.perTier[0].vpn) : 0, 4)}</td><td>${fmt(r.perValidatorAWU * M.AWU_SECONDS, 3)}</td><td></td><td></td><td></td><td></td><td></td></tr>`;
  }

  function drawTiles(r) {
    const tiles = [
      [sec(r.finality), 'Time to finality', `${P.rounds} rounds × ${sec(r.round)}`],
      [fmt0(r.totalAWU), 'Total work per finality (AWU)', `≈ ${fmt0(r.totalAWU * M.AWU_SECONDS / 3600)} thread-hours`],
      [fmt(r.perValidatorAWU, 3), 'Work per validator (AWU)', `≈ ${sec(r.perValidatorAWU * M.AWU_SECONDS)} of one thread`],
      ['$' + fmt0(r.net.energy), 'Network cost per year (electricity)', `$${fmt0(r.net.cloud)} if rented as cloud thread-hours`],
    ];
    const AWU_DEF = '<b>AWU (aggregation work unit)</b><br>The CPU work to prove one leaf of 100 PQ signatures on a single thread of the reference machine (Intel Xeon Gold 6548N, leanVM benchmark: 1.005 s).<br><br>Merge jobs use the same unit: a 2→1 merge ≈ 0.61 AWU, 4→1 ≈ 1.24 AWU.<br><br>AWU counts single-thread-equivalent work. Running a job on many threads finishes sooner but burns more thread-seconds (≈ 2.1 thread-s per AWU at 16 threads); cost figures use thread-seconds.';
    $('mobileBar').innerHTML = `<b>${sec(r.finality)}</b> to finality · ${P.mode === 'gossip' ? 'gossip' : 'directed'} · ${fmt0(P.N)} validators`;
    $('tiles').innerHTML = tiles.map(t => `<div class="card tile">${/AWU/.test(t[1]) ? '<span class="info" tabindex="0" aria-label="What is an AWU?">i</span>' : ''}<div class="v">${t[0]}</div><div class="l">${t[1]}</div><div class="d">${t[2]}</div></div>`).join('');
    $('tiles').querySelectorAll('.info').forEach(el => {
      el.onmousemove = e => showTip(e, AWU_DEF);
      el.onmouseleave = hideTip;
      el.onfocus = () => { const b = el.getBoundingClientRect(); showTip({ clientX: b.left, clientY: b.bottom }, AWU_DEF); };
      el.onblur = hideTip;
    });
  }

  function drawSens() {
    const svg = $('sens');
    const W = svg.clientWidth || 800, H = 260, ml = 48, mr = 16, mt = 12, mb = 34;
    const HMAX = 0.3; const hs = []; for (let h = 0; h <= HMAX + 1e-9; h += 0.015) hs.push(+h.toFixed(3));
    const series = ['gossip', 'directed'].map(mode => hs.map(h => { const r = M.run(params({ h, mode })); return r ? r.finality : null; }));
    const ymax = Math.max(...series.flat().filter(v => v != null), 1) * 1.1;
    const sx = h => ml + (h / HMAX) * (W - ml - mr), sy = v => mt + (1 - v / ymax) * (H - mt - mb);
    let out = '';
    const ystep = ymax > 60 ? 20 : ymax > 30 ? 10 : ymax > 12 ? 5 : 2;
    for (let v = 0; v <= ymax; v += ystep) out += `<line x1="${ml}" x2="${W - mr}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--grid)"></line><text x="${ml - 6}" y="${sy(v) + 4}" text-anchor="end">${v} s</text>`;
    for (let h = 0; h <= HMAX + 1e-9; h += (W < 600 ? 0.1 : 0.05)) out += `<text x="${sx(h)}" y="${H - mb + 16}" text-anchor="middle">${fmt(h * 2000, 0)} ms</text>`;
    out += `<text x="${(W) / 2}" y="${H - 4}" text-anchor="middle">network RTT</text>`;
    // selected network type in the accent colour, the other greyed out; selected drawn last (on top)
    const sel = P.mode === 'gossip' ? 0 : 1;
    const cols = [0, 1].map(i => i === sel ? 'var(--accent)' : '#c8c8c8');
    [1 - sel, sel].forEach(i => {
      const s = series[i];
      const pts = s.map((v, j) => v == null ? null : `${sx(hs[j])},${sy(v)}`).filter(Boolean).join(' ');
      out += `<polyline points="${pts}" fill="none" stroke="${cols[i]}" stroke-width="${i === sel ? 2.5 : 2}"></polyline>`;
      const last = s[s.length - 1];
      if (last != null) out += `<text x="${sx(hs[hs.length - 1]) - 4}" y="${sy(last) - 6}" text-anchor="end" style="fill:${i === sel ? 'var(--text-primary)' : 'var(--text-muted)'};${i === sel ? 'font-weight:600' : ''}">${i ? 'Directed' : 'Gossip'}</text>`;
    });
    $('sensLegend').innerHTML = ['Gossip', 'Directed'].map((n, i) => `<span style="color:${i === sel ? 'var(--text-primary)' : 'var(--text-muted)'}"><span class="sw" style="background:${cols[i]}"></span>${n}${i === sel ? ' (selected)' : ''}</span>`).join('');
    const cur = M.run(params());
    if (cur) out += `<circle cx="${sx(P.h)}" cy="${sy(cur.finality)}" r="5" fill="var(--accent)" stroke="var(--surface-1)" stroke-width="2"></circle>`;
    out += `<line id="xh" y1="${mt}" y2="${H - mb}" stroke="var(--text-muted)" stroke-dasharray="3 3" style="display:none"></line>`;
    out += `<rect x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" fill="transparent" id="hit"></rect>`;
    svg.innerHTML = out;
    const hit = svg.querySelector('#hit'), xh = svg.querySelector('#xh');
    hit.onmousemove = e => {
      const rect = svg.getBoundingClientRect();
      const h = Math.min(HMAX, Math.max(0, ((e.clientX - rect.left) - ml) / (W - ml - mr) * HMAX));
      let j = 0; hs.forEach((v, k) => { if (Math.abs(v - h) < Math.abs(hs[j] - h)) j = k; });
      xh.setAttribute('x1', sx(hs[j])); xh.setAttribute('x2', sx(hs[j])); xh.style.display = '';
      showTip(e, `RTT = ${fmt(hs[j] * 2000, 0)} ms<br>Gossip: ${sec(series[0][j])}<br>Directed: ${sec(series[1][j])}`);
    };
    hit.onmouseleave = () => { hideTip(); xh.style.display = 'none'; };
  }

  function drawNet(r) {
    const svg = $('netDiagram');
    const W = Math.max(360, svg.clientWidth || 360), H = 190;
    const tot = P.tiers.reduce((s, t) => s + t.share, 0) || 1;
    const KiB = P.proofKiB * 1024, bps = m => m * 125000;
    const pull = P.gossipStyle === 'pull', gCopies = pull ? P.pullServe : P.meshD, lat = (pull ? 3 : 1) * P.h;
    const gossipSer = P.tiers.reduce((s, t) => s + (t.share / tot) * gCopies * KiB / bps(t.up * P.bwShare), 0);
    const gossipT = P.gossipHops * (lat + gossipSer);
    const copies = r && r.rs.length > 1 ? r.rs[1] : 4;
    const homeUp = P.tiers[0] ? P.tiers[0].up : 25, proUp = P.tiers[1] ? P.tiers[1].up : 1000;
    const dirHome = P.h + copies * KiB / bps(homeUp * P.bwShare), dirPro = P.h + copies * KiB / bps(proUp * P.bwShare);
    const g = P.mode === 'gossip', on = 'var(--text-primary)', off = 'var(--text-muted)';
    const node = (x, y, c, rr = 6) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${c}" stroke="var(--surface-1)" stroke-width="2"></circle>`;
    const arrow = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1.5" marker-end="url(#ah)"></line>`;
    const PH = 108, gap = 8, dW = Math.min(150, W * 0.42), tx = dW + 14;
    svg.setAttribute('viewBox', `0 0 ${W} ${2 * PH + gap + 4}`);
    svg.removeAttribute('height');
    let out = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted)"></path></marker></defs>`;
    const panel = (y0, active, col, title, lines) => {
      out += `<rect class="frame" x="1" y="${y0 + 1}" width="${W - 2}" height="${PH}" rx="8" fill="${active ? 'var(--surface-1)' : 'transparent'}" stroke="${active ? 'var(--accent)' : 'var(--border)'}" stroke-width="${active ? 1.5 : 1}"></rect>`;
      out += `<text x="10" y="${y0 + 18}" style="font-weight:600;fill:${active ? on : off}">${title}</text>`;
      lines.forEach((l, i) => { out += `<text x="${tx}" y="${y0 + 34 + i * 18}" style="${i === lines.length - 1 ? 'font-weight:600;fill:' + (active ? on : off) : ''}">${l}</text>`; });
    };
    // gossip
    out += `<g class="pick" data-mode="gossip" tabindex="0" role="button" aria-pressed="${g}" aria-label="Use gossip propagation">`;
    const gc = g ? 'var(--accent)' : off, gy = 62;
    panel(0, g, 'var(--series-1)', pull ? 'Gossip · pull' : 'Gossip · push', pull ? [`${P.gossipHops} hops × (1.5 RTT + c·size ÷ up)`, `= ${P.gossipHops}×(${fmt0(P.h * 3000)}ms + ${P.pullServe}×${P.proofKiB}KiB÷up)`, `announce → request → data`, `≈ ${sec(gossipT)} per level`] : [`${P.gossipHops} hop${P.gossipHops > 1 ? 's' : ''} × (½ RTT + D·size ÷ up)`, `= ${P.gossipHops} × (${fmt0(P.h * 1000)} ms + ${P.meshD} × ${P.proofKiB} KiB ÷ up)`, `relays re-upload to D = ${P.meshD} peers`, `≈ ${sec(gossipT)} per level`]);
    const hops = Math.max(1, Math.min(3, P.gossipHops)), stepX = (dW - 30) / hops;
    out += node(16, gy, gc, 7);
    let frontier = [[16, gy]];
    for (let s = 1; s <= hops; s++) {
      const x = 16 + s * stepX, n = Math.min(4, s + 2), next = [];
      for (let j = 0; j < n; j++) next.push([x, gy - 30 + j * (60 / (n - 1))]);
      next.forEach(([x, y], j) => { const [px, py] = frontier[Math.min(frontier.length - 1, Math.floor(j * frontier.length / next.length))]; out += arrow(px + 6, py, x - 7, y, off); out += node(x, y, gc, 5); });
      frontier = next;
    }
    out += `</g>`;
    // directed
    out += `<g class="pick" data-mode="directed" tabindex="0" role="button" aria-pressed="${!g}" aria-label="Use directed propagation">`;
    const y1 = PH + gap, dc = !g ? 'var(--accent)' : off, dy = y1 + 62;
    panel(y1, !g, 'var(--series-2)', 'Directed', [`1 hop: ½ RTT + copies·size ÷ up`, `to ${copies} known parent copies`, `${sec(dirHome)} at ${homeUp} Mbps up × ${P.bwShare}`, `${sec(dirPro)} at ${proUp} Mbps up × ${P.bwShare}`]);
    out += node(16, dy, dc, 7);
    const nShow = Math.min(copies, 5);
    for (let j = 0; j < nShow; j++) { const y = dy - 30 + j * (60 / Math.max(1, nShow - 1)); const x = dW - 10; out += arrow(23, dy, x - 7, y, off); out += node(x, y, dc, 5); }
    out += `</g>`;
    svg.innerHTML = out;
    svg.querySelectorAll('.pick').forEach(el => {
      const choose = () => { if (P.mode !== el.dataset.mode) { P.mode = el.dataset.mode; update(); } };
      el.onclick = choose;
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } };
    });
    $('netInfo').dataset.tip = `Time for one ${P.proofKiB} KiB proof to move up one level. Network-wide broadcasts (final block proof; in gossip mode also the block proof to the proposer) use ${P.globalHops} hops: ≈ ${sec(P.globalHops * (lat + gossipSer))}. Gossip uses the stake-weighted average upload of relays; directed is shown for the first two hardware tiers. Receiving k child proofs (size ÷ download) is added in the timeline.`;
  }

  let timer = null;
  function update() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const r = M.run(params());
      if (!r) {
        $('tiles').innerHTML = '<div class="card tile"><div class="l warn">No feasible configuration: relax ε, β, q, or the leaf / key limits.</div></div>';
        return;
      }
      drawTiles(r); drawTimeline(r); drawTree(r); drawTreeSvg(r); drawNet(r); drawNodes(r); drawSens();
    }, 60);
  }

  // keep each info icon glued to the last word of its label so it never wraps alone
  function glueIcons(root) {
    root.querySelectorAll('label .info, h3 .info').forEach(icon => {
      const prev = icon.previousSibling;
      if (!prev || prev.nodeType !== 3 || icon.parentElement.classList.contains('nowrap')) return;
      const text = prev.textContent.replace(/\s+$/, '');
      const cut = text.lastIndexOf(' ');
      prev.textContent = cut >= 0 ? text.slice(0, cut + 1) : '';
      const span = document.createElement('span');
      span.className = 'nowrap';
      span.textContent = cut >= 0 ? text.slice(cut + 1) : text;
      icon.parentElement.insertBefore(span, icon);
      span.appendChild(icon);
    });
  }

  function bindTips(root) {
    root.querySelectorAll('[data-tip]').forEach(el => {
      el.onmousemove = e => showTip(e, el.dataset.tip);
      el.onmouseleave = hideTip;
      el.onfocus = () => { const b = el.getBoundingClientRect(); showTip({ clientX: b.left, clientY: b.bottom }, el.dataset.tip); };
      el.onblur = hideTip;
      el.onclick = e => e.preventDefault();
    });
  }

  // ---- wiring
  NUM.forEach(k => $(k).addEventListener('change', () => {
    P[k] = PCT.has(k) ? +$(k).value / 100 : +$(k).value;
    if (k === 'totalNodes' || k === 'maxStakeETH') { P.totalNodes = Math.max(1, Math.round(P.totalNodes)); rebalance('global', -1); sync(); }
    update();
  }));
  // latency is edited as RTT in ms, stored as one-way seconds (h = RTT / 2)
  $('h').addEventListener('input', () => { P.h = +$('h').value / 2000; $('h_n').value = $('h').value; update(); });
  $('h_n').addEventListener('change', () => { P.h = Math.max(0, +$('h_n').value) / 2000; $('h').value = $('h_n').value; update(); });
  $('logN').addEventListener('input', () => { P.N = Math.round(Math.pow(10, +$('logN').value) / 1000) * 1000; $('N').value = P.N; rebalance('global', -1); sync(); update(); });
  $('N').addEventListener('change', () => { P.N = Math.max(1000, +$('N').value); $('logN').value = Math.log10(P.N); rebalance('global', -1); sync(); update(); });
  $('preset').onchange = () => { P.preset = $('preset').value; update(); };
  $('objective').onchange = () => { P.objective = $('objective').value; sync(); update(); };
  $('eps').onchange = () => { P.eps = +$('eps').value; update(); };
  $('proposerTier').onchange = () => { P.proposerTier = +$('proposerTier').value; update(); };
  $('reset').onclick = () => { P = JSON.parse(JSON.stringify(DEFAULTS)); sync(); update(); };
  bindSeg('shapeMode', 'shapeMode'); bindSeg('rMode', 'rMode'); bindSeg('gossipStyle', 'gossipStyle');
  $('roundsSeg').querySelectorAll('button').forEach(b => b.onclick = () => { P.rounds = +b.dataset.v; sync(); update(); }); bindSeg('subnetMode', 'subnetMode'); bindSeg('rFoldMode', 'rFoldMode');
  window.addEventListener('resize', update);
  sync(); glueIcons(document); bindTips(document); update();
})();
