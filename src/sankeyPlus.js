import { find } from "./find.js";
//import { constant } from './constant.js';
import {group, groups, sum, mean, min, max, select, range, scaleLinear, linkHorizontal} from "d3";
import { findCircuits } from "./networks/elementaryCircuits.js";
import {
  getNodeID,
  value,
  numberOfNonSelfLinkingCycles,
  linkTargetCenter,
  linkSourceCenter,
  nodeCenter,
  getSelfLinksHeight,
} from "./nodeAttributes.js";
import { selfLinking } from "./linkAttributes.js";
import { left, right, center, justify } from "./align.js";
import { clone } from "./clone.js"; //https://github.com/pvorb/clone
import {
  ascendingBreadth,
  ascendingTargetBreadth,
  ascendingSourceBreadth,
  sortSourceLinks,
  sortTargetLinks,
} from "./sortGraph.js";
import { addCircularPathData } from "./circularPath.js";
import { adjustSankeySize } from "./adjustSankeySize.js";
import { adjustGraphExtents } from "./adjustGraphExtents.js";

//internal functions

const _typeof =
  typeof Symbol === "function" && typeof Symbol.iterator === "symbol"
    ? function (obj) {
        return typeof obj;
      }
    : function (obj) {
        return obj &&
          typeof Symbol === "function" &&
          obj.constructor === Symbol &&
          obj !== Symbol.prototype
          ? "symbol"
          : typeof obj;
      };

function createMap(arr, id) {
  let m = new Map();

  let nodeByIDGroup = group(arr, id);
  nodeByIDGroup.forEach(function (value, key) {
    m.set(key, value[0]);
  });

  return m;
}

function computeNodeLinks(inputGraph, id) {
  let graph = inputGraph;

  graph.nodes.forEach(function (node, i) {
    node.index = i;
    node.sourceLinks = [];
    node.targetLinks = [];
  });

  let nodeByID = createMap(graph.nodes, id);

  graph.links.forEach(function (link, i) {
    link.index = i;
    var source = link.source;
    var target = link.target;
    if (
      (typeof source === "undefined" ? "undefined" : _typeof(source)) !==
      "object"
    ) {
      source = link.source = find(nodeByID, source);
    }
    if (
      (typeof target === "undefined" ? "undefined" : _typeof(target)) !==
      "object"
    ) {
      target = link.target = find(nodeByID, target);
    }
    source.sourceLinks.push(link);
    target.targetLinks.push(link);
  });
  return graph;
}

function identifyCircles(inputGraph, sortNodes) {
  let graph = inputGraph;

  var circularLinkID = 0;
  if (sortNodes === null || sortNodes(graph.nodes[0]) === undefined) {
    // Building adjacency graph
    var adjList = [];
    for (var i = 0; i < graph.links.length; i++) {
      var link = graph.links[i];
      var source = link.source.index;
      var target = link.target.index;
      if (!adjList[source]) adjList[source] = [];
      if (!adjList[target]) adjList[target] = [];

      // Add links if not already in set
      if (adjList[source].indexOf(target) === -1) adjList[source].push(target);
    }

    // Find all elementary circuits
    let cycles = findCircuits(adjList);

    // Sort by circuits length
    cycles.sort(function (a, b) {
      return a.length - b.length;
    });

    let circularLinks = {};
    for (i = 0; i < cycles.length; i++) {
      var cycle = cycles[i];
      var last = cycle.slice(-2);
      if (!circularLinks[last[0]]) circularLinks[last[0]] = {};
      circularLinks[last[0]][last[1]] = true;
    }

    graph.links.forEach(function (link) {
      var target = link.target.index;
      var source = link.source.index;
      // If self-linking or a back-edge
      if (
        target === source ||
        (circularLinks[source] && circularLinks[source][target])
      ) {
        link.circular = true;
        link.circularLinkID = circularLinkID;
        circularLinkID = circularLinkID + 1;
      } else {
        link.circular = false;
      }
    });
  } else {
    graph.links.forEach(function (link) {
      //if (link.source[sortNodes] < link.target[sortNodes]) {
      if (sortNodes(link.source) < sortNodes(link.target)) {
        link.circular = false;
      } else {
        link.circular = true;
        link.circularLinkID = circularLinkID;
        circularLinkID = circularLinkID + 1;
      }
    });
  }

  return graph;
}

// Assign a circular link type (top or bottom), based on:
// - if the source/target node already has circular links, then use the same type
// - if not, choose the type with fewer links
function selectCircularLinkTypes(inputGraph, id) {
  let graph = inputGraph;

  // Reset any per-run forced routing hints
  graph.links.forEach(function (l) {
    if (l && l._forcedCircularLinkType) delete l._forcedCircularLinkType;
  });

  let numberOfTops = 0;
  let numberOfBottoms = 0;
  graph.links.forEach(function (link) {
    if (link.circular) {
      // if either souce or target has type already use that
      if (link.source.circularLinkType || link.target.circularLinkType) {
        // default to source type if available
        link.circularLinkType = link.source.circularLinkType
          ? link.source.circularLinkType
          : link.target.circularLinkType;
      } else {
        link.circularLinkType =
          numberOfTops < numberOfBottoms ? "top" : "bottom";
      }

      if (link.circularLinkType == "top") {
        numberOfTops = numberOfTops + 1;
      } else {
        numberOfBottoms = numberOfBottoms + 1;
      }

      graph.nodes.forEach(function (node) {
        if (
          getNodeID(node, id) == getNodeID(link.source, id) ||
          getNodeID(node, id) == getNodeID(link.target, id)
        ) {
          node.circularLinkType = link.circularLinkType;
        }
      });
    }
  });

  // First pass: determine types for non-self circular links based on vertical positions
  graph.links.forEach(function (link) {
    if (link.circular && !selfLinking(link, id)) {
      var sourceCenter = (link.source.y0 + link.source.y1) / 2;
      var targetCenter = (link.target.y0 + link.target.y1) / 2;
      
      // Check if this is a forward circular link (goes left to right but is part of cycle)
      var isForwardCircular = link.target.column > link.source.column;
      
      if (isForwardCircular) {
        // Forward circular links: route above the main flow to avoid crossing
        if (targetCenter >= sourceCenter) {
          link.circularLinkType = "top";
        } else {
          link.circularLinkType = "bottom";
        }
      } else {
        // Backward circular links: route towards target
        // Prefer geometric consistency but allow balancing if not extreme
        // Only force type if target is significantly vertically separated
        var verticalDiff = targetCenter - sourceCenter;
        var totalHeight = graph.y1 - graph.y0;
        
        // If separation is > 30% of chart height, force geometry
        if (Math.abs(verticalDiff) > totalHeight * 0.3) {
           if (verticalDiff < 0) { // Target above source
             link.circularLinkType = "top";
           } else {
             link.circularLinkType = "bottom";
           }
        }
        // Otherwise keep the balanced assignment (from lines 170-172)
      }
    }
  });

  // Local-backlink heuristic:
  // For very local backward links (span=1), routing them BELOW usually reduces crossings
  // because they sit under the dense TOP bundles. This matches the UX expectation for
  // "between two adjacent columns" backlinks.
  graph.links.forEach(function (link) {
    if (!link.circular || selfLinking(link, id)) return;
    if (link._forcedCircularLinkType) return;
    if (!link.source || !link.target) return;

    var span = Math.abs((link.source.column || 0) - (link.target.column || 0));
    var isBackward = (link.target.column || 0) < (link.source.column || 0);
    if (!(isBackward && span === 1)) return;

    var sourceCenter = (link.source.y0 + link.source.y1) / 2;
    var targetCenter = (link.target.y0 + link.target.y1) / 2;
    var srcH = (link.source.y1 - link.source.y0) || 0;
    var tgtH = (link.target.y1 - link.target.y0) || 0;
    var localThreshold = Math.max(srcH, tgtH); // "nearby" in the same band of the diagram

    if (Math.abs(targetCenter - sourceCenter) <= localThreshold) {
      link.circularLinkType = "bottom";
      link._forcedCircularLinkType = "bottom";
    }
  });

  // Consistency pass: prevent X-crossings for links leaving the same column
  // If a link from a lower node goes Top, and a link from an upper node goes Bottom, they cross.
  // We should swap them or force them to be consistent.
  var linksByColumn = groups(graph.links.filter(l => l.circular && !selfLinking(l, id)), l => l.source.column);
  
  linksByColumn.forEach(([col, links]) => {
    // Sort links by source Y (top to bottom)
    links.sort((a, b) => ((a.source.y0 + a.source.y1)/2) - ((b.source.y0 + b.source.y1)/2));
    
    // We want to avoid the pattern: [Bottom, ..., Top]
    // Because Bottom means "goes down" (from upper node), Top means "goes up" (from lower node).
    // Actually, Bottom means "route below", Top means "route above".
    // Upper node (small Y) -> Bottom (goes down).
    // Lower node (large Y) -> Top (goes up).
    // This is the X-crossing.
    
    // So if we see a Bottom link followed by a Top link, we have a problem.
    // We should enforce a transition point: Top links then Bottom links (or all Top, or all Bottom).
    // Wait. Top links go UP. Bottom links go DOWN.
    // Upper nodes should go Top (up). Lower nodes should go Bottom (down).
    // This maximizes separation.
    
    // Current heuristic: Target < Source => Top.
    // If Target is above, go Top.
    
    // Let's just fix the specific conflict if found.
    // Find last Bottom link index and first Top link index.
    // If first Top > last Bottom (indices in sorted array), we are fine (Top ... Bottom).
    // No, wait.
    // Top links (go up) should be from UPPER nodes?
    // If Upper node goes Top (up), it clears the space.
    // If Lower node goes Bottom (down), it clears the space.
    // So we want [Top, Top, ..., Bottom, Bottom].
    
    // If we have [Bottom, Top], then Upper node goes Bottom (down), Lower node goes Top (up). CROSSING!
    
    // So we iterate and check for Bottom followed by Top.
    var lastBottomIndex = -1;
    links.forEach((l, i) => {
      if (l.circularLinkType === "bottom") lastBottomIndex = i;
    });
    
    var firstTopAfterBottom = -1;
    if (lastBottomIndex !== -1) {
      for (var i = lastBottomIndex + 1; i < links.length; i++) {
        if (links[i].circularLinkType === "top") {
          firstTopAfterBottom = i;
          break;
        }
      }
    }
    
    if (firstTopAfterBottom !== -1) {
      // We found a Bottom link (from upper node) followed by a Top link (from lower node).
      // This causes a crossing.
      // We need to resolve this.
      // Strategy: Force the "Bottom" link to be "Top" (if target is high) or "Top" link to be "Bottom" (if target is low).
      // Or just flip one of them to match the other?
      
      // Let's force all links in the "crossing zone" to be the same type?
      // Or simply: If we have this pattern, flip the Bottom one to Top?
      // Upper node going Bottom is usually worse than Upper node going Top (unless target is REALLY low).
      
      // Let's try to flip the Bottom link to Top.
      // Link at lastBottomIndex is "bottom". Flip to "top".
      // But verify if that makes sense.
      // If we flip it, we might create other issues?
      // Assuming "Top" is generally safe for links going to higher targets.
      
      // In our specific case: Link 25 (Upper) is Bottom. Link 2 (Lower) is Top.
      // We want Link 25 to be Top.
      
      var badBottomLink = links[lastBottomIndex];
      // Respect explicit routing decisions (e.g. headroom balancing below)
      if (badBottomLink && badBottomLink._forcedCircularLinkType) {
        return;
      }
      // Only flip if target is actually above source (geometry supports Top)
      var srcY = (badBottomLink.source.y0 + badBottomLink.source.y1) / 2;
      var tgtY = (badBottomLink.target.y0 + badBottomLink.target.y1) / 2;
      
      if (tgtY < srcY) {
         badBottomLink.circularLinkType = "top";
      }
    }
  });

  // Local relief pass (conservative):
  // If a target node has a very large TOP bundle, allow moving AT MOST ONE *distant* backlink
  // (large span) to BOTTOM. This makes the bundle "wrap" (outer/distant goes lower) and
  // reduces crossings in dense areas, without splitting many links across both sides.
  var nonSelfCircular = graph.links.filter((l) => l.circular && !selfLinking(l, id));
  var linksByTarget = groups(nonSelfCircular, (l) => getNodeID(l.target, id));

  linksByTarget.forEach(([targetId, linksToTarget]) => {
    if (!linksToTarget || linksToTarget.length < 2) return;
    var topLinks = linksToTarget.filter((l) => l.circularLinkType === "top");
    var bottomLinks = linksToTarget.filter((l) => l.circularLinkType === "bottom");

    // Already has bottom links -> don't add more (avoid both-sides-from-far effect)
    if (bottomLinks.length > 0) return;

    // Only if target is really congested on top
    if (topLinks.length < 8) return;

    // Prefer the most distant backlink(s) first. We only move ONE to avoid the
    // "distant links from both sides" look.
    var candidates = topLinks.filter((l) => {
      var isBackward = (l.target.column || 0) <= (l.source.column || 0);
      return isBackward;
    });
    if (candidates.length === 0) return;

    candidates.sort((a, b) => {
      var as = Math.abs((a.source.column || 0) - (a.target.column || 0));
      var bs = Math.abs((b.source.column || 0) - (b.target.column || 0));
      if (as !== bs) return bs - as; // longest first
      var aw = a.width || 0;
      var bw = b.width || 0;
      return bw - aw; // thicker first as tie-break
    });

    var chosen = candidates[0];
    chosen.circularLinkType = "bottom";
    chosen._forcedCircularLinkType = "bottom";
  });
  
  // Second pass: determine types for self-links based on other circular links of the same node
  graph.links.forEach(function (link) {
    if (link.circular && selfLinking(link, id)) {
      // Find the predominant type of other circular links for this node
      var topCount = 0;
      var bottomCount = 0;
      
      link.source.sourceLinks.forEach(function(l) {
        if (l.circular && !selfLinking(l, id)) {
          if (l.circularLinkType === "top") topCount++;
          else if (l.circularLinkType === "bottom") bottomCount++;
        }
      });
      link.source.targetLinks.forEach(function(l) {
        if (l.circular && !selfLinking(l, id)) {
          if (l.circularLinkType === "top") topCount++;
          else if (l.circularLinkType === "bottom") bottomCount++;
        }
      });
      
      if (topCount > 0 || bottomCount > 0) {
        // Put self-link on opposite side from majority of other circular links
        var otherType = topCount >= bottomCount ? "top" : "bottom";
        link.circularLinkType = otherType === "top" ? "bottom" : "top";
      }
      // else keep the type assigned earlier (for nodes with only self-links)
    }
  });

  return graph;
}

// Synchronize bidirectional circular links to prevent overlap
// Must be called AFTER selectCircularLinkTypes
function synchronizeBidirectionalLinks(inputGraph, id) {
  let graph = inputGraph;
  
  var processedPairs = new Set();
  
  graph.links.forEach(function (link) {
    if (!link.circular || selfLinking(link, id)) return;
    
    var linkId = getNodeID(link.source, id) + '-' + getNodeID(link.target, id);
    var reverseLinkId = getNodeID(link.target, id) + '-' + getNodeID(link.source, id);
    
    if (processedPairs.has(linkId) || processedPairs.has(reverseLinkId)) return;
    
    // Find reverse link
    var reverseLink = graph.links.find(function(l) {
      return l.circular && 
             !selfLinking(l, id) &&
             getNodeID(l.source, id) === getNodeID(link.target, id) &&
             getNodeID(l.target, id) === getNodeID(link.source, id);
    });
    
    if (reverseLink) {
      // Found a pair - synchronize their types
      // Use the type of the link with larger value, or "top" if equal
      var preferredType;
      if (link.value > reverseLink.value) {
        preferredType = link.circularLinkType;
      } else if (reverseLink.value > link.value) {
        preferredType = reverseLink.circularLinkType;
      } else {
        // Equal values - prefer "top"
        preferredType = link.circularLinkType === "top" || reverseLink.circularLinkType === "top" ? "top" : "bottom";
      }
      
      link.circularLinkType = preferredType;
      reverseLink.circularLinkType = preferredType;
      
      processedPairs.add(linkId);
      processedPairs.add(reverseLinkId);
    }
  });
  
  return graph;
}

function computeNodeValues(inputGraph) {
  let graph = inputGraph;

  graph.nodes.forEach(function (node) {
    node.partOfCycle = false;
    node.value = Math.max(
      sum(node.sourceLinks, value),
      sum(node.targetLinks, value)
    );
    
    // Count circular link types to determine the predominant type
    var topCount = 0;
    var bottomCount = 0;
    
    node.sourceLinks.forEach(function (link) {
      if (link.circular) {
        node.partOfCycle = true;
        if (link.circularLinkType === "top") topCount++;
        else if (link.circularLinkType === "bottom") bottomCount++;
      }
    });
    node.targetLinks.forEach(function (link) {
      if (link.circular) {
        node.partOfCycle = true;
        if (link.circularLinkType === "top") topCount++;
        else if (link.circularLinkType === "bottom") bottomCount++;
      }
    });
    
    // Assign the predominant type (or "top" if equal)
    if (node.partOfCycle) {
      node.circularLinkType = topCount >= bottomCount ? "top" : "bottom";
    }
  });

  return graph;
}

function computeNodeDepths(inputGraph, sortNodes, align) {
  let graph = inputGraph;

  var nodes, next, x;

  if (sortNodes != null && sortNodes(graph.nodes[0]) != undefined) {
    graph.nodes.sort(function (a, b) {
      return sortNodes(a) < sortNodes(b) ? -1 : 1;
    });

    let c = 0;
    let currentSortIndex = sortNodes(graph.nodes[0]);

    graph.nodes.forEach(function (node) {
      c = sortNodes(node) == currentSortIndex ? c : c + 1;

      currentSortIndex =
        sortNodes(node) == currentSortIndex
          ? currentSortIndex
          : sortNodes(node);
      node.column = c;
    });
  }

  for (
    nodes = graph.nodes, next = [], x = 0;
    nodes.length;
    ++x, nodes = next, next = []
  ) {
    nodes.forEach(function (node) {
      node.depth = x;
      node.sourceLinks.forEach(function (link) {
        if (next.indexOf(link.target) < 0 && !link.circular) {
          next.push(link.target);
        }
      });
    });
  }

  for (
    nodes = graph.nodes, next = [], x = 0;
    nodes.length;
    ++x, nodes = next, next = []
  ) {
    nodes.forEach(function (node) {
      node.height = x;
      node.targetLinks.forEach(function (link) {
        if (next.indexOf(link.source) < 0 && !link.circular) {
          next.push(link.source);
        }
      });
    });
  }

  // assign column numbers, and get max value
  graph.nodes.forEach(function (node) {
    node.column =
      sortNodes == null || sortNodes(graph.nodes[0]) == undefined
        ? align(node, x)
        : node.column;
  });

  return graph;
}

function createVirtualNodes(inputGraph, useVirtualRoutes, id) {
  let graph = inputGraph;

  graph.replacedLinks = [];

  if (useVirtualRoutes) {
    let virtualNodeIndex = -1;
    let virtualLinkIndex = 0;
    let linksLength = graph.links.length;

    for (var linkIndex = 0; linkIndex < linksLength; linkIndex++) {
      var thisLink = graph.links[linkIndex];

      //if the link spans more than 1 column, then replace it with virtual nodes and links
      if (thisLink.target.column - thisLink.source.column < 2) {
        thisLink.linkType = "normal";
      } else {
        thisLink.linkType = "replaced";

        let totalToCreate = thisLink.target.column - thisLink.source.column - 1;

        for (var n = 0; n < totalToCreate; n++) {
          let newNode = {};

          //get the next index number
          virtualNodeIndex = virtualNodeIndex + 1;
          newNode.name = "virtualNode" + virtualNodeIndex;
          newNode.index = "v" + virtualNodeIndex;

          newNode.sourceLinks = [];
          newNode.targetLinks = [];
          newNode.partOfCycle = false;
          newNode.value = thisLink.value;
          newNode.depth = thisLink.source.depth + (n + 1);
          newNode.height = thisLink.source.height - (n + 1);
          newNode.column = thisLink.source.column + (n + 1);
          newNode.virtual = true;
          newNode.replacedLink = thisLink.index;

          graph.nodes.push(newNode);

          let newLink = {};
          let vMinus1 = virtualNodeIndex - 1;
          newLink.source = n == 0 ? thisLink.source : "virtualNode" + vMinus1;
          newLink.target = newNode.name;
          newLink.value = thisLink.value;
          newLink.index = "virtualLink" + virtualLinkIndex;
          virtualLinkIndex = virtualLinkIndex + 1;
          newLink.circular = false;
          newLink.linkType = "virtual";
          newLink.parentLink = thisLink.index;

          graph.links.push(newLink);
        }

        let lastLink = {};
        lastLink.source = "virtualNode" + virtualNodeIndex;
        lastLink.target = thisLink.target;

        lastLink.value = thisLink.value;
        lastLink.index = "virtualLink" + virtualLinkIndex;
        virtualLinkIndex = virtualLinkIndex + 1;
        lastLink.circular = false;
        lastLink.linkType = "virtual";
        lastLink.parentLink = thisLink.index;

        graph.links.push(lastLink);
      }
    }

    let nodeByID = createMap(graph.nodes, id);

    graph.links.forEach(function (link, i) {
      if (link.linkType == "virtual") {
        var source = link.source;
        var target = link.target;
        if (
          (typeof source === "undefined" ? "undefined" : _typeof(source)) !==
          "object"
        ) {
          source = link.source = find(nodeByID, source);
        }
        if (
          (typeof target === "undefined" ? "undefined" : _typeof(target)) !==
          "object"
        ) {
          target = link.target = find(nodeByID, target);
        }
        source.sourceLinks.push(link);
        target.targetLinks.push(link);
      }
    });

    let l = graph.links.length;
    while (l--) {
      if (graph.links[l].linkType == "replaced") {
        let obj = clone(graph.links[l]);
        graph.links.splice(l, 1);
        graph.replacedLinks.push(obj);
      }
    }

    graph.nodes.forEach(function (node) {
      let sIndex = node.sourceLinks.length;
      while (sIndex--) {
        if (node.sourceLinks[sIndex].linkType == "replaced") {
          node.sourceLinks.splice(sIndex, 1);
        }
      }

      let tIndex = node.targetLinks.length;
      while (tIndex--) {
        if (node.targetLinks[tIndex].linkType == "replaced") {
          node.targetLinks.splice(tIndex, 1);
        }
      }
    });
  }

  return graph;
}

// Assign nodes' breadths, and then shift nodes that overlap (resolveCollisions)
function computeNodeBreadths() {

  let graph = this.graph;
  const setNodePositions = this.config.nodes.setPositions;
  const id = this.config.id;

  function nodeHeightPx(node) {
    return node.value * graph.ky;
  }

  let columns = groups(graph.nodes, (d) => d.column)
    .sort((a, b) => a[0] - b[0])
    .map((d) => d[1]);

  const nodePadding = this.config.nodes.padding;

  columns.forEach( (nodes) => {
    let nodesLength = nodes.length;

    let totalColumnValue = nodes.reduce(function (total, d) {
      return total + d.value;
    }, 0);

    let preferredTotalGap = graph.y1 - graph.y0 - nodes.reduce(function (sum, d) {
      return sum + (d.virtual ? 0 : nodeHeightPx(d));
    }, 0);
    
    // Cap the gap to prevent huge spaces when scale is small
    // Maximum gap per node should be reasonable (e.g., 2x nodePadding)
    let maxGapPerNode = nodePadding * 2;
    let maxTotalGap = maxGapPerNode * (nodesLength - 1);
    if (preferredTotalGap > maxTotalGap) {
      preferredTotalGap = maxTotalGap;
    }
    // Also ensure gap is not negative
    if (preferredTotalGap < 0) {
      preferredTotalGap = 0;
    }

     const optimizedSort = (a, b) => {
      if (a.circularLinkType == b.circularLinkType) {
        return (
          numberOfNonSelfLinkingCycles(b, id) -
          numberOfNonSelfLinkingCycles(a, id)
        );
      } else if (
        a.circularLinkType == "top" &&
        b.circularLinkType == "bottom"
      ) {
        return -1;
      } else if (a.circularLinkType == "top" && b.partOfCycle == false) {
        return -1;
      } else if (a.partOfCycle == false && b.circularLinkType == "bottom") {
        return -1;
      }
    };

    const customSort = (a, b) =>  b.verticalSort - a.verticalSort;    

    this.config.nodes.verticalSort 
    ? nodes.sort(customSort)        // use custom values for sorting
    : nodes.sort(optimizedSort);    // Push any overlapping nodes down.

    if (setNodePositions) {
      let currentY = graph.y0;

      nodes.forEach(function (node, i) {
        if (nodes.length == 1) {
          var h = nodeHeightPx(node);
          node.y0 = sankeyExtent.y1 / 2 - h / 2;
          node.y1 = node.y0 + h;
        } else {
          node.y0 = currentY;
          node.y1 = node.y0 + nodeHeightPx(node);
          currentY = node.y1 + preferredTotalGap / (nodes.length - 1);
        }
      });
    } else {
      nodes.forEach(function (node, i) {
        const cycleInset =
          typeof this.config.nodes.cycleInsetAccessor === "function"
            ? Number(this.config.nodes.cycleInsetAccessor(node)) || 0
            : Number(this.config.nodes.cycleInset) || 0;
        // if the node is in the last column, and is the only node in that column, put it in the centre
        if (node.depth == columns.length - 1 && nodesLength == 1) {
          var h = nodeHeightPx(node);
          node.y0 = graph.y1 / 2 - h / 2;
          node.y1 = node.y0 + h;

          // if the node is in the first column, and is the only node in that column, put it in the centre
        } else if (node.depth == 0 && nodesLength == 1) {
          var h2 = nodeHeightPx(node);
          node.y0 = graph.y1 / 2 - h2 / 2;
          node.y1 = node.y0 + h2;
        }

        // if the node has a circular link
        else if (node.partOfCycle) {
          let totalNodesHeight = nodes.reduce(function (sum, d) {
            return sum + (d.virtual ? 0 : nodeHeightPx(d));
          }, 0);
          let gapPerNode = nodesLength > 1 ? Math.min(nodePadding, (graph.y1 - graph.y0 - totalNodesHeight) / (nodesLength - 1)) : 0;
          if (gapPerNode < 0) gapPerNode = 0;
          
          let topCyclesBefore = 0, bottomCyclesBefore = 0;
          for (let j = 0; j < i; j++) {
            if (nodes[j].partOfCycle && nodes[j].circularLinkType == "top") topCyclesBefore++;
            if (nodes[j].partOfCycle && nodes[j].circularLinkType == "bottom") bottomCyclesBefore++;
          }
          
          if (numberOfNonSelfLinkingCycles(node, id) == 0) {
            node.y0 = graph.y0 + (graph.y1 - graph.y0) / 2 + i * (nodeHeightPx(node) + gapPerNode);
            node.y1 = node.y0 + nodeHeightPx(node);
          } else if (node.circularLinkType == "top") {
            node.y0 = graph.y0 + topCyclesBefore * (nodeHeightPx(node) + gapPerNode) + cycleInset;
            node.y1 = node.y0 + nodeHeightPx(node);
          } else {
            // Place bottom cycle nodes symmetrically to top cycle nodes
            // Calculate total height of all top cycles first for proper mirroring
            let totalTopCyclesHeight = 0;
            let topCyclesCount = 0;
            nodes.forEach(function(n) {
              if (n.partOfCycle && n.circularLinkType == "top" && numberOfNonSelfLinkingCycles(n, id) > 0) {
                totalTopCyclesHeight += nodeHeightPx(n);
                topCyclesCount++;
              }
            });
            let totalTopGaps = topCyclesCount > 1 ? gapPerNode * (topCyclesCount - 1) : 0;
            
            // Mirror bottom nodes: if top node is at y0, bottom node should be at (graph.y1 - (y0 - graph.y0) - height)
            // Equivalently: graph.y1 - (topOffset + height) where topOffset is distance from graph.y0
            let topEquivalentY0 = graph.y0 + bottomCyclesBefore * (nodeHeightPx(node) + gapPerNode) + cycleInset;
            let distanceFromTop = topEquivalentY0 - graph.y0;
            
            // Add extra inset for bottom nodes to bring them closer to center (visual balance)
            // Use 40% of available height as bottom margin to lift them significantly
            let bottomInset = (graph.y1 - graph.y0) * 0.40;
            
            // console.log(`Bottom node ${node.name}: inset=${bottomInset}, y1_target=${(graph.y1 - bottomInset) - distanceFromTop}`);

            // Mirror it to bottom
            node.y1 = (graph.y1 - bottomInset) - distanceFromTop;
            node.y0 = node.y1 - nodeHeightPx(node);
          }
        } else {
          let totalNodesHeight = nodes.reduce(function (sum, d) {
            return sum + (d.virtual ? 0 : nodeHeightPx(d));
          }, 0);
          let availableHeight = graph.y1 - graph.y0;
          let totalGap = availableHeight - totalNodesHeight;
          
          let maxGapPerNode = nodePadding;
          if (totalGap > maxGapPerNode * (nodesLength - 1)) totalGap = maxGapPerNode * (nodesLength - 1);
          if (totalGap < 0) totalGap = 0;
          
          let gapPerNode = nodesLength > 1 ? totalGap / (nodesLength - 1) : 0;
          let startY = graph.y0 + (availableHeight - totalNodesHeight - totalGap) / 2;
          
          let accumulatedHeight = 0;
          for (let j = 0; j < i; j++) accumulatedHeight += nodeHeightPx(nodes[j]) + gapPerNode;
          
          node.y0 = startY + accumulatedHeight;
          node.y1 = node.y0 + nodeHeightPx(node);
        }
      }, this);
    }
  });

  return graph;
}

function resolveCollisionsAndRelax() {

  let graph = this.graph;
  const id = this.config.id;
  const nodePadding = this.config.nodes.padding;
  const minNodePadding = this.config.nodes.minPadding;
  const iterations = this.config.iterations;

  let columns = groups(graph.nodes, (d) => d.column)
    .sort((a, b) => a[0] - b[0])
    .map((d) => d[1]);

  resolveCollisions.call(this);

  for (var alpha = 1, n = iterations; n > 0; --n) {
    relaxLeftAndRight((alpha *= 0.99), id);
    resolveCollisions.call(this);
  }

  // For each node in each column, check the node's vertical position in relation to its targets and sources vertical position
  // and shift up/down to be closer to the vertical middle of those targets and sources
  function relaxLeftAndRight(alpha, id) {
    var columnsLength = columns.length;

    columns.forEach(function (nodes) {
      var n = nodes.length;
      var depth = nodes[0].depth;

      nodes.forEach(function (node) {
        // check the node is not an orphan
        var nodeHeight;
        if (node.sourceLinks.length || node.targetLinks.length) {
          if (node.partOfCycle && numberOfNonSelfLinkingCycles(node, id) > 0);
          else if (depth == 0 && n == 1) {
            nodeHeight = node.y1 - node.y0;

            node.y0 = graph.y1 / 2 - nodeHeight / 2;
            node.y1 = graph.y1 / 2 + nodeHeight / 2;
          } else if (depth == columnsLength - 1 && n == 1) {
            nodeHeight = node.y1 - node.y0;

            node.y0 = graph.y1 / 2 - nodeHeight / 2;
            node.y1 = graph.y1 / 2 + nodeHeight / 2;
          } else if (
            node.targetLinks.length == 1 &&
            node.targetLinks[0].source.sourceLinks.length == 1
          ) {
            let nodeHeight = node.y1 - node.y0;
            node.y0 = node.targetLinks[0].source.y0;
            node.y1 = node.y0 + nodeHeight;
          } else {
            var avg = 0;

            var avgTargetY = mean(node.sourceLinks, linkTargetCenter);
            var avgSourceY = mean(node.targetLinks, linkSourceCenter);

            if (avgTargetY && avgSourceY) {
              avg = (avgTargetY + avgSourceY) / 2;
            } else {
              avg = avgTargetY || avgSourceY;
            }

            var dy = (avg - nodeCenter(node)) * alpha;
            // positive if it node needs to move down
            node.y0 += dy;
            node.y1 += dy;
          }
        }
      });
    });
  }

  // For each column, check if nodes are overlapping, and if so, shift up/down
  function resolveCollisions() {
    const baseRadius = this.config.links.circularRadius || 10;
    const graph = this.graph;
    function nodeHeightPx(node) {
      return node.value * graph.ky;
    }
    
    columns.forEach((nodes) => {
      var node,
        dy,
        y = graph.y0,
        n = nodes.length,
        i;

      // Push any overlapping nodes down.
      const customSort = (a, b) =>  b.verticalSort - a.verticalSort;       

      this.config.nodes.verticalSort 
      ? nodes.sort(customSort)        // use custom values for sorting
      : nodes.sort(ascendingBreadth); // Push any overlapping nodes down.

      // First pass: calculate self-links height for all nodes
      for (i = 0; i < n; ++i) {
        nodes[i].selfLinksHeight = getSelfLinksHeight(nodes[i], id, baseRadius);
      }

    // Second pass: position nodes with space for self-links
    // Calculate total height needed for nodes and self-links
      let totalNodesHeight = nodes.reduce((sum, n) => sum + (n.virtual ? 0 : nodeHeightPx(n)), 0);
      let totalSelfLinksHeight = nodes.reduce((sum, n) => sum + (n.selfLinksHeight ? n.selfLinksHeight.top + n.selfLinksHeight.bottom : 0), 0);
      let availableHeight = graph.y1 - graph.y0;
      let maxTotalPadding = availableHeight - totalNodesHeight - totalSelfLinksHeight;
      
      // Cap padding per node to prevent huge gaps when scale is small
      // Use reasonable max padding (2x nodePadding) but don't exceed available space
      let maxPaddingPerNode = maxTotalPadding > 0 
        ? Math.min(nodePadding * 2, maxTotalPadding / Math.max(1, n - 1)) 
        : nodePadding;
      
      for (i = 0; i < n; ++i) {
        node = nodes[i];
        
        // Add space for top self-links before the node
        y += node.selfLinksHeight.top;
        
        dy = y - node.y0;

        if (dy > 0) {
          node.y0 += dy;
          node.y1 += dy;
        }
        
        // Add space for bottom self-links after the node
        // Use capped padding to prevent huge gaps
        let actualPadding = i < n - 1 ? Math.min(nodePadding, maxPaddingPerNode) : 0;
        y = node.y1 + actualPadding + node.selfLinksHeight.bottom;
      }

      // If the bottommost node goes outside the bounds, push it back up.
      dy = y - nodePadding - graph.y1;
      if (dy > 0) {
        (y = node.y0 -= dy), (node.y1 -= dy);

        // Push any overlapping nodes back up.
        for (i = n - 2; i >= 0; --i) {
          node = nodes[i];
          var selfLinkSpace = (node.selfLinksHeight ? node.selfLinksHeight.bottom : 0) + 
                              (nodes[i+1] && nodes[i+1].selfLinksHeight ? nodes[i+1].selfLinksHeight.top : 0);
          dy = node.y1 + minNodePadding + selfLinkSpace - y;
          if (dy > 0) (node.y0 -= dy), (node.y1 -= dy);
          y = node.y0;
        }
      }

      // Symmetric bounds clamp:
      // The block above can push an entire column upward to fit the bottom, but it does not
      // re-check that the column still stays within the top bound (graph.y0). This can lead
      // to some columns having nodes above graph.y0 (visually "higher" than other columns).
      // Bring the whole column back down if needed, but never so far that we overflow the bottom again.
      var minY0 = Infinity;
      var maxY1 = -Infinity;
      for (i = 0; i < n; ++i) {
        if (nodes[i].y0 < minY0) minY0 = nodes[i].y0;
        if (nodes[i].y1 > maxY1) maxY1 = nodes[i].y1;
      }
      var needDown = graph.y0 - minY0; // >0 means column starts above the top bound
      if (needDown > 0) {
        var canDown = graph.y1 - maxY1; // available space to move down without bottom overflow
        if (canDown < 0) canDown = 0;
        var down = Math.min(needDown, canDown);
        if (down > 0) {
          for (i = 0; i < n; ++i) {
            nodes[i].y0 += down;
            nodes[i].y1 += down;
          }
        }
      }
    });
  }

  return graph;
}

// Assign the links y0 and y1 based on source/target nodes position,
// plus the link's relative position to other links to the same node
function computeLinkBreadths(inputGraph, circularPortGap) {
  let graph = inputGraph;

  graph.nodes.forEach(function (node) {
    node.sourceLinks.sort(ascendingTargetBreadth);
    node.targetLinks.sort(ascendingSourceBreadth);
  });
  graph.nodes.forEach(function (node) {
    var y0 = node.y0;
    var y1 = y0;

    // start from the bottom of the node for cycle links
    var y0cycle = node.y1;
    var y1cycle = y0cycle;

    node.sourceLinks.forEach(function (link) {
      if (link.circular) {
        link.y0 = y0cycle - link.width / 2;
        y0cycle = y0cycle - link.width - (circularPortGap || 0);
      } else {
        link.y0 = y0 + link.width / 2;
        y0 += link.width;
      }
    });
    node.targetLinks.forEach(function (link) {
      if (link.circular) {
        link.y1 = y1cycle - link.width / 2;
        y1cycle = y1cycle - link.width - (circularPortGap || 0);
      } else {
        link.y1 = y1 + link.width / 2;
        y1 += link.width;
      }
    });
  });

  return graph;
}

function straigtenVirtualNodes(inputGraph) {
  let graph = inputGraph;

  graph.nodes.forEach(function (node) {
    if (node.virtual) {
      //let nodeHeight = node.y1 - node.y0;
      let dy = 0;

      //if the node is linked to another virtual node, get the difference in y
      //select the node which precedes it first, else get the node after it
      //If next node is real target, align to it so links sort correctly
      if (node.targetLinks[0].source.virtual) {
        dy = node.targetLinks[0].source.y0 - node.y0;
      } else if (node.sourceLinks[0].target.virtual) {
        dy = node.sourceLinks[0].target.y0 - node.y0;
      } else {
        // Last virtual node before real target - align to real target
        dy = node.sourceLinks[0].target.y0 - node.y0;
      }

      node.y0 = node.y0 + dy;
      node.y1 = node.y1 + dy;

      node.targetLinks.forEach(function (l) {
        l.y1 = l.y1 + dy;
      });

      node.sourceLinks.forEach(function (l) {
        l.y0 = l.y0 + dy;
      });
    }
  });

  return graph;
}

function fillHeight(inputGraph) {
  let graph = inputGraph;

  var nodes = graph.nodes;
  var links = graph.links;

  var top = false;
  var bottom = false;

  links.forEach(function (link) {
    if (link.circularLinkType == "top") {
      top = true;
    } else if (link.circularLinkType == "bottom") {
      bottom = true;
    }
  });

  if (top == false || bottom == false) {
    var minY0 = min(nodes, function (node) {
      return node.y0;
    });

    var maxY1 = max(nodes, function (node) {
      return node.y1;
    });

    var currentHeight = maxY1 - minY0;
    var chartHeight = graph.y1 - graph.y0;
    var ratio = chartHeight / currentHeight;

    // Only scale down if nodes are too tall, don't stretch if they're too short
    // This prevents creating huge gaps when scale is small
    if (ratio < 1) {
      let moveScale = scaleLinear()
        .domain([minY0, maxY1])
        .range([graph.y0, graph.y1]);

      nodes.forEach(function (node) {
        node.y0 = moveScale(node.y0);
        node.y1 = moveScale(node.y1);
      });

      links.forEach(function (link) {
        link.y0 = moveScale(link.y0);
        link.y1 = moveScale(link.y1);
        link.width = link.width * ratio;
      });
    }
    // If ratio >= 1, nodes fit fine - don't stretch them to fill entire height
    // This prevents creating huge gaps between nodes
  }

  return graph;
}

function addVirtualPathData(inputGraph, virtualLinkType) {
  let graph = inputGraph;

  graph.virtualLinks = [];
  graph.virtualNodes = [];

  graph.replacedLinks.forEach(function (replacedLink) {
    replacedLink.useVirtual = virtualLinkType == "virtual" ? true : false;

    // Find the first virtual link (starts from replacedLink.source) and last (ends at replacedLink.target)
    let foundFirst = false;
    let foundLast = false;
    
    for (let i = 0; i < graph.links.length; i++) {
      if (graph.links[i].parentLink == replacedLink.index) {
        // First link in chain: source matches AND target is virtual node belonging to this replacedLink
        var link = graph.links[i];
        var isFirst = link.source.index === replacedLink.source.index && 
                      link.target.virtual && link.target.replacedLink === replacedLink.index;
        if (isFirst) {
          replacedLink.y0 = link.y0;
          replacedLink.x0 = link.source.x1;
          replacedLink.width = link.width;
          foundFirst = true;
        }
        // Last link in chain: target matches replacedLink.target (compare by index)
        if (graph.links[i].target.index === replacedLink.target.index) {
          replacedLink.y1 = graph.links[i].y1;
          replacedLink.x1 = graph.links[i].target.x0;
          foundLast = true;
        }
      }
    }
    
    // Fallback to old logic if source/target matching didn't work
    if (!foundFirst || !foundLast) {
      let firstPath = true;
      for (let i = 0; i < graph.links.length; i++) {
        if (graph.links[i].parentLink == replacedLink.index) {
          if (firstPath && !foundFirst) {
            replacedLink.y0 = graph.links[i].y0;
            replacedLink.x0 = graph.links[i].source.x1;
            replacedLink.width = graph.links[i].width;
            firstPath = false;
          } else if (!foundLast) {
            replacedLink.y1 = graph.links[i].y1;
            replacedLink.x1 = graph.links[i].target.x0;
          }
        }
      }
    }
    

    if (virtualLinkType == "both") {
      let columnToTest = replacedLink.source.column + 1;
      let maxColumnToTest = replacedLink.target.column - 1;
      let i = 1;
      let numberOfColumnsToTest = maxColumnToTest - columnToTest + 1;

      for (i = 1; columnToTest <= maxColumnToTest; columnToTest++, i++) {
        graph.nodes.forEach(function (node) {
          if (
            node.column == columnToTest &&
            node.replacedLink != replacedLink.index
          ) {
            var t = i / (numberOfColumnsToTest + 1);

            // Find all the points of a cubic bezier curve in javascript
            // https://stackoverflow.com/questions/15397596/find-all-the-points-of-a-cubic-bezier-curve-in-javascript

            var B0_t = Math.pow(1 - t, 3);
            var B1_t = 3 * t * Math.pow(1 - t, 2);
            var B2_t = 3 * Math.pow(t, 2) * (1 - t);
            var B3_t = Math.pow(t, 3);

            var py_t =
              B0_t * replacedLink.y0 +
              B1_t * replacedLink.y0 +
              B2_t * replacedLink.y1 +
              B3_t * replacedLink.y1;

            var linkY0AtColumn = py_t - replacedLink.width / 2;
            var linkY1AtColumn = py_t + replacedLink.width / 2;

            if (linkY0AtColumn > node.y0 && linkY0AtColumn < node.y1) {
              replacedLink.useVirtual = true;
            } else if (linkY1AtColumn > node.y0 && linkY1AtColumn < node.y1) {
              replacedLink.useVirtual = true;
            } else if (linkY0AtColumn < node.y0 && linkY1AtColumn > node.y1) {
              replacedLink.useVirtual = true;
            }
          }
        });
      }
    }
  });

  //create d path string
  graph.replacedLinks.forEach(function (replacedLink) {
    //replacedLink.width = replacedLink.value * graph.ky;

    if (replacedLink.useVirtual) {
      let pathString = "";
      let firstPath = true;

      for (let i = 0; i < graph.links.length; i++) {
        if (graph.links[i].parentLink == replacedLink.index) {
          if (firstPath) {
            pathString = pathString + graph.links[i].path;
            firstPath = false;
          } else {
            pathString = pathString + graph.links[i].path.replace("M", "L");
          }
        }
      }

      replacedLink.path = pathString;
    } else {
      var normalPath = linkHorizontal()
        .source(function (d) {
          var x = d.x0;
          var y = d.y0;
          return [x, y];
        })
        .target(function (d) {
          var x = d.x1;
          var y = d.y1;
          return [x, y];
        });
      replacedLink.path = normalPath(replacedLink);
    }

    let copy = clone(replacedLink);
    graph.links.push(copy);
  });

  let l = graph.links.length;
  while (l--) {
    if (graph.links[l].linkType == "virtual") {
      let obj = clone(graph.links[l]);
      graph.links.splice(l, 1);
      graph.virtualLinks.push(obj);
    }
  }

  let n = graph.nodes.length;
  while (n--) {
    if (graph.nodes[n].virtual) {
      let obj = clone(graph.nodes[n]);
      graph.nodes.splice(n, 1);
      graph.virtualNodes.push(obj);
    }
  }

  return graph;
}

class SankeyChart {
  constructor(config) {
    if (!config.nodes.data) {
      throw "Please supply node data";
    }

    if (!config.links.data) {
      throw "Please supply links data";
    }

    const defaultOptions = {
      align: "left",
      id: (d) => d.name,
      iterations: 32,
      padding: 20,
      width: 1000,
      height: 500,
      useManualScale: false,
      showCanvasBorder: false,
      scale: 0.2,
      nodes: {
        width: 24, //dx
        padding: 25,
        minPadding: 25,
        virtualPadding: 7,
        horizontalSort: null,
        verticalSort: null,
        // Pull cycle nodes slightly away from the extreme top/bottom (in px).
        // Useful when circular routing reserves a lot of space and some cycle nodes end up too far from center.
        cycleInset: 0,
        // Optional per-node override: (node) => number (px). If provided, overrides cycleInset for that node.
        cycleInsetAccessor: null,
        setPositions: false,
        fill: "grey",
        stroke: "none",
        opacity: 1,
      },
      links: {
        circularGap: 5,
        circularLinkPortionTopBottom: 0.4,
        circularLinkPortionLeftRight: 0.1,
        opacity: 1,
        useVirtualRoutes: true,
        baseRadius: 10,
        verticalMargin: 25,
        virtualLinkType: "both", // ["both", "bezier", "virtual"]
        color: "lightgrey",
        types: null, // e.g. { "optimal": { name: "Optimal", color: "green" }, "critical": { name: "Critical", color: "red" } }
        typeAccessor: (d) => d.type, // function to get link type from data
        typeOrder: null, // e.g. ["critical", "primary", "secondary"] - order from top to bottom
        // How many times to alternate source/target link sorting before fillHeight().
        // More iterations can reduce crossings, especially with virtual routes enabled.
        sortIterations: 6,
        // Additional sorting passes after fillHeight() so ports match final scaled positions/widths.
        postSortIterations: 2,
      },
      arrows: {
        enabled: false,
        color: "DarkSlateGrey",
        length: 10,
        gap: 25,
        headSize: 4,
      },
    };

    this.config = Object.assign({}, defaultOptions, config);
    this.config.nodes = Object.assign({}, defaultOptions.nodes, config.nodes);
    this.config.links = Object.assign({}, defaultOptions.links, config.links);
    this.config.arrows = Object.assign(
      {},
      defaultOptions.arrows,
      config.arrows
    );
  }

  process() {
    let sortNodes = this.config.nodes.horizontalSort
      ? (node) => node.horizontalSort
      : null;

    let align =
      this.config.align == "left"
        ? left
        : this.config.align == "right"
        ? right
        : this.config.align == "center"
        ? center
        : this.config.align == "center"
        ? center
        : justify;

    //create associations and additional data
    this.graph = computeNodeLinks(
      {
        nodes: this.config.nodes.data,
        links: this.config.links.data,
      },
      this.config.id
    );

    this.graph.x0 = this.config.padding;
    this.graph.y0 = this.config.padding;
    this.graph.x1 = this.config.width - this.config.padding;
    this.graph.y1 = this.config.height - this.config.padding;
    this.graph.py = 0;

    this.graph = identifyCircles(this.graph, sortNodes);
    this.graph = selectCircularLinkTypes(this.graph, this.config.id);
    this.graph = synchronizeBidirectionalLinks(this.graph, this.config.id);

    this.graph = computeNodeValues(this.graph);
    this.graph = computeNodeDepths(this.graph, sortNodes, align);

    this.graph = createVirtualNodes(
      this.graph,
      this.config.links.useVirtualRoutes,
      this.config.id
    );

    this.graph = adjustSankeySize(
      this.graph,
      this.config.useManualScale,
      this.config.nodes.padding,
      this.config.nodes.width,
      //this.config.nodes.maxHeight,
      this.config.nodes.scaleDomain,
      this.config.nodes.scaleRange,
      this.config.links.circularLinkPortionTopBottom,
      this.config.links.circularLinkPortionLeftRight,
      this.config.scale,
      this.config.links.baseRadius
    );

    
    this.graph = computeNodeBreadths.call(this);
    this.graph = resolveCollisionsAndRelax.call(this);
    
    // Recalculate circular link types based on final node positions
    this.graph = selectCircularLinkTypes(this.graph, this.config.id);
    // Synchronize bidirectional circular links to prevent overlap
    this.graph = synchronizeBidirectionalLinks(this.graph, this.config.id);
    // Update node circularLinkType based on predominant link types
    this.graph = computeNodeValues(this.graph);
    
    // Recalculate node positions with updated link types
    this.graph = computeNodeBreadths.call(this);
    this.graph = resolveCollisionsAndRelax.call(this);
    this.graph = computeLinkBreadths(this.graph);

    this.graph = straigtenVirtualNodes(this.graph);

    // Optional debug: enable targeted circular-link logs via query params.
    // Example: `?debugCircular=1&debugCircularIdx=32,62`
    try {
      if (typeof window !== "undefined" && window.location && window.location.search) {
        var sp = new URLSearchParams(window.location.search);
        if (sp.get("debugCircular") === "1") {
          var raw = sp.get("debugCircularIdx") || "";
          var ids = raw
            .split(",")
            .map((s) => Number(String(s).trim()))
            .filter((n) => Number.isFinite(n));
          if (ids.length) {
            this.graph.links.forEach(function (l) {
              if (l && typeof l.index === "number" && ids.indexOf(l.index) !== -1) {
                l._debugCircular = true;
              }
            });
          } else {
            // If no specific indices provided, enable debug for all circular links (noisy).
            this.graph.links.forEach(function (l) {
              if (l && l.circular) l._debugCircular = true;
            });
          }
        }
      }
    } catch (e) {
      // ignore
    }

    this.graph = addCircularPathData(
      this.graph,
      this.config.id,
      this.config.links.circularGap,
      this.config.links.baseRadius,
      this.config.links.verticalMargin
    );

    this.graph = adjustGraphExtents(
      this.graph,
      this.config.padding,
      this.config.height,
      this.config.width,
      this.config.nodes.width
    );

    // this.graph = computeNodeBreadths(
    //   this.graph,
    //   this.config.nodes.setPositions,
    //   this.config.id
    // );
    this.graph = computeNodeBreadths.call(this);
    this.graph = resolveCollisionsAndRelax.call(this);
    this.graph = computeLinkBreadths(this.graph);
    this.graph = straigtenVirtualNodes(this.graph);

    this.graph = addCircularPathData(
      this.graph,
      this.config.id,
      this.config.links.circularGap,
      this.config.links.baseRadius,
      this.config.links.verticalMargin
    );

    const sortIters =
      typeof this.config.links.sortIterations === "number"
        ? Math.max(1, Math.floor(this.config.links.sortIterations))
        : 1;
    for (let i = 0; i < sortIters; i++) {
      this.graph = sortSourceLinks(
        this.graph,
        this.config.id,
        this.config.links.typeOrder,
        this.config.links.typeAccessor
      );
      this.graph = sortTargetLinks(
        this.graph,
        this.config.id,
        this.config.links.typeOrder,
        this.config.links.typeAccessor
      );
    }

    this.graph = fillHeight(this.graph);

    const postSortIters =
      typeof this.config.links.postSortIterations === "number"
        ? Math.max(0, Math.floor(this.config.links.postSortIterations))
        : 0;
    for (let i = 0; i < postSortIters; i++) {
      this.graph = sortSourceLinks(
        this.graph,
        this.config.id,
        this.config.links.typeOrder,
        this.config.links.typeAccessor
      );
      this.graph = sortTargetLinks(
        this.graph,
        this.config.id,
        this.config.links.typeOrder,
        this.config.links.typeAccessor
      );
    }

    this.graph = addCircularPathData(
      this.graph,
      this.config.id,
      this.config.links.circularGap,
      this.config.links.baseRadius,
      this.config.links.verticalMargin
    );

    this.graph = addCircularPathData(
      this.graph,
      this.config.id,
      this.config.links.circularGap,
      this.config.links.baseRadius,
      this.config.links.verticalMargin
    );

    this.graph = adjustGraphExtents(
      this.graph,
      this.config.padding,
      this.config.height,
      this.config.width,
      this.config.nodes.width
    );

    this.graph = addCircularPathData(
      this.graph,
      this.config.id,
      this.config.links.circularGap,
      this.config.links.baseRadius,
      this.config.links.verticalMargin
    );

    this.graph = addVirtualPathData(
      this.graph,
      this.config.links.virtualLinkType
    );

    //not using resolveLinkOverlaps at the mo
  }

  draw(id) {
    // select node
    const container = select(`#${id}`);
    container.selectChildren().remove();

    let svg = container
      .append("svg")
      .attr("width", this.config.width)
      .attr("height", this.config.height);

    let g = svg.append("g").attr("transform", "translate(0,0)");

    let linkG = g
      .append("g")
      .attr("class", "links")
      .attr("fill", "none")
      .attr("stroke-opacity", this.config.links.opacity)
      .selectAll("path");

    let nodeG = g
      .append("g")
      .attr("class", "nodes")
      .attr("font-family", "sans-serif")
      .attr("font-size", 10)
      .selectAll("g");

    let node = nodeG.data(this.graph.nodes).enter().append("g");

    node
      .append("rect")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .style("fill", this.config.nodes.fill)
      .style("stroke", this.config.nodes.stroke)
      .style("opacity", this.config.nodes.opacity)
      .style("cursor", "pointer")
      .style("transition", "opacity 0.3s ease");

    node
      .append("text")
      .attr("x", (d) => (d.x0 + d.x1) / 2)
      .attr("y", (d) => d.y0 - 8)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .style("transition", "opacity 0.3s ease")
      .text(this.config.id);

    node.append("title").text(function (d) {
      return d.name;
    });

    // Node hover handlers
    const graphLinks = this.graph.links;
    const nodeOpacity = this.config.nodes.opacity;
    const linkOpacity = this.config.links.opacity;
    
    node
      .on("mouseenter", function(event, d) {
        const dimOpacity = 0.1;
        
        // Find all links connected to this node (using Set of indices for reliable comparison)
        const connectedLinkIndices = new Set();
        graphLinks.forEach((link, idx) => {
          // Check both by reference and by name (in case objects differ)
          // Also handle the case where source/target are objects with 'index' or 'name' properties
          // For sankey-plus, source/target are usually node objects
          
          let sourceMatch = false;
          let targetMatch = false;
          
          if (link.source === d) sourceMatch = true;
          else if (link.source && d && link.source.index !== undefined && link.source.index === d.index) sourceMatch = true;
          else if (link.source && d && link.source.name !== undefined && link.source.name === d.name) sourceMatch = true;
          
          if (link.target === d) targetMatch = true;
          else if (link.target && d && link.target.index !== undefined && link.target.index === d.index) targetMatch = true;
          else if (link.target && d && link.target.name !== undefined && link.target.name === d.name) targetMatch = true;
          
          if (sourceMatch || targetMatch) {
            connectedLinkIndices.add(link.index !== undefined ? link.index : idx);
          }
        });
        
        // Find all connected nodes (by name for reliable matching)
        const connectedNodeNames = new Set([d.name]);
        graphLinks.forEach((link, idx) => {
          const linkIdx = link.index !== undefined ? link.index : idx;
          if (connectedLinkIndices.has(linkIdx)) {
            if (link.source && link.source.name) connectedNodeNames.add(link.source.name);
            if (link.target && link.target.name) connectedNodeNames.add(link.target.name);
          }
        });
        
        // Dim all links, highlight connected ones
        g.selectAll(".sankey-link")
          .style("stroke-opacity", (linkData, i) => {
            const linkIdx = linkData.index !== undefined ? linkData.index : i;
            return connectedLinkIndices.has(linkIdx) ? linkOpacity : dimOpacity;
          });
        
        // Dim all nodes, highlight connected ones
        g.selectAll(".nodes g rect")
          .style("opacity", nodeData => 
            connectedNodeNames.has(nodeData.name) ? nodeOpacity : dimOpacity
          );
        g.selectAll(".nodes g text")
          .style("opacity", nodeData => 
            connectedNodeNames.has(nodeData.name) ? 1 : dimOpacity
          );
      })
      .on("mouseleave", function() {
        // Restore all links
        g.selectAll(".sankey-link")
          .style("stroke-opacity", linkOpacity);
        
        // Restore all nodes
        g.selectAll(".nodes g rect")
          .style("opacity", nodeOpacity);
        g.selectAll(".nodes g text")
          .style("opacity", 1);
      });

    var link = linkG.data(this.graph.links).enter().append("g");

    const linkTypes = this.config.links.types;
    const typeAccessor = this.config.links.typeAccessor;
    const defaultLinkColor = this.config.links.color;

    const getLinkColor = (d) => {
      if (linkTypes && typeAccessor) {
        const linkType = typeAccessor(d);
        if (linkType && linkTypes[linkType]) {
          return linkTypes[linkType].color || defaultLinkColor;
        }
      }
      return defaultLinkColor;
    };

    const dimOpacity = 0.1;
    const normalLinkOpacity = this.config.links.opacity;
    const normalNodeOpacity = this.config.nodes.opacity;

    link
      .filter((d) => d.path)
      .append("path")
      .attr("class", (d) => {
        const baseClass = "sankey-link";
        if (linkTypes && typeAccessor) {
          const linkType = typeAccessor(d);
          if (linkType) {
            return `${baseClass} sankey-link-type-${linkType}`;
          }
        }
        return baseClass;
      })
      .attr("d", (d) => d.path)
      .style("stroke-width", (d) => Math.max(1, d.width))
      .style("stroke", getLinkColor)
      .style("cursor", "pointer")
      .style("transition", "stroke-opacity 0.3s ease")
      .on("mouseenter", function(event, d) {
        // Dim all links
        g.selectAll(".sankey-link")
          .style("stroke-opacity", dimOpacity);
        
        // Dim all nodes
        g.selectAll(".nodes g rect")
          .style("opacity", dimOpacity);
        g.selectAll(".nodes g text")
          .style("opacity", dimOpacity);
        
        // Highlight hovered link
        select(this).style("stroke-opacity", normalLinkOpacity);
        
        // Highlight connected nodes
        g.selectAll(".nodes g")
          .filter((nodeData) => {
            return (
              nodeData === d.source ||
              nodeData === d.target ||
              (d.source && nodeData.index === d.source.index) ||
              (d.target && nodeData.index === d.target.index) ||
              (d.source && nodeData.name === d.source.name) ||
              (d.target && nodeData.name === d.target.name)
            );
          })
          .selectAll("rect")
          .style("opacity", normalNodeOpacity);
        g.selectAll(".nodes g")
          .filter((nodeData) => {
            return (
              nodeData === d.source ||
              nodeData === d.target ||
              (d.source && nodeData.index === d.source.index) ||
              (d.target && nodeData.index === d.target.index) ||
              (d.source && nodeData.name === d.source.name) ||
              (d.target && nodeData.name === d.target.name)
            );
          })
          .selectAll("text")
          .style("opacity", 1);
      })
      .on("mouseleave", function() {
        // Restore all links
        g.selectAll(".sankey-link")
          .style("stroke-opacity", normalLinkOpacity);
        
        // Restore all nodes
        g.selectAll(".nodes g rect")
          .style("opacity", normalNodeOpacity);
        g.selectAll(".nodes g text")
          .style("opacity", 1);
      });

    link.append("title").text(function (d) {
      let typeName = "";
      if (linkTypes && typeAccessor) {
        const linkType = typeAccessor(d);
        if (linkType && linkTypes[linkType]) {
          typeName = "\nType: " + linkTypes[linkType].name;
        }
      }
      return d.source.name + " -> " + d.target.name + "\nValue: " + d.value + "%" + typeName;
    });

    svg
      .append("rect")
      .attr("width", this.config.width)
      .attr("height", this.config.height)
      .style("fill", "none")
      .style("stroke", this.config.showCanvasBorder ? "red" : "none");

    svg
      .append("rect")
      .attr("x", this.config.padding)
      .attr("y", this.config.padding)
      .attr("width", this.config.width - this.config.padding * 2)
      .attr("height", this.config.height - this.config.padding * 2)
      .style("fill", "none")
      .style("stroke", this.config.showCanvasBorder ? "blue" : "none");

    svg
      .append("rect")
      .attr("x", this.graph.x0)
      .attr("y", this.graph.y0)
      .attr("width", this.graph.x1 - this.graph.x0)
      .attr("height", this.graph.y1 - this.graph.y0)
      .style("fill", "none")
      .style("stroke", this.config.showCanvasBorder ? "green" : "none");

    // Add legend data to graph for external use
    if (linkTypes) {
      this.graph.linkTypes = linkTypes;
    }

    if (this.config.arrows.enabled) {
      let arrowLength = this.config.arrows.length;
      let gapLength = this.config.arrows.gap;
      let headSize = this.config.arrows.headSize;
      let arrowColor = this.config.arrows.color;

      let totalDashArrayLength = arrowLength + gapLength;

      var arrowsG = linkG
        .data(this.graph.links)
        .enter()
        .append("g")
        .attr("class", "g-arrow");

      let arrows = arrowsG
        .append("path")
        .attr("d", (d) => d.path)
        .style("stroke-width", 1)
        .style("stroke", arrowColor)
        .style("stroke-dasharray", arrowLength + "," + gapLength);

      arrows.each(function (arrow) {
        let thisPath = select(this).node();
        let parentG = select(this.parentNode);
        let pathLength = thisPath.getTotalLength();
        let numberOfArrows = Math.ceil(pathLength / totalDashArrayLength);

        // remove the last arrow head if it will overlap the target node
        if (
          (numberOfArrows - 1) * totalDashArrayLength +
            (arrowLength + (headSize + 1)) >
          pathLength
        ) {
          numberOfArrows = numberOfArrows - 1;
        }

        let arrowHeadData = range(numberOfArrows).map(function (d, i) {
          let length = i * totalDashArrayLength + arrowLength;

          let point = thisPath.getPointAtLength(length);
          let previousPoint = thisPath.getPointAtLength(length - 2);

          let rotation = 0;

          if (point.y == previousPoint.y) {
            rotation = point.x < previousPoint.x ? 180 : 0;
          } else if (point.x == previousPoint.x) {
            rotation = point.y < previousPoint.y ? -90 : 90;
          } else {
            let adj = Math.abs(point.x - previousPoint.x);
            let opp = Math.abs(point.y - previousPoint.y);
            let angle = Math.atan(opp / adj) * (180 / Math.PI);
            if (point.x < previousPoint.x) {
              angle = angle + (90 - angle) * 2;
            }
            if (point.y < previousPoint.y) {
              rotation = -angle;
            } else {
              rotation = angle;
            }
          }

          return { x: point.x, y: point.y, rotation: rotation };
        });

        parentG
          .selectAll(".arrow-heads")
          .data(arrowHeadData)
          .enter()
          .append("path")
          .attr("d", function (d) {
            return (
              "M" +
              d.x +
              "," +
              (d.y - headSize / 2) +
              " " +
              "L" +
              (d.x + headSize) +
              "," +
              d.y +
              " " +
              "L" +
              d.x +
              "," +
              (d.y + headSize / 2)
            );
          })
          .attr("class", "arrow-head")
          .attr("transform", function (d) {
            return "rotate(" + d.rotation + "," + d.x + "," + d.y + ")";
          })
          .style("fill", arrowColor);
      });
    }
  }
} // End of draw()

export { SankeyChart };
