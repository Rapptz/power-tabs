function hexToInt(str) {
  if(str[0] === '#') {
    return parseInt(str.slice(1), 16);
  }
  return parseInt(str, 16);
}

function intToRGB(integer) {
  return [
    (integer >> 16) & 0xFF,
    (integer >> 8 ) & 0xFF,
    (integer      ) & 0xFF
  ];
}

function hexToRgb(hex) {
  let num = hexToInt(hex);
  return intToRGB(num);
}

function textColourFromHex(hexCode, simple=true) {
  if(simple) {
    let [r, g, b] = hexToRgb(hexCode);
    return ((r * 0.299 + g * 0.587 + b * 0.114) > 186) ? '#000000' : '#ffffff';
  }

  let [r, g, b] = hexToRgb(hexCode).map((c) => {
    let v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  let L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L > 0.179) ? '#000000' : '#ffffff';
}

function hexToHsl(hex) {
  let [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function hslToHex(h, s, l) {
  let [r, g, b] = hslToRgb(h, s, l);
  let value = Math.floor((r << 16) + (g << 8) + b);
  return '#' + value.toString(16).padStart(6, '0');
}

function randomColour() {
  let number = Math.floor(Math.random() * 0xFFFFFF);
  return '#' + number.toString(16).padStart(6, 0);
}

function setDefaultGroupColour(elem, hexCode) {
  let [h, s, l] = hexToHsl(hexCode);
  elem.style.boxShadow = `inset 0 0 0 1px ${hexCode}`;
  elem.style.backgroundColor = hslToHex(h, s, 0.93);
  elem.style.color = hslToHex(h, s, 0.43);
}

function setHoverGroupColour(elem, hexCode) {
  let [h, s, l] = hexToHsl(hexCode);
  elem.style.backgroundColor = hslToHex(h, s, 0.83);
}

// credit: https://gist.github.com/mjackson/5311256

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
function rgbToHsl(r, g, b){
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
function hslToRgb(h, s, l){
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [r * 255, g * 255, b * 255];
}
