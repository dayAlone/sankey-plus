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



  // sort and set the links' y0 for each node
export function sortSourceLinks(inputGraph, id, typeOrder = null, typeAccessor = null) {

  let graph = inputGraph;

  graph.nodes.forEach(function(node) {
    // move any nodes up which are off the bottom
    if (node.y + (node.y1 - node.y0) > graph.y1) {
      node.y = node.y - (node.y + (node.y1 - node.y0) - graph.y1);
    }

    var nodesSourceLinks = graph.links.filter(function(l) {
      return getNodeID(l.source, id) == getNodeID(node, id);
    });

    var nodeSourceLinksLength = nodesSourceLinks.length;

    // if more than 1 link then sort
    if (nodeSourceLinksLength > 1) {
      nodesSourceLinks.sort(function(link1, link2) {
        // FIRST: Handle circular vs non-circular - circular links go to top/bottom of node
        // if only one is circular, the move top links up, or bottom links down
        if (link1.circular && !link2.circular) {
          return link1.circularLinkType == 'top' ? -1 : 1;
        } else if (link2.circular && !link1.circular) {
          return link2.circularLinkType == 'top' ? 1 : -1;
        }

        // if both links are circular...
        if (link1.circular && link2.circular) {
          // ...and they loop around different ways, the move top up and bottom down
          if (link1.circularLinkType !== link2.circularLinkType) {
            return link1.circularLinkType == 'top' ? -1 : 1;
          }
          // ...and they both loop the same way (both top)
          if (link1.circularLinkType == 'top') {
            // ...and they both connect to a target with same column, then sort by the target's y
            if (link1.target.column === link2.target.column) {
              return link1.target.y1 - link2.target.y1;
            } else {
              // ...and they connect to different column targets, then sort by how far back they
              return link2.target.column - link1.target.column;
            }
          } else {
            // ...and they both loop the same way (both bottom)
            // ...and they both connect to a target with same column, then sort by the target's y
            if (link1.target.column === link2.target.column) {
              return link2.target.y1 - link1.target.y1;
            } else {
              // ...and they connect to different column targets, then sort by how far back they
              return link1.target.column - link2.target.column;
            }
          }
        }

        // SECOND: For non-circular links, sort by target node center position to minimize crossings
        // Use type as secondary criterion when target positions are similar
        if (!link1.circular && !link2.circular) {
          // Use target node center for more reliable comparison
          var target1Center = (link1.target.y0 + link1.target.y1) / 2;
          var target2Center = (link2.target.y0 + link2.target.y1) / 2;
          
          // If targets are at different vertical positions, sort by position
          var yDiff = target1Center - target2Center;
          if (Math.abs(yDiff) > 1) { // small threshold for floating point
            return yDiff;
          }
          
          // If target centers are similar, use type as tiebreaker
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
          
          return yDiff;
        }
      });
    }

    // update y0 for links
    var ySourceOffset = node.y0;

    nodesSourceLinks.forEach(function(link) {
      link.y0 = ySourceOffset + link.width / 2;
      ySourceOffset = ySourceOffset + link.width;
    });

    // correct any circular bottom links so they are at the bottom of the node
    nodesSourceLinks.forEach(function(link, i) {
      if (link.circularLinkType == 'bottom') {
        var j = i + 1;
        var offsetFromBottom = 0;
        // sum the widths of any links that are below this link
        for (j; j < nodeSourceLinksLength; j++) {
          offsetFromBottom = offsetFromBottom + nodesSourceLinks[j].width;
        }
        link.y0 = node.y1 - offsetFromBottom - link.width / 2;
      }
    });
  });

  return graph;
}


// sort and set the links' y1 for each node
export function sortTargetLinks(inputGraph, id, typeOrder = null, typeAccessor = null) {
  let graph = inputGraph;

  graph.nodes.forEach(function(node) {
    var nodesTargetLinks = graph.links.filter(function(l) {
      return getNodeID(l.target, id) == getNodeID(node, id);
    });

    var nodesTargetLinksLength = nodesTargetLinks.length;

    if (nodesTargetLinksLength > 1) {
      nodesTargetLinks.sort(function(link1, link2) {
        // FIRST: Handle circular vs non-circular - circular links go to top/bottom of node
        // if only one is circular, the move top links up, or bottom links down
        if (link1.circular && !link2.circular) {
          return link1.circularLinkType == 'top' ? -1 : 1;
        } else if (link2.circular && !link1.circular) {
          return link2.circularLinkType == 'top' ? 1 : -1;
        }

        // if both links are circular...
        if (link1.circular && link2.circular) {
          // ...and they loop around different ways, the move top up and bottom down
          if (link1.circularLinkType !== link2.circularLinkType) {
            return link1.circularLinkType == 'top' ? -1 : 1;
          }
          // ...and they both loop the same way (both top)
          if (link1.circularLinkType == 'top') {
            // ...and they both connect to a target with same column, then sort by the target's y
            if (link1.source.column === link2.source.column) {
              return link1.source.y1 - link2.source.y1;
            } else {
              // ...and they connect to different column targets, then sort by how far back they
              return link1.source.column - link2.source.column;
            }
          } else {
            // ...and they both loop the same way (both bottom)
            // ...and they both connect to a target with same column, then sort by the target's y
            if (link1.source.column === link2.source.column) {
              return link1.source.y1 - link2.source.y1;
            } else {
              // ...and they connect to different column targets, then sort by how far back they
              return link2.source.column - link1.source.column;
            }
          }
        }

        // SECOND: For non-circular links, sort by source node center position to minimize crossings
        // Use type as secondary criterion when source positions are similar
        if (!link1.circular && !link2.circular) {
          // Use source node center for more reliable comparison
          var source1Center = (link1.source.y0 + link1.source.y1) / 2;
          var source2Center = (link2.source.y0 + link2.source.y1) / 2;
          
          // If sources are at different vertical positions, sort by position
          var yDiff = source1Center - source2Center;
          if (Math.abs(yDiff) > 1) { // small threshold for floating point
            return yDiff;
          }
          
          // If source centers are similar, use type as tiebreaker
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
          
          return yDiff;
        }
      });
    }

    // update y1 for links
    var yTargetOffset = node.y0;

    nodesTargetLinks.forEach(function(link) {
      link.y1 = yTargetOffset + link.width / 2;
      yTargetOffset = yTargetOffset + link.width;
    });

    // correct any circular bottom links so they are at the bottom of the node
    nodesTargetLinks.forEach(function(link, i) {
      if (link.circularLinkType == 'bottom') {
        var j = i + 1;
        var offsetFromBottom = 0;
        // sum the widths of any links that are below this link
        for (j; j < nodesTargetLinksLength; j++) {
          offsetFromBottom = offsetFromBottom + nodesTargetLinks[j].width;
        }
        link.y1 = node.y1 - offsetFromBottom - link.width / 2;
      }
    });
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