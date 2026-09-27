// Brick layouts. A level names a pattern; patternActive() answers "is there a
// brick at row r, column c?" for a grid of the given size.

// Hand-drawn pixel-art silhouettes: 10 columns is too coarse for curve math to
// read as an object, so each row lists its active column ranges explicitly.
const SHAPE_ROWS = {
  star:      [[[4, 5]], [[3, 6]], [[2, 7]], [[0, 9]], [[1, 8]], [[0, 2], [7, 9]], [[0, 1], [8, 9]]],
  heart:     [[[1, 2], [7, 8]], [[0, 3], [6, 9]], [[0, 9]], [[1, 8]], [[2, 7]], [[3, 6]], [[4, 5]], [[4, 5]]],
  anchor:    [[[4, 5]], [[3, 6]], [[4, 5]], [[0, 9]], [[4, 5]], [[4, 5]], [[4, 5]], [[1, 3], [6, 8]], [[0, 2], [7, 9]]],
  sword:     [[[4, 5]], [[4, 5]], [[4, 5]], [[4, 5]], [[4, 5]], [[2, 7]], [[4, 5]], [[4, 5]], [[3, 6]]],
  shield:    [[[2, 7]], [[0, 9]], [[0, 9]], [[0, 9]], [[1, 8]], [[2, 7]], [[3, 6]], [[4, 5]]],
  crown:     [[[1, 1], [4, 5], [8, 8]], [[1, 2], [4, 5], [7, 8]], [[0, 2], [4, 5], [7, 9]], [[0, 9]], [[0, 9]]],
  key:       [[[3, 6]], [[2, 3], [6, 7]], [[3, 6]], [[4, 5]], [[4, 5]], [[4, 5]], [[4, 6]], [[4, 5], [7, 8]]],
  trophy:    [[[2, 7]], [[0, 0], [1, 8], [9, 9]], [[1, 8]], [[2, 7]], [[3, 6]], [[4, 5]], [[4, 5]], [[2, 7]]],
  bell:      [[[4, 5]], [[3, 6]], [[2, 7]], [[2, 7]], [[1, 8]], [[1, 8]], [[0, 9]], [[3, 6]]],
  house:     [[[4, 5]], [[3, 6]], [[2, 7]], [[1, 8]], [[0, 9]], [[1, 1], [8, 8]], [[1, 1], [8, 8]], [[1, 1], [8, 8]], [[1, 3], [6, 8]]],
  tree:      [[[4, 5]], [[3, 6]], [[2, 7]], [[1, 8]], [[0, 9]], [[2, 7]], [[4, 5]], [[4, 5]]],
  snowflake: [[[4, 5]], [[2, 2], [4, 5], [7, 7]], [[3, 6]], [[1, 1], [4, 5], [8, 8]], [[0, 9]], [[1, 1], [4, 5], [8, 8]], [[3, 6]], [[2, 2], [4, 5], [7, 7]], [[4, 5]]],
  umbrella:  [[[4, 5]], [[2, 7]], [[1, 8]], [[0, 9]], [[4, 5]], [[4, 5]], [[4, 5]], [[3, 4]]],
  balloon:   [[[4, 5]], [[3, 6]], [[2, 7]], [[2, 7]], [[3, 6]], [[4, 5]], [[4, 5]], [[4, 5]]],
  sun:       [[[4, 5]], [[2, 2], [4, 5], [7, 7]], [[3, 6]], [[0, 0], [2, 7], [9, 9]], [[1, 8]], [[0, 0], [2, 7], [9, 9]], [[3, 6]], [[2, 2], [4, 5], [7, 7]], [[4, 5]]],
  boat:      [[[4, 4]], [[3, 5]], [[2, 6]], [[1, 7]], [[4, 4]], [[1, 8]], [[0, 9]]],
  rocket:    [[[4, 5]], [[3, 6]], [[3, 6]], [[3, 6]], [[3, 6]], [[3, 6]], [[2, 3], [6, 7]], [[1, 2], [7, 8]], [[4, 5]]],
};

function rowPatternActive(table, r, c) {
  if (r < 0 || r >= table.length) return false;
  return table[r].some(([lo, hi]) => c >= lo && c <= hi);
}

// ---- Year levels: bricks literally spell out a number ----
const DIGIT_FONT = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};
const DIGIT_W = 5, DIGIT_H = 7, DIGIT_GAP = 1;

function digitsCols(digits) {
  return digits.length * DIGIT_W + (digits.length - 1) * DIGIT_GAP;
}

function digitsPatternActive(digits, r, c) {
  if (r < 0 || r >= DIGIT_H) return false;
  for (let i = 0; i < digits.length; i++) {
    const start = i * (DIGIT_W + DIGIT_GAP);
    if (c >= start && c < start + DIGIT_W) {
      return DIGIT_FONT[digits[i]][r][c - start] === "1";
    }
  }
  return false;
}

// ---- Formula-driven shapes ----
function patternActive(pattern, r, c, rows, cols) {
  if (SHAPE_ROWS[pattern]) return rowPatternActive(SHAPE_ROWS[pattern], r, c);
  const centerR = (rows - 1) / 2, centerC = (cols - 1) / 2;
  switch (pattern) {
    case "pyramid": {
      const count = Math.min(cols, r + 2);
      const start = Math.floor((cols - count) / 2);
      return c >= start && c < start + count;
    }
    case "diamond": {
      const radius = Math.floor((rows + cols) / 4);
      return Math.abs(r - centerR) + Math.abs(c - centerC) <= radius;
    }
    case "checkerboard":
      return (r + c) % 2 === 0;
    case "hourglass": {
      const midRow = (rows - 1) / 2;
      const dist = Math.abs(r - midRow);
      const count = Math.max(2, Math.round((dist / midRow) * cols));
      const start = Math.floor((cols - count) / 2);
      return c >= start && c < start + count;
    }
    case "plus":
      return Math.abs(c - centerC) <= 1 || Math.abs(r - centerR) <= 1;
    case "maze": {
      const outer = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      const innerH = (r === 2 || r === rows - 3) && c >= 2 && c <= cols - 3;
      const innerV = (c === 2 || c === cols - 3) && r >= 2 && r <= rows - 3;
      return outer || innerH || innerV;
    }
    case "arrow": {
      if (r < rows - 4) return Math.abs(c - centerC) <= 1;
      const rr = r - (rows - 4);
      const halfWidth = 4 - rr;
      return Math.abs(c - centerC) <= halfWidth;
    }
    case "islands": {
      const centers = [[0.2, 0.25], [0.2, 0.75], [0.5, 0.5], [0.8, 0.25], [0.8, 0.75]];
      return centers.some(([rf, cf]) => {
        const cr = rf * (rows - 1), cc = cf * (cols - 1);
        return Math.abs(r - cr) <= 1.3 && Math.abs(c - cc) <= 1.3;
      });
    }
    case "crescent": {
      const R = (Math.min(rows, cols) / 2) * 1.15;
      const d1 = Math.hypot((r - centerR) * (cols / rows), c - centerC);
      const d2 = Math.hypot((r - centerR) * (cols / rows), c - (centerC + cols * 0.32));
      return d1 <= R && d2 > R * 0.9;
    }
    case "target": {
      const dist = Math.hypot((r - centerR) * (cols / rows) * 0.85, c - centerC);
      return Math.floor(dist / 1.8) % 2 === 0;
    }
    case "infinity": {
      const lobeR = rows * 0.36;
      const leftCx = centerC - cols * 0.3, rightCx = centerC + cols * 0.3;
      const d1 = Math.hypot(r - centerR, (c - leftCx) * 0.9);
      const d2 = Math.hypot(r - centerR, (c - rightCx) * 0.9);
      return d1 <= lobeR || d2 <= lobeR;
    }
    default: // "full"
      return true;
  }
}
