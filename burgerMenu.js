var theToggle = document.getElementById('toggle');

// based on Todd Motto functions
// https://toddmotto.com/labs/reusable-js/

// hasClass
function hasClass(elem, className) {
	return new RegExp(' ' + className + ' ').test(' ' + elem.className + ' ');
}
// addClass
function addClass(elem, className) {
    if (!hasClass(elem, className)) {
    	elem.className += ' ' + className;
    }
}
// removeClass
function removeClass(elem, className) {
	var newClass = ' ' + elem.className.replace( /[\t\r\n]/g, ' ') + ' ';
	if (hasClass(elem, className)) {
        while (newClass.indexOf(' ' + className + ' ') >= 0 ) {
            newClass = newClass.replace(' ' + className + ' ', ' ');
        }
        elem.className = newClass.replace(/^\s+|\s+$/g, '');
    }
}
// toggleClass
function toggleClass(elem, className) {
	var newClass = ' ' + elem.className.replace( /[\t\r\n]/g, " " ) + ' ';
    if (hasClass(elem, className)) {
        while (newClass.indexOf(" " + className + " ") >= 0 ) {
            newClass = newClass.replace( " " + className + " " , " " );
        }
        elem.className = newClass.replace(/^\s+|\s+$/g, '');
    } else {
        elem.className += ' ' + className;
    }
}

theToggle.onclick = function() {
   toggleClass(this, 'on');
   return false;
}

// NEW CODE: Submenu functionality
document.addEventListener('DOMContentLoaded', function() {
    // Get all menu items that have submenus
    var submenuItems = document.querySelectorAll('.has-submenu > a');
    
    // Add click event to each submenu trigger
    submenuItems.forEach(function(menuItem) {
        menuItem.addEventListener('click', function(e) {
            // Prevent the link from navigating if it's just '#'
            if (this.getAttribute('href') === '#') {
                e.preventDefault();
            }
            
            var parentLi = this.parentElement;
            
            // Close other open submenus
            document.querySelectorAll('.has-submenu.active').forEach(function(activeItem) {
                if (activeItem !== parentLi) {
                    removeClass(activeItem, 'active');
                }
            });
            
            // Toggle current submenu
            toggleClass(parentLi, 'active');
        });
    });
    
    // Optional: Close submenus when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#menu')) {
            // Click was outside the menu, close all submenus
            document.querySelectorAll('.has-submenu.active').forEach(function(activeItem) {
                removeClass(activeItem, 'active');
            });
        }
    });
});