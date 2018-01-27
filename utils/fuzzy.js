var _escapedRegex = /[-\/\\^$*+?.()|[\]{}]/g;
function escapeRegex(e) {
    return e.replace(_escapedRegex, '\\$&');
}

function _findBestMatch(regex, str) {
  let matches = [];
  let match;
  while((match = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if(match.index === regex.lastIndex) {
      regex.lastIndex++;
    }

    // our match will always be at group 1 instead of group 0 due to our lookahead
    matches.push([match.index, match[1]]);
  }

  if(matches.length === 0) {
    return null;
  }

  let result = matches.sort((a, b) => {
    return a[1].length - b[1].length;
  })[0];

  return {
    subLength: result[1].length,
    start: result[0]
  };
}


function fuzzyMatchTabObjects(query, tabs) {
  let suggestions = [];
  let pattern =  `(?=(${Array.from(query).map(escapeRegex).join('.*?')}))`;
  let regex = new RegExp(pattern, "gi");
  let urlRegex = new RegExp(escapeRegex(query), "i");

  for(let tab of tabs) {
    let domainName = new URL(tab.url).hostname;
    let urlIndex = domainName.search(urlRegex);
    if(urlIndex !== -1) {
      suggestions.push({
        subLength: query.length,
        start: urlIndex,
        isUrl: true,
        domain: domainName,
        tab: tab
      });
    }
    else {
      let match = _findBestMatch(regex, tab.title);
      if(match !== null) {
        suggestions.push({
          subLength: match.subLength,
          start: match.start,
          isUrl: false,
          tab: tab
        });
      }
    }
  }

  function cmp(a, b) {
    if(a.isUrl === b.isUrl) {
      if(a.subLength - b.subLength === 0) {
        if(a.start - b.start === 0) {
          return a.isUrl ? a.domain.localeCompare(b.domain) : a.tab.title.localeCompare(b.tab.title);
        }
        return a.start - b.start;
      }
      return a.subLength - b.subLength;
    }
    else {
      // if one is different than the other then the URL search ranks lower
      // than the non-URL search
      return a.isUrl - b.isUrl;
    }
  };

  return suggestions.sort(cmp).map(o => o.tab);
}

function fuzzyfinder(text, collections, key) {
    let suggestions = [];
    let regex = new RegExp(Array.prototype.map.call(text, escapeRegex).join('.*?'), 'i');
    for(let item of collections) {
        let toSearch = key ? key(item) : item;
        let match = regex.exec(toSearch);
        if(match !== null) {
            suggestions.push({
                subLength: match[0].length,
                start: match.index,
                item: item
            });
        }
    }

    function cmp(a, b) {
        if(a.subLength - b.subLength === 0) {
            if(a.start - b.start === 0) {
                return key ? key(a.item).localeCompare(key(b.item)) : a.item.localeCompare(b.item);
            }
            return a.start - b.start;
        }
        return a.subLength - b.subLength;
    };

    suggestions.sort(cmp);
    let items = [];
    for(let obj of suggestions) {
        items.push(obj.item);
    }
    return items;
    // return suggestions;
}

/* provided by https://github.com/bevacqua/fuzzysearch
   Copyright © 2015 Nicolas Bevacqua
   MIT license
*/

function fuzzysearch(needle, haystack) {
  var hlen = haystack.length;
  var nlen = needle.length;
  if(nlen > hlen) {
    return false;
  }
  if(nlen === hlen) {
    return needle === haystack;
  }
  outer: for (var i = 0, j = 0; i < nlen; i++) {
    var nch = needle.charCodeAt(i);
    while(j < hlen) {
      if (haystack.charCodeAt(j++) === nch) {
        continue outer;
      }
    }
    return false;
  }
  return true;
}
