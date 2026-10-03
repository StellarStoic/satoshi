document.addEventListener("DOMContentLoaded", function() {
    const themeToggle = document.getElementById("themeToggle");
    const themeIcon = document.getElementById("themeIcon");
    
    // Retrieve saved theme or default to dark-theme
    let currentTheme = localStorage.getItem("theme") || "dark";
    document.body.classList.add(currentTheme + "-theme");
    
    // Set initial icon based on current theme
    /* Icon author... https://www.flaticon.com/free-icons/secret" Secret icons created by Freepik - Flaticon */
    themeIcon.src = currentTheme === "dark" ? "/img/othrIcon/spy_light.png" : "/img/othrIcon/spy_dark.png";
  
    themeToggle.addEventListener("click", function() {
      // Play the toggle sound
      const audio = new Audio("/stego/audio/on_off.wav");
      audio.play();
  
      // Toggle the theme class on the body and update localStorage
      if (document.body.classList.contains("dark-theme")) {
        document.body.classList.remove("dark-theme");
        document.body.classList.add("light-theme");
        localStorage.setItem("theme", "light");
        themeIcon.src = "/img/othrIcon/spy_light.png";  // Update icon for light theme
      } else {
        document.body.classList.remove("light-theme");
        document.body.classList.add("dark-theme");
        localStorage.setItem("theme", "dark");
        themeIcon.src = "/img/othrIcon/spy_dark.png"; // Update icon for dark theme
      }
    });
  });