const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("node:fs");

// UMD bundle expects a global `self` (browser). Provide it for Node.
globalThis.self = globalThis;

const { SankeyChart } = require(path.join("..", "dist", "sankeyPlus.js"));

// Keep tests self-contained: parse link fixtures from `test-debug.html`.
// (We intentionally don't depend on a separate JSON file that can be deleted/rebased.)
const debugHtml = fs.readFileSync(path.join(__dirname, "..", "test-debug.html"), "utf8");
const linksMatch = debugHtml.match(/let links\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(linksMatch, "Failed to parse links from test-debug.html");
// eslint-disable-next-line no-new-func
const linksRaw = Function(`\"use strict\"; return (${linksMatch[1]});`)();

const nodes = [
  { name: "path_start", horizontalSort: 0, verticalSort: 0 },
  { name: "search ○", horizontalSort: 1, verticalSort: 0 },
  { name: "search ◐", horizontalSort: 2, verticalSort: 0 },
  { name: "search ●", horizontalSort: 3, verticalSort: 0 },
  { name: "saved_filters_search ●", horizontalSort: 3, verticalSort: 1 },
  { name: "filter", horizontalSort: 5, verticalSort: 3 },
  { name: "autosearch", horizontalSort: 5, verticalSort: 2 },
  { name: "listing ○", horizontalSort: 5, verticalSort: 1 },
  { name: "filter off", horizontalSort: 5, verticalSort: 0 },
  { name: "schedule ○", horizontalSort: 6, verticalSort: 0 },
  { name: "sosisa ○", horizontalSort: 7, verticalSort: 0 },
  { name: "sharing", horizontalSort: 7, verticalSort: 0 },
  { name: "subscription", horizontalSort: 7, verticalSort: 0 },
  { name: "schedule ◐", horizontalSort: 8, verticalSort: 0 },
  { name: "schedule ●", horizontalSort: 8, verticalSort: 1 },
  { name: "sosisa ◐", horizontalSort: 10, verticalSort: 1 },
  { name: "listing ●", horizontalSort: 10, verticalSort: -2 },
  { name: "sosisa ●", horizontalSort: 11, verticalSort: 3 },
  { name: "done", horizontalSort: 12, verticalSort: 0 },
];

function makeChart() {
  const nodesData = nodes.map((n) => ({ ...n }));
  const nodeNames = new Set(nodesData.map((n) => n.name));
  // Filter out links that reference nodes not present in this test fixture (e.g. `booking`).
  const linksData = linksRaw
    .filter((l) => nodeNames.has(l.source) && nodeNames.has(l.target))
    .map((l) => ({ ...l }));

  const chart = new SankeyChart({
    align: "left",
    id: (d) => d.name,
    iterations: 10,
    padding: 25,
    width: 1400,
    height: 1000,
    nodes: {
      data: nodesData,
      width: 15,
      padding: 25,
      minPadding: 30,
      virtualPadding: 7,
      horizontalSort: true,
      verticalSort: true,
      setPositions: false,
      fill: () => "#ccc",
    },
    links: {
      data: linksData,
      circularGap: 1,
      circularLinkPortionTopBottom: 0.4,
      circularLinkPortionLeftRight: 0.1,
      useVirtualRoutes: true,
      baseRadius: 5,
      verticalMargin: 20,
      horizontalMargin: 100,
      opacity: 0.7,
      virtualLinkType: "bezier",
      color: "lightgrey",
      sortIterations: 12,
      postSortIterations: 4,
      typeOrder: ["search_loop", "primary", "secondary", "search_nearby"],
      typeAccessor: (d) => d.type,
      types: {},
    },
    arrows: { enabled: false },
  });

  chart.process();
  return chart;
}

function span(link) {
  const sc = link?.source?.column ?? 0;
  const tc = link?.target?.column ?? 0;
  return Math.abs(tc - sc);
}

function isSelf(link) {
  return link?.source?.name && link?.target?.name && link.source.name === link.target.name;
}

function circularLinksActuallyCrossLite(link1, link2) {
  const link1Source = link1?.source?.column ?? 0;
  const link1Target = link1?.target?.column ?? 0;
  const link2Source = link2?.source?.column ?? 0;
  const link2Target = link2?.target?.column ?? 0;

  function sameNode(a, b) {
    if (a === b) return true;
    if (a?.name != null && b?.name != null) return a.name === b.name;
    return false;
  }

  const link1SelfLoop = sameNode(link1.source, link1.target);
  const link2SelfLoop = sameNode(link2.source, link2.target);
  const shareNode =
    sameNode(link1.source, link2.source) ||
    sameNode(link1.source, link2.target) ||
    sameNode(link1.target, link2.source) ||
    sameNode(link1.target, link2.target);

  // Special case: "zero-span" (same column) but NOT same node
  const link1ZeroSpanNonSelf = link1Source === link1Target && !link1SelfLoop;
  const link2ZeroSpanNonSelf = link2Source === link2Target && !link2SelfLoop;
  if (link1ZeroSpanNonSelf) {
    const c = link1Source;
    if (!(link2Source === c || link2Target === c)) return false;
  }
  if (link2ZeroSpanNonSelf) {
    const c = link2Source;
    if (!(link1Source === c || link1Target === c)) return false;
  }

  const link1Min = Math.min(link1Source, link1Target);
  const link1Max = Math.max(link1Source, link1Target);
  const link2Min = Math.min(link2Source, link2Target);
  const link2Max = Math.max(link2Source, link2Target);

  const rangesOverlap = link1Max >= link2Min && link2Max >= link1Min;
  if (!rangesOverlap) return false;

  // Same TARGET NODE stacks
  if (sameNode(link1.target, link2.target)) return true;

  const sameSource = link1Source === link2Source;
  if (sameSource) {
    if ((link1SelfLoop || link2SelfLoop) && !shareNode) {
      // allow unrelated self-loops to be nested
    } else {
      return true;
    }
  }

  if (link1SelfLoop || link2SelfLoop) {
    if (!shareNode) return false;
    const selfCol = link1SelfLoop ? link1Source : link2Source;
    const otherMin = link1SelfLoop ? link2Min : link1Min;
    const otherMax = link1SelfLoop ? link2Max : link1Max;
    if (selfCol >= otherMin && selfCol <= otherMax) return true;
  }

  const overlapStart = Math.max(link1Min, link2Min);
  const overlapEnd = Math.min(link1Max, link2Max);
  if (overlapStart === overlapEnd) {
    const c = overlapStart;
    const link1HasEndpointAt = link1Source === c || link1Target === c;
    const link2HasEndpointAt = link2Source === c || link2Target === c;
    if (link1HasEndpointAt && link2HasEndpointAt) {
      const bothTouchAsSource = link1Source === c && link2Source === c;
      const bothTouchAsTarget = link1Target === c && link2Target === c;
      if (bothTouchAsSource || bothTouchAsTarget) return true;
    }
  }

  function inside(col, min, max) {
    return col > min && col < max;
  }
  if (
    inside(link1Source, link2Min, link2Max) ||
    inside(link1Target, link2Min, link2Max) ||
    inside(link2Source, link1Min, link1Max) ||
    inside(link2Target, link1Min, link1Max)
  ) {
    return true;
  }

  return false;
}

function assertNonDecreasing(arr, msg) {
  for (let i = 1; i < arr.length; i++) {
    assert.ok(arr[i] >= arr[i - 1], `${msg}: at ${i - 1}->${i}, ${arr[i - 1]} -> ${arr[i]}`);
  }
}

function assertNonIncreasing(arr, msg) {
  for (let i = 1; i < arr.length; i++) {
    assert.ok(arr[i] <= arr[i - 1], `${msg}: at ${i - 1}->${i}, ${arr[i - 1]} -> ${arr[i]}`);
  }
}

test("minimal smoke test", () => {
  const chart = makeChart();
  assert.ok(chart.graph);
  assert.ok(chart.graph.nodes.length > 0);
  assert.ok(chart.graph.links.length > 0);
});

test("local span=1 bottom circular link does not use column-wide group baseline (stays compact)", () => {
  const chart = makeChart();
  const l = chart.graph.links.find(
    (x) =>
      x.circular &&
      !x.isVirtual &&
      x.type === "search_nearby" &&
      x.circularLinkType === "bottom" &&
      x.source?.name === "search ◐" &&
      x.target?.name === "search ○"
  );
  assert.ok(l, "Missing link search ◐ → search ○ (search_nearby, bottom)");

  const c = l.circularPathData;
  assert.ok(typeof c._extMaxY === "number", "Expected _extMaxY to be computed");
  assert.ok(typeof c.verticalFullExtent === "number", "Expected verticalFullExtent to be computed");

  // Height above/below baseline should be driven by baseOffset+vBuf, not by unrelated links
  // targeting the same column. If we accidentally use column groupMaxY as baseline, this
  // becomes ~170px in the fixture (regression that created huge depth).
  const height = c.verticalFullExtent - c._extMaxY;
  assert.ok(
    height <= 60,
    `Expected local backlink to stay compact: height=${height.toFixed(2)}px (too deep)`
  );
});

test("top span=1 search_loop stays aligned with its target-column bundle baseline (no drift) (full test-debug.html)", () => {
  // Use the FULL fixture (same as in the booking regression) to match the reported DOM case.
  const debugHtml = fs.readFileSync(path.join(__dirname, "..", "test-debug.html"), "utf8");
  const nodesMatch = debugHtml.match(/\b(?:let|const)\s+nodes\s*=\s*(\[[\s\S]*?\]);/);
  const linksMatch = debugHtml.match(/\b(?:let|const)\s+links\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(nodesMatch, "Failed to parse nodes from test-debug.html");
  assert.ok(linksMatch, "Failed to parse links from test-debug.html");
  // eslint-disable-next-line no-new-func
  const fullNodes = Function(`\"use strict\"; return (${nodesMatch[1]});`)();
  // eslint-disable-next-line no-new-func
  const fullLinks = Function(`\"use strict\"; return (${linksMatch[1]});`)();

  const chart = new SankeyChart({
    align: "left",
    id: (d) => d.name,
    iterations: 10,
    padding: 25,
    width: 1200,
    height: 900,
    nodes: {
      data: fullNodes.map((n) => ({ ...n })),
      width: 15,
      padding: 25,
      minPadding: 30,
      virtualPadding: 7,
      horizontalSort: true,
      verticalSort: true,
      setPositions: false,
      fill: () => "#ccc",
    },
    links: {
      data: fullLinks.map((l) => ({ ...l })),
      circularGap: 1,
      circularLinkPortionTopBottom: 0.4,
      circularLinkPortionLeftRight: 0.1,
      useVirtualRoutes: true,
      baseRadius: 5,
      verticalMargin: 20,
      horizontalMargin: 100,
      opacity: 0.7,
      virtualLinkType: "bezier",
      color: "lightgrey",
      sortIterations: 12,
      postSortIterations: 4,
      typeOrder: ["booking", "search_loop", "primary", "secondary", "search_nearby"],
      typeAccessor: (d) => d.type,
      types: {},
    },
    arrows: { enabled: false },
  });
  chart.process();

  const l = chart.graph.links.find(
    (x) =>
      x.circular &&
      !x.isVirtual &&
      x.circularLinkType === "top" &&
      x.type === "search_loop" &&
      x.source?.name === "autosearch" &&
      x.target?.name === "search ●"
  );
  assert.ok(l, "Missing TOP link autosearch → search ● (search_loop)");

  const c = l.circularPathData;
  assert.ok(typeof c.groupMinY === "number", "Expected groupMinY");
  assert.ok(typeof c._extMinY === "number", "Expected _extMinY");
  assert.ok(typeof c.verticalFullExtent === "number", "Expected verticalFullExtent");
  assert.ok(typeof c.baseOffset === "number", "Expected baseOffset");
  assert.ok(typeof c.verticalBuffer === "number", "Expected verticalBuffer");

  // For TOP links: vfe = baselineMinY - (baseOffset + vBuf)  => baselineMinY = vfe + baseOffset + vBuf
  const baselineMinY = c.verticalFullExtent + c.baseOffset + c.verticalBuffer;
  assert.ok(
    Math.abs(baselineMinY - c.groupMinY) < 1e-3,
    `Expected TOP span=1 search_loop to use groupMinY baseline: baselineMinY=${baselineMinY.toFixed(2)} groupMinY=${c.groupMinY.toFixed(2)}`
  );
  // NOTE: In some fixtures the group's minimum Y can coincide with this link's own extMinY.
  // The invariant we care about is baselineMinY === groupMinY; we do NOT require it to differ from _extMinY.
  if (Math.abs(c.groupMinY - c._extMinY) > 1e-3) {
    assert.ok(
      Math.abs(baselineMinY - c._extMinY) > 1e-3,
      `Expected TOP span=1 search_loop NOT to use _extMinY baseline when groupMinY differs: baselineMinY=${baselineMinY.toFixed(2)} extMinY=${c._extMinY.toFixed(2)} groupMinY=${c.groupMinY.toFixed(2)}`
    );
  }
});

test("top backlinks are grouped by target: no interleaving between search ○ and search ◐ bundles", () => {
  const chart = makeChart();
  const topCircular = chart.graph.links
    .filter((l) => l.circular && l.circularLinkType === "top" && !l.isVirtual)
    // inner (closer to nodes) first
    .sort((a, b) => b.circularPathData.verticalFullExtent - a.circularPathData.verticalFullExtent);

  function assertTargetBlock(targetName) {
    const idxs = [];
    topCircular.forEach((l, i) => {
      if (l.target?.name === targetName) idxs.push(i);
    });
    assert.ok(idxs.length > 1, `Need at least 2 top circular links into ${targetName} for this invariant`);
    const min = Math.min(...idxs);
    const max = Math.max(...idxs);
    assert.equal(
      max - min + 1,
      idxs.length,
      `Expected top circular links into ${targetName} to be contiguous in VFE order (no interleaving)`
    );
  }

  assertTargetBlock("search ◐");
  assertTargetBlock("search ○");
});

test("top circular links into the same target node maintain minimum gap (saved_filters_search ●, full fixture)", () => {
  // Use the FULL fixture (including `booking`) to match the reported intersections.
  const debugHtml = fs.readFileSync(path.join(__dirname, "..", "test-debug.html"), "utf8");
  const nodesMatch = debugHtml.match(/\b(?:let|const)\s+nodes\s*=\s*(\[[\s\S]*?\]);/);
  const linksMatch = debugHtml.match(/\b(?:let|const)\s+links\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(nodesMatch, "Failed to parse nodes from test-debug.html");
  assert.ok(linksMatch, "Failed to parse links from test-debug.html");
  // eslint-disable-next-line no-new-func
  const fullNodes = Function(`\"use strict\"; return (${nodesMatch[1]});`)();
  // eslint-disable-next-line no-new-func
  const fullLinks = Function(`\"use strict\"; return (${linksMatch[1]});`)();

  const chart = new SankeyChart({
    align: "left",
    id: (d) => d.name,
    iterations: 10,
    padding: 25,
    width: 1200,
    height: 900,
    nodes: {
      data: fullNodes.map((n) => ({ ...n })),
      width: 15,
      padding: 25,
      minPadding: 30,
      virtualPadding: 7,
      horizontalSort: true,
      verticalSort: true,
      setPositions: false,
      fill: () => "#ccc",
    },
    links: {
      data: fullLinks.map((l) => ({ ...l })),
      circularGap: 1,
      circularLinkPortionTopBottom: 0.4,
      circularLinkPortionLeftRight: 0.1,
      useVirtualRoutes: true,
      baseRadius: 5,
      verticalMargin: 20,
      horizontalMargin: 100,
      opacity: 0.7,
      virtualLinkType: "bezier",
      color: "lightgrey",
      sortIterations: 12,
      postSortIterations: 4,
      typeOrder: ["booking", "search_loop", "primary", "secondary", "search_nearby"],
      typeAccessor: (d) => d.type,
      types: {},
    },
    arrows: { enabled: false },
  });
  chart.process();

  const circularGap = 1;
  const topToSaved = chart.graph.links
    .filter(
      (l) =>
        l.circular &&
        !l.isVirtual &&
        l.circularLinkType === "top" &&
        l.target?.name === "saved_filters_search ●"
    )
    .sort((a, b) => b.circularPathData.verticalFullExtent - a.circularPathData.verticalFullExtent);

  assert.ok(topToSaved.length >= 2, "Expected at least 2 TOP links into saved_filters_search ●");

  for (let i = 1; i < topToSaved.length; i++) {
    const inner = topToSaved[i - 1]; // closer to nodes
    const outer = topToSaved[i];     // more outer (higher visually)
    const innerTopEdge = inner.circularPathData.verticalFullExtent - inner.width / 2;
    const outerBottomEdge = outer.circularPathData.verticalFullExtent + outer.width / 2;
    const gap = innerTopEdge - outerBottomEdge;
    assert.ok(
      gap >= circularGap - 1e-4,
      `TOP into saved_filters_search ● overlap: ` +
        `${inner.source.name}→${inner.target.name} and ${outer.source.name}→${outer.target.name}: gap=${gap.toFixed(2)}`
    );
  }
});

test("bottom circular links maintain minimum vertical gap (circularGap)", () => {
  const chart = makeChart();
  const circularGap = 1;
  const bottomCircular = chart.graph.links.filter(
    (l) => l.circular && l.circularLinkType === "bottom" && !l.isVirtual
  );

  // Sort by verticalFullExtent ascending (innermost first)
  bottomCircular.sort(
    (a, b) => a.circularPathData.verticalFullExtent - b.circularPathData.verticalFullExtent
  );

  for (let i = 1; i < bottomCircular.length; i++) {
    const prev = bottomCircular[i - 1];
    const curr = bottomCircular[i];
    // We only enforce vertical separation when these two circulars can actually overlap/cross.
    if (!circularLinksActuallyCrossLite(prev, curr)) continue;
    const prevBottom = prev.circularPathData.verticalFullExtent + prev.width / 2;
    const currTop = curr.circularPathData.verticalFullExtent - curr.width / 2;
    const gap = currTop - prevBottom;
    assert.ok(
      gap >= circularGap - 1e-5,
      `Bottom gap violated between ${prev.source.name}→${prev.target.name} and ` +
        `${curr.source.name}→${curr.target.name}: gap=${gap.toFixed(2)}px, need >=${circularGap}`
    );
  }
});

test("top circular links maintain minimum vertical gap (circularGap)", () => {
  const chart = makeChart();
  const circularGap = 1;
  const topCircular = chart.graph.links.filter(
    (l) => l.circular && l.circularLinkType === "top" && !l.isVirtual
  );

  // Sort by verticalFullExtent descending (inner links first = higher VFE)
  topCircular.sort(
    (a, b) => b.circularPathData.verticalFullExtent - a.circularPathData.verticalFullExtent
  );

  for (let i = 1; i < topCircular.length; i++) {
    const prev = topCircular[i - 1]; // higher VFE = closer to nodes
    const curr = topCircular[i];     // lower VFE = further from nodes (higher visually)
    // We only enforce vertical separation when these two circulars can actually overlap/cross.
    if (!circularLinksActuallyCrossLite(prev, curr)) continue;
    const prevTopEdge = prev.circularPathData.verticalFullExtent - prev.width / 2;
    const currBottomEdge = curr.circularPathData.verticalFullExtent + curr.width / 2;
    const gap = prevTopEdge - currBottomEdge;
    assert.ok(
      gap >= circularGap - 1e-5,
      `Top gap violated between ${prev.source.name}→${prev.target.name} and ` +
        `${curr.source.name}→${curr.target.name}: gap=${gap.toFixed(2)}px, need >=${circularGap}`
    );
  }
});

test("circular links from same source column maintain horizontal clearance at right leg when vertically overlapping", () => {
  const chart = makeChart();
  const allCircular = chart.graph.links.filter(
    (l) => l.circular && !l.isVirtual
  );

  // Group ALL circular links by source column (not by type)
  const bySourceCol = {};
  allCircular.forEach((l) => {
    const col = l.source.column;
    if (!bySourceCol[col]) bySourceCol[col] = [];
    bySourceCol[col].push(l);
  });

  // Helper: get Y range on right leg
  function getYRange(link) {
    if (link.circularLinkType === 'top') {
      return [link.circularPathData.verticalFullExtent, link.source.y0];
    } else {
      return [link.source.y1, link.circularPathData.verticalFullExtent];
    }
  }

  // Helper: check if two Y ranges overlap
  function yRangesOverlap(a, b) {
    const [aMin, aMax] = getYRange(a);
    const [bMin, bMax] = getYRange(b);
    return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin)) > 1e-6;
  }

  Object.entries(bySourceCol).forEach(([col, group]) => {
    if (group.length < 2) return;
    // Sort by rightFullExtent (innermost first)
    group.sort((a, b) => a.circularPathData.rightFullExtent - b.circularPathData.rightFullExtent);

    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const curr = group[i];
      
      // Only check clearance if their vertical ranges overlap on the right leg
      if (!yRangesOverlap(prev, curr)) continue;
      
      const prevRight = prev.circularPathData.rightFullExtent + prev.width / 2;
      const currLeft = curr.circularPathData.rightFullExtent - curr.width / 2;
      const gap = currLeft - prevRight;
      assert.ok(
        gap >= -1e-6,
        `Right-leg overlap at source col ${col}: ` +
          `${prev.source.name}→${prev.target.name} (${prev.circularLinkType}) and ` +
          `${curr.source.name}→${curr.target.name} (${curr.circularLinkType}): gap=${gap.toFixed(2)}px`
      );
    }
  });
});

test("circular links from same target column and same type (top/bottom) maintain horizontal clearance at left leg when vertically overlapping", () => {
  const chart = makeChart();
  // Skip self-loops: they are handled by right leg clearance (source col grouping)
  // NOTE: TOP and BOTTOM links are grouped SEPARATELY because they go in opposite directions
  // and their left legs don't intersect.
  const allCircular = chart.graph.links.filter(
    (l) => l.circular && !l.isVirtual && !isSelf(l)
  );

  // Group by circularLinkType + target column - matches the algorithm logic
  const byTypeAndCol = {};
  allCircular.forEach((l) => {
    const key = `${l.circularLinkType}|${l.target.column}`;
    if (!byTypeAndCol[key]) byTypeAndCol[key] = [];
    byTypeAndCol[key].push(l);
  });

  // Helper: check if two links' vertical ranges overlap on the left leg
  function verticalOverlap(a, b) {
    const aTargetY = a.target.y1;
    const aVfe = a.circularPathData.verticalFullExtent;
    const aYMin = Math.min(aTargetY, aVfe);
    const aYMax = Math.max(aTargetY, aVfe);
    
    const bTargetY = b.target.y1;
    const bVfe = b.circularPathData.verticalFullExtent;
    const bYMin = Math.min(bTargetY, bVfe);
    const bYMax = Math.max(bTargetY, bVfe);
    
    return (aYMin <= bYMax) && (bYMin <= aYMax);
  }

  Object.entries(byTypeAndCol).forEach(([key, group]) => {
    if (group.length < 2) return;
    // Sort by leftFullExtent (outermost first = smallest value, most to the left)
    group.sort((a, b) => a.circularPathData.leftFullExtent - b.circularPathData.leftFullExtent);

    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1]; // outer (more left)
      const curr = group[i];     // inner (more right)
      
      // Only check clearance if their vertical ranges overlap on the left leg
      if (!verticalOverlap(prev, curr)) continue;
      
      const prevRight = prev.circularPathData.leftFullExtent + prev.width / 2;
      const currLeft = curr.circularPathData.leftFullExtent - curr.width / 2;
      const gap = currLeft - prevRight;
      assert.ok(
        gap >= -1e-6,
        `Left-leg overlap (${key}): ` +
          `${prev.source.name}→${prev.target.name} and ` +
          `${curr.source.name}→${curr.target.name}: gap=${gap.toFixed(2)}px`
      );
    }
  });
});

test("self-loops remain compact (height <= 40px)", () => {
  const chart = makeChart();
  const maxSelfLoopHeight = 40;
  const selfLoops = chart.graph.links.filter(
    (l) => l.circular && !l.isVirtual && isSelf(l)
  );

  selfLoops.forEach((l) => {
    const nodeY = l.circularLinkType === "bottom" ? l.source.y1 : l.source.y0;
    const vfe = l.circularPathData.verticalFullExtent;
    const height = l.circularLinkType === "bottom" ? vfe - nodeY : nodeY - vfe;
    assert.ok(
      height <= maxSelfLoopHeight,
      `Self-loop ${l.source.name}→${l.target.name} (${l.circularLinkType}) too tall: ` +
        `height=${height.toFixed(1)}px, max=${maxSelfLoopHeight}px`
    );
  });
});

test("circular port ordering: spans are monotonic by band (bottom: outer has larger span)", () => {
  const chart = makeChart();
  const bottomCircular = chart.graph.links.filter(
    (l) => l.circular && l.circularLinkType === "bottom" && !l.isVirtual
  );

  // Group by target node
  const byTarget = {};
  bottomCircular.forEach((l) => {
    const t = l.target.name;
    if (!byTarget[t]) byTarget[t] = [];
    byTarget[t].push(l);
  });

  Object.entries(byTarget).forEach(([targetName, group]) => {
    // Self-loops are handled by a separate geometry path and can legitimately be outer
    // regardless of span (span=0), so they are excluded from this monotonicity invariant.
    group = group.filter((l) => !isSelf(l));
    if (group.length < 2) return;
    // Sort by verticalFullExtent (innermost first = lower VFE)
    group.sort((a, b) => a.circularPathData.verticalFullExtent - b.circularPathData.verticalFullExtent);
    const spans = group.map(span);
    // Outer links (higher VFE) should have >= span compared to inner
    assertNonDecreasing(spans, `Bottom into ${targetName}: span should increase outward`);
  });
});

test("circular port ordering: spans are monotonic by band (top: outer has larger span)", () => {
  const chart = makeChart();
  const topCircular = chart.graph.links.filter(
    (l) => l.circular && l.circularLinkType === "top" && !l.isVirtual
  );

  // Group by target node
  const byTarget = {};
  topCircular.forEach((l) => {
    const t = l.target.name;
    if (!byTarget[t]) byTarget[t] = [];
    byTarget[t].push(l);
  });

  Object.entries(byTarget).forEach(([targetName, group]) => {
    // Self-loops are handled by a separate geometry path and can legitimately be outer
    // regardless of span (span=0), so they are excluded from this monotonicity invariant.
    group = group.filter((l) => !isSelf(l));
    if (group.length < 2) return;
    // Sort by verticalFullExtent descending (innermost first = higher VFE, closer to nodes)
    group.sort((a, b) => b.circularPathData.verticalFullExtent - a.circularPathData.verticalFullExtent);
    const spans = group.map(span);
    // Outer links (lower VFE) should have >= span
    assertNonDecreasing(spans, `Top into ${targetName}: span should increase outward`);
  });
});

test("top group ordering: backlinks to schedule ○ stay below listing ○ / filter bundles when maxSpan ties", () => {
  const chart = makeChart();

  function findLink(source, target) {
    return chart.graph.links.find(
      (l) =>
        l.circular &&
        !l.isVirtual &&
        l.circularLinkType === "top" &&
        l.source?.name === source &&
        l.target?.name === target
    );
  }

  // The reported case:
  // - sosisa ● / sosisa ◐ → schedule ○ should be LOWER (larger vfe) than
  // - listing ● → listing ○ and schedule ◐ → filter
  const s1 = findLink("sosisa ●", "schedule ○");
  const s2 = findLink("sosisa ◐", "schedule ○");
  const l1 = findLink("listing ●", "listing ○");
  const f1 = findLink("schedule ◐", "filter");

  assert.ok(s1, "Missing link sosisa ● → schedule ○ (top)");
  assert.ok(s2, "Missing link sosisa ◐ → schedule ○ (top)");
  assert.ok(l1, "Missing link listing ● → listing ○ (top)");
  assert.ok(f1, "Missing link schedule ◐ → filter (top)");

  const ref = Math.max(l1.circularPathData.verticalFullExtent, f1.circularPathData.verticalFullExtent);
  assert.ok(
    s1.circularPathData.verticalFullExtent >= ref - 1e-6,
    `Expected sosisa ● → schedule ○ to be below listing/filter bundles: ` +
      `vfe=${s1.circularPathData.verticalFullExtent.toFixed(2)} vs ref=${ref.toFixed(2)}`
  );
  assert.ok(
    s2.circularPathData.verticalFullExtent >= ref - 1e-6,
    `Expected sosisa ◐ → schedule ○ to be below listing/filter bundles: ` +
      `vfe=${s2.circularPathData.verticalFullExtent.toFixed(2)} vs ref=${ref.toFixed(2)}`
  );
});
