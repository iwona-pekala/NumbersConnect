// --- Cookie Utility Functions ---
function setCookie(name, value, days) {
  var expires = "";
  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + (days*24*60*60*1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}

function getCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for(var i=0;i < ca.length;i++) {
      var c = ca[i];
      while (c.charAt(0)==' ') c = c.substring(1);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length);
  }
  return null;
}

// --- Global Game Variables ---
let currentBoards = [];  // boards loaded from JSON for chosen size
let currentBoard = null; // current board object from JSON
let currentSize = 6;     // current board size (default)

let boardSize = 6;       // will be set from currentBoard.size
let numbers = [];        // board numbers from currentBoard.numbers
let path = [];
let dragging = false;
let cursor = { x: 0, y: 0 };
let lastInputWasKeyboard = false;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const cellSize = () => {
  const containerWidth = canvas.getBoundingClientRect().width;
  return containerWidth / boardSize;
};
const messageEl = document.getElementById('message');
const nextBoardDiv = document.getElementById('nextBoardDiv');
const currentBoardDisplay = document.getElementById('currentBoardDisplay');

// --- Helper: Choose Next Board Based on Cookie ---
function chooseNextBoard(boards, size) {
  const cookieName = "lastCompletedBoard_" + size;
  let lastCompleted = parseInt(getCookie(cookieName)) || 0;
  for (let board of boards) {
    if (board.id > lastCompleted) {
      return board;
    }
  }
  return boards[0];
}

// --- Load a board JSON file for a given size ---
function loadBoardSize(size) {
  currentSize = size;
  
  // Save the selected board size in a cookie
  setCookie("lastSelectedSize", size, 365);
  
  // Show canvas container and hide select board message
  document.getElementById('canvasContainer').style.display = 'block';
  document.getElementById('selectBoardMessage').style.display = 'none';
  
  // Update button states - simpler approach
  // First, remove selected class and set aria-pressed to false for all buttons
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.classList.remove('selected');
    btn.setAttribute('aria-pressed', 'false');
  });
  
  // Then add selected class and set aria-pressed to true for the selected button
  const selectedBtn = document.getElementById('btn-' + size);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
    selectedBtn.setAttribute('aria-pressed', 'true');
  }
  
  // Call setBoardSize() immediately after showing the canvas
  // This ensures proper dimensions are calculated now that it's visible
  setBoardSize();
  
  fetch("boards" + size + ".json")
    .then(response => {
      if (!response.ok) throw new Error("HTTP error " + response.status);
      return response.json();
    })
    .then(data => {
      currentBoards = data;
      
      // Check if we have a saved board ID for this size
      const savedBoardId = getCookie("currentBoardId_" + size);
      if (savedBoardId) {
        // Find the saved board by ID
        const savedBoard = data.find(board => board.id == savedBoardId);
        if (savedBoard) {
          currentBoard = savedBoard;
        } else {
          currentBoard = chooseNextBoard(currentBoards, size);
        }
      } else {
        currentBoard = chooseNextBoard(currentBoards, size);
      }
      
      initBoard(currentBoard);
      
      // After initializing the board, try to restore the saved path
      try {
        const savedPath = getCookie("currentPath_" + size);
        if (savedPath) {
          path = JSON.parse(savedPath);
          // Update cursor to end of path
          if (path.length > 0) {
            cursor = { x: path[path.length - 1].x, y: path[path.length - 1].y };
          }
          drawBoard();
          checkSuccess();
        }
      } catch (e) {
        console.error("Error restoring saved path:", e);
        // If there's an error parsing the path, just continue with a new game
      }
    })
    .catch(error => {
      console.error("Error loading board file:", error);
      messageEl.textContent = "Error loading boards" + size + ".json";
    });
}

// --- Initialize Game with a Given Board Object ---
function initBoard(board) {
  boardSize = board.size;
  numbers = board.numbers;
  // Determine starting number as the smallest in the board.
  let startNum = Math.min(...numbers.map(n => n.num));
  path = [];
  cursor = { x: 0, y: 0 };
  let startCell = numbers.find(item => item.num === startNum);
  if (startCell) {
    cursor = { x: startCell.x, y: startCell.y };
  }
  messageEl.textContent = "";
  nextBoardDiv.style.display = "none";
  // Update current board display.
  currentBoardDisplay.textContent = "Board " + currentBoard.id;
  drawBoard();
}

// --- When a board is completed, update cookie and show next board button ---
function completeBoard() {
  const cookieName = "lastCompletedBoard_" + currentSize;
  setCookie(cookieName, currentBoard.id, 365);
  messageEl.textContent = "Congratulations, board " + currentBoard.id + " completed!";
  nextBoardDiv.style.display = "block";
}

// --- Go to Next Board ---
function nextBoard() {
  // Clear the saved path for this size when going to next board
  setCookie("currentPath_" + currentSize, "", -1);
  
  currentBoard = chooseNextBoard(currentBoards, currentSize);
  initBoard(currentBoard);
}

// --- Utility Functions for Game Logic ---
function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isAdjacent(a, b) {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) === 1;
}

function getNumberAt(cell) {
  for (let item of numbers) {
    if (item.x === cell.x && item.y === cell.y) return item.num;
  }
  return null;
}

// getCellOfNumber: returns the cell coordinates for the given number.
function getCellOfNumber(num) {
  for (let item of numbers) {
    if (item.num === num) return { x: item.x, y: item.y };
  }
  return null;
}

// --- Main Drawing Function ---
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw grid lines - FIXED to avoid double lines at edges
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#949494';
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  
  // Start drawing grid lines from 1 (not 0) to avoid overlap with border
  for (let i = 1; i < boardSize; i++) {
    // Draw horizontal lines
    ctx.beginPath();
    ctx.moveTo(0, i * cellSize());
    ctx.lineTo(canvas.width, i * cellSize());
    ctx.stroke();
    
    // Draw vertical lines
    ctx.beginPath();
    ctx.moveTo(i * cellSize(), 0);
    ctx.lineTo(i * cellSize(), canvas.height);
    ctx.stroke();
  }
  
  // Draw keyboard preview connecting line (behind main marker)
  if (document.activeElement === canvas && lastInputWasKeyboard && path.length > 0) {
    const last = path[path.length - 1];
    if (!sameCell(last, cursor)) {
      const startX = last.x * cellSize() + cellSize() / 2;
      const startY = last.y * cellSize() + cellSize() / 2;
      const endX = cursor.x * cellSize() + cellSize() / 2;
      const endY = cursor.y * cellSize() + cellSize() / 2;
      const previewLineWidth = 0.6 * cellSize();
      // Draw preview outline (using main line color) with same thickness.
      ctx.lineWidth = previewLineWidth;
      ctx.strokeStyle = "#FF5C5C";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      // Draw inner preview stroke, slightly smaller.
      const innerWidth = previewLineWidth * 0.85;
      ctx.lineWidth = innerWidth;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }
  
  // Draw main marker line (or dot)
  if (path.length > 0) {
    const mainLineWidth = 0.6 * cellSize();
    ctx.lineWidth = mainLineWidth;
    ctx.strokeStyle = "#FF5C5C";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (path.length === 1) {
      const cell = path[0];
      const centerX = cell.x * cellSize() + cellSize() / 2;
      const centerY = cell.y * cellSize() + cellSize() / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, mainLineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#FF5C5C";
      ctx.fill();
    } else {
      ctx.beginPath();
      const start = path[0];
      ctx.moveTo(start.x * cellSize() + cellSize() / 2, start.y * cellSize() + cellSize() / 2);
      for (let i = 1; i < path.length; i++) {
        const cell = path[i];
        ctx.lineTo(cell.x * cellSize() + cellSize() / 2, cell.y * cellSize() + cellSize() / 2);
      }
      ctx.stroke();
    }
  }
  
  // Draw keyboard focus rectangle (on top)
  if (document.activeElement === canvas && lastInputWasKeyboard) {
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(cursor.x * cellSize(), cursor.y * cellSize(), cellSize(), cellSize());
    ctx.setLineDash([]);
  }
  
  // Draw numbers inside black circles - REDUCED SIZE
  const circleRadius = 0.25 * cellSize();
  for (let item of numbers) {
    const centerX = item.x * cellSize() + cellSize() / 2;
    const centerY = item.y * cellSize() + cellSize() / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'black';
    ctx.fill();
  }
  
  // Draw white number text on top.
  ctx.fillStyle = 'white';
  
  // Use responsive font size based on cell size
  const fontSize = Math.max(16, Math.floor(cellSize() * 0.4));
  const fontWeight = window.innerWidth <= 768 ? 'bold' : 'normal'; // Bold on mobile
  ctx.font = `${fontWeight} ${fontSize}px Arial`;
  
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let item of numbers) {
    const centerX = item.x * cellSize() + cellSize() / 2;
    const centerY = item.y * cellSize() + cellSize() / 2 + Math.floor(fontSize * 0.1);
    ctx.fillText(item.num, centerX, centerY);
  }
}

// --- Success Check ---
function checkSuccess() {
  if (path.length !== boardSize * boardSize) {
    messageEl.textContent = "";
    return;
  }
  const sortedNums = numbers.map(item => item.num).sort((a, b) => a - b);
  let lastIndex = -1;
  for (let num of sortedNums) {
    let foundIndex = path.findIndex(cell => getNumberAt(cell) === num);
    if (foundIndex === -1 || foundIndex <= lastIndex) {
      messageEl.textContent = "";
      return;
    }
    lastIndex = foundIndex;
  }
  messageEl.textContent = "Congratulations, board " + currentBoard.id + " completed!";
  completeBoard();
}

// --- Save current game state (path, board id, etc.) ---
function saveGameState() {
  // Only save if we have a valid board and path
  if (currentBoard && path.length > 0) {
    // Save the current board ID for this size
    setCookie("currentBoardId_" + currentSize, currentBoard.id, 365);
    
    // Save the current path as JSON string
    setCookie("currentPath_" + currentSize, JSON.stringify(path), 365);
  }
}

// --- Path Processing (Input Handling) ---
function processCell(cell, isDragOperation = false) {
  if (path.length && sameCell(path[path.length - 1], cell)) return;
  const cellNum = getNumberAt(cell);
  
  // Check if cell is already in path
  let indexInPath = path.findIndex(c => sameCell(c, cell));
  if (indexInPath !== -1) {
    if (!isDragOperation) {
      // On click: truncate path to this cell (existing behavior)
      path = path.slice(0, indexInPath + 1);
      cursor = { x: cell.x, y: cell.y };
      drawBoard();
      checkSuccess();
      return;
    } else if (path.length >= 2 && indexInPath === path.length - 2) {
      // On drag: allow backing up only to the previous cell in the path
      path.pop(); // Remove the last cell (backing up)
      cursor = { x: cell.x, y: cell.y };
      drawBoard();
      checkSuccess();
      return;
    } else {
      // Prevent jumping to arbitrary cells in the path during drag
      return;
    }
  }
  
  if (path.length === 0) {
    const startCell = getCellOfNumber(Math.min(...numbers.map(n => n.num)));
    if (cellNum === Math.min(...numbers.map(n => n.num))) {
      path.push(cell);
    } else if (isAdjacent(cell, startCell)) {
      path.push(startCell);
      path.push(cell);
    } else {
      console.log("You must start at " + Math.min(...numbers.map(n => n.num)) + " or next to it.");
      return;
    }
  } else {
    const currentEnd = path[path.length - 1];
    if (isAdjacent(currentEnd, cell)) {
      path.push(cell);
    } else if (currentEnd.x === cell.x || currentEnd.y === cell.y) {
      // Before adding cells in a straight line, check if any are already in the path
      let pathContainsExistingCell = false;
      
      if (currentEnd.x === cell.x) {
        let startY = currentEnd.y;
        let endY = cell.y;
        let step = (endY > startY) ? 1 : -1;
        for (let y = startY + step; y !== endY + step; y += step) {
          const checkCell = { x: currentEnd.x, y: y };
          if (path.some(c => sameCell(c, checkCell)) && y !== endY) {
            pathContainsExistingCell = true;
            break;
          }
        }
      } else {
        let startX = currentEnd.x;
        let endX = cell.x;
        let step = (endX > startX) ? 1 : -1;
        for (let x = startX + step; x !== endX + step; x += step) {
          const checkCell = { x: x, y: currentEnd.y };
          if (path.some(c => sameCell(c, checkCell)) && x !== endX) {
            pathContainsExistingCell = true;
            break;
          }
        }
      }
      
      // Only add cells if none of them are already in the path
      // (except the target cell itself for truncation)
      if (!pathContainsExistingCell) {
        if (currentEnd.x === cell.x) {
          let startY = currentEnd.y;
          let endY = cell.y;
          let step = (endY > startY) ? 1 : -1;
          for (let y = startY + step; y !== endY; y += step) {
            path.push({ x: currentEnd.x, y: y });
          }
          path.push(cell);
        } else {
          let startX = currentEnd.x;
          let endX = cell.x;
          let step = (endX > startX) ? 1 : -1;
          for (let x = startX + step; x !== endX; x += step) {
            path.push({ x: x, y: currentEnd.y });
          }
          path.push(cell);
        }
      } else if (!isDragOperation) {
        // On non-drag operations, we still allow truncation
        let indexInPath = path.findIndex(c => sameCell(c, cell));
        if (indexInPath !== -1) {
          path = path.slice(0, indexInPath + 1);
        }
      }
    } else if (cellNum !== null) {
      let lastNumber = null;
      for (let c of path) {
        const n = getNumberAt(c);
        if (n !== null) lastNumber = n;
      }
      if (cellNum === lastNumber + 1) {
        let foundIndex = -1;
        for (let i = path.length - 1; i >= 0; i--) {
          if (isAdjacent(path[i], cell)) {
            foundIndex = i;
            break;
          }
        }
        if (foundIndex !== -1) {
          path = path.slice(0, foundIndex + 1);
          path.push(cell);
        } else {
          console.log("No valid connection found for " + cellNum);
          return;
        }
      } else {
        console.log("Cell not adjacent to current path end and not the next number.");
        return;
      }
    } else {
      console.log("Cell not adjacent to current path end.");
      return;
    }
  }
  cursor = { x: cell.x, y: cell.y };
  drawBoard();
  checkSuccess();
  
  // Save game state after each path change
  saveGameState();
}

// --- Mouse & Touch Handlers ---
function getCellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  
  // Calculate position in CSS pixels (display coordinates)
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Convert to cell coordinates using the display width
  const displayCellSize = rect.width / boardSize;
  let cellX = Math.floor(x / displayCellSize);
  let cellY = Math.floor(y / displayCellSize);
  
  // Clamp values to ensure they're within board boundaries
  cellX = Math.max(0, Math.min(cellX, boardSize - 1));
  cellY = Math.max(0, Math.min(cellY, boardSize - 1));
  
  return { x: cellX, y: cellY };
}

canvas.addEventListener('mousedown', function(e) {
  lastInputWasKeyboard = false;
  dragging = true;
  // On mousedown (click), we allow path truncation
  processCell(getCellFromEvent(e), false);
  if (path.length > 0) {
    cursor = { x: path[path.length - 1].x, y: path[path.length - 1].y };
  }
});

canvas.addEventListener('mousemove', function(e) {
  lastInputWasKeyboard = false;
  if (!dragging) return;
  // On mousemove (drag), we don't allow path truncation
  processCell(getCellFromEvent(e), true);
  if (path.length > 0) {
    cursor = { x: path[path.length - 1].x, y: path[path.length - 1].y };
  }
});

canvas.addEventListener('mouseup', function() {
  dragging = false;
});

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  lastInputWasKeyboard = false;
  dragging = true;
  // On touchstart, we allow path truncation
  processCell(getCellFromEvent(e.touches[0]), false);
  if (path.length > 0) {
    cursor = { x: path[path.length - 1].x, y: path[path.length - 1].y };
  }
});

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  lastInputWasKeyboard = false;
  if (!dragging) return;
  // On touchmove, we don't allow path truncation
  processCell(getCellFromEvent(e.touches[0]), true);
  if (path.length > 0) {
    cursor = { x: path[path.length - 1].x, y: path[path.length - 1].y };
  }
});

canvas.addEventListener('touchend', function() {
  dragging = false;
});

// --- Keyboard Support ---
canvas.addEventListener('keydown', function(e) {
  lastInputWasKeyboard = true;
  let moved = false;
  switch (e.key) {
    case "ArrowUp":
      if (cursor.y > 0) { cursor.y--; moved = true; }
      break;
    case "ArrowDown":
      if (cursor.y < boardSize - 1) { cursor.y++; moved = true; }
      break;
    case "ArrowLeft":
      if (cursor.x > 0) { cursor.x--; moved = true; }
      break;
    case "ArrowRight":
      if (cursor.x < boardSize - 1) { cursor.x++; moved = true; }
      break;
    case "Enter":
    case " ":
      processCell({ x: cursor.x, y: cursor.y });
      moved = true;
      break;
    default:
      break;
  }
  if (moved) {
    e.preventDefault();
    drawBoard();
  }
});

// --- Focus & Blur Handlers ---
canvas.addEventListener('focus', function() {
  lastInputWasKeyboard = true;
  if (path.length === 0) {
    cursor = { x: 0, y: 0 };
  } else {
    cursor = { x: path[path.length - 1].x, y: path[path.length - 1].y };
  }
  drawBoard();
});

canvas.addEventListener('blur', function() {
  lastInputWasKeyboard = false;
  drawBoard();
});

// --- Initial Render ---
drawBoard();

// Simpler function to maintain crisp canvas rendering
function setBoardSize() {
  const canvas = document.getElementById('gameCanvas');
  const container = document.getElementById('canvasContainer');
  
  // Get the container's inner width
  const displayWidth = container.clientWidth - 
                         parseInt(getComputedStyle(container).paddingLeft) - 
                         parseInt(getComputedStyle(container).paddingRight);
  
  // Make canvas square at display size
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayWidth + 'px';
  
  // Set actual canvas dimensions equal to CSS dimensions times device pixel ratio
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = displayWidth * pixelRatio;
  canvas.height = displayWidth * pixelRatio;
  
  // Apply scaling to the context to account for the pixel ratio
  const ctx = canvas.getContext('2d');
  ctx.resetTransform(); // Clear any previous transforms
  ctx.scale(pixelRatio, pixelRatio);
  
  // Redraw the board if needed
  if (numbers && numbers.length > 0) {
    drawBoard();
  }
}

// --- Initial setup and board loading ---
window.addEventListener('load', function() {
  setBoardSize();
  
  // Check for saved board size
  const savedSize = getCookie("lastSelectedSize");
  if (savedSize) {
    loadBoardSize(parseInt(savedSize));
  } else {
    // If no saved size, use default (show selection message)
    document.getElementById('canvasContainer').style.display = 'none';
    document.getElementById('selectBoardMessage').style.display = 'block';
  }
});

////////////////////////////////////
// HINT HELPER FUNCTIONS + hint()
////////////////////////////////////

/**
 * Debug logger for hint() logic.
 */
function hintDebug(msg) {
  console.log("[HINT] " + msg);
}

/**
 * Returns the number at each cell of the path, in the order they appear.
 * Example: if path = [{x:1,y:2}, {x:1,y:3}, {x:2,y:3}...],
 *          and numbers array says (1,2)->#2, (2,3)->#3,
 *          then it returns [2, 3, ...].
 */
function extractNumberSequenceFromPath(p) {
  let seq = [];
  for (let cell of p) {
    const n = getNumberAt(cell); // uses your existing function
    if (n !== null) seq.push(n);
  }
  return seq;
}

/**
 * Find how many numbered cells at the start of userPath match the start
 * of the currentBoard.path (which is the solution).
 * For instance:
 *   user path numbers => [1, 2, 3, 4, ...]
 *   solution numbers  => [1, 2, 5, 6, ...]
 * The "longest valid prefix" is [1,2], so the count = 2.
 */
function longestValidPrefixCount(userPath, solutionPath) {
  const userNums = extractNumberSequenceFromPath(userPath);
  const solNums = extractNumberSequenceFromPath(solutionPath);
  let count = 0;
  for (let i = 0; i < userNums.length && i < solNums.length; i++) {
    if (userNums[i] === solNums[i]) count++;
    else break;
  }
  return count;
}

/**
 * Removes everything in userPath after the last valid numbered cell
 * in the matched prefix. If there's no matching prefix, userPath is cleared.
 */
function truncateToValidPrefix(userPath, prefixCount) {
  if (prefixCount === 0) {
    hintDebug("No valid prefix; clearing user path.");
    userPath.splice(0, userPath.length);
    return;
  }
  // we keep exactly prefixCount numbered cells
  let counted = 0;
  for (let i = 0; i < userPath.length; i++) {
    const n = getNumberAt(userPath[i]);
    if (n !== null) {
      counted++;
      if (counted === prefixCount) {
        // remove everything after i
        userPath.splice(i + 1);
        return;
      }
    }
  }
  // fallback
  userPath.splice(0, userPath.length);
}

/**
 * Returns the index in 'solutionPath' of the Nth numbered cell,
 * or null if not found. For example, if N=1 => first numbered cell in solution (i.e. #1).
 * If N=2 => second numbered cell in solution (i.e. #2).
 */
function getIndexOfNthNumber(solutionPath, n) {
  if (n < 1) return null; 
  let foundCount = 0;
  for (let i = 0; i < solutionPath.length; i++) {
    let num = getNumberAt(solutionPath[i]); 
    if (num !== null) {
      foundCount++;
      if (foundCount === n) return i;
    }
  }
  return null;
}

/**
 * Extends userPath by exactly one "next numbered cell" from solution.
 * If prefixCount=0, we connect the first two numbers from the solution.
 * If prefixCount=k>0, we connect the k-th numbered cell to the (k+1)-th.
 */
function addNextSegment(userPath, solutionPath, prefixCount) {
  const solUserWants = prefixCount + 1; // we want to add the (prefixCount+1)-th number
  const idxPrev = getIndexOfNthNumber(solutionPath, prefixCount);   // k-th
  const idxNext = getIndexOfNthNumber(solutionPath, solUserWants);  // (k+1)-th
  
  if (idxNext === null) {
    hintDebug("No next number to add; possibly at the end of solution?");
    return; 
  }
  if (idxPrev === null) {
    hintDebug("prefixCount=0, so let's connect the first two numbered cells.");
    // If prefixCount=0, we connect the 1st and 2nd numbered cells in the solution
    const idx1 = getIndexOfNthNumber(solutionPath, 1);
    const idx2 = getIndexOfNthNumber(solutionPath, 2);
    if (idx1 == null || idx2 == null) return;
    const start = Math.min(idx1, idx2);
    const end   = Math.max(idx1, idx2);
    const slice = solutionPath.slice(start, end + 1);
    userPath.push(...slice);
    return;
  }
  // Otherwise we have valid indices for the k-th and (k+1)-th
  hintDebug("Adding segment from numbered cell " + prefixCount + " to " + (prefixCount + 1));
  const start = Math.min(idxPrev, idxNext);
  const end   = Math.max(idxPrev, idxNext);
  const slice = solutionPath.slice(start, end + 1);
  userPath.push(...slice);
}

/**
 * The main hint function:
 *  1) If the puzzle is already complete, do nothing.
 *  2) Determine how many of the user's numbered cells match the solution from the start.
 *  3) Remove everything after that valid prefix.
 *  4) Add one more numbered cell from the solution path.
 *  5) Redraw and check success.
 */
///////////////////////
// HELPER FUNCTIONS
///////////////////////

/**
 * Returns the numeric label at cell, e.g. #1..#9 if it's a special cell,
 * or null otherwise. (Reuses your existing 'getNumberAt(cell)' logic.)
 */
function getNumberOrNull(cell) {
  return getNumberAt(cell); // your existing function
}

/**
 * Extracts the sequence of numbers in a path in order:
 * e.g. if path has cells leading from #1 => #2 => #3 (with in-between squares),
 * you might see an array like [1, null, null, 2, null, 3, ...].
 * This helper returns only [1,2,3] in that order.
 */
function extractNumberSequence(p) {
  const seq = [];
  for (let c of p) {
    const n = getNumberOrNull(c);
    if (n !== null) seq.push(n);
  }
  return seq;
}

/**
 * Determines how many consecutive numbers from 1 upwards
 * are fully connected in the user's path in the correct order.
 * For example, if user path has #1, #2 in correct order, but #3 is missing
 * or out of place, we return 2. 
 */
function countConsecutiveNumbersSoFar(userPath) {
  // First, build the array of numbers in the user path:
  // e.g. [1,2,2,5,3,...].
  // We want the largest k such that user has #1..#k in order.
  const nums = extractNumberSequence(userPath);

  let expected = 1;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === expected) {
      expected++;
    } else if (nums[i] > expected) {
      // we found a bigger number than expected => sequence is broken
      break;
    }
  }
  // If user's path had #1, #2, #3 in perfect order, expected would now be 4
  // meaning they've completed up to 3. So the largest consecutive number is expected-1.
  return expected - 1;
}

/**
 * Removes everything in 'userPath' after the last fully-correct consecutive number.
 * So if user completed up to #2, we keep the path up to #2, removing anything after that.
 */
function truncateUserPathToLastCorrectNumber(userPath, lastCorrectNum) {
  if (lastCorrectNum < 1) {
    // If user hasn't even placed #1, clear entire path
    userPath.splice(0, userPath.length);
    return;
  }
  // We'll keep everything up through #lastCorrectNum
  let foundCount = 0;
  for (let i = 0; i < userPath.length; i++) {
    let n = getNumberOrNull(userPath[i]);
    if (n === lastCorrectNum) {
      foundCount++;
      // remove everything after i
      userPath.splice(i + 1);
      return;
    }
  }
  // fallback if something weird occurs
  userPath.splice(0, userPath.length);
}

/**
 * Given a board's official path (the complete solution),
 * finds all squares from number `startNum` to number `endNum` inclusive,
 * and returns them in the correct sub-order.
 * For example, if startNum=2 and endNum=3,
 * and solution path visits (4,5) => (5,5) => (5,4) => (5,3) 
 * between #2 and #3, we return exactly that sub-array of coordinates.
 */
function getSolutionSegmentForNumbers(solutionPath, startNum, endNum) {
  if (!solutionPath || !solutionPath.length) return [];

  // We scan solutionPath to find all squares from #startNum up to #endNum
  // inclusive, i.e. from the cell containing #startNum to the cell containing #endNum.
  // Because it might pass intermediate squares that have no number, we must
  // start at the #startNum cell, and end at the #endNum cell (both inclusive).
  let startIndex = -1;
  let endIndex   = -1;
  // Find the cell that has startNum
  for (let i = 0; i < solutionPath.length; i++) {
    if (getNumberOrNull(solutionPath[i]) === startNum) {
      startIndex = i;
      break;
    }
  }
  // find the cell that has endNum, searching from startIndex forward
  for (let j = startIndex + 1; j < solutionPath.length; j++) {
    if (getNumberOrNull(solutionPath[j]) === endNum) {
      endIndex = j;
      break;
    }
  }
  if (startIndex === -1 || endIndex === -1) {
    // If we can't find them, something is off
    return [];
  }
  // The sub-array from startIndex..endIndex
  return solutionPath.slice(startIndex, endIndex + 1);
}

//////////////////////////
// HELPER FUNCTIONS
//////////////////////////

/**
 * For a cell {x,y}, returns the numbered label (#1..#9) or null if none.
 * This reuses your existing getNumberAt(cell) logic.
 */
function getNumberOrNull(cell) {
  return getNumberAt(cell);
}

/**
 * Returns the official subpath from number n to number n+1, inclusive,
 * based on the board's "currentBoard.path". That is, we look for
 * the cell containing #n, then collect every coordinate in the solution path
 * until we reach #n+1 (inclusive).
 */
function getOfficialSegment(n) {
  const sol = currentBoard.path; // the entire official solution route
  if (!sol || sol.length === 0) return [];

  // 1) Find the cell with #n
  let startIndex = -1;
  for (let i = 0; i < sol.length; i++) {
    const num = getNumberOrNull(sol[i]);
    if (num === n) {
      startIndex = i;
      break;
    }
  }
  // 2) Find the cell with #(n+1)
  let endIndex = -1;
  for (let j = startIndex + 1; j < sol.length; j++) {
    const num = getNumberOrNull(sol[j]);
    if (num === (n + 1)) {
      endIndex = j;
      break;
    }
  }
  // If not found, it might mean #n was the last number (9).
  if (startIndex === -1 || endIndex === -1) {
    return [];
  }
  return sol.slice(startIndex, endIndex + 1);
}

/**
 * Checks if userPath has a correct segment for #n→#(n+1).
 * We'll find where #n and #(n+1) appear in userPath, then see if
 * all intermediate cells match the official subpath exactly.
 *
 * Return:
 *   - "OK" if userPath's #n..#(n+1) exactly matches the official segment
 *   - "MISSING" if userPath doesn't have #n and #(n+1) in the correct order
 *   - "WRONG" if userPath has #n..#(n+1) but differs from the official route
 */
function checkUserSegment(n, userPath) {
  // find indices in userPath for #n and #(n+1)
  let idxStart = -1;
  for (let i = 0; i < userPath.length; i++) {
    if (getNumberOrNull(userPath[i]) === n) {
      idxStart = i;
      break;
    }
  }
  if (idxStart === -1) {
    return "MISSING"; // no #n => not even started
  }

  let idxEnd = -1;
  for (let j = idxStart + 1; j < userPath.length; j++) {
    if (getNumberOrNull(userPath[j]) === (n + 1)) {
      idxEnd = j;
      break;
    }
  }
  if (idxEnd === -1) {
    return "MISSING"; // found #n but not #(n+1)
  }

  // We have #n..#(n+1) in userPath => compare each coordinate to official subpath
  const official = getOfficialSegment(n);
  if (official.length === 0) {
    // means there's no sub-segment in the official solution for #n..#(n+1)
    return "WRONG";
  }
  // build user subpath
  const userSubpath = userPath.slice(idxStart, idxEnd + 1);
  // compare them by exact coordinate sequence
  // because solution path may have a certain order of intermediate squares
  if (userSubpath.length !== official.length) {
    return "WRONG";
  }
  for (let k = 0; k < official.length; k++) {
    if (official[k].x !== userSubpath[k].x || official[k].y !== userSubpath[k].y) {
      return "WRONG";
    }
  }
  // if we pass everything => user subpath is correct
  return "OK";
}

/**
 * Remove everything in userPath from the index "cutIndex" onward.
 */
function truncatePathAt(userPath, cutIndex) {
  if (cutIndex < 0) return;
  userPath.splice(cutIndex, userPath.length - cutIndex);
}

/**
 * Appends the official #n..#(n+1) subpath to userPath, skipping the first cell
 * if userPath already ends with it. This prevents duplicating the cell at the junction.
 */
function appendOfficialSegment(n, userPath) {
  const seg = getOfficialSegment(n);
  if (seg.length === 0) return;

  // if user path last cell is the same as seg[0], skip seg[0]
  const lastCell = userPath.length > 0 ? userPath[userPath.length - 1] : null;
  if (
    lastCell &&
    seg.length > 1 &&
    lastCell.x === seg[0].x &&
    lastCell.y === seg[0].y
  ) {
    seg.shift();
  }
  userPath.push(...seg);
}

//////////////////////
// MAIN hint() FUNCTION
//////////////////////
function hint() {
  console.log("[HINT] Called.");

  // 1) If puzzle is already complete, do nothing
  if (messageEl.textContent.includes("Congratulations")) {
    console.log("[HINT] Puzzle is done, no hint needed.");
    return;
  }

  // We'll check each numbered pair #1→#2, #2→#3, #3→#4, up to #8→#9
  // to find which segment is the first that is "MISSING" or "WRONG".

  let firstBadSegment = -1; 
  for (let n = 1; n < 9; n++) { 
    const status = checkUserSegment(n, path);
    console.log(`[HINT] Checking #${n}->#${n+1}: ${status}`);
    if (status === "MISSING" || status === "WRONG") {
      firstBadSegment = n;
      break;
    }
  }

  // 2) If we found no bad segments => that means #1->#2..#8->#9 are all correct
  // So maybe the user has a complete path or is very close to done
  if (firstBadSegment === -1) {
    console.log("[HINT] All segments #1->#2..#8->#9 appear correct. Possibly done or missing final squares.");
    // If the puzzle actually isn't done, you could still do final squares, but let's do nothing
    return;
  }

  // 3) We found a problem with #firstBadSegment..#(firstBadSegment+1)
  // We remove everything in the user's path from #firstBadSegment onward
  // That means we find where #firstBadSegment appears in path, and truncate from there
  let cutIndex = -1;
  for (let i = 0; i < path.length; i++) {
    if (getNumberOrNull(path[i]) === firstBadSegment) {
      cutIndex = i;
      break;
    }
  }
  if (cutIndex === -1) {
    // If we don't even have #firstBadSegment, we cut everything
    cutIndex = 0;
  }
  truncatePathAt(path, cutIndex);

  // 4) Now we forcibly append the official subpath for #firstBadSegment..#(firstBadSegment+1)
  console.log(`[HINT] Removing path from index ${cutIndex} onward. Now adding official #${firstBadSegment}..#${firstBadSegment+1}.`);
  appendOfficialSegment(firstBadSegment, path);

  // 5) Redraw and check success
  if (path.length > 0) {
    cursor = { x: path[path.length - 1].x, y: path[path.length - 1].y };
  }
  drawBoard();
  checkSuccess();

  console.log("[HINT] Done. Path length:", path.length);
}




window.addEventListener('resize', setBoardSize); 