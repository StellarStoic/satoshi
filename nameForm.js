const nameForm = document.getElementById('name-form');
nameForm?.addEventListener('submit', function(event) {
    // Prevent the form from being submitted
    event.preventDefault();

    // Get the name from the form
    var name = document.getElementById('name').value;

    // Display the name in the name-display div
    const firstDisplay = document.getElementById('name-display-1');
    const secondDisplay = document.getElementById('name-display-2');
    if (firstDisplay) firstDisplay.textContent = name;
    if (secondDisplay) secondDisplay.textContent = name;
    });
