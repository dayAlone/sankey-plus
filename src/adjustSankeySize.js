import {groups, sum, min, max} from "d3";

export function adjustSankeySize(
  inputGraph,
  useManualScale,
  nodePadding,
  nodeWidth,
  scaleDomain,
  scaleRange,
  circularLinkPortionTopBottom,
  circularLinkPortionLeftRight,
  scale,
  baseRadius,
  circularPortGapPx
) {
  let graph = inputGraph;

  let columns = 
    groups(graph.nodes, (d) => d.column)
    .sort((a, b) => a[0] - b[0])
    .map((d) => d[1]);

  if (true) {
    graph.py = nodePadding;

    // Compute per-node additional internal height needed for circular port gaps.
    // This keeps circular links from "spilling" outside the node when we add spacing.
    var portGap = circularPortGapPx || 0;
    var nodeById = {};
    graph.nodes.forEach(function(n) {
      nodeById[n.index] = n;
      n._circularPortGapPx = 0;
    });

    if (portGap > 0) {
      // Count circular links per node and side (top/bottom) for both outgoing and incoming.
      var counts = {};
      graph.links.forEach(function(l) {
        if (!l.circular) return;
        if (!l.source || !l.target) return;
        var sId = l.source.index;
        var tId = l.target.index;
        if (counts[sId] === undefined) counts[sId] = { outTop: 0, outBottom: 0, inTop: 0, inBottom: 0 };
        if (counts[tId] === undefined) counts[tId] = { outTop: 0, outBottom: 0, inTop: 0, inBottom: 0 };
        if (l.circularLinkType === "bottom") {
          counts[sId].outBottom++;
          counts[tId].inBottom++;
        } else {
          counts[sId].outTop++;
          counts[tId].inTop++;
        }
      });

      graph.nodes.forEach(function(n) {
        if (n.virtual) return;
        var c = counts[n.index] || { outTop: 0, outBottom: 0, inTop: 0, inBottom: 0 };
        var outGaps = Math.max(0, c.outTop - 1) + Math.max(0, c.outBottom - 1);
        var inGaps = Math.max(0, c.inTop - 1) + Math.max(0, c.inBottom - 1);
        // Node must be large enough for both incoming and outgoing port stacks.
        n._circularPortGapPx = Math.max(outGaps, inGaps) * portGap;
      });
    }

    // Keep this accessible for later stages
    graph.circularPortGapPx = portGap;

    // Compute ky per column, subtracting internal circular port gaps from available height.
    var ky = min(columns, function (nodes) {
      var totalGapPx = sum(nodes, function(d) {
        return d.virtual ? 0 : (d._circularPortGapPx || 0);
      });
      var available =
        (graph.y1 - graph.y0 - (nodes.length - 1) * graph.py - totalGapPx);
      return (
        available /
        sum(nodes, function (d) {
          return d.virtual ? 0 : d.value;
        })
      );
    });

    let maxColumnSum = max(columns, function (nodes) {
      let sumNodesValue =
        sum(nodes, function (d) {
          return d.virtual ? 0 : d.value;
        }) +
        (nodes.length - 1) * graph.py;
      return sumNodesValue;
    });

    let ky1 = (graph.y1 - graph.y0) / maxColumnSum;

    //calculate the widths of the links
    graph.ky = ky * scale;

    graph.links.forEach(function (link) {
      link.width = link.value * graph.ky;
    });

    //determine how much to scale down the chart, based on circular links

    var totalTopLinksWidth = 0,
      totalBottomLinksWidth = 0,
      totalRightLinksWidth = 0,
      totalLeftLinksWidth = 0;

    var maxColumn = max(graph.nodes, function (node) {
      return node.column;
    });

    graph.links.forEach(function (link) {
      if (link.circular) {
        if (link.circularLinkType == "top") {
          totalTopLinksWidth = totalTopLinksWidth + link.width;
        } else {
          totalBottomLinksWidth = totalBottomLinksWidth + link.width;
        }

        if (link.target.column == 0) {
          totalLeftLinksWidth = totalLeftLinksWidth + link.width;
        }

        if (link.source.column == maxColumn) {
          totalRightLinksWidth = totalRightLinksWidth + link.width;
        }
      }
    });

    //account for radius of curves and padding between links
    totalTopLinksWidth =
      totalTopLinksWidth > 0
        ? totalTopLinksWidth + baseRadius
        : totalTopLinksWidth;
    totalBottomLinksWidth =
      totalBottomLinksWidth > 0
        ? totalBottomLinksWidth + baseRadius
        : totalBottomLinksWidth;
    totalRightLinksWidth =
      totalRightLinksWidth > 0
        ? totalRightLinksWidth + baseRadius
        : totalRightLinksWidth;
    totalLeftLinksWidth =
      totalLeftLinksWidth > 0
        ? totalLeftLinksWidth + baseRadius
        : totalLeftLinksWidth;

    var margin = {
      top: totalTopLinksWidth,
      bottom: totalBottomLinksWidth,
      left: totalLeftLinksWidth,
      right: totalRightLinksWidth,
    };

    graph.nodes.forEach(function (node) {
      node.x0 =
        graph.x0 +
        node.column * ((graph.x1 - graph.x0 - nodeWidth) / maxColumn);
      node.x1 = node.x0 + nodeWidth;
    });
  }

  return graph;
}
