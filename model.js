// PQ aggregation model: tree shape, redundancy, finality time, per-node work.
// Calibration: leanVM benchmarks (leanethereum.github.io/leanVM, riscv-exploration
// 06e5c9c, Xeon Gold 6548N, measured 2026-10-15).
(function (root) {
  const BENCH = {
    threads: [1, 4, 8, 16],
    leaf100: [1.005, 0.289, 0.169, 0.131],   // leanXMSS "Verify 100 signatures"
    merge2: [0.612, 0.183, 0.119, 0.091],    // 2 to 1, higher node
    merge4: [1.243, 0.382, 0.244, 0.167],    // 4 to 1, higher node
  };
  const PRESETS = {
    oct: { label: 'leanVM site (Oct 15, 2026)', leafMul: 1, mergeMul: 1, mergeFixed: 0 },
    may: { label: 'leanBench May 2026 build', leafMul: 1.98, mergeMul: 9.5, mergeFixed: 0.2 },
    // Kamil's ballpark (1024 sigs -> 1 s; k-to-1 merge = 0.15 s per child, ~14 vCPUs busy), scaled against the 16-thread leanVM-site run
    kamil: { label: "Kamil's ballpark (Oct 2026)", leafMul: (1 / 10.24) / 0.131, mergeMul: 0.15 / 0.038, mergeFixed: -0.015 },
  };
  const AWU_SECONDS = 1.005; // 1 AWU = one 100-sig leaf proof, single thread

  function interp(arr, t) {
    const xs = BENCH.threads.map(Math.log);
    const x = Math.log(Math.max(1, t));
    let i = 0;
    while (i < xs.length - 2 && x > xs[i + 1]) i++;
    const f = (x - xs[i]) / (xs[i + 1] - xs[i]);
    const y = Math.log(arr[i]) + f * (Math.log(arr[i + 1]) - Math.log(arr[i]));
    return Math.exp(y);
  }
  function leafTime(s, threads, P) { return (s / 100) * interp(BENCH.leaf100, threads) * P.leafMul; }
  function mergeTime(k, threads, P) {
    const m2 = interp(BENCH.merge2, threads), m4 = interp(BENCH.merge4, threads);
    const b = (m4 - m2) / 2, a = Math.max(0, m2 - 2 * b);
    return P.mergeFixed + a + b * k * P.mergeMul;
  }

  // ---- binomial tail P(X > m), X ~ Bin(G, p)
  function tail(G, p, m) {
    if (m >= G) return 0;
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    if (G <= 600) {
      let pmf = Math.pow(1 - p, G), cdf = 0;
      if (pmf === 0) return chernoff(G, p, m);
      for (let i = 0; i <= m; i++) {
        cdf += pmf;
        pmf *= ((G - i) / (i + 1)) * (p / (1 - p));
      }
      return Math.max(0, 1 - cdf);
    }
    return chernoff(G, p, m);
  }
  function chernoff(G, p, m) {
    const a = (m + 1) / G;
    if (a <= p) return 1;
    if (a >= 1) return Math.pow(p, G);
    const kl = a * Math.log(a / p) + (1 - a) * Math.log((1 - a) / (1 - p));
    return Math.min(1, Math.exp(-G * kl));
  }

  // ---- tree structure
  function structure(N, s, k, L) {
    const G = [Math.ceil(N / s)], cov = [s];
    for (let l = 1; l <= L; l++) { G.push(Math.ceil(G[l - 1] / k)); cov.push(Math.min(N, cov[l - 1] * k)); }
    return { G, cov };
  }

  function failProb(p) { return p.q + (1 - p.q) * p.pOff; }

  // DP over loss-budget split -> per-level redundancy minimising work
  function optimiseRedundancy(p, s, k, L, st, workPerJob) {
    const pf = failProb(p), C = 20, eps = p.eps / (L + 1);
    if (pf <= 0) return Array(L + 1).fill(1);
    const rFor = (l, c) => {
      const m = Math.floor((p.beta * c / C) * p.N / st.cov[l]);
      for (let r = 1; r <= 64; r++) if (tail(st.G[l], Math.pow(pf, r), m) <= eps) return r;
      return null;
    };
    let best = new Map([[0, { cost: 0, rs: [], cs: [] }]]);
    for (let l = 0; l <= L; l++) {
      const nb = new Map();
      const cache = [];
      for (const [used, v] of best) {
        for (let c = 0; c + used <= C; c++) {
          if (cache[c] === undefined) cache[c] = rFor(l, c);
          const r = cache[c];
          if (r == null) continue;
          const key = used + c, cost = v.cost + r * st.G[l] * workPerJob[l];
          const cur = nb.get(key);
          if (!cur || cost < cur.cost) nb.set(key, { cost, rs: v.rs.concat([r]), cs: v.cs.concat([c]) });
        }
      }
      best = nb;
      if (!best.size) return null;
    }
    let out = null;
    for (const v of best.values()) if (!out || v.cost < out.cost) out = v;
    out.rs.split = out.cs.map(c => p.beta * c / C);
    return out.rs;
  }

  function foldCopies(p, L) {
    if (p.rFoldMode === 'manual') return Math.max(1, Math.round(p.rFold));
    const pf = failProb(p);
    if (pf <= 0) return 1;
    return Math.max(1, Math.ceil(Math.log(p.eps / (L + 2)) / Math.log(pf) - 1e-9));
  }

  function lossRisk(p, st, rs, rFold) {
    const pf = failProb(p);
    // union bound over levels with an even budget split (reporting only)
    // Chernoff bound on P(total lost coverage > beta), levels independent
    let expLoss = 0;
    const lv = rs.map((r, l) => {
      const pl = Math.pow(pf, r), c = st.cov[l] / p.N;
      expLoss += st.G[l] * pl * c;
      return [st.G[l], pl, c];
    });
    const L = rs.length - 1;
    const split = rs.split || rs.map(() => p.beta / (L + 1));
    let risk = 0;
    lv.forEach(([G, pl], l) => { risk += tail(G, pl, Math.floor(split[l] * p.N / st.cov[l])); });
    // every folder failing loses the whole round
    const pFold = Math.pow(pf, rFold);
    risk += pFold; expLoss += pFold;
    return { risk: Math.min(1, risk), expLoss, pFold };
  }

  // ---- timing
  function tierEff(p) {
    const tot = p.tiers.reduce((a, t) => a + t.share, 0) || 1;
    const bw = p.bwShare > 0 ? p.bwShare : 1;
    return p.tiers.map(t => ({ ...t, up: t.up * bw, down: t.down * bw, w: t.share / tot, thr: Math.max(1, Math.floor(t.threads * p.cpuShare)) }));
  }
  function bps(mbps) { return mbps * 125000; }

  // hops: group topic (one tree group / subnet) unless global=true (whole-network broadcast)
  function gossipLat(p, tiers, bytes, global) {
    // push: each relay eagerly uploads to D peers, one link delay per hop.
    // announce & pull: announce (h) -> request (h) -> data (h), each relay uploads only the copies peers pull.
    // small messages (signatures) are always pushed: announcing them would cost more than sending them
    const pull = p.gossipStyle === 'pull' && bytes > 16 * 1024;
    const copies = pull ? p.pullServe : p.meshD;
    const ser = tiers.reduce((a, t) => a + t.w * copies * bytes / bps(t.up), 0);
    // relays verify a proof before forwarding it
    const verify = bytes > 16 * 1024 ? p.verifyMs / 1000 : 0;
    return (global ? p.globalHops : p.gossipHops) * ((pull ? 3 : 1) * p.h + ser + verify);
  }
  // phase completes when every job has at least one finished copy; stragglers that
  // appear in fewer than 0.5 jobs in expectation are ignored
  function straggler(G, r, tiers, times) {
    const idx = tiers.map((_, i) => i).sort((a, b) => times[b] - times[a]);
    let slower = 0;
    for (const i of idx) {
      slower += tiers[i].w;
      if (tiers[i].w > 0 && G * Math.pow(slower, r) >= 0.5) return { t: times[i], tier: i };
    }
    const i = idx[idx.length - 1];
    return { t: times[i], tier: i };
  }

  // Level deadline: the level closes once a fraction `pct` of its jobs has at least one finished copy.
  // Jobs whose copies all sit on slower tiers are dropped (their votes are lost for this round).
  // pct >= 1 means wait for all jobs (stragglers expected in fewer than 0.5 jobs are ignored).
  function levelTime(G, r, tiers, times, pct) {
    if (!(pct < 1)) { const sg = straggler(G, r, tiers, times); return { ...sg, dropped: 0 }; }
    const idx = tiers.map((_, i) => i).filter(i => tiers[i].w > 0).sort((a, b) => times[a] - times[b]);
    for (const i of idx) {
      const slower = idx.filter(j => times[j] > times[i]).reduce((a, j) => a + tiers[j].w, 0);
      const dropped = Math.pow(slower, r);
      if (1 - dropped >= pct) return { t: times[i], tier: i, dropped };
    }
    const i = idx[idx.length - 1];
    return { t: times[i], tier: i, dropped: 0 };
  }

  function evaluate(p, s, k, L, rs, S) {
    S = S || Math.ceil(p.N / s);
    const P = PRESETS[p.preset];
    const tiers = tierEff(p);
    const st = structure(p.N, s, k, L);
    const sigB = p.sigKiB * 1024, proofB = p.proofKiB * 1024;
    const meanDown = tiers.reduce((a, t) => a + t.w * bps(t.down), 0);
    const jobs = st.G.map((g, l) => g * rs[l]);
    const phases = [];
    const levels = [];

    // 1. signatures reach leaf aggregators
    // gossip: every signature of a subnet must reach that subnet's aggregators; subnet throughput is
    // limited (p.sigRate signatures/s per subnet), so time grows with signatures per subnet.
    // directed: attesters send straight to their leaf aggregators, no subnet topic.
    const sigsPerSubnet = Math.ceil(p.N / S);
    const sigNet = p.mode === 'gossip' ? gossipLat(p, tiers, sigB) + sigsPerSubnet / p.sigRate : p.h;
    phases.push({ name: 'Signatures to leaf aggregators', kind: 'net', t: sigNet });

    const rFold = foldCopies(p, L);
    for (let l = 0; l <= L; l++) {
      const isLeaf = l === 0;
      const outCopies = l < L ? rs[l + 1] : rFold;
      const times = tiers.map(t => {
        const queue = Math.max(1, t.vpn * jobs[l] / p.N);
        const ingest = isLeaf ? s * sigB / bps(t.down) : 0;
        // merges first verify their k child proofs
        const comp = isLeaf ? leafTime(s, t.thr, P) : mergeTime(k, t.thr, P) + k * p.verifyMs / 1000;
        const upload = p.mode === 'directed' ? outCopies * proofB / bps(t.up) : 0;
        return ingest + queue * (comp + upload);
      });
      const sg = levelTime(st.G[l], rs[l], tiers, times, p.deadlinePct);
      phases.push({ name: isLeaf ? 'Leaf proving' : `Merge level ${l}`, kind: 'cpu', t: sg.t });
      levels.push({ l, G: st.G[l], cov: st.cov[l], r: rs[l], jobs: jobs[l], times, phase: sg.t, waitTier: sg.tier, dropped: sg.dropped });
      // transfer to next level (or to the proposer)
      const fanIn = l < L ? k : st.G[L];
      const net = (p.mode === 'gossip' ? gossipLat(p, tiers, proofB) : p.h) + fanIn * proofB / meanDown;
      phases.push({ name: l < L ? `Proofs to level ${l + 1}` : 'Root proofs to folders', kind: 'net', t: net });
    }
    // fold layer: rFold stake-sampled folders each fold all roots into the block proof
    // and send it to the proposer, who includes the first valid one
    const R = st.G[L];
    const propTier = tiers[p.proposerTier] || tiers[0];
    const foldSteps = [];
    { let rem = R; while (rem > 1) { const f = Math.min(p.maxRec, rem); foldSteps.push(f); rem = Math.ceil(rem / p.maxRec); } }
    const foldLevels = foldSteps.length;
    const foldTime = thr => foldSteps.reduce((a, f) => a + mergeTime(f, thr, P), 0);
    const foldTimes = tiers.map(t => {
      const queue = Math.max(1, t.vpn * rFold / p.N);
      const upload = p.mode === 'directed' ? proofB / bps(t.up) : 0;
      return queue * (foldTime(t.thr) + R * p.verifyMs / 1000 + upload);
    });
    const fsg = straggler(1, rFold, tiers, foldTimes);
    phases.push({ name: 'Fold into block proof', kind: 'cpu', t: fsg.t });
    phases.push({ name: 'Block proof to proposer', kind: 'net', t: (p.mode === 'gossip' ? gossipLat(p, tiers, proofB, true) : p.h + p.verifyMs / 1000) + proofB / bps(propTier.down) });
    phases.push({ name: 'Final proof broadcast', kind: 'net', t: gossipLat(p, tiers, proofB, true) });
    const fold = { r: rFold, times: foldTimes, phase: fsg.t, waitTier: fsg.tier, steps: foldLevels };

    const round = phases.reduce((a, x) => a + x.t, 0);
    const finality = round * p.rounds;

    // work (single-thread seconds -> AWU)
    const leafWork = leafTime(s, 1, P) / AWU_SECONDS;
    const mergeWork = mergeTime(k, 1, P) / AWU_SECONDS;
    const workPerJob = st.G.map((_, l) => (l === 0 ? leafWork : mergeWork));
    const foldWork = foldSteps.reduce((a, f) => a + mergeTime(f, 1, P), 0) / AWU_SECONDS;
    const totalAWU = jobs.reduce((a, j, l) => a + j * workPerJob[l], 0) + rFold * foldWork;

    // per tier node
    const interval = p.roundInterval > 0 ? p.roundInterval : round;
    const roundsPerYear = 365 * 86400 / interval;
    const perTier = tiers.map((t, i) => {
      let expJobs = 0, busy = 0, up = 0, down = 0, pSampled = 1;
      for (let l = 0; l <= L; l++) {
        const e = t.vpn * jobs[l] / p.N;
        expJobs += e;
        pSampled *= Math.pow(1 - Math.min(1, t.vpn / p.N), jobs[l]);
        const comp = l === 0 ? leafTime(s, t.thr, P) : mergeTime(k, t.thr, P) + k * p.verifyMs / 1000;
        busy += e * comp * t.thr; // thread-seconds
        const outCopies = l < L ? rs[l + 1] : 1;
        up += e * proofB * (p.mode === 'directed' ? outCopies : (p.gossipStyle === 'pull' ? p.pullServe : p.meshD));
        down += e * (l === 0 ? s * sigB : k * proofB);
      }
      { // fold jobs
        const e = t.vpn * rFold / p.N;
        expJobs += e;
        pSampled *= Math.pow(1 - Math.min(1, t.vpn / p.N), rFold);
        busy += e * (foldTime(t.thr) + R * p.verifyMs / 1000) * t.thr;
        up += e * proofB * (p.mode === 'directed' ? 1 : (p.gossipStyle === 'pull' ? p.pullServe : p.meshD));
        down += e * R * proofB;
      }
      const threadSecYear = busy * roundsPerYear;
      const kwh = threadSecYear / 3600 * p.wattsPerThread / 1000;
      return {
        name: t.name, vpn: t.vpn, thr: t.thr,
        pSampled: 1 - pSampled, expJobs: expJobs * p.rounds, busy: busy * p.rounds,
        duty: busy / (interval * t.threads), up: up * p.rounds, down: down * p.rounds,
        kwh, cost: kwh * p.pricekWh,
        cloud: threadSecYear / 3600 * p.cloudPerThreadHour,
        threadHoursYear: threadSecYear / 3600,
        nodes: t.w * p.N / Math.max(1, t.vpn),
        stakeETH: t.vpn * 32,
      };
    });

    const net = perTier.reduce((a, t) => ({
      energy: a.energy + t.nodes * t.cost, cloud: a.cloud + t.nodes * t.cloud,
      kwh: a.kwh + t.nodes * t.kwh, threadHours: a.threadHours + t.nodes * t.threadHoursYear,
    }), { energy: 0, cloud: 0, kwh: 0, threadHours: 0 });
    net.perETHEnergy = net.energy / (p.N * 32);
    net.perETHCloud = net.cloud / (p.N * 32);
    return {
      net, roundsPerYear, subnets: S, groupsPerSubnet: Math.max(1, Math.round(st.G[0] / S)), sigsPerSubnet,
      subscribersPerSubnet: p.mode === 'gossip' ? p.totalNodes * p.subsPerNode / S : null,
      s, k, L, rs, st, phases, levels, round, finality, totalAWU: totalAWU * p.rounds,
      perValidatorAWU: totalAWU * p.rounds / p.N, perTier, roots: R, foldLevels, fold, foldWork,
      risk: (() => { const rk = lossRisk(p, st, rs, rFold); rk.deadlineLoss = 1 - levels.reduce((a, lv) => a * (1 - lv.dropped), 1); rk.safetyLoss = rk.expLoss; rk.expLoss += rk.deadlineLoss; return rk; })(), workPerJob,
      proofBytesRound: (jobs.reduce((a, j) => a + j, 0) + rFold) * proofB,
    };
  }

  const S_LIST = [50, 100, 200, 250, 500, 1000, 2000, 4000];
  const K_LIST = [2, 3, 4, 6, 8, 12, 16];

  const SUBNET_LIST = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
  const GROUP_LIST = [1, 2, 4, 8, 16, 32, 64, 128];
  // largest subnet count that keeps every subnet topic above the minimum mesh size
  function maxSubnets(p) { return Math.max(1, Math.floor(p.totalNodes * p.subsPerNode / p.minMesh)); }

  function candidates(p) {
    const out = [], seen = new Set();
    const fixed = p.subnetMode === 'fixed';
    const add = (s, S) => {
      if (s < 1 || s > p.N) return;
      if (!fixed && s > p.leafCap) return;
      for (const k of K_LIST) {
        if (k > p.maxRec) continue;
        for (let L = 1; L <= 8; L++) {
          const cov = s * Math.pow(k, L);
          if (cov > p.maxKeys) break;
          const key = s + '|' + S + '|' + k + '|' + L;
          if (seen.has(key)) continue;
          seen.add(key);
          const st = structure(p.N, s, k, L);
          if (st.G[L] > p.maxRec * p.maxRec) continue; // folders fold roots in <= 2 levels
          out.push({ s, k, L, st, S });
        }
      }
    };
    if (p.mode === 'gossip') {
      // subnets (gossip topics) and leaf groups are separate: each subnet is split into g leaf groups
      const cap = maxSubnets(p);
      const Ss = fixed ? [Math.max(1, Math.round(p.subnets))] : SUBNET_LIST.filter(S => S <= cap);
      if (!fixed && !Ss.length) Ss.push(cap);
      for (const S of Ss) for (const g of GROUP_LIST) add(Math.ceil(p.N / (S * g)), S);
    } else {
      // directed: no subnet topics, leaf groups are free
      const sList = fixed ? [Math.ceil(p.N / Math.max(1, p.subnets))] : S_LIST;
      for (const s of sList) add(s, Math.ceil(p.N / s));
    }
    return out;
  }

  const rCache = new Map();
  function redundancyFor(p, c) {
    const key = [p.N, p.q, p.pOff, p.beta, p.eps, p.preset, p.rMode, p.rFoldMode, p.rFold, p.rLeaf, p.rMid, p.rTop, c.s, c.k, c.L].join('|');
    if (!rCache.has(key)) { if (rCache.size > 20000) rCache.clear(); rCache.set(key, redundancyRaw(p, c)); }
    return rCache.get(key);
  }
  function redundancyRaw(p, c) {
    const P = PRESETS[p.preset];
    const w = c.st.G.map((_, l) => (l === 0 ? leafTime(c.s, 1, P) : mergeTime(c.k, 1, P)) / AWU_SECONDS);
    if (p.rMode === 'manual') {
      return c.st.G.map((_, l) => (l === 0 ? p.rLeaf : l === 1 ? p.rMid : p.rTop));
    }
    return optimiseRedundancy(p, c.s, c.k, c.L, c.st, w);
  }

  function optimise(p) {
    let best = null;
    for (const c of candidates(p)) {
      const rs = redundancyFor(p, c);
      if (!rs) continue;
      const e = evaluate(p, c.s, c.k, c.L, rs, c.S);
      const ok = e.risk.expLoss <= p.beta, bestOk = best && best.risk.expLoss <= p.beta;
      if (best && bestOk && !ok) continue;
      const better = !best || (ok && !bestOk) ||
        (p.objective === 'time'
          ? e.finality < best.finality - 1e-9 || (Math.abs(e.finality - best.finality) < 1e-9 && e.totalAWU < best.totalAWU)
          : (e.finality <= p.tMax && (best.finality > p.tMax || e.totalAWU < best.totalAWU)) ||
            (best.finality > p.tMax && e.finality < best.finality));
      if (better) best = e;
    }
    return best;
  }

  function run(p) {
    if (p.shapeMode === 'manual') {
      const st = structure(p.N, p.sManual, p.kManual, p.LManual);
      const c = { s: p.sManual, k: p.kManual, L: p.LManual, st };
      const rs = redundancyFor(p, c);
      if (!rs) return null;
      return evaluate(p, c.s, c.k, c.L, rs, c.S);
    }
    return optimise(p);
  }

  const api = { maxSubnets, run, evaluate, optimise, PRESETS, BENCH, leafTime, mergeTime, tail, AWU_SECONDS };
  if (typeof module !== 'undefined') module.exports = api; else root.AggModel = api;
})(this);
