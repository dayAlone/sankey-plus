const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// UMD bundle expects a global `self` (browser). Provide it for Node.
globalThis.self = globalThis;

const { SankeyChart } = require(path.join("..", "dist", "sankeyPlus.js"));

const links = require(path.join("..", "test-debug-links.json"));

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
  const linksData = links.map((l) => ({ ...l }));

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
    const prevBottom = prev.circularPathData.verticalFullExtent + prev.width / 2;
    const currTop = curr.circularPathData.verticalFullExtent - curr.width / 2;
    const gap = currTop - prevBottom;
    assert.ok(
      gap >= circularGap - 1e-6,
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
    const prevTopEdge = prev.circularPathData.verticalFullExtent - prev.width / 2;
    const currBottomEdge = curr.circularPathData.verticalFullExtent + curr.width / 2;
    const gap = prevTopEdge - currBottomEdge;
    assert.ok(
      gap >= circularGap - 1e-6,
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

test("self-loops remain compact (height <= 20px)", () => {
  const chart = makeChart();
  const maxSelfLoopHeight = 20;
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
    if (group.length < 2) return;
    // Sort by verticalFullExtent descending (innermost first = higher VFE, closer to nodes)
    group.sort((a, b) => b.circularPathData.verticalFullExtent - a.circularPathData.verticalFullExtent);
    const spans = group.map(span);
    // Outer links (lower VFE) should have >= span
    assertNonDecreasing(spans, `Top into ${targetName}: span should increase outward`);
  });
});
