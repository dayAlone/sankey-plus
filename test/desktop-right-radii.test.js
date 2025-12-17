const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// UMD bundle expects a global `self` (browser). Provide it for Node.
globalThis.self = globalThis;
const { SankeyChart } = require(path.join("..", "dist", "sankeyPlus.js"));

function makeDesktopChart() {
  const html = fs.readFileSync(path.join(__dirname, "..", "test-debug-desktop.html"), "utf8");
  const nodesMatch = html.match(/\b(?:let|const)\s+nodes\s*=\s*(\[[\s\S]*?\]);/);
  const linksMatch = html.match(/\b(?:let|const)\s+links\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(nodesMatch, "Failed to parse nodes from test-debug-desktop.html");
  assert.ok(linksMatch, "Failed to parse links from test-debug-desktop.html");
  // eslint-disable-next-line no-new-func
  const nodes = Function(`"use strict"; return (${nodesMatch[1]});`)();
  // eslint-disable-next-line no-new-func
  const links = Function(`"use strict"; return (${linksMatch[1]});`)();

  const chart = new SankeyChart({
    align: "left",
    id: (d) => d.name,
    iterations: 10,
    scale: 0.3,
    padding: 25,
    width: 1200,
    height: 700,
    nodes: {
      data: nodes.map((n) => ({ ...n })),
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
      data: links.map((l) => ({ ...l })),
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
      typeOrder: ["booking", "search_loop", "primary", "secondary", "search_nearby", "schedule"],
      typeAccessor: (d) => d.type,
      types: {},
    },
    arrows: { enabled: false },
  });
  chart.process();
  return chart;
}

test("desktop: listing ●→search ○ should not be noticeably more right-shifted than sosisa ◐→search ○ (right radii)", () => {
  const chart = makeDesktopChart();
  const a = chart.graph.links.find((l) => l.source?.name === "listing ●" && l.target?.name === "search ○");
  const b = chart.graph.links.find((l) => l.source?.name === "sosisa ◐" && l.target?.name === "search ○");
  assert.ok(a && b, "Missing expected desktop links");
  assert.ok(a.circular && b.circular, "Expected both links to be circular");
  assert.equal(a.circularLinkType, "top");
  assert.equal(b.circularLinkType, "top");
  assert.equal(a.type, "search_nearby");
  assert.equal(b.type, "search_nearby");

  const ar = a.circularPathData?.rightLargeArcRadius;
  const br = b.circularPathData?.rightLargeArcRadius;
  assert.ok(Number.isFinite(ar) && Number.isFinite(br), "Missing rightLargeArcRadius");

  // We just want to prevent the "big jump" regression; allow moderate differences.
  // (Exact ordering can vary a bit with other links, but it shouldn't balloon.)
  const delta = Math.abs(ar - br);
  assert.ok(delta <= 10, `Expected right radii delta<=10, got ${delta.toFixed(3)}`);
});

test("desktop: bottom circular shelves should not horizontally overlap (listing ○→search ● vs filter backlinks)", () => {
  const chart = makeDesktopChart();
  const gap = 1; // matches links.circularGap in makeDesktopChart()

  const listingToSearchLoop = chart.graph.links.find(
    (l) => l.source?.name === "listing ○" && l.target?.name === "search ●"
  );
  const scheduleToFilter = chart.graph.links.find(
    (l) => l.source?.name === "schedule ○" && l.target?.name === "filter"
  );
  const filterOffToFilter = chart.graph.links.find(
    (l) => l.source?.name === "filter off" && l.target?.name === "filter"
  );

  assert.ok(listingToSearchLoop && scheduleToFilter && filterOffToFilter, "Missing expected desktop links");
  assert.ok(listingToSearchLoop.circular && scheduleToFilter.circular && filterOffToFilter.circular, "Expected links to be circular");
  assert.equal(listingToSearchLoop.circularLinkType, "bottom");
  assert.equal(scheduleToFilter.circularLinkType, "bottom");
  assert.equal(filterOffToFilter.circularLinkType, "bottom");

  function shelf(link) {
    const c = link.circularPathData;
    assert.ok(c, "Missing circularPathData");
    const x1 = Math.min(c.leftInnerExtent, c.rightInnerExtent);
    const x2 = Math.max(c.leftInnerExtent, c.rightInnerExtent);
    return { vfe: c.verticalFullExtent, x1, x2, w: link.width };
  }
  function xOverlap(a, b) {
    return Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  }

  const a = shelf(listingToSearchLoop);
  const b = shelf(scheduleToFilter);
  const c = shelf(filterOffToFilter);

  function assertNoShelfOverlay(nameA, sa, nameB, sb) {
    const ox = xOverlap(sa, sb);
    if (ox <= 1e-6) return; // no horizontal overlap => OK
    const dy = Math.abs(sa.vfe - sb.vfe);
    const minDy = (sa.w + sb.w) / 2 + gap - 1e-3; // small epsilon
    assert.ok(
      dy >= minDy,
      `Expected no horizontal shelf overlap between ${nameA} and ${nameB}: xOverlap=${ox.toFixed(
        2
      )}, dy=${dy.toFixed(3)} < minDy=${minDy.toFixed(3)}`
    );
  }

  assertNoShelfOverlay("listing ○→search ●", a, "schedule ○→filter", b);
  assertNoShelfOverlay("listing ○→search ●", a, "filter off→filter", c);
});

test("desktop: filter backlinks should not overlap each other on the same bottom shelf (schedule ○→filter vs filter off→filter)", () => {
  const chart = makeDesktopChart();
  const gap = 1;

  const aLink = chart.graph.links.find((l) => l.source?.name === "schedule ○" && l.target?.name === "filter");
  const bLink = chart.graph.links.find((l) => l.source?.name === "filter off" && l.target?.name === "filter");
  assert.ok(aLink && bLink, "Missing expected desktop filter backlinks");
  assert.ok(aLink.circular && bLink.circular, "Expected both links to be circular");
  assert.equal(aLink.circularLinkType, "bottom");
  assert.equal(bLink.circularLinkType, "bottom");

  function shelf(link) {
    const c = link.circularPathData;
    assert.ok(c, "Missing circularPathData");
    const x1 = Math.min(c.leftInnerExtent, c.rightInnerExtent);
    const x2 = Math.max(c.leftInnerExtent, c.rightInnerExtent);
    return { vfe: c.verticalFullExtent, x1, x2, w: link.width };
  }
  function xOverlap(a, b) {
    return Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  }

  const a = shelf(aLink);
  const b = shelf(bLink);
  const ox = xOverlap(a, b);
  assert.ok(ox > 1e-6, "Expected the two filter backlinks to have horizontal overlap in X");

  const dy = Math.abs(a.vfe - b.vfe);
  const minDy = (a.w + b.w) / 2 + gap - 1e-3;
  assert.ok(
    dy >= minDy,
    `Expected schedule ○→filter and filter off→filter to be vertically separated: xOverlap=${ox.toFixed(
      2
    )}, dy=${dy.toFixed(3)} < minDy=${minDy.toFixed(3)}`
  );
});


