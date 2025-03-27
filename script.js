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
      currentBoard = chooseNextBoard(currentBoards, size);
      initBoard(currentBoard);
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

// Call this function at the right times
window.addEventListener('load', setBoardSize);
window.addEventListener('resize', setBoardSize); 