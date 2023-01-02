document.getElementById('name-form').addEventListener('submit', function(event) {
    // Prevent the form from being submitted
    event.preventDefault();

    // Get the name from the form
    var name = document.getElementById('name').value;

    // Display the name in the name-display div
    document.getElementById('name-display-1').innerHTML =  name;
    document.getElementById('name-display-2').innerHTML =  name;
    });
