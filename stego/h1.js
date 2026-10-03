  // --- Final target texts for the three rows ---
  const targetTopOriginal    = "4WE50M3";
  const targetMiddleOriginal = "5T3G4NOGRAPHY";
  const targetBottomOriginal = "PL4YGR0UND";
  
  // --- Pad a text to a given length (center-aligned) ---
  function padCenter(text, length) {
    let padTotal = length - text.length;
    let padLeft = Math.floor(padTotal / 2);
    let padRight = padTotal - padLeft;
    return " ".repeat(padLeft) + text + " ".repeat(padRight);
  }
  
  // Use the center row length as reference.
  const maxLen = targetMiddleOriginal.length;
  const targetTop    = padCenter(targetTopOriginal, maxLen);
  const targetMiddle = padCenter(targetMiddleOriginal, maxLen);
  const targetBottom = padCenter(targetBottomOriginal, maxLen);
  
  // Pack the padded strings into an array for easier access per row.
  const targets = [ targetTop, targetMiddle, targetBottom ];
  
  // --- Common animation settings ---
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ043175 -';
  const charArray = chars.split('');
  const charMap   = {};
  for (let i = 0; i < charArray.length; i++){
    charMap[charArray[i]] = i;
  }
  
  const scale    = 25;      // font size (and horizontal step)
  const breaks   = 0.03;   // deceleration per frame
  const endSpeed = 0.03;   // minimal speed when finishing
  const firstLetter = 80;  // base parameter before a letter stops
  const delay = 40;         // delay (in frames) between columns stopping
  
  // --- Create one offset and speed per column (columns animate in sequence) ---
  const offset  = [];
  const offsetV = [];
  for (let i = 0; i < maxLen; i++){
    // Add a delay per column so they stop sequentially from left to right.
    let f = firstLetter + delay * i;
    offset[i]  = -(1 + f) * (breaks * f + 2 * endSpeed) / 2;
    offsetV[i] = endSpeed + breaks * f;
  }
  
  const canvas = document.querySelector('canvas');
  const ctx    = canvas.getContext('2d');
  
  // --- Resize canvas to fill its container ---
  function resizeCanvas(){
    canvas.width  = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  window.onresize = resizeCanvas;
  resizeCanvas();
  
  // --- Animation loop ---
  function loop(){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Horizontal base so that the whole text is centered.
    const xBase = Math.floor((canvas.width - scale * (maxLen - 1)) / 2);
    // Vertical center for the middle row; adjust spacing for top and bottom.
    const centerY = canvas.height / 2;
    const verticalSpacing = scale;  // space between rows
    
    // Process each column (each character position)
    for (let i = 0; i < maxLen; i++){
      // Update the rolling offset for this column.
      offset[i]  += offsetV[i];
      offsetV[i] -= breaks;
      
      // Smooth the ending:
      // When the column's speed is low and its offset is nearly an integer, snap it.
      if (offsetV[i] < endSpeed && Math.abs(offset[i] - Math.round(offset[i])) < 0.01) {
        offset[i]  = Math.round(offset[i]);
        offsetV[i] = 0;
      }
      
      // Determine how many full "rolls" have occurred.
      let steps = -Math.floor(offset[i]);
      // The fractional part gives a subtle vertical sliding effect.
      let frac  = offset[i] - Math.floor(offset[i]);
      
      // For each of the 3 rows (0 = top, 1 = middle, 2 = bottom)
      for (let r = 0; r < 3; r++){
        // Get the target letter for this column and row.
        let targetLetter = targets[r][i];
        let finalIndex = charMap[targetLetter];
        let dispIndex = (finalIndex + steps) % charArray.length;
        if (dispIndex < 0) dispIndex += charArray.length;
        let displayedChar = charArray[dispIndex];
        
        // Compute x and y positions.
        let xPos = xBase + i * scale;
        let yPos = centerY + (r - 1) * verticalSpacing - frac * verticalSpacing;
        
        ctx.globalAlpha = 1;
        ctx.font = scale + "px 'Major Mono Display', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#808080";
        ctx.fillText(displayedChar, xPos, yPos);
      }
    }
    
    requestAnimationFrame(loop);
  }
  
  requestAnimationFrame(loop);