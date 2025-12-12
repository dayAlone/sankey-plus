import { getNodeID } from "./nodeAttributes.js";
import { linkPerpendicularYToLinkSource, linkPerpendicularYToLinkTarget } from "./linkAttributes.js";


// sort ascending links by their source vertical position, y0
export function sortLinkSourceYAscending(link1, link2) {
    return link1.y0 - link2.y0;
}

// sort descending links by their source vertical position, y0
export function sortLinkSourceYDescending(link1, link2) {
    return link2.y0 - link1.y0;
}

// sort ascending links by their target vertical position, y1
export function sortLinkTargetYAscending(link1, link2) {
    return link1.y1 - link2.y1;
}

// sort descending links by their target vertical position, y1
export function sortLinkTargetYDescending(link1, link2) {
    return link2.y1 - link1.y1;
}

// sort links' breadth (ie top to bottom in a column), based on their source nodes' breadths
export function ascendingSourceBreadth(a, b) {
    return ascendingBreadth(a.source, b.source) || a.index - b.index;
}

// sort links' breadth (ie top to bottom in a column), based on their target nodes' breadths
export function ascendingTargetBreadth(a, b) {
    return ascendingBreadth(a.target, b.target) || a.index - b.index;
}

// sort nodes' breadth (ie top to bottom in a column)
// if both nodes have circular links, or both don't have circular links, then sort by the top (y0) of the node
// else push nodes that have top circular links to the top, and nodes that have bottom circular links to the bottom
export function ascendingBreadth(a, b) {
    if (a.partOfCycle === b.partOfCycle) {
      return a.y0 - b.y0;
    } else {
      if (a.circularLinkType === 'top' || b.circularLinkType === 'bottom') {
        return -1;
      } else {
        return 1;
      }
    }
  }


   // sort links based on the distance between the source and tartget node columns
  // if the same, then use Y position of the source node
  export function sortLinkColumnAscending(link1, link2) {
    if (linkColumnDistance(link1) == linkColumnDistance(link2)) {
      return link1.circularLinkType == 'bottom'
        ? sortLinkSourceYDescending(link1, link2)
        : sortLinkSourceYAscending(link1, link2);
    } else {
      return linkColumnDistance(link2) - linkColumnDistance(link1);
    }
  }

  function linkColumnDistance(link) {
    return link.target.column - link.source.column;
  }



  // Helper function to get effective Y position for sorting
  // For circular links, use extreme values to push them to top/bottom
  function getEffectiveTargetY(link, graphHeight) {
    if (link.circular) {
      if (link.circularLinkType === 'top') {
        return -Infinity; // Push to very top
      } else {
        return Infinity; // Push to very bottom
      }
    }
    // For normal links, use target node center
    return (link.target.y0 + link.target.y1) / 2;
  }

  // sort and set the links' y0 for each node
export function sortSourceLinks(inputGraph, id, typeOrder = null, typeAccessor = null) {

  let graph = inputGraph;

  graph.nodes.forEach(function(node) {
    // move any nodes up which are off the bottom
    if (node.y + (node.y1 - node.y0) > graph.y1) {
      node.y = node.y - (node.y + (node.y1 - node.y0) - graph.y1);
    }

    var nodesSourceLinks = node.sourceLinks;
    var nodeSourceLinksLength = nodesSourceLinks.length;

    if (nodeSourceLinksLength > 1) {
      nodesSourceLinks.sort(function(link1, link2) {
        // Get effective Y positions (handles circular links with Infinity/-Infinity)
        var y1 = getEffectiveTargetY(link1, graph.y1);
        var y2 = getEffectiveTargetY(link2, graph.y1);
        
        // Primary sort: by effective target Y position
        if (y1 !== y2) {
          return y1 - y2;
        }
        
        // Both are circular with same type - sort by column distance
        if (link1.circular && link2.circular) {
          if (link1.circularLinkType === 'top') {
            return link2.target.column - link1.target.column;
          } else {
            return link1.target.column - link2.target.column;
          }
        }
        
        // Secondary: sort by type if typeOrder is provided
        if (typeOrder && typeAccessor) {
          var type1 = typeAccessor(link1);
          var type2 = typeAccessor(link2);
          var typeIndex1 = typeOrder.indexOf(type1);
          var typeIndex2 = typeOrder.indexOf(type2);
          if (typeIndex1 === -1) typeIndex1 = typeOrder.length;
          if (typeIndex2 === -1) typeIndex2 = typeOrder.length;
          if (typeIndex1 !== typeIndex2) {
            return typeIndex1 - typeIndex2;
          }
        }
        
        // Tertiary: sort by link index for stability
        return link1.index - link2.index;
      });
    }

    // Position non-circular links from top of node
    var ySourceOffset = node.y0;
    nodesSourceLinks.forEach(function(link) {
      if (!link.circular || link.circularLinkType === 'top') {
        link.y0 = ySourceOffset + link.width / 2;
        ySourceOffset = ySourceOffset + link.width;
      }
    });

    // Position bottom circular links from bottom of node
    var yBottomOffset = node.y1;
    for (var i = nodeSourceLinksLength - 1; i >= 0; i--) {
      var link = nodesSourceLinks[i];
      if (link.circular && link.circularLinkType === 'bottom') {
        yBottomOffset = yBottomOffset - link.width;
        link.y0 = yBottomOffset + link.width / 2;
      }
    }
  });

  return graph;
}


// Helper function to get effective Y position for sorting incoming links
function getEffectiveSourceY(link) {
  if (link.circular) {
    if (link.circularLinkType === 'top') {
      return -Infinity;
    } else {
      return Infinity;
    }
  }
  return (link.source.y0 + link.source.y1) / 2;
}

// sort and set the links' y1 for each node
export function sortTargetLinks(inputGraph, id, typeOrder = null, typeAccessor = null) {
  let graph = inputGraph;

  graph.nodes.forEach(function(node) {
    var nodesTargetLinks = node.targetLinks;
    var nodesTargetLinksLength = nodesTargetLinks.length;

    if (nodesTargetLinksLength > 1) {
      nodesTargetLinks.sort(function(link1, link2) {
        // Get effective Y positions
        var y1 = getEffectiveSourceY(link1);
        var y2 = getEffectiveSourceY(link2);
        
        // Primary sort: by effective source Y position
        if (y1 !== y2) {
          return y1 - y2;
        }
        
        // Both are circular with same type - sort by column distance
        if (link1.circular && link2.circular) {
          if (link1.circularLinkType === 'top') {
            return link1.source.column - link2.source.column;
          } else {
            return link2.source.column - link1.source.column;
          }
        }
        
        // Secondary: sort by type if typeOrder is provided
        if (typeOrder && typeAccessor) {
          var type1 = typeAccessor(link1);
          var type2 = typeAccessor(link2);
          var typeIndex1 = typeOrder.indexOf(type1);
          var typeIndex2 = typeOrder.indexOf(type2);
          if (typeIndex1 === -1) typeIndex1 = typeOrder.length;
          if (typeIndex2 === -1) typeIndex2 = typeOrder.length;
          if (typeIndex1 !== typeIndex2) {
            return typeIndex1 - typeIndex2;
          }
        }
        
        // Tertiary: sort by link index for stability
        return link1.index - link2.index;
      });
    }

    // Position non-circular and top circular links from top of node
    var yTargetOffset = node.y0;
    nodesTargetLinks.forEach(function(link) {
      if (!link.circular || link.circularLinkType === 'top') {
        link.y1 = yTargetOffset + link.width / 2;
        yTargetOffset = yTargetOffset + link.width;
      }
    });

    // Position bottom circular links from bottom of node
    var yBottomOffset = node.y1;
    for (var i = nodesTargetLinksLength - 1; i >= 0; i--) {
      var link = nodesTargetLinks[i];
      if (link.circular && link.circularLinkType === 'bottom') {
        yBottomOffset = yBottomOffset - link.width;
        link.y1 = yBottomOffset + link.width / 2;
      }
    }
  });

  return graph;
}

export function sortLinks(inputGraph) {
  let g = inputGraph;

  for (var iteration = 0; iteration < linkSortingIterations; iteration++) {
    g = sortSourceLinks(g);
    g = sortTargetLinks(g);
  }

  return g;
}


// test if links both slope up, or both slope down
function sameInclines(link1, link2) {
  return incline(link1) == incline(link2);
}

// returns the slope of a link, from source to target
// up => slopes up from source to target
// down => slopes down from source to target
function incline(link) {
  return link.y0 - link.y1 > 0 ? 'up' : 'down';
}