var _escapedRegex = /[-\/\\^$*+?.()|[\]{}]/g;
function escapeRegex(e) {
    return e.replace(_escapedRegex, '\\$&');
}

function fuzzyMatchTabObjects(query, tabs) {
  let suggestions = [];
  let regex = new RegExp(Array.prototype.map.call(query, escapeRegex).join('.*?'), 'i');
  let urlRegex = new RegExp(escapeRegex(query), "i");

  for(let tab of tabs) {
    let urlIndex = tab.url.search(urlRegex);
    if(urlIndex !== -1) {
      suggestions.push({
        subLength: query.length,
        start: urlIndex,
        isUrl: true,
        tab: tab
      });
    }
    else {
      let match = regex.exec(tab.title);
      if(match !== null) {
        suggestions.push({
          subLength: match[0].length,
          start: match.index,
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
          return a.isUrl ? a.tab.url.localeCompare(b.tab.url) : a.tab.title.localeCompare(b.tab.title);
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
