import { selfLinking } from './linkAttributes.js';


export function getNodeID(node, id) {
    return id(node);
}

//TO DO REMOVE IF NOT USED
export function getNodePadding(node) {
    return node.virtual ? virtualNodePadding : nodePadding;
}

// return the vertical center of a link's source node
export function linkSourceCenter(link) {
    return nodeCenter(link.source);
}

// return the vertical center of a link's target node
export function linkTargetCenter(link) {
    return nodeCenter(link.target);
}

// return the vertical center of a node
export function nodeCenter(node) {
    return (node.y0 + node.y1) / 2;
  }

// For a given link, return the target node's depth
export function targetDepth(d) {
    return d.target.depth;
}

export function value(d) {
    return d.virtual ? 0 : d.value;
}

// Return the number of circular links for node, not including self linking links
export function numberOfNonSelfLinkingCycles(node, id) {
    var sourceCount = 0;
    node.sourceLinks.forEach(function (l) {
        sourceCount =
            l.circular && !selfLinking(l, id) ? sourceCount + 1 : sourceCount;
    });

    var targetCount = 0;
    node.targetLinks.forEach(function (l) {
        targetCount =
            l.circular && !selfLinking(l, id) ? targetCount + 1 : targetCount;
    });

    return sourceCount + targetCount;
}

// Calculate total height needed for self-links of a node
// This should match the selfLinkMargin calculation in circularPath.js
export function getSelfLinksHeight(node, id, baseRadius) {
    var maxHeight = 0;
    node.sourceLinks.forEach(function (l) {
        if (l.circular && selfLinking(l, id)) {
            // Match the formula: selfLinkRadius * 2 + link.width
            // where selfLinkRadius = baseRadius + link.width / 2
            var selfLinkRadius = (baseRadius || 10) + l.width / 2;
            var linkHeight = selfLinkRadius * 2 + l.width;
            if (linkHeight > maxHeight) {
                maxHeight = linkHeight;
            }
        }
    });
    return maxHeight;
}